-- Phase 6: Business Intelligence.
--
-- This is a decision-support system, not a reporting system. A number on its
-- own is not an insight, so every metric here carries four things: what it is
-- now, which way it is moving, why, and what to do about it. Anything that
-- cannot answer all four does not belong on the dashboard.
--
-- Nothing computes its own version of the truth. Revenue comes from visits,
-- relationships from customer_health, communities from community_health,
-- campaigns from campaign_outcomes. There is one source for each fact.
--
-- Performance: everything below is a function or a view over indexed columns.
-- Nothing is materialized yet, deliberately — at café scale these run in
-- milliseconds, and a stale aggregate is worse than a slow honest one. The
-- point at which materialization becomes justified is documented in
-- docs/ANALYTICS.md along with the refresh strategy it would need.

-- Business facts for a period, and the period before it, so trend is always
-- available without a second round trip.
create or replace function public.business_period_facts(
    period_days integer default 30,
    reference_time timestamptz default now()
)
returns table (
    metric_key text,
    current_value numeric,
    previous_value numeric
)
language sql
stable
security definer
set search_path = public
as $$
    with bounds as (
        select
            reference_time - make_interval(days => period_days) as current_start,
            reference_time as current_end,
            reference_time - make_interval(days => period_days * 2) as previous_start,
            reference_time - make_interval(days => period_days) as previous_end
    ),
    visit_facts as (
        select
            count(*) filter (where v.visited_at between b.current_start and b.current_end) as visits_now,
            count(*) filter (where v.visited_at between b.previous_start and b.previous_end) as visits_before,
            coalesce(sum(v.net_amount) filter (where v.visited_at between b.current_start and b.current_end), 0) as revenue_now,
            coalesce(sum(v.net_amount) filter (where v.visited_at between b.previous_start and b.previous_end), 0) as revenue_before,
            count(distinct v.person_id) filter (where v.visited_at between b.current_start and b.current_end) as guests_now,
            count(distinct v.person_id) filter (where v.visited_at between b.previous_start and b.previous_end) as guests_before
        from public.visits v, bounds b
    ),
    repeat_facts as (
        select
            count(*) filter (where visits_in_period > 1) as repeat_now,
            count(*) as active_now
        from (
            select v.person_id, count(*) as visits_in_period
            from public.visits v, bounds b
            where v.visited_at between b.current_start and b.current_end
            group by v.person_id
        ) per_guest
    ),
    growth_facts as (
        select
            count(*) filter (where p.created_at between b.current_start and b.current_end) as new_now,
            count(*) filter (where p.created_at between b.previous_start and b.previous_end) as new_before
        from public.people p, bounds b
        where p.is_active = true
    ),
    relationship_facts as (
        select
            coalesce(avg(h.relationship_score), 0) as relationship_now,
            coalesce(avg(h.health_score), 0) as health_now
        from public.customer_health h
        where h.total_visits > 0
    ),
    task_facts as (
        select
            count(*) filter (
                where t.status = 'done'
                  and t.due_on >= (b.current_start)::date
            ) as done_now,
            count(*) filter (where t.due_on >= (b.current_start)::date) as raised_now
        from public.hospitality_tasks t, bounds b
    ),
    recovery_facts as (
        select
            count(*) filter (
                where f.resolution_status = 'resolved'
                  and f.created_at >= b.current_start
            ) as resolved_now,
            count(*) filter (
                where coalesce(f.rating, 5) <= 3
                  and f.created_at >= b.current_start
            ) as raised_now
        from public.customer_feedback f, bounds b
    ),
    community_facts as (
        select
            count(*) filter (where ch.events_last_quarter > 0) as thriving,
            count(*) as total
        from public.community_health ch
    ),
    event_facts as (
        select
            coalesce(sum(s.attended_count), 0) as attended,
            coalesce(sum(s.registered_count), 0) as registered
        from public.event_attendance_summary s, bounds b
        where s.starts_at between b.current_start and b.current_end
    ),
    campaign_facts as (
        select
            coalesce(sum(co.visits_generated), 0) as visits_generated,
            coalesce(sum(co.reached), 0) as reached
        from public.campaign_outcomes co
    )
    select * from (
        values
            ('revenue', (select revenue_now from visit_facts), (select revenue_before from visit_facts)),
            ('visits', (select visits_now from visit_facts)::numeric, (select visits_before from visit_facts)::numeric),
            ('guests', (select guests_now from visit_facts)::numeric, (select guests_before from visit_facts)::numeric),
            ('average_spend',
                case when (select visits_now from visit_facts) = 0 then 0
                     else (select revenue_now from visit_facts) / (select visits_now from visit_facts) end,
                case when (select visits_before from visit_facts) = 0 then 0
                     else (select revenue_before from visit_facts) / (select visits_before from visit_facts) end),
            ('repeat_rate',
                case when (select active_now from repeat_facts) = 0 then 0
                     else (select repeat_now from repeat_facts) * 100.0 / (select active_now from repeat_facts) end,
                null),
            ('new_customers', (select new_now from growth_facts)::numeric, (select new_before from growth_facts)::numeric),
            ('relationship_score', (select relationship_now from relationship_facts), null),
            ('hospitality_health', (select health_now from relationship_facts), null),
            ('task_completion',
                case when (select raised_now from task_facts) = 0 then 100
                     else (select done_now from task_facts) * 100.0 / (select raised_now from task_facts) end,
                null),
            ('service_recovery',
                case when (select raised_now from recovery_facts) = 0 then 100
                     else (select resolved_now from recovery_facts) * 100.0 / (select raised_now from recovery_facts) end,
                null),
            ('community_health',
                case when (select total from community_facts) = 0 then 0
                     else (select thriving from community_facts) * 100.0 / (select total from community_facts) end,
                null),
            ('event_turnout',
                case when (select registered from event_facts) = 0 then 0
                     else (select attended from event_facts) * 100.0 / (select registered from event_facts) end,
                null),
            ('campaign_effectiveness',
                case when (select reached from campaign_facts) = 0 then 0
                     else (select visits_generated from campaign_facts) * 100.0 / (select reached from campaign_facts) end,
                null)
    ) as facts(metric_key, current_value, previous_value);
