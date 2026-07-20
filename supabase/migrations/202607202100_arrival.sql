-- Arrival.
--
-- Recording a visit took fourteen fields. During service, with somebody
-- waiting, that does not happen — and every piece of intelligence in this CRM
-- is derived from visits. The briefing, the favourites, the churn risk and the
-- forecasts all quietly starve when the counter is too busy to do paperwork.
--
-- This makes recognising a guest one action: search, tap, done. Everything the
-- person behind the counter needs to greet them well comes back in the same
-- round trip, because a second query is a second of somebody standing there.

-- Everything worth knowing about a guest in the moment they walk in.
--
-- Deliberately one function: the counter needs the whole picture at once, and
-- assembling it from five queries would be slower and could show a half-filled
-- card while the guest waits.
create or replace function public.arrival_context(target_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'person_id', p.id,
        'name', coalesce(p.preferred_name, p.first_name)
            || coalesce(' ' || p.last_name, ''),
        'greeting_name', coalesce(p.preferred_name, p.first_name),
        -- Safety first, always. An allergy is the one thing that must never be
        -- buried below anything else on this screen.
        'allergies', coalesce(hp.allergies, array[]::text[]),
        'dietary', coalesce(hp.dietary_restrictions, array[]::text[]),
        'usual_drink', coalesce(
            (
                select i.item_name
                from public.customer_item_history i
                where i.person_id = p.id
                  and i.visit_count > 1
                  and lower(coalesce(i.category, '')) in
                      ('coffee', 'tea', 'drink', 'drinks', 'beverage', 'beverages')
                order by i.visit_count desc, i.last_ordered_at desc
                limit 1
            ),
            nullif(hp.coffee_preferences->>'drink', '')
        ),
        'usual_food', (
            select i.item_name
            from public.customer_item_history i
            where i.person_id = p.id
              and i.visit_count > 1
              and lower(coalesce(i.category, '')) in
                  ('food', 'bakery', 'dessert', 'desserts', 'snack', 'snacks')
            order by i.visit_count desc, i.last_ordered_at desc
            limit 1
        ),
        'seating', (
            select cp.preference_value
            from public.customer_preferences cp
            where cp.person_id = p.id and cp.preference_type = 'seating'
            limit 1
        ),
        'total_visits', coalesce(h.total_visits, 0),
        'last_visit_at', h.last_visit_at,
        'days_since_visit', case
            when h.last_visit_at is null then null
            else extract(day from (now() - h.last_visit_at))::integer
        end,
        'is_first_visit', coalesce(h.total_visits, 0) = 0,
        'staff_summary', hp.staff_summary,
        'communities', coalesce(
            (
                select array_agg(c.name order by c.name)
                from public.community_memberships m
                join public.communities c on c.id = m.community_id
                where m.person_id = p.id and m.left_at is null
            ),
            array[]::text[]
        ),
        'next_best_action', public.next_best_action(p.id),
        -- Anything the café already owes them, surfaced before they order.
        'open_tasks', coalesce(
            (
                select jsonb_agg(jsonb_build_object('title', t.title, 'detail', t.detail))
                from public.hospitality_tasks t
                where t.person_id = p.id and t.status = 'open'
            ),
            '[]'::jsonb
        )
    )
    from public.people p
    left join public.customer_hospitality_profiles hp on hp.person_id = p.id
    left join public.customer_health h on h.person_id = p.id
    where p.id = target_person_id;
$$;


-- Records that a guest is here, and returns what to say to them.
--
-- One argument is required. Everything else has a defensible default, because
-- a form with optional fields is still a form, and the point is that there
-- isn't one.
create or replace function public.record_arrival(
    target_person_id uuid,
    guest_count integer default 1,
    arrival_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_visit_id uuid;
  context jsonb;
begin
  if not exists (
    select 1 from public.people where id = target_person_id and is_active = true
  ) then
    raise exception 'No active guest with id %', target_person_id;
  end if;

  -- The same guest tapped twice within the hour is one visit, not two. Staff
  -- will double-tap; the CRM should absorb that rather than record a fiction.
  select id into new_visit_id
  from public.visits
  where person_id = target_person_id
    and visited_at > now() - interval '1 hour'
    and source = 'arrival'
  order by visited_at desc
  limit 1;

  if new_visit_id is null then
    insert into public.visits (
      person_id, visited_at, visit_type, party_size,
      gross_amount, net_amount, source, staff_notes
    )
    values (
      target_person_id,
      now(),
      'walk_in',
      greatest(coalesce(guest_count, 1), 1),
      0,
      0,
      'arrival',
      nullif(arrival_note, '')
    )
    returning id into new_visit_id;
  elsif arrival_note is not null and arrival_note <> '' then
    -- A second tap carrying a note is somebody adding detail, not arriving again.
    update public.visits
    set staff_notes = coalesce(staff_notes || ' ', '') || arrival_note,
        party_size = greatest(party_size, coalesce(guest_count, 1))
    where id = new_visit_id;
  end if;

  select public.arrival_context(target_person_id) into context;

  return context || jsonb_build_object('visit_id', new_visit_id);
end;
$$;


-- Adds a guest at the counter from the least the café can ask for.
--
-- The full customer form wants seven fields. Somebody is waiting, so this
-- wants a name and one way to reach them, and records the arrival in the same
-- action. The rest can be filled in when there is a moment.
create or replace function public.quick_add_guest(
    guest_name text,
    contact_phone text default null,
    contact_email text default null,
    guest_count integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  first_part text;
  last_part text;
  new_person_id uuid;
  existing uuid;
begin
  guest_name := trim(coalesce(guest_name, ''));

  if guest_name = '' then
    raise exception 'A name is needed';
  end if;

  if coalesce(contact_phone, '') = '' and coalesce(contact_email, '') = '' then
    raise exception 'A phone number or email is needed so their orders can be recognised next time';
  end if;

  -- Somebody who is already known should not be duplicated by a busy counter.
  select person_id into existing
  from public.match_guest_detail(contact_phone, contact_email);

  if existing is not null then
    return public.record_arrival(existing, guest_count, null)
      || jsonb_build_object('already_known', true);
  end if;

  first_part := split_part(guest_name, ' ', 1);
  last_part := nullif(trim(substring(guest_name from length(first_part) + 1)), '');

  insert into public.people (
    first_name, last_name, phone, email, person_type, customer_status, is_active
  )
  values (
    first_part,
    last_part,
    nullif(contact_phone, ''),
    nullif(contact_email, ''),
    'customer',
    'new',
    true
  )
  returning id into new_person_id;

  return public.record_arrival(new_person_id, guest_count, null)
    || jsonb_build_object('already_known', false);
end;
$$;


-- Who is in right now, for the counter and the close-of-day summary.
create or replace view public.arrivals_today as
select
    v.id as visit_id,
    v.person_id,
    coalesce(p.preferred_name, p.first_name) as greeting_name,
    p.last_name,
    v.visited_at,
    v.party_size,
    v.staff_notes,
    coalesce(h.total_visits, 0) as total_visits,
    coalesce(h.total_visits, 0) <= 1 as is_new_guest
from public.visits v
join public.people p on p.id = v.person_id
left join public.customer_health h on h.person_id = v.person_id
where v.visited_at >= date_trunc('day', now())
order by v.visited_at desc;

grant select on public.arrivals_today to authenticated;

notify pgrst, 'reload schema';
