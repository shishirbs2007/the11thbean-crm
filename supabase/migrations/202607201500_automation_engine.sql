-- Phase 7: the automation engine.
--
-- Automations act on behalf of the café without anyone watching, so they are
-- built to be audited: every run is recorded, every guest touched is recorded
-- with the reason they qualified, and a failure stops that guest rather than
-- the whole run.
--
-- Nothing here invents a new definition of anything. An automation selects
-- guests through the same audience rules campaigns use, and respects consent
-- through the same has_consent function.

create table if not exists public.automation_runs (
    id uuid primary key default gen_random_uuid(),
    automation_id uuid not null
        references public.hospitality_automations(id) on delete cascade,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running'
        check (status in ('running', 'succeeded', 'partially_failed', 'failed')),
    candidates_found integer not null default 0,
    actions_taken integer not null default 0,
    skipped integer not null default 0,
    failures integer not null default 0,
    -- Why this run did what it did, in the café's own words.
    summary text,
    triggered_by text not null default 'schedule'
        check (triggered_by in ('schedule', 'manual'))
);

create index if not exists automation_runs_automation_idx
on public.automation_runs(automation_id, started_at desc);

create table if not exists public.automation_run_items (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null
        references public.automation_runs(id) on delete cascade,
    person_id uuid references public.people(id) on delete set null,
    outcome text not null
        check (outcome in ('acted', 'skipped', 'failed')),
    -- Both why they qualified and, when skipped, why nothing happened.
    reason text not null,
    detail jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists automation_run_items_run_idx
on public.automation_run_items(run_id);

create index if not exists automation_run_items_person_idx
on public.automation_run_items(person_id);

alter table public.automation_runs enable row level security;
alter table public.automation_run_items enable row level security;

drop policy if exists automation_runs_staff_read on public.automation_runs;

create policy automation_runs_staff_read
on public.automation_runs
for select
to authenticated
using (true);

drop policy if exists automation_run_items_staff_read on public.automation_run_items;

create policy automation_run_items_staff_read
on public.automation_run_items
for select
to authenticated
using (true);

alter table public.hospitality_automations
    add column if not exists last_run_at timestamptz;

alter table public.hospitality_automations
    add column if not exists run_interval_hours integer not null default 24
        check (run_interval_hours > 0);


-- Which guests an automation applies to right now, and why each one qualified.
--
-- Every branch respects consent, so an automation cannot reach somebody a
-- campaign would not be allowed to reach.
create or replace function public.automation_candidates(
    target_automation_id uuid
)
returns table (person_id uuid, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  automation public.hospitality_automations;
begin
  select * into automation
  from public.hospitality_automations
  where id = target_automation_id;

  if automation.id is null then
    raise exception 'Automation % does not exist', target_automation_id;
  end if;

  return query
  select c.person_id, c.reason
  from (
    select
      p.id as person_id,
      case automation.trigger_type
        when 'birthday' then 'Birthday today'
        when 'anniversary' then 'Anniversary today'
        when 'after_event' then 'Attended an event ' || automation.delay_days::text || ' day(s) ago'
        when 'first_visit' then 'First visit ' || automation.delay_days::text || ' day(s) ago'
        when 'lapsed' then 'Past their usual gap between visits'
        when 'favourite_item_available' then 'Orders this item regularly'
        when 'community_invitation' then 'Member of a community with an upcoming event'
        when 'workshop_reminder' then 'Registered for a workshop tomorrow'
        when 'service_recovery' then 'Unresolved feedback ' || automation.delay_days::text || ' day(s) old'
        else 'Matched the automation trigger'
      end as reason
    from public.people p
    left join public.customer_health h on h.person_id = p.id
    where p.is_active = true
      and case automation.trigger_type
        when 'birthday' then exists (
          select 1 from public.important_dates d
          where d.person_id = p.id
            and d.date_type = 'birthday'
            and extract(month from d.date_value) = extract(month from current_date)
            and extract(day from d.date_value) = extract(day from current_date)
        )
        when 'anniversary' then exists (
          select 1 from public.important_dates d
          where d.person_id = p.id
            and d.date_type <> 'birthday'
            and extract(month from d.date_value) = extract(month from current_date)
            and extract(day from d.date_value) = extract(day from current_date)
        )
        when 'after_event' then exists (
          select 1
          from public.event_registrations r
          join public.events e on e.id = r.event_id
          where r.person_id = p.id
            and r.status = 'attended'
            and e.starts_at::date = current_date - automation.delay_days
        )
        when 'first_visit' then
          coalesce(h.total_visits, 0) >= 1
          and h.first_visit_at::date = current_date - automation.delay_days
        when 'lapsed' then
          coalesce(h.total_visits, 0) >= 3
          and h.last_visit_at is not null
          and extract(day from (now() - h.last_visit_at))
              > greatest(
                  1,
                  extract(day from (h.last_visit_at - h.first_visit_at))
                    / greatest(h.total_visits - 1, 1)
                ) * 1.5
        when 'favourite_item_available' then exists (
          select 1 from public.customer_item_history i
          where i.person_id = p.id and i.visit_count > 1
        )
        when 'community_invitation' then exists (
          select 1
          from public.community_memberships m
          join public.events e on e.community_id = m.community_id
          where m.person_id = p.id
            and m.left_at is null
            and e.starts_at between now() and now() + interval '14 days'
        )
        when 'workshop_reminder' then exists (
          select 1
          from public.event_registrations r
          join public.events e on e.id = r.event_id
          where r.person_id = p.id
            and r.status in ('registered', 'interested')
            and e.event_type ilike '%workshop%'
            and e.starts_at::date = current_date + automation.delay_days
        )
        when 'service_recovery' then exists (
          select 1 from public.customer_feedback f
          where f.person_id = p.id
            and f.resolution_status <> 'resolved'
            and coalesce(f.rating, 5) <= 3
            and f.created_at::date <= current_date - automation.delay_days
        )
        else false
      end
  ) c
  where public.has_consent(c.person_id, automation.channel, automation.purpose);
end;
$$;


-- Runs one automation.
--
-- An internal automation raises a hospitality task for staff; anything on a
-- guest-facing channel queues a message for the send pipeline rather than
-- sending directly, so delivery stays the provider adapter's job.
--
-- A failure against one guest is recorded and the run continues. One bad row
-- must never stop the café's other guests being looked after.
create or replace function public.run_automation(
    target_automation_id uuid,
    triggered_by text default 'schedule'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  automation public.hospitality_automations;
  run_id uuid;
  candidate record;
  found_count integer := 0;
  acted_count integer := 0;
  skipped_count integer := 0;
  failed_count integer := 0;
begin
  select * into automation
  from public.hospitality_automations
  where id = target_automation_id;

  if automation.id is null then
    raise exception 'Automation % does not exist', target_automation_id;
  end if;

  if not automation.is_active then
    raise exception 'Automation % is switched off', automation.name;
  end if;

  insert into public.automation_runs (automation_id, triggered_by)
  values (target_automation_id, triggered_by)
  returning id into run_id;

  for candidate in
    select * from public.automation_candidates(target_automation_id)
  loop
    found_count := found_count + 1;

    begin
      if automation.channel = 'internal' then
        -- Already raised for this guest today: nothing to do, but say so.
        if exists (
          select 1 from public.hospitality_tasks t
          where t.person_id = candidate.person_id
            and t.task_type = automation.key
            and t.due_on = current_date
        ) then
          skipped_count := skipped_count + 1;
          insert into public.automation_run_items (run_id, person_id, outcome, reason)
          values (run_id, candidate.person_id, 'skipped', 'Already raised today');
        else
          insert into public.hospitality_tasks (
            person_id, task_type, title, detail, due_on, priority, source
          )
          values (
            candidate.person_id,
            automation.key,
            automation.name,
            automation.explanation || ' (' || candidate.reason || ')',
            current_date,
            2,
            'system'
          );

          acted_count := acted_count + 1;
          insert into public.automation_run_items (run_id, person_id, outcome, reason)
          values (run_id, candidate.person_id, 'acted', candidate.reason);
        end if;
      else
        insert into public.communication_messages (
          person_id, channel, direction, subject, body_text, status, metadata
        )
        values (
          candidate.person_id,
          automation.channel,
          'outbound',
          automation.name,
          automation.explanation,
          'queued',
          jsonb_build_object(
            'automation_id', automation.id,
            'automation_key', automation.key,
            'reason', candidate.reason
          )
        );

        acted_count := acted_count + 1;
        insert into public.automation_run_items (run_id, person_id, outcome, reason)
        values (run_id, candidate.person_id, 'acted', candidate.reason);
      end if;

    exception when others then
      -- One guest failing must not stop the rest.
      failed_count := failed_count + 1;
      insert into public.automation_run_items (run_id, person_id, outcome, reason, detail)
      values (
        run_id,
        candidate.person_id,
        'failed',
        'Automation failed for this guest',
        jsonb_build_object('error', sqlerrm, 'sqlstate', sqlstate)
      );
    end;
  end loop;

  update public.automation_runs
  set finished_at = now(),
      status = case
        when failed_count = 0 then 'succeeded'
        when acted_count = 0 then 'failed'
        else 'partially_failed'
      end,
      candidates_found = found_count,
      actions_taken = acted_count,
      skipped = skipped_count,
      failures = failed_count,
      summary = automation.name || ': ' || found_count::text || ' matched, '
        || acted_count::text || ' acted on, ' || skipped_count::text
        || ' already done, ' || failed_count::text || ' failed.'
  where id = run_id;

  update public.hospitality_automations
  set last_run_at = now()
  where id = target_automation_id;

  return run_id;
end;
$$;


-- The scheduler: runs every active automation that is due.
--
-- Idempotent by interval rather than by clock time, so calling it twice in a
-- minute does no work the second time. Safe to drive from a cron, a webhook,
-- or a member of staff pressing a button.
create or replace function public.run_due_automations(
    triggered_by text default 'schedule'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  automation record;
  ran integer := 0;
begin
  for automation in
    select id, name
    from public.hospitality_automations
    where is_active = true
      and (
        last_run_at is null
        or last_run_at < now() - make_interval(hours => run_interval_hours)
      )
  loop
    begin
      perform public.run_automation(automation.id, triggered_by);
      ran := ran + 1;
    exception when others then
      -- A broken automation is recorded and skipped, never fatal to the rest.
      insert into public.automation_runs (
        automation_id, finished_at, status, summary, triggered_by
      )
      values (
        automation.id, now(), 'failed',
        'Run could not start: ' || sqlerrm, triggered_by
      );
    end;
  end loop;

  return ran;
end;
$$;

notify pgrst, 'reload schema';