$$;


-- The registry of what the café watches, how to read each number, and where
-- to go to see the rows behind it. Adding a KPI is a row plus a fact above.
create table if not exists public.business_metrics (
    key text primary key,
    label text not null,
    unit text not null default 'number'
        check (unit in ('number', 'currency', 'percent')),
    -- What this measures, in the words a café owner would use.
    description text not null,
    -- Where to go to see the underlying rows. No number is a dead end.
    drill_down_path text not null,
    -- Below this, the metric needs attention.
    healthy_above numeric,
    higher_is_better boolean not null default true,
    display_order integer not null default 100,
    is_active boolean not null default true
);

insert into public.business_metrics
    (key, label, unit, description, drill_down_path, healthy_above, higher_is_better, display_order)
values
    ('revenue', 'Revenue', 'currency', 'Recorded takings from visits in the period.', '/visits', null, true, 10),
    ('visits', 'Visits', 'number', 'How many times guests came in.', '/visits', null, true, 20),
    ('guests', 'Guests', 'number', 'How many different people came in.', '/customers', null, true, 30),
    ('average_spend', 'Average spend', 'currency', 'Revenue divided by visits.', '/visits', null, true, 40),
    ('repeat_rate', 'Repeat rate', 'percent', 'Share of guests who came more than once in the period.', '/customers', 40, true, 50),
    ('new_customers', 'New customers', 'number', 'People recorded for the first time.', '/customers', null, true, 60),
    ('relationship_score', 'Relationship depth', 'number', 'Average relationship score across guests who visit.', '/insights', 40, true, 70),
    ('hospitality_health', 'Hospitality health', 'number', 'Average customer health across guests who visit.', '/insights', 50, true, 80),
    ('task_completion', 'Hospitality actions done', 'percent', 'Share of raised hospitality tasks that were completed.', '/briefing', 70, true, 90),
    ('service_recovery', 'Service recovery', 'percent', 'Share of poor feedback that has been put right.', '/feedback', 80, true, 100),
    ('community_health', 'Communities meeting', 'percent', 'Share of communities that held an event this quarter.', '/communities', 60, true, 110),
    ('event_turnout', 'Event turnout', 'percent', 'Share of registered guests who actually came.', '/events', 70, true, 120),
    ('campaign_effectiveness', 'Campaign effectiveness', 'percent', 'Share of contacted guests who visited afterwards.', '/campaigns', 15, true, 130)
