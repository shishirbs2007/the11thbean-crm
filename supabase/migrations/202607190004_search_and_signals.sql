create index if not exists people_phone_lower_idx
on public.people(lower(coalesce(phone, '')));

create index if not exists people_email_lower_idx
on public.people(lower(coalesce(email, '')));

create index if not exists tags_name_lower_idx
on public.tags(lower(name));

create index if not exists customer_notes_search_idx
on public.customer_notes
using gin (to_tsvector('simple', coalesce(note, '')));

create or replace function public.crm_global_search(search_term text)
returns table (
  result_type text,
  result_id uuid,
  title text,
  subtitle text,
  href text,
  rank_score integer
)
language sql
security definer
set search_path = public
as $$
  with term as (
    select trim(coalesce(search_term, '')) as q
  ),
  people_results as (
    select
      'customer'::text,
      p.id,
      trim(
        coalesce(nullif(p.preferred_name, ''), p.first_name) || ' ' ||
        coalesce(p.last_name, '')
      ),
      concat_ws(
        ' · ',
        nullif(p.phone, ''),
        nullif(p.email, ''),
        nullif(p.company, '')
      ),
      '/customers/' || p.id::text,
      case
        when lower(coalesce(p.phone, '')) = lower(term.q) then 100
        when lower(coalesce(p.email, '')) = lower(term.q) then 95
        when lower(coalesce(p.first_name, '')) = lower(term.q) then 90
        when lower(coalesce(p.preferred_name, '')) = lower(term.q) then 90
        else 70
      end
    from public.people p
    cross join term
    where p.is_active = true
      and term.q <> ''
      and (
        p.first_name ilike '%' || term.q || '%'
        or coalesce(p.last_name, '') ilike '%' || term.q || '%'
        or coalesce(p.preferred_name, '') ilike '%' || term.q || '%'
        or coalesce(p.phone, '') ilike '%' || term.q || '%'
        or coalesce(p.email, '') ilike '%' || term.q || '%'
        or coalesce(p.company, '') ilike '%' || term.q || '%'
        or coalesce(p.occupation, '') ilike '%' || term.q || '%'
      )
  ),
  note_results as (
    select
      'note'::text,
      n.person_id,
      'Note for ' ||
        trim(
          coalesce(nullif(p.preferred_name, ''), p.first_name) || ' ' ||
          coalesce(p.last_name, '')
        ),
      left(n.note, 140),
      '/customers/' || n.person_id::text,
      55
    from public.customer_notes n
    join public.people p on p.id = n.person_id
    cross join term
    where term.q <> ''
      and n.note ilike '%' || term.q || '%'
      and (
        public.current_app_role() in ('manager', 'admin')
        or n.visibility = 'barista'
      )
  ),
  tag_results as (
    select
      'tag'::text,
      pt.person_id,
      trim(
        coalesce(nullif(p.preferred_name, ''), p.first_name) || ' ' ||
        coalesce(p.last_name, '')
      ),
      'Tagged: ' || t.name,
      '/customers/' || pt.person_id::text,
      60
    from public.person_tags pt
    join public.tags t on t.id = pt.tag_id
    join public.people p on p.id = pt.person_id
    cross join term
    where term.q <> ''
      and t.name ilike '%' || term.q || '%'
  ),
  community_results as (
    select
      'community'::text,
      c.id,
      c.name,
      coalesce(c.description, 'Community'),
      '/communities',
      50
    from public.communities c
    cross join term
    where term.q <> ''
      and c.name ilike '%' || term.q || '%'
  ),
  event_results as (
    select
      'event'::text,
      e.id,
      e.name,
      concat_ws(' · ', e.location, e.starts_at::date::text),
      '/events',
      50
    from public.events e
    cross join term
    where term.q <> ''
      and (
        e.name ilike '%' || term.q || '%'
        or coalesce(e.location, '') ilike '%' || term.q || '%'
      )
  )
  select * from people_results
  union all
  select * from note_results
  union all
  select * from tag_results
  union all
  select * from community_results
  union all
  select * from event_results
  order by 6 desc, 3
  limit 100;
$$;

revoke all on function public.crm_global_search(text) from public;
grant execute on function public.crm_global_search(text) to authenticated;

create or replace function public.crm_dashboard_signals()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'customers', (
      select count(*) from public.people where is_active = true
    ),
    'new_customers_30d', (
      select count(*) from public.people
      where is_active = true
        and created_at >= now() - interval '30 days'
    ),
    'visits_30d', (
      select count(*) from public.visits
      where visited_at >= now() - interval '30 days'
    ),
    'dormant_45d', (
      select count(*)
      from public.people p
      where p.is_active = true
        and not exists (
          select 1
          from public.visits v
          where v.person_id = p.id
            and v.visited_at >= now() - interval '45 days'
        )
    ),
    'open_feedback', (
      select count(*) from public.customer_feedback
      where resolution_status = 'open'
    ),
    'important_dates_total', (
      select count(*) from public.important_dates
    )
  );
$$;

revoke all on function public.crm_dashboard_signals() from public;
grant execute on function public.crm_dashboard_signals() to authenticated;
