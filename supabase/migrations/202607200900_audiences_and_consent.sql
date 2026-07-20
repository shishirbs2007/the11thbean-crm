-- Phase 5: Marketing & Communications — audiences and consent.
--
-- This is not an email marketing tool. Before anything is sent, the system has
-- to be able to answer why this guest, why now, why this message. So audiences
-- are built from named rules that each explain themselves, and consent is
-- checked by the audience itself rather than by whoever remembers to check.

-- Consent, per channel and per purpose. The café may have permission to send
-- someone a booking confirmation and no permission at all to market to them.
create table if not exists public.consent_purposes (
    key text primary key,
    label text not null,
    description text,
    -- Transactional messages a guest has asked for do not need marketing
    -- consent, but they still need a record.
    requires_explicit_opt_in boolean not null default true,
    created_at timestamptz not null default now()
);

insert into public.consent_purposes (key, label, description, requires_explicit_opt_in)
values
    ('marketing', 'Marketing', 'General news and offers from the café.', true),
    ('event_invitations', 'Event invitations', 'Invitations to events and workshops.', true),
    ('community_updates', 'Community updates', 'News from communities they belong to.', true),
    ('transactional', 'Transactional', 'Confirmations and replies to something they started.', false),
    ('hospitality', 'Hospitality follow-up', 'Personal follow-up from staff, such as a thank-you.', false)
on conflict (key) do update set
    label = excluded.label,
    description = excluded.description;