on conflict (key) do update set
    label = excluded.label,
    description = excluded.description,
    drill_down_path = excluded.drill_down_path,
    healthy_above = excluded.healthy_above,
    display_order = excluded.display_order;

alter table public.business_metrics enable row level security;

drop policy if exists business_metrics_staff_read on public.business_metrics;

create policy business_metrics_staff_read
on public.business_metrics
for select
to authenticated
using (true);


-- The executive dashboard, assembled: value, trend, why, and what to do.
--
-- The recommended action is derived from the same thresholds staff can see in
-- the registry, so nobody has to guess why the CRM is worried.
create or replace function public.executive_kpis(
    period_days integer default 30,
    reference_time timestamptz default now()
)
returns table (
    key text,
    label text,
    unit text,
    value numeric,
    previous_value numeric,
    change_percent numeric,
    description text,
    explanation text,
    recommended_action text,
    needs_attention boolean,
    drill_down_path text
)
language sql
stable
security definer
set search_path = public
as $$
    with facts as (
        select * from public.business_period_facts(period_days, reference_time)
    ),
    joined as (
        select
            m.key,
            m.label,
            m.unit,
            round(coalesce(f.current_value, 0), 1) as value,
            round(f.previous_value, 1) as previous_value,
            case
                when f.previous_value is null or f.previous_value = 0 then null
                else round(
                    (f.current_value - f.previous_value) * 100 / f.previous_value,
                    1
                )
            end as change_percent,
            m.description,
            m.healthy_above,
            m.higher_is_better,
            m.drill_down_path,
            m.display_order
        from public.business_metrics m
        join facts f on f.metric_key = m.key
        where m.is_active = true
    )
    select
        j.key,
        j.label,
        j.unit,
        j.value,
        j.previous_value,
        j.change_percent,
        j.description,
        case
            when j.change_percent is null then
                j.description
            when j.change_percent > 0 then
                'Up ' || abs(j.change_percent)::text || '% on the previous '
                || period_days::text || ' days.'
            when j.change_percent < 0 then
                'Down ' || abs(j.change_percent)::text || '% on the previous '
                || period_days::text || ' days.'
            else
                'Unchanged on the previous ' || period_days::text || ' days.'
        end as explanation,
        case j.key
            when 'repeat_rate' then
                case when j.healthy_above is not null and j.value < j.healthy_above
                    then 'Most guests are not coming back. Look at who visited once and why they have not returned.'
                    else 'Healthy. Keep learning regulars'' usual orders.' end
            when 'task_completion' then
                case when j.healthy_above is not null and j.value < j.healthy_above
                    then 'Hospitality actions are being raised faster than they are done. Review the briefing at the start of each shift.'
                    else 'The shift is keeping up with its hospitality actions.' end
            when 'service_recovery' then
                case when j.healthy_above is not null and j.value < j.healthy_above
                    then 'Guests are still waiting for something to be put right. Clear these before anything else.'
                    else 'Complaints are being resolved.' end
            when 'community_health' then
                case when j.healthy_above is not null and j.value < j.healthy_above
                    then 'Communities are going quiet. Schedule an event for the ones with nothing planned.'
                    else 'Communities are meeting regularly.' end
            when 'event_turnout' then
                case when j.healthy_above is not null and j.value < j.healthy_above
                    then 'People register and then do not come. Try a reminder the day before.'
                    else 'People who register are turning up.' end
            when 'campaign_effectiveness' then
                case when j.healthy_above is not null and j.value < j.healthy_above
                    then 'Messages are not bringing people in. Send fewer, to smaller and better-reasoned audiences.'
                    else 'Campaigns are bringing guests back.' end
            when 'relationship_score' then
                case when j.healthy_above is not null and j.value < j.healthy_above
                    then 'Guests are transacting rather than belonging. Introduce regulars to a community.'
                    else 'Guests are well connected to the café.' end
            when 'hospitality_health' then
                case when j.healthy_above is not null and j.value < j.healthy_above
                    then 'Overall guest health is low. Start with the drifting regulars on the briefing.'
                    else 'Guest health is holding up.' end
            when 'revenue' then
                case when coalesce(j.change_percent, 0) < -10
                    then 'Takings have fallen. Check whether visits or average spend dropped, and which regulars stopped coming.'
                    else 'Takings are steady or growing.' end
            when 'visits' then
                case when coalesce(j.change_percent, 0) < -10
                    then 'Fewer visits than last period. The briefing lists who is overdue.'
                    else 'Visit numbers are holding.' end
            when 'guests' then
                case when coalesce(j.change_percent, 0) < -10
                    then 'Fewer different people came in. Look at whether regulars are drifting or new guests stopped arriving.'
                    else 'The café is seeing a healthy spread of people.' end
            when 'average_spend' then
                case when coalesce(j.change_percent, 0) < -10
                    then 'Average spend has slipped. Check whether food is being ordered alongside drinks.'
                    else 'Average spend is stable.' end
            when 'new_customers' then
                case when coalesce(j.change_percent, 0) < -10
                    then 'Fewer new faces. Referral champions are the cheapest way to change that.'
                    else 'New guests are still arriving.' end
            else j.description
        end as recommended_action,
        case
            when j.healthy_above is not null then
                case when j.higher_is_better
                    then j.value < j.healthy_above
                    else j.value > j.healthy_above end
            else coalesce(j.change_percent, 0) < -10
        end as needs_attention,
        j.drill_down_path
    from joined j
    order by j.display_order;
