-- Operational monitoring.
--
-- Failure information already existed but was scattered: automation failures on
-- one page, adapter health on another, import problems on a third, and nothing
-- at all for an error thrown inside a server action. Nobody would find any of
-- it unless they went looking, and by then a guest had already noticed.
--
-- This gives the café one place that answers "is this working?", and a record
-- of anything that broke. It is deliberately built so an external service such
-- as Sentry can be added later without changing any of the checks: incidents
-- are captured here first, and dispatch is a separate concern.

create table if not exists public.system_incidents (
    id uuid primary key default gen_random_uuid(),
    occurred_at timestamptz not null default now(),
    severity text not null default 'error'
        check (severity in ('info', 'warning', 'error', 'critical')),
    -- Where it happened, in terms a person would use: "briefing", "import".
    area text not null,
    summary text not null,
    detail text,
    -- Anything that helps diagnosis, never anything identifying a guest
    -- beyond an id.
    context jsonb not null default '{}'::jsonb,
    person_id uuid references public.people(id) on delete set null,
    -- Set once somebody has looked. An incident nobody acknowledges stays
    -- visible, which is the point.
    acknowledged_at timestamptz,
    acknowledged_by uuid references auth.users(id) on delete set null,
    -- Whether an external alerting service has been told. Null until one is
    -- configured, so adding Sentry later needs no schema change.
    dispatched_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists system_incidents_open_idx
on public.system_incidents(occurred_at desc)
where acknowledged_at is null;

create index if not exists system_incidents_area_idx
on public.system_incidents(area, occurred_at desc);

alter table public.system_incidents enable row level security;

drop policy if exists system_incidents_staff_read on public.system_incidents;

create policy system_incidents_staff_read
on public.system_incidents for select to authenticated using (true);

drop policy if exists system_incidents_staff_write on public.system_incidents;

create policy system_incidents_staff_write
on public.system_incidents for all to authenticated
using (true) with check (true);


-- Records something that went wrong.
--
-- Callable from the application, from a trigger, or from a function. Kept
-- deliberately forgiving: monitoring that throws is worse than no monitoring,
-- because it turns a small failure into a page that will not load.
create or replace function public.record_incident(
    incident_area text,
    incident_summary text,
    incident_detail text default null,
    incident_severity text default 'error',
    incident_context jsonb default '{}'::jsonb,
    subject_person_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  incident_id uuid;
begin
  insert into public.system_incidents (
    area, summary, detail, severity, context, person_id
  )
  values (
    coalesce(nullif(incident_area, ''), 'unknown'),
    coalesce(nullif(incident_summary, ''), 'Unspecified failure'),
    incident_detail,
    case
      when incident_severity in ('info', 'warning', 'error', 'critical')
        then incident_severity
      else 'error'
    end,
    coalesce(incident_context, '{}'::jsonb),
    subject_person_id
  )
  returning id into incident_id;

  return incident_id;
exception when others then
  -- Never let recording a problem become the problem.
  return null;
end;
$$;


-- The health of the café's CRM, as a set of named checks.
--
-- Each returns a status, what it measured, and what to do about it. A check
-- that cannot say what to do is not worth showing: staff need an action, not a
-- red light.
create or replace function public.system_health_checks()
returns table (
    check_key text,
    label text,
    status text,
    detail text,
    recommended_action text,
    drill_down_path text
)
language sql
stable
security definer
set search_path = public
as $$
    with
    -- Is anything actually reaching the CRM? A café that is trading but shows
    -- no visits has a broken pipeline, not a quiet week.
    visit_freshness as (
        select max(visited_at) as last_visit from public.visits
    ),
    automation_failures as (
        select count(*)::integer as failures
        from public.automation_run_items
        where outcome = 'failed'
          and created_at >= now() - interval '7 days'
    ),
    import_failures as (
        select
            coalesce(sum(orders_failed), 0)::integer as failures,
            coalesce(sum(guests_unmatched), 0)::integer as unmatched
        from public.import_runs
        where started_at >= now() - interval '7 days'
    ),
    adapter_trouble as (
        select count(*)::integer as failing
        from public.integration_adapters
        where is_enabled = true and health_status = 'failing'
    ),
    open_incidents as (
        select
            count(*)::integer as total,
            count(*) filter (where severity in ('error', 'critical'))::integer as serious
        from public.system_incidents
        where acknowledged_at is null
          and occurred_at >= now() - interval '30 days'
    ),
    stale_health as (
        select count(*)::integer as stale
        from public.customer_health
        where calculated_at < now() - interval '7 days'
    ),
    recovery_backlog as (
        select count(*)::integer as open_items
        from public.customer_feedback
        where resolution_status <> 'resolved'
          and coalesce(rating, 5) <= 3
          and created_at < now() - interval '3 days'
    ),
    task_backlog as (
        select count(*)::integer as overdue
        from public.hospitality_tasks
        where status = 'open' and due_on < current_date - 3
    )
    select * from (values
        (
            'data_flowing', 'Records reaching the CRM',
            case
                when (select last_visit from visit_freshness) is null then 'warning'
                when (select last_visit from visit_freshness) < now() - interval '3 days' then 'warning'
                else 'ok'
            end,
            case
                when (select last_visit from visit_freshness) is null
                    then 'No visits have ever been recorded.'
                else 'Last visit recorded '
                    || extract(day from (now() - (select last_visit from visit_freshness)))::integer::text
                    || ' days ago.'
            end,
            'If the café has been trading, the till is not feeding the CRM. Import a till export or check the integration.',
            '/integrations'
        ),
        (
            'open_incidents', 'Unacknowledged incidents',
            case
                when (select serious from open_incidents) > 0 then 'error'
                when (select total from open_incidents) > 0 then 'warning'
                else 'ok'
            end,
            (select total from open_incidents)::text || ' unacknowledged in the last 30 days, '
                || (select serious from open_incidents)::text || ' serious.',
            'Read them, fix what needs fixing, and acknowledge the rest so the next real one stands out.',
            '/system'
        ),
        (
            'automations', 'Automation failures',
            case when (select failures from automation_failures) > 0 then 'warning' else 'ok' end,
            (select failures from automation_failures)::text
                || ' guest(s) an automation failed for this week.',
            'Each failure names the guest and the error. A failure affects one guest, not the run.',
            '/automations'
        ),
        (
            'imports', 'Order imports',
            case
                when (select failures from import_failures) > 0 then 'warning'
                when (select unmatched from import_failures) > 5 then 'warning'
                else 'ok'
            end,
            (select failures from import_failures)::text || ' failed, '
                || (select unmatched from import_failures)::text
                || ' could not be matched to a guest, this week.',
            'Unmatched orders usually mean the guest is not in the CRM yet. Adding them attaches future orders automatically.',
            '/integrations'
        ),
        (
            'adapters', 'Integration health',
            case when (select failing from adapter_trouble) > 0 then 'error' else 'ok' end,
            (select failing from adapter_trouble)::text || ' enabled adapter(s) reporting failure.',
            'A failing adapter is silently not doing its job. Check its credentials.',
            '/integrations'
        ),
        (
            'intelligence_fresh', 'Guest intelligence is current',
            case when (select stale from stale_health) > 0 then 'warning' else 'ok' end,
            (select stale from stale_health)::text
                || ' guest(s) whose scores have not been recalculated in a week.',
            'Health recalculates on visit and order changes. Staleness means nothing has changed, or a trigger is not firing.',
            '/customers'
        ),
        (
            'service_recovery', 'Service recovery backlog',
            case when (select open_items from recovery_backlog) > 0 then 'error' else 'ok' end,
            (select open_items from recovery_backlog)::text
                || ' complaint(s) unresolved for more than three days.',
            'A guest is still waiting for the café to put something right. Nothing on this page matters more.',
            '/feedback'
        ),
        (
            'task_backlog', 'Hospitality task backlog',
            case when (select overdue from task_backlog) > 5 then 'warning' else 'ok' end,
            (select overdue from task_backlog)::text
                || ' task(s) more than three days overdue.',
            'Either the shift is too busy to work the briefing, or the tasks are not worth raising. Both are worth knowing.',
            '/briefing'
        )
    ) as checks(check_key, label, status, detail, recommended_action, drill_down_path);
$$;


-- Automation and import failures become incidents, so one page shows
-- everything that broke rather than three pages each showing a part.
create or replace function public.raise_incident_for_automation_failure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.outcome = 'failed' then
    perform public.record_incident(
      'automations',
      'An automation failed for a guest',
      new.reason,
      'warning',
      new.detail,
      new.person_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists automation_run_items_incident
on public.automation_run_items;

create trigger automation_run_items_incident
after insert on public.automation_run_items
for each row
execute function public.raise_incident_for_automation_failure();

notify pgrst, 'reload schema';
