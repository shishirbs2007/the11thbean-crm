-- Phase 7: explainable recommendations.
--
-- Every recommendation carries why it was made, the evidence behind it, how
-- confident the CRM is, and what to actually do. A recommendation that cannot
-- produce all four is not shown, because a member of staff who cannot check
-- the reasoning cannot disagree with it — and they should always be able to.
--
-- The reasoning is deterministic SQL over facts the café already records.
-- Nothing here is a black box, and nothing here needs a model.

create table if not exists public.recommendation_types (
    key text primary key,
    label text not null,
    category text not null
        check (category in ('risk', 'opportunity', 'care', 'community', 'event')),
    description text not null,
    default_priority integer not null default 3
        check (default_priority between 1 and 5),
    is_active boolean not null default true
);

insert into public.recommendation_types
    (key, label, category, description, default_priority)
values
    ('churn_risk', 'At risk of drifting away', 'risk',
     'A regular whose visits have stopped matching their own pattern.', 1),
    ('service_recovery', 'Needs putting right', 'risk',
     'Something went wrong and has not been resolved.', 1),
    ('milestone_soon', 'Milestone coming up', 'care',
     'A birthday or anniversary within the fortnight.', 2),
    ('becoming_regular', 'Becoming a regular', 'opportunity',
     'A new guest is forming a habit and worth learning properly.', 2),
    ('advocate', 'Worth thanking', 'opportunity',
     'A guest who has introduced others to the café.', 3),
    ('community_fit', 'Would suit a community', 'community',
     'Visits match a community that meets when they are here.', 3),
    ('event_fit', 'Would enjoy an upcoming event', 'event',
     'Their history matches an event that has not happened yet.', 3),
    ('unknown_usual', 'The café does not know their usual', 'care',
     'A frequent guest with no recorded preference.', 4)
on conflict (key) do update set
    label = excluded.label,
    description = excluded.description;

alter table public.recommendation_types enable row level security;

drop policy if exists recommendation_types_staff_read on public.recommendation_types;

create policy recommendation_types_staff_read
on public.recommendation_types
for select
to authenticated
using (true);