-- Does this guest allow this kind of message on this channel?
--
-- The most recent explicit record wins. Purposes that do not require an opt-in
-- are allowed unless the guest has explicitly refused, and a suppression on
-- the channel overrides everything.
create or replace function public.has_consent(
    target_person_id uuid,
    target_channel text,
    target_purpose text default 'marketing'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select
        not exists (
            select 1
            from public.communication_suppressions s
            where s.person_id = target_person_id
              and s.channel = target_channel
              and (s.expires_at is null or s.expires_at > now())
        )
        and coalesce(
            (
                select c.granted
                from public.consents c
                where c.person_id = target_person_id
                  and c.purpose = target_purpose
                  and (c.channel is null or c.channel = target_channel)
                order by c.captured_at desc
                limit 1
            ),
            -- No record either way: allowed only if the purpose does not
            -- require an explicit opt-in.
            not coalesce(
                (
                    select p.requires_explicit_opt_in
                    from public.consent_purposes p
                    where p.key = target_purpose
                ),
                true
            )
        );
$$;


-- The rules an audience can be built from. A registry, like hospitality
-- signals, so a new way of describing guests is a row rather than a rewrite.
create table if not exists public.audience_rules (
    key text primary key,
    label text not null,
    description text not null,
    -- Free-text so the UI can group rules without a migration.
    category text not null default 'general',
    accepts_days boolean not null default false,
    accepts_reference_id boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

insert into public.audience_rules
    (key, label, description, category, accepts_days, accepts_reference_id)
values
    ('regular_not_seen', 'Regulars not seen recently', 'Guests with a real visit history who have not been in lately.', 'visiting', true, false),
    ('first_time_guest', 'First-time guests', 'Been in once or twice, recently enough to still be forming a habit.', 'visiting', true, false),
    ('returning_guest', 'Returning guests', 'Came back after a long gap.', 'visiting', true, false),
    ('vip_guest', 'VIP guests', 'Highest relationship scores in the café.', 'relationship', false, false),
    ('high_relationship', 'High relationship score', 'Well connected across communities, events and referrals.', 'relationship', false, false),
    ('referral_champion', 'Referral champions', 'Guests who have introduced others to the café.', 'relationship', false, false),
    ('birthday_this_month', 'Birthdays this month', 'Recorded birthdays falling in the current month.', 'milestones', false, false),
    ('anniversary_this_month', 'Anniversaries this month', 'Recorded anniversaries falling in the current month.', 'milestones', false, false),
    ('event_attendee', 'Event attendees', 'Attended a particular event.', 'events', false, true),
    ('community_member', 'Community members', 'Active members of a particular community.', 'community', false, true),
    ('workshop_interest', 'Interested in workshops', 'Attended or registered for a workshop.', 'events', false, false),
    ('favourite_item', 'Favourite item drinkers', 'Repeatedly order a particular item.', 'preferences', false, false),
    ('service_recovery', 'Service recovery', 'Something went wrong and has not been put right.', 'care', false, false),
    ('family', 'Families', 'Part of a household with more than one member.', 'household', false, false)
on conflict (key) do update set
    label = excluded.label,
    description = excluded.description,
    category = excluded.category;


-- The people matching one rule.
--
-- To add a rule: insert a row above and add a branch here. Every audience,
-- campaign and automation reads through this function, so there is exactly one
-- definition of what "regulars not seen recently" means.
create or replace function public.audience_rule_members(
    rule_key text,
    days integer default null,
    reference_id uuid default null,
    reference_text text default null
)
returns table (person_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  window_days integer := coalesce(days, 30);
begin
  return query
  select p.id
  from public.people p
  left join public.customer_health h on h.person_id = p.id
  where p.is_active = true
    and case rule_key
      when 'regular_not_seen' then
        coalesce(h.total_visits, 0) >= 3
        and h.last_visit_at is not null
        and h.last_visit_at < now() - make_interval(days => window_days)
      when 'first_time_guest' then
        coalesce(h.total_visits, 0) between 1 and 2
        and h.first_visit_at >= now() - make_interval(days => window_days)
      when 'returning_guest' then
        coalesce(h.total_visits, 0) >= 2
        and h.last_visit_at >= now() - make_interval(days => window_days)
        and exists (
          select 1 from public.visits v
          where v.person_id = p.id
            and v.visited_at < now() - make_interval(days => window_days * 3)
        )
      when 'vip_guest' then
        coalesce(h.relationship_score, 0) >= 70
      when 'high_relationship' then
        coalesce(h.relationship_score, 0) >= 50
      when 'referral_champion' then
        coalesce(h.referral_count, 0) > 0
      when 'birthday_this_month' then
        exists (
          select 1 from public.important_dates d
          where d.person_id = p.id
            and d.date_type = 'birthday'
            and extract(month from d.date_value) = extract(month from current_date)
        )
      when 'anniversary_this_month' then
        exists (
          select 1 from public.important_dates d
          where d.person_id = p.id
            and d.date_type <> 'birthday'
            and extract(month from d.date_value) = extract(month from current_date)
        )
      when 'event_attendee' then
        exists (
          select 1 from public.event_registrations r
          where r.person_id = p.id
            and r.status = 'attended'
            and (reference_id is null or r.event_id = reference_id)
        )
      when 'community_member' then
        exists (
          select 1 from public.community_memberships m
          where m.person_id = p.id
            and m.left_at is null
            and (reference_id is null or m.community_id = reference_id)
        )
      when 'workshop_interest' then
        exists (
          select 1
          from public.event_registrations r
          join public.events e on e.id = r.event_id
          where r.person_id = p.id
            and e.event_type ilike '%workshop%'
        )
      when 'favourite_item' then
        exists (
          select 1 from public.customer_item_history i
          where i.person_id = p.id
            and i.visit_count > 1
            and (
              reference_text is null
              or i.item_name ilike '%' || reference_text || '%'
            )
        )
      when 'service_recovery' then
        exists (
          select 1 from public.customer_feedback f
          where f.person_id = p.id
            and f.resolution_status <> 'resolved'
            and coalesce(f.rating, 5) <= 3
        )
      when 'family' then
        exists (
          select 1
          from public.household_members hm
          where hm.person_id = p.id
            and (
              select count(*) from public.household_members other
              where other.household_id = hm.household_id
            ) > 1
        )
      else false
    end;
end;
$$;


-- A saved audience: a set of rules, a channel, and the purpose it will be
-- used for. Consent is part of the definition, not an afterthought.
create table if not exists public.audiences (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    -- [{ "key": "regular_not_seen", "days": 30 }, ...]
    rules jsonb not null default '[]'::jsonb,
    match_mode text not null default 'any'
        check (match_mode in ('any', 'all')),
    channel text not null default 'email'
        check (channel in ('email', 'whatsapp', 'sms', 'push', 'internal')),
    purpose text not null default 'marketing'
        references public.consent_purposes(key),
    is_active boolean not null default true,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.audiences enable row level security;

drop policy if exists audiences_staff_read on public.audiences;

create policy audiences_staff_read
on public.audiences
for select
to authenticated
using (true);

drop policy if exists audiences_manager_write on public.audiences;

create policy audiences_manager_write
on public.audiences
for all
to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

alter table public.audience_rules enable row level security;

drop policy if exists audience_rules_staff_read on public.audience_rules;

create policy audience_rules_staff_read
on public.audience_rules
for select
to authenticated
using (true);

alter table public.consent_purposes enable row level security;

drop policy if exists consent_purposes_staff_read on public.consent_purposes;

create policy consent_purposes_staff_read
on public.consent_purposes
for select
to authenticated
using (true);


-- Who is in this audience, and why.
--
-- Returns one row per guest with the rules that matched them, so the audience
-- can always account for itself. Anyone without consent for the channel and
-- purpose is excluded here, so no caller can forget.
create or replace function public.evaluate_audience(
    audience_rules_json jsonb,
    match_mode text default 'any',
    target_channel text default 'email',
    target_purpose text default 'marketing'
)
returns table (
    person_id uuid,
    first_name text,
    last_name text,
    preferred_name text,
    matched_rules text[]
)
language sql
stable
security definer
set search_path = public
as $$
    with rule_list as (
        select
            rule->>'key' as rule_key,
            nullif(rule->>'days', '')::integer as days,
            nullif(rule->>'reference_id', '')::uuid as reference_id,
            nullif(rule->>'reference_text', '') as reference_text
        from jsonb_array_elements(coalesce(audience_rules_json, '[]'::jsonb)) rule
    ),
    matches as (
        select
            m.person_id,
            r.rule_key
        from rule_list r
        cross join lateral public.audience_rule_members(
            r.rule_key, r.days, r.reference_id, r.reference_text
        ) m
    ),
    grouped as (
        select
            m.person_id,
            array_agg(distinct m.rule_key) as matched_rules,
            count(distinct m.rule_key) as rules_matched
        from matches m
        group by m.person_id
    )
    select
        g.person_id,
        p.first_name,
        p.last_name,
        p.preferred_name,
        g.matched_rules
    from grouped g
    join public.people p on p.id = g.person_id
    where (
        match_mode <> 'all'
        or g.rules_matched = (select count(*) from rule_list)
    )
      and public.has_consent(g.person_id, target_channel, target_purpose)
    order by p.first_name;
$$;


-- The breakdown staff actually read: "237 guests selected — 81 attended Book
-- Club, 65 haven't visited in 30 days, ...". Counts are per rule, so they
-- overlap; the total is the distinct number of people.
create or replace function public.explain_audience(
    audience_rules_json jsonb,
    match_mode text default 'any',
    target_channel text default 'email',
    target_purpose text default 'marketing'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with selected as (
        select person_id, matched_rules
        from public.evaluate_audience(
            audience_rules_json, match_mode, target_channel, target_purpose
        )
    ),
    per_rule as (
        select
            rule_key,
            count(*)::integer as guest_count
        from selected, unnest(selected.matched_rules) as rule_key
        group by rule_key
    )
    select jsonb_build_object(
        'total', (select count(*) from selected),
        'reasons', coalesce(
            (
                select jsonb_agg(
                    jsonb_build_object(
                        'key', pr.rule_key,
                        'label', coalesce(ar.label, pr.rule_key),
                        'count', pr.guest_count
                    )
                    order by pr.guest_count desc
                )
                from per_rule pr
                left join public.audience_rules ar on ar.key = pr.rule_key
            ),
            '[]'::jsonb
        )
    );
$$;

grant select on public.audience_rules to authenticated;
grant select on public.consent_purposes to authenticated;

notify pgrst, 'reload schema';
