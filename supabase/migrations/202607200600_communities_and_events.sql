-- Phase 3: Communities & Events.
--
-- The café's communities are the reason many guests come at all: the badminton
-- group, the book club, the Sunday regulars. This migration teaches the CRM to
-- reason about them, so staff never have to guess who to invite or who quietly
-- stopped turning up.

alter table public.events
    add column if not exists community_id uuid
        references public.communities(id) on delete set null;

alter table public.events
    add column if not exists event_type text not null default 'general';

alter table public.events
    add column if not exists host_notes text;

create index if not exists events_community_idx
on public.events(community_id);

create index if not exists events_starts_at_idx
on public.events(starts_at desc);

alter table public.event_registrations
    add column if not exists attended_at timestamptz;

alter table public.event_registrations
    add column if not exists invited_at timestamptz;

alter table public.event_registrations
    add column if not exists guest_count integer not null default 1
        check (guest_count > 0);

alter table public.event_registrations
    add column if not exists notes text;

create index if not exists event_registrations_person_idx
on public.event_registrations(person_id);


-- How full an event is, and who has actually turned up. Capacity is a
-- hospitality constraint, not just a number: a room that is too full stops
-- feeling like the café.
create or replace view public.event_attendance_summary as
select
    e.id as event_id,
    e.name,
    e.starts_at,
    e.capacity,
    e.community_id,
    count(r.person_id) filter (
        where r.status in ('registered', 'attended')
    )::integer as registered_count,
    coalesce(sum(r.guest_count) filter (
        where r.status in ('registered', 'attended')
    ), 0)::integer as expected_headcount,
    count(r.person_id) filter (where r.status = 'attended')::integer as attended_count,
    count(r.person_id) filter (where r.status = 'no_show')::integer as no_show_count,
    count(r.person_id) filter (where r.status = 'interested')::integer as interested_count,
    case
        when e.capacity is null or e.capacity = 0 then null
        else round(
            coalesce(sum(r.guest_count) filter (
                where r.status in ('registered', 'attended')
            ), 0)::numeric * 100 / e.capacity,
            1
        )
    end as capacity_used_percent
from public.events e
left join public.event_registrations r on r.event_id = e.id
group by e.id;


-- The health of a community, in the terms staff actually care about: is it
-- growing, is it still meeting, and who has quietly drifted away.
create or replace view public.community_health as
select
    c.id as community_id,
    c.name,
    c.category,
    count(m.person_id) filter (where m.left_at is null)::integer as active_members,
    count(m.person_id) filter (where m.left_at is not null)::integer as former_members,
    count(m.person_id) filter (
        where m.left_at is null and m.joined_at >= current_date - 90
    )::integer as joined_last_quarter,
    (
        select count(*)
        from public.events e
        where e.community_id = c.id
          and e.starts_at >= now() - interval '90 days'
    )::integer as events_last_quarter,
    (
        select max(e.starts_at)
        from public.events e
        where e.community_id = c.id
          and e.starts_at <= now()
    ) as last_event_at,
    (
        select min(e.starts_at)
        from public.events e
        where e.community_id = c.id
          and e.starts_at > now()
    ) as next_event_at
from public.communities c
left join public.community_memberships m on m.community_id = c.id
where c.is_active = true
group by c.id;


