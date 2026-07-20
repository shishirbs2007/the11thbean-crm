-- Phase 4: Hospitality Operating System — the signal registry.
--
-- Hospitality intelligence lives in the database, in one place, so it cannot
-- drift between screens. Rather than hard-coding a scoring formula, signals are
-- registered as rows: adding "staff affinity" or "travel distance" later means
-- inserting a row and extending one case expression, not rewriting a query or
-- hunting through the application.
--
-- Every signal returns a 0-100 strength for a person, and carries a weight and
-- a plain-language template so the CRM can always explain itself to staff.

create table if not exists public.hospitality_signals (
    key text primary key,
    label text not null,
    description text,
    weight numeric(5,2) not null default 1
        check (weight >= 0),
    is_active boolean not null default true,
    -- Signals a café may not want, such as spend, can be switched off without
    -- a deployment.
    created_at timestamptz not null default now()
);

alter table public.hospitality_signals enable row level security;

drop policy if exists hospitality_signals_staff_read
on public.hospitality_signals;

create policy hospitality_signals_staff_read
on public.hospitality_signals
for select
to authenticated
using (true);

drop policy if exists hospitality_signals_manager_write
on public.hospitality_signals;

create policy hospitality_signals_manager_write
on public.hospitality_signals
for all
to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

insert into public.hospitality_signals (key, label, description, weight)
values
    ('visit_recency', 'Visit recency', 'How recently the guest was last in.', 1.00),
    ('visit_frequency', 'Visit frequency', 'How often the guest comes.', 0.90),
    ('favourite_weekday', 'Favourite weekday', 'Today matches the day they usually come.', 0.70),
    ('favourite_time', 'Favourite time', 'Now matches the time they usually come.', 0.50),
    ('relationship', 'Relationship depth', 'How connected the guest is across the café.', 0.80),
    ('spend_behaviour', 'Spend behaviour', 'Lifetime value and average ticket.', 0.40),
    ('coffee_preference', 'Coffee preference', 'The café knows their usual order.', 0.60),
    ('event_affinity', 'Event affinity', 'How often they come to events.', 0.60),
    ('rsvp_reliability', 'RSVP reliability', 'Whether they turn up when they say they will.', 0.50),
    ('referral', 'Referral relationships', 'Guests they have introduced to the café.', 0.70),
    ('community', 'Community engagement', 'Membership of the cafe''s communities.', 0.70)
on conflict (key) do update set
    label = excluded.label,
    description = excluded.description;


-- The strength of every active signal for one guest, on a 0-100 scale.
--
-- To add a signal: insert a row above and add a branch here. Nothing else in
-- the system needs to change, because every caller reads through this function.
create or replace function public.hospitality_signal_strengths(
    target_person_id uuid,
    reference_time timestamptz default now()
)
returns table (
    signal_key text,
    label text,
    weight numeric,
    strength numeric
)
language sql
stable
security definer
set search_path = public
as $$
    with facts as (
        select
            h.person_id,
            h.recency_score,
            h.frequency_score,
            h.relationship_score,
            h.community_score,
            h.referral_score,
            h.monetary_score,
            h.preferred_visit_day,
            h.preferred_visit_time,
            (
                select count(*)
                from public.event_registrations r
                where r.person_id = h.person_id
                  and r.status = 'attended'
            )::numeric as events_attended,
            (
                select count(*)
                from public.event_registrations r
                where r.person_id = h.person_id
                  and r.status in ('attended', 'no_show')
            )::numeric as events_decided,
            (
                select count(*)
                from public.customer_hospitality_profiles p
                where p.person_id = h.person_id
                  and coalesce(p.coffee_preferences->>'drink', '') <> ''
            )::numeric as stated_coffee,
            (
                select count(*)
                from public.customer_item_history i
                where i.person_id = h.person_id
                  and i.visit_count > 1
            )::numeric as repeat_items
        from public.customer_health h
        where h.person_id = target_person_id
    )
    select
        s.key,
        s.label,
        s.weight,
        greatest(0, least(100, case s.key
            when 'visit_recency' then f.recency_score
            when 'visit_frequency' then f.frequency_score
            when 'relationship' then f.relationship_score
            when 'community' then f.community_score
            when 'referral' then f.referral_score
            when 'spend_behaviour' then f.monetary_score
            when 'favourite_weekday' then
                case
                    when f.preferred_visit_day is null then 0
                    when trim(f.preferred_visit_day) =
                        trim(to_char(extract(dow from reference_time), '9'))
                        then 100
                    else 0
                end
            when 'favourite_time' then
                case
                    when f.preferred_visit_time is null then 0
                    when abs(
                        extract(hour from reference_time)
                        - split_part(f.preferred_visit_time, ':', 1)::numeric
                    ) <= 1 then 100
                    when abs(
                        extract(hour from reference_time)
                        - split_part(f.preferred_visit_time, ':', 1)::numeric
                    ) <= 2 then 50
                    else 0
                end
            when 'coffee_preference' then
                least((f.stated_coffee * 60) + (f.repeat_items * 20), 100)
            when 'event_affinity' then least(f.events_attended * 25, 100)
            when 'rsvp_reliability' then
                case
                    when f.events_decided = 0 then 0
                    else round(f.events_attended * 100 / f.events_decided, 1)
                end
            else 0
        end)) as strength
    from public.hospitality_signals s
    cross join facts f
    where s.is_active = true;
$$;


-- One weighted score per guest, with the signals that drove it. This is the
-- single entry point for "how well do we know this person, and how ready are
-- we to look after them today".
create or replace function public.hospitality_score(
    target_person_id uuid,
    reference_time timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'score', coalesce(
            round(
                sum(strength * weight) / nullif(sum(weight), 0),
                1
            ),
            0
        ),
        'signals', coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'key', signal_key,
                    'label', label,
                    'strength', strength,
                    'weight', weight
                )
                order by strength * weight desc
            ) filter (where strength > 0),
            '[]'::jsonb
        )
    )
    from public.hospitality_signal_strengths(target_person_id, reference_time);
$$;

grant select on public.hospitality_signals to authenticated;

notify pgrst, 'reload schema';