-- The next best hospitality action for one guest, or for every guest when
-- called with null.
--
-- Confidence is not a guess: it reflects how much evidence the café actually
-- has. Three visits is a pattern; one is a coincidence.
create or replace function public.hospitality_recommendations(
    target_person_id uuid default null,
    max_results integer default 50
)
returns table (
    person_id uuid,
    first_name text,
    last_name text,
    preferred_name text,
    recommendation_key text,
    label text,
    category text,
    priority integer,
    why text,
    evidence jsonb,
    confidence numeric,
    suggested_action text
)
language sql
stable
security definer
set search_path = public
as $$
    with candidates as (
        select
            p.id,
            p.first_name,
            p.last_name,
            p.preferred_name,
            coalesce(p.preferred_name, p.first_name) as short_name,
            h.total_visits,
            h.last_visit_at,
            h.first_visit_at,
            h.churn_risk,
            h.relationship_score,
            h.referral_count,
            h.lifetime_value,
            case
                when h.total_visits < 2 or h.first_visit_at is null then null
                else greatest(
                    1,
                    extract(day from (h.last_visit_at - h.first_visit_at))
                        / greatest(h.total_visits - 1, 1)
                )
            end as average_gap_days,
            extract(day from (now() - h.last_visit_at)) as days_since_visit
        from public.people p
        join public.customer_health h on h.person_id = p.id
        where p.is_active = true
          and (target_person_id is null or p.id = target_person_id)
    ),
    raised as (
        -- A regular who has drifted well past their own rhythm.
        select
            c.id, c.first_name, c.last_name, c.preferred_name,
            'churn_risk' as recommendation_key,
            c.short_name || ' usually comes every '
                || round(c.average_gap_days)::text
                || ' days and has not been in for '
                || round(c.days_since_visit)::text || '.' as why,
            jsonb_build_object(
                'total_visits', c.total_visits,
                'average_gap_days', round(c.average_gap_days),
                'days_since_visit', round(c.days_since_visit),
                'lifetime_value', c.lifetime_value
            ) as evidence,
            least(0.5 + c.total_visits * 0.05, 0.95) as confidence,
            'Get in touch personally. Mention the thing they usually order.' as suggested_action
        from candidates c
        where c.average_gap_days is not null
          and c.total_visits >= 3
          and c.days_since_visit > c.average_gap_days * 1.5

        union all

        -- Something went wrong and nobody has fixed it.
        select
            c.id, c.first_name, c.last_name, c.preferred_name,
            'service_recovery',
            c.short_name || ' left feedback rated '
                || f.rating::text || ' that is still open.',
            jsonb_build_object(
                'rating', f.rating,
                'message', f.message,
                'raised_at', f.created_at
            ),
            0.95,
            'Speak to them directly and record what was done about it.'
        from candidates c
        join public.customer_feedback f on f.person_id = c.id
        where f.resolution_status <> 'resolved'
          and coalesce(f.rating, 5) <= 3

        union all

        -- A milestone within the fortnight.
        select
            c.id, c.first_name, c.last_name, c.preferred_name,
            'milestone_soon',
            c.short_name || '''s ' || coalesce(d.label, d.date_type)
                || ' falls on ' || to_char(d.date_value, 'DD Mon') || '.',
            jsonb_build_object(
                'date_type', d.date_type,
                'date_value', d.date_value,
                'recurring', d.recurring_annually
            ),
            1.0,
            'Plan something small and personal rather than a discount.'
        from candidates c
        join public.important_dates d on d.person_id = c.id
        where make_date(
                extract(year from current_date)::integer,
                extract(month from d.date_value)::integer,
                extract(day from d.date_value)::integer
              ) between current_date and current_date + 14

        union all

        -- Somebody is forming a habit and is worth learning properly.
        select
            c.id, c.first_name, c.last_name, c.preferred_name,
            'becoming_regular',
            c.short_name || ' has been in ' || c.total_visits::text
                || ' times since ' || to_char(c.first_visit_at, 'DD Mon') || '.',
            jsonb_build_object(
                'total_visits', c.total_visits,
                'first_visit_at', c.first_visit_at
            ),
            0.7,
            'Learn their name and their usual before they have to repeat it.'
        from candidates c
        where c.total_visits between 2 and 4
          and c.first_visit_at >= now() - interval '60 days'

        union all

        -- Guests who brought other people in.
        select
            c.id, c.first_name, c.last_name, c.preferred_name,
            'advocate',
            c.short_name || ' has introduced ' || c.referral_count::text
                || ' guest' || case when c.referral_count = 1 then '' else 's' end
                || ' to the café.',
            jsonb_build_object('referral_count', c.referral_count),
            0.9,
            'Thank them properly. Advocates are how a café grows.'
        from candidates c
        where c.referral_count > 0

        union all

        -- A frequent guest whose usual the café has never recorded.
        select
            c.id, c.first_name, c.last_name, c.preferred_name,
            'unknown_usual',
            c.short_name || ' has been in ' || c.total_visits::text
                || ' times and the café has not recorded what they drink.',
            jsonb_build_object('total_visits', c.total_visits),
            0.8,
            'Ask what they usually order, and write it down.'
        from candidates c
        where c.total_visits >= 4
          and not exists (
            select 1 from public.customer_item_history i
            where i.person_id = c.id and i.visit_count > 1
          )
          and not exists (
            select 1 from public.customer_hospitality_profiles hp
            where hp.person_id = c.id
              and coalesce(hp.coffee_preferences->>'drink', '') <> ''
          )

        union all

        -- An upcoming event that matches what they have enjoyed before.
        select
            c.id, c.first_name, c.last_name, c.preferred_name,
            'event_fit',
            c.short_name || ' has been to ' || e.event_type
                || ' events before, and one is coming up.',
            jsonb_build_object(
                'event_type', e.event_type,
                'event_name', e.name,
                'starts_at', e.starts_at
            ),
            0.75,
            'Invite them personally rather than in a bulk message.'
        from candidates c
        join public.event_registrations r on r.person_id = c.id and r.status = 'attended'
        join public.events past_event on past_event.id = r.event_id
        join public.events e
          on e.event_type = past_event.event_type
         and e.starts_at > now()
        where not exists (
            select 1 from public.event_registrations existing
            where existing.event_id = e.id and existing.person_id = c.id
        )

        union all

        -- A community that meets when they are usually in.
        select
            c.id, c.first_name, c.last_name, c.preferred_name,
            'community_fit',
            c.short_name || ' comes in regularly and is not part of '
                || com.name || ' yet.',
            jsonb_build_object(
                'community', com.name,
                'total_visits', c.total_visits
            ),
            0.6,
            'Mention the group next time they are in. Do not sign them up.'
        from candidates c
        cross join public.communities com
        where c.total_visits >= 5
          and com.is_active = true
          and not exists (
            select 1 from public.community_memberships m
            where m.person_id = c.id and m.community_id = com.id and m.left_at is null
          )
          and exists (
            select 1 from public.community_memberships any_member
            where any_member.community_id = com.id and any_member.left_at is null
          )
    )
    select distinct on (r.id, r.recommendation_key)
        r.id,
        r.first_name,
        r.last_name,
        r.preferred_name,
        r.recommendation_key,
        t.label,
        t.category,
        t.default_priority,
        r.why,
        r.evidence,
        round(r.confidence, 2),
        r.suggested_action
    from raised r
    join public.recommendation_types t on t.key = r.recommendation_key
    where t.is_active = true
    order by r.id, r.recommendation_key, r.confidence desc
    limit greatest(max_results, 1);
$$;


-- The single most useful thing to do for a guest right now. Risk before care,
-- care before opportunity, and within that, whichever the café is most sure of.
create or replace function public.next_best_action(target_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (
            select jsonb_build_object(
                'recommendation', r.recommendation_key,
                'label', r.label,
                'category', r.category,
                'why', r.why,
                'evidence', r.evidence,
                'confidence', r.confidence,
                'suggested_action', r.suggested_action
            )
            from public.hospitality_recommendations(target_person_id, 20) r
            order by
                case r.category
                    when 'risk' then 1
                    when 'care' then 2
                    when 'opportunity' then 3
                    when 'community' then 4
                    else 5
                end,
                r.priority,
                r.confidence desc
            limit 1
        ),
        jsonb_build_object(
            'recommendation', 'none',
            'label', 'Nothing outstanding',
            'category', 'care',
            'why', 'The café has no open concerns or opportunities for this guest.',
            'evidence', '{}'::jsonb,
            'confidence', 1.0,
            'suggested_action', 'Greet them by name and ask how they are.'
        )
    );
$$;

grant select on public.recommendation_types to authenticated;

notify pgrst, 'reload schema';