-- Who should be invited to this event?
--
-- Ranked by the things that actually predict someone turning up and enjoying
-- themselves: they belong to the community running it, they have come to this
-- kind of event before, they are a live regular rather than someone who has
-- drifted, and they matter to the room. Anyone already registered or invited
-- is excluded, as is anyone who has withdrawn consent to be contacted.
create or replace function public.event_invitation_candidates(
    target_event_id uuid,
    max_results integer default 25
)
returns table (
    person_id uuid,
    first_name text,
    last_name text,
    preferred_name text,
    score numeric,
    reasons text[]
)
language sql
stable
security definer
set search_path = public
as $$
    with event_row as (
        select id, community_id, event_type, starts_at
        from public.events
        where id = target_event_id
    ),
    candidate as (
        select
            p.id,
            p.first_name,
            p.last_name,
            p.preferred_name,
            -- Belongs to the community hosting this event.
            (
                select count(*)
                from public.community_memberships cm, event_row er
                where cm.person_id = p.id
                  and cm.left_at is null
                  and er.community_id is not null
                  and cm.community_id = er.community_id
            ) > 0 as in_host_community,
            -- Has attended this kind of event before.
            (
                select count(*)
                from public.event_registrations r
                join public.events e2 on e2.id = r.event_id, event_row er
                where r.person_id = p.id
                  and r.status = 'attended'
                  and e2.event_type = er.event_type
            )::integer as similar_events_attended,
            coalesce(h.relationship_score, 0) as relationship_score,
            coalesce(h.recency_score, 0) as recency_score,
            h.last_visit_at
        from public.people p
        left join public.customer_health h on h.person_id = p.id
        where p.is_active = true
          and not exists (
              select 1
              from public.event_registrations r
              where r.event_id = target_event_id
                and r.person_id = p.id
          )
          and not exists (
              select 1
              from public.consents c
              where c.person_id = p.id
                and c.purpose = 'event_invitations'
                and c.granted = false
          )
    )
    select
        c.id,
        c.first_name,
        c.last_name,
        c.preferred_name,
        round(
            (case when c.in_host_community then 40 else 0 end)
            + least(c.similar_events_attended * 15, 30)
            + c.relationship_score * 0.20
            + c.recency_score * 0.10,
            1
        ) as score,
        array_remove(
            array[
                case when c.in_host_community
                    then 'Member of the hosting community' end,
                case when c.similar_events_attended > 0
                    then 'Came to ' || c.similar_events_attended
                        || ' event' || case when c.similar_events_attended = 1 then '' else 's' end
                        || ' like this' end,
                case when c.recency_score >= 80
                    then 'Visiting regularly right now' end,
                case when c.relationship_score >= 50
                    then 'Well connected across the café' end,
                case when c.last_visit_at is null
                    then 'Never recorded a visit yet' end
            ],
            null
        ) as reasons
    from candidate c
    where c.in_host_community
       or c.similar_events_attended > 0
       or c.relationship_score > 0
    order by score desc, c.first_name
    limit greatest(max_results, 1);
$$;


-- Marking someone as attended is a hospitality moment, not a data entry task:
-- it lands on their timeline so the next person to serve them knows.
create or replace function public.record_event_attendance(
    target_event_id uuid,
    target_person_id uuid,
    did_attend boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  event_name text;
  event_start timestamptz;
begin
  select name, starts_at into event_name, event_start
  from public.events
  where id = target_event_id;

  if event_name is null then
    raise exception 'Event % does not exist', target_event_id;
  end if;

  update public.event_registrations
  set status = (
        case when did_attend then 'attended' else 'no_show' end
      )::public.event_registration_status,
      attended_at = case when did_attend then now() else null end
  where event_id = target_event_id
    and person_id = target_person_id;

  if not found then
    raise exception 'No registration for person % on event %',
      target_person_id, target_event_id;
  end if;

  if did_attend then
    insert into public.timeline_entries (
      person_id,
      event_type,
      title,
      summary,
      occurred_at,
      source_type,
      source_id
    )
    values (
      target_person_id,
      'event',
      'Attended ' || event_name,
      'Came to ' || event_name || ' on '
        || to_char(event_start, 'DD Mon YYYY') || '.',
      coalesce(event_start, now()),
      'system',
      target_event_id
    );
  end if;

  perform public.recalculate_customer_health(target_person_id);
end;
$$;

grant select on public.event_attendance_summary to authenticated;
grant select on public.community_health to authenticated;

notify pgrst, 'reload schema';
