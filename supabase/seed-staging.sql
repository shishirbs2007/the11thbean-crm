-- Synthetic staging seed.
--
-- Every person, visit, order and conversation below is invented. No real
-- guest, staff member, order or message from the café is represented here or
-- may ever be copied into this file.
--
-- The names are deliberately obvious fiction and every email is @example.com,
-- which is reserved by RFC 2606 and cannot receive mail. If a message ever
-- escapes a staging environment it goes nowhere.
--
-- Idempotent: every insert is guarded, so running this repeatedly converges
-- rather than duplicating. Safe to run on every bootstrap.

do $$
declare
  branch uuid;
  badminton uuid;
  book_club uuid;
  asha uuid;
  ravi uuid;
  meera uuid;
  sam uuid;
  nina uuid;
  quiet_event uuid;
  workshop uuid;
begin
  -- Refuse to seed anything that looks like production.
  if exists (
    select 1 from public.people
    where email not like '%@example.com'
    limit 1
  ) then
    raise exception
      'Refusing to seed: this database contains records that are not synthetic.';
  end if;

  select id into branch from public.branches where is_default limit 1;

  -- Idempotent by guard rather than by upsert: several of these tables carry
  -- no unique constraint a targeted ON CONFLICT could use.
  if exists (select 1 from public.people where email = 'asha.menon@example.com') then
    raise notice 'Synthetic staging seed already present. Nothing to do.';
    return;
  end if;

  -- Communities the café actually revolves around.
  insert into public.communities (name, description, category, meeting_frequency, branch_id)
  values
    ('Thursday Badminton', 'Plays at the court up the road, comes in after.', 'sport', 'Every Thursday evening', branch),
    ('Second Chapter Book Club', 'Meets on the first Sunday. Reads slowly, argues warmly.', 'reading', 'Monthly', branch)
  on conflict (name) do nothing;

  select id into badminton from public.communities where name = 'Thursday Badminton';
  select id into book_club from public.communities where name = 'Second Chapter Book Club';

  -- Guests, each with a different relationship to the café.
  insert into public.people (first_name, last_name, preferred_name, email, phone, person_type, customer_status, occupation, is_active, home_branch_id)
  values
    ('Asha', 'Menon', 'Asha', 'asha.menon@example.com', '+919000000001', 'customer', 'regular', 'Architect', true, branch),
    ('Ravi', 'Iyer', null, 'ravi.iyer@example.com', '+919000000002', 'customer', 'regular', 'Teacher', true, branch),
    ('Meera', 'Rao', 'Mimi', 'meera.rao@example.com', '+919000000003', 'customer', 'new', 'Student', true, branch),
    ('Sam', 'Fernandes', null, 'sam.fernandes@example.com', '+919000000004', 'customer', 'regular', 'Software engineer', true, branch),
    ('Nina', 'Kapoor', null, 'nina.kapoor@example.com', '+919000000005', 'customer', 'lapsed', 'Journalist', true, branch);

  select id into asha from public.people where email = 'asha.menon@example.com';
  select id into ravi from public.people where email = 'ravi.iyer@example.com';
  select id into meera from public.people where email = 'meera.rao@example.com';
  select id into sam from public.people where email = 'sam.fernandes@example.com';
  select id into nina from public.people where email = 'nina.kapoor@example.com';

  -- Asha is a Thursday regular. Ravi comes weekly too. Nina has drifted.
  begin
    insert into public.visits (person_id, visited_at, visit_type, party_size, gross_amount, discount_amount, tax_amount, net_amount, source, branch_id)
    select
      asha,
      date_trunc('hour', now() - make_interval(days => offset_days)) + interval '18 hours',
      'walk_in', 2, 520, 0, 26, 520, 'manual', branch
    from generate_series(2, 60, 7) as offset_days;

    insert into public.visits (person_id, visited_at, visit_type, party_size, gross_amount, discount_amount, tax_amount, net_amount, source, branch_id)
    select
      ravi,
      date_trunc('hour', now() - make_interval(days => offset_days)) + interval '9 hours',
      'walk_in', 1, 260, 0, 13, 260, 'manual', branch
    from generate_series(1, 56, 7) as offset_days;

    -- Nina came weekly for two months and then stopped. Drifting, by her own rhythm.
    insert into public.visits (person_id, visited_at, visit_type, party_size, gross_amount, discount_amount, tax_amount, net_amount, source, branch_id)
    select
      nina,
      date_trunc('hour', now() - make_interval(days => offset_days)) + interval '11 hours',
      'walk_in', 1, 340, 0, 17, 340, 'manual', branch
    from generate_series(75, 130, 7) as offset_days;

    -- Meera has just started coming.
    insert into public.visits (person_id, visited_at, visit_type, party_size, gross_amount, discount_amount, tax_amount, net_amount, source, branch_id)
    values
      (meera, now() - interval '9 days', 'walk_in', 1, 180, 0, 9, 180, 'manual', branch),
      (meera, now() - interval '3 days', 'walk_in', 1, 210, 0, 11, 210, 'manual', branch);

    -- Sam brings people with him.
    insert into public.visits (person_id, visited_at, visit_type, party_size, gross_amount, discount_amount, tax_amount, net_amount, source, branch_id)
    select
      sam,
      date_trunc('hour', now() - make_interval(days => offset_days)) + interval '16 hours',
      'walk_in', 4, 900, 50, 45, 850, 'manual', branch
    from generate_series(4, 50, 10) as offset_days;
  end;

  -- What they order, so favourites can be inferred rather than typed in.
  insert into public.visit_items (visit_id, item_name, category, quantity, unit_price, total_amount)
  select v.id, 'Flat White', 'coffee', 1, 220, 220
  from public.visits v where v.person_id = asha
  and not exists (select 1 from public.visit_items i where i.visit_id = v.id);

  insert into public.visit_items (visit_id, item_name, category, quantity, unit_price, total_amount)
  select v.id, 'Banana Bread', 'bakery', 1, 180, 180
  from public.visits v where v.person_id = asha
  and not exists (
    select 1 from public.visit_items i where i.visit_id = v.id and i.item_name = 'Banana Bread'
  );

  insert into public.visit_items (visit_id, item_name, category, quantity, unit_price, total_amount)
  select v.id, 'Filter Coffee', 'coffee', 1, 140, 140
  from public.visits v where v.person_id = ravi
  and not exists (select 1 from public.visit_items i where i.visit_id = v.id);

  insert into public.visit_items (visit_id, item_name, category, quantity, unit_price, total_amount)
  select v.id, 'Oat Cortado', 'coffee', 1, 240, 240
  from public.visits v where v.person_id = sam
  and not exists (select 1 from public.visit_items i where i.visit_id = v.id);

  -- Hospitality the café has learned. Asha's allergy matters most.
  insert into public.customer_hospitality_profiles (person_id, staff_summary, coffee_preferences, food_preferences, allergies)
  values
    (asha, 'Thursday evening regular after badminton. Wants the quiet corner table.',
     '{"drink": "Flat White", "milk": "Regular"}'::jsonb,
     '{"favourites": ["Banana Bread"]}'::jsonb,
     array['Peanuts']),
    (sam, 'Always brings colleagues. Oat milk, no sugar.',
     '{"drink": "Cortado", "milk": "Oat"}'::jsonb, '{}'::jsonb, array[]::text[])
  on conflict (person_id) do nothing;

  insert into public.customer_preferences (person_id, preference_type, preference_value, source)
  values (asha, 'seating', 'at the quiet corner table', 'staff')
  on conflict do nothing;

  -- Community membership.
  insert into public.community_memberships (community_id, person_id, role, joined_at)
  values
    (badminton, asha, 'member', current_date - 200),
    (badminton, sam, 'member', current_date - 120),
    (book_club, ravi, 'organiser', current_date - 300),
    (book_club, nina, 'member', current_date - 250)
  on conflict (community_id, person_id) do nothing;

  -- Sam introduced Meera to the café.
  insert into public.referrals (referrer_person_id, referred_person_id, source_context, notes)
  values (sam, meera, 'Brought her in after work', 'Mentioned she was looking for somewhere to study.')
  on conflict (referrer_person_id, referred_person_id) do nothing;

  -- A birthday and an anniversary the café should not miss.
  insert into public.important_dates (person_id, date_type, date_value, label, recurring_annually)
  values
    (asha, 'birthday', make_date(1988, extract(month from current_date + 3)::int,
       least(extract(day from current_date + 3)::int, 28)), 'birthday', true),
    (ravi, 'anniversary', make_date(2015, extract(month from current_date + 10)::int,
       least(extract(day from current_date + 10)::int, 28)), 'wedding anniversary', true)
  on conflict do nothing;

  -- Events, one past and one upcoming.
  insert into public.events (name, description, starts_at, location, capacity, status, event_type, community_id, branch_id)
  values
    ('Doubles night', 'Badminton regulars come back for filter coffee afterwards.',
     now() - interval '6 days', 'Main room', 20, 'published', 'badminton', badminton, branch),
    ('Pour-over workshop', 'Learn to brew the house filter properly.',
     now() + interval '9 days', 'Counter', 8, 'published', 'workshop', null, branch)
  on conflict do nothing;

  select id into quiet_event from public.events where name = 'Doubles night';
  select id into workshop from public.events where name = 'Pour-over workshop';

  insert into public.event_registrations (event_id, person_id, status, guest_count)
  values
    (quiet_event, asha, 'attended', 1),
    (quiet_event, sam, 'attended', 2),
    (quiet_event, ravi, 'no_show', 1),
    (workshop, meera, 'registered', 1)
  on conflict (event_id, person_id) do nothing;

  -- Something the café got wrong and has not yet put right.
  insert into public.customer_feedback (person_id, rating, feedback_type, message, resolution_status)
  select nina, 2, 'service', 'Waited twenty minutes and the order was wrong.', 'open'
  where not exists (select 1 from public.customer_feedback where person_id = nina);

  -- Consent, deliberately mixed so audience filtering is visible in staging.
  insert into public.consents (person_id, purpose, channel, granted, source)
  values
    (asha, 'marketing', 'email', true, 'seed'),
    (sam, 'marketing', 'email', true, 'seed'),
    (ravi, 'marketing', 'email', true, 'seed'),
    (nina, 'marketing', 'email', false, 'seed'),
    (asha, 'event_invitations', 'email', true, 'seed'),
    (meera, 'event_invitations', 'email', true, 'seed')
  on conflict do nothing;

  -- Loyalty, so the score has something to read.
  insert into public.loyalty_accounts (person_id, tier, points_balance, lifetime_points)
  values
    (asha, 'gold', 340, 1200),
    (sam, 'silver', 180, 600)
  on conflict (person_id) do nothing;

  -- Bring derived intelligence up to date with everything above.
  perform public.recalculate_customer_health(null);
  perform public.generate_daily_hospitality_tasks();

  raise notice 'Synthetic staging seed complete: 5 guests, 2 communities, 2 events.';
end $$;