$$;


-- Which regulars are drifting away, and how far past their own rhythm they
-- are. Reuses the same cadence logic as the daily briefing rather than
-- inventing a second definition of "overdue".
create or replace function public.drifting_regulars(
    max_results integer default 25
)
returns table (
    person_id uuid,
    first_name text,
    last_name text,
    preferred_name text,
    days_since_visit integer,
    average_gap_days integer,
    overdue_ratio numeric,
    lifetime_value numeric,
    reason text
)
language sql
stable
security definer
set search_path = public
as $$
    select
        p.id,
        p.first_name,
        p.last_name,
        p.preferred_name,
        extract(day from (now() - h.last_visit_at))::integer,
        gap.average_gap_days::integer,
        round(
            extract(day from (now() - h.last_visit_at))::numeric
            / nullif(gap.average_gap_days, 0),
            1
        ),
        h.lifetime_value,
        'Usually in every ' || gap.average_gap_days::integer::text
            || ' days, last seen '
            || extract(day from (now() - h.last_visit_at))::integer::text
            || ' days ago'
    from public.customer_health h
    join public.people p on p.id = h.person_id
    cross join lateral (
        select greatest(
            1,
            extract(day from (h.last_visit_at - h.first_visit_at))
                / greatest(h.total_visits - 1, 1)
        ) as average_gap_days
    ) gap
    where p.is_active = true
      and h.total_visits >= 3
      and h.last_visit_at is not null
      and extract(day from (now() - h.last_visit_at)) > gap.average_gap_days * 1.5
    order by h.lifetime_value desc, h.last_visit_at
    limit greatest(max_results, 1);
$$;


-- First-time guests who became regulars, and what the café did in between.
-- This is how staff learn which acts of hospitality actually work.
create or replace function public.conversion_stories(
    max_results integer default 25
)
returns table (
    person_id uuid,
    first_name text,
    last_name text,
    preferred_name text,
    total_visits integer,
    days_to_regular integer,
    hospitality_actions integer,
    events_attended integer,
    communities_joined integer
)
language sql
stable
security definer
set search_path = public
as $$
    select
        p.id,
        p.first_name,
        p.last_name,
        p.preferred_name,
        h.total_visits,
        extract(day from (h.last_visit_at - h.first_visit_at))::integer,
        (
            select count(*)::integer from public.hospitality_tasks t
            where t.person_id = p.id and t.status = 'done'
        ),
        (
            select count(*)::integer from public.event_registrations r
            where r.person_id = p.id and r.status = 'attended'
        ),
        (
            select count(*)::integer from public.community_memberships m
            where m.person_id = p.id and m.left_at is null
        )
    from public.customer_health h
    join public.people p on p.id = h.person_id
    where p.is_active = true
      and h.total_visits >= 5
      and h.first_visit_at is not null
    order by h.first_visit_at desc
    limit greatest(max_results, 1);
$$;


-- When the café is busy and when it is quiet, from recorded visits.
create or replace view public.operational_rhythm as
select
    extract(dow from v.visited_at)::integer as day_of_week,
    extract(hour from v.visited_at)::integer as hour_of_day,
    count(*)::integer as visit_count,
    coalesce(sum(v.party_size), 0)::integer as guest_count,
    round(coalesce(avg(v.net_amount), 0), 2) as average_spend
from public.visits v
where v.visited_at >= now() - interval '90 days'
group by 1, 2;


-- Explainable forecasting.
--
-- Deliberately a moving average over the same weekday, not a model: a café
-- owner can check this by hand, and a forecast nobody can check is a forecast
-- nobody should act on. The method is returned alongside the number.
create or replace function public.forecast_demand(
    days_ahead integer default 7,
    reference_time timestamptz default now()
)
returns table (
    forecast_date date,
    day_of_week integer,
    expected_visits numeric,
    expected_guests numeric,
    expected_revenue numeric,
    sample_weeks integer,
    method text
)
language sql
stable
security definer
set search_path = public
as $$
    with horizon as (
        select
            (reference_time + make_interval(days => offset_days))::date as forecast_date,
            extract(dow from reference_time + make_interval(days => offset_days))::integer as dow
        from generate_series(0, greatest(days_ahead, 1) - 1) as offset_days
    ),
    history as (
        select
            extract(dow from v.visited_at)::integer as dow,
            date_trunc('week', v.visited_at) as week_start,
            count(*) as visits,
            coalesce(sum(v.party_size), 0) as guests,
            coalesce(sum(v.net_amount), 0) as revenue
        from public.visits v
        where v.visited_at >= reference_time - interval '84 days'
          and v.visited_at < reference_time
        group by 1, 2
    ),
    averages as (
        select
            dow,
            round(avg(visits), 1) as expected_visits,
            round(avg(guests), 1) as expected_guests,
            round(avg(revenue), 0) as expected_revenue,
            count(*)::integer as sample_weeks
        from history
        group by dow
    )
    select
        h.forecast_date,
        h.dow,
        coalesce(a.expected_visits, 0),
        coalesce(a.expected_guests, 0),
        coalesce(a.expected_revenue, 0),
        coalesce(a.sample_weeks, 0),
        case
            when coalesce(a.sample_weeks, 0) = 0
                then 'No history for this weekday yet'
            else 'Average of the last ' || a.sample_weeks::text
                || ' same weekdays'
        end
    from horizon h
    left join averages a on a.dow = h.dow
    order by h.forecast_date;
$$;

grant select on public.business_metrics to authenticated;
grant select on public.operational_rhythm to authenticated;

notify pgrst, 'reload schema';
