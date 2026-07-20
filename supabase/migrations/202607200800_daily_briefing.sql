-- Phase 4: the daily briefing.
--
-- One question, answered every morning: how do we create the best possible
-- experience for the guests we will see today?
--
-- Everything here is derived. Nobody keeps a list of who is due in, whose
-- birthday it is, or who deserves an apology — the café's own records already
-- know, and this surfaces it.

create table if not exists public.hospitality_tasks (
    id uuid primary key default gen_random_uuid(),
    person_id uuid references public.people(id) on delete cascade,
    -- Tasks raised by the CRM carry the reason they exist, so staff can judge
    -- whether they still matter.
    task_type text not null,
    title text not null,
    detail text,
    due_on date not null default current_date,
    priority integer not null default 3
        check (priority between 1 and 5),
    status text not null default 'open'
        check (status in ('open', 'done', 'dismissed')),
    source text not null default 'system'
        check (source in ('system', 'staff')),
    assigned_to uuid references auth.users(id) on delete set null,
    completed_at timestamptz,
    completed_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    -- A generated task is raised once per person, per type, per day.
    unique nulls not distinct (person_id, task_type, due_on)
);

create index if not exists hospitality_tasks_due_idx
on public.hospitality_tasks(due_on, status);

create index if not exists hospitality_tasks_person_idx
on public.hospitality_tasks(person_id);

alter table public.hospitality_tasks enable row level security;

drop policy if exists hospitality_tasks_staff_read on public.hospitality_tasks;

create policy hospitality_tasks_staff_read
on public.hospitality_tasks
for select
to authenticated
using (true);

drop policy if exists hospitality_tasks_staff_write on public.hospitality_tasks;

create policy hospitality_tasks_staff_write
on public.hospitality_tasks
for all
to authenticated
using (true)
with check (true);


-- Notes handed from one shift to the next. Small, deliberately: a handover
-- that takes ten minutes to read does not get read.
create table if not exists public.shift_handovers (
    id uuid primary key default gen_random_uuid(),
    shift_date date not null default current_date,
    shift_label text not null default 'day',
    notes text not null,
    guests_to_watch text,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists shift_handovers_date_idx
on public.shift_handovers(shift_date desc);

alter table public.shift_handovers enable row level security;

drop policy if exists shift_handovers_staff_read on public.shift_handovers;

create policy shift_handovers_staff_read
on public.shift_handovers
for select
to authenticated
using (true);

drop policy if exists shift_handovers_staff_write on public.shift_handovers;

create policy shift_handovers_staff_write
on public.shift_handovers
for all
to authenticated
using (true)
with check (true);


-- Who is likely to walk in today, and why.
--
-- Regulars are creatures of habit: someone who always comes on a Thursday
-- evening is probably coming this Thursday evening. This ranks by how strongly
-- today matches their pattern, and how overdue they are against their own
-- rhythm rather than a fixed threshold.
create or replace function public.expected_guests_today(
    reference_time timestamptz default now(),
    max_results integer default 20
)
returns table (
    person_id uuid,
    first_name text,
    last_name text,
    preferred_name text,
    likelihood numeric,
    reasons text[]
)
language sql
stable
security definer
set search_path = public
as $$
    with rhythm as (
        select
            h.person_id,
            h.total_visits,
            h.last_visit_at,
            h.preferred_visit_day,
            h.preferred_visit_time,
            h.first_visit_at,
            case
                when h.total_visits < 2 or h.first_visit_at is null then null
                else greatest(
                    1,
                    extract(
                        day from (h.last_visit_at - h.first_visit_at)
                    ) / greatest(h.total_visits - 1, 1)
                )
            end as average_gap_days,
            extract(
                day from (reference_time - h.last_visit_at)
            ) as days_since_visit
        from public.customer_health h
        where h.total_visits > 0
    ),
    scored as (
        select
            r.person_id,
            r.average_gap_days,
            r.days_since_visit,
            trim(r.preferred_visit_day) =
                trim(to_char(extract(dow from reference_time), '9')) as day_matches,
            r.preferred_visit_time is not null
                and abs(
                    extract(hour from reference_time)
                    - split_part(r.preferred_visit_time, ':', 1)::numeric
                ) <= 2 as time_matches,
            -- Due when they have been away at least as long as their own
            -- usual gap, but not so long that they have clearly moved on.
            r.average_gap_days is not null
                and r.days_since_visit >= r.average_gap_days * 0.75
                and r.days_since_visit <= r.average_gap_days * 3 as is_due
        from rhythm r
    )
    select
        p.id,
        p.first_name,
        p.last_name,
        p.preferred_name,
        round(
            (case when s.day_matches then 45 else 0 end)
            + (case when s.time_matches then 20 else 0 end)
            + (case when s.is_due then 35 else 0 end),
            1
        ) as likelihood,
        array_remove(
            array[
                case when s.day_matches
                    then 'Usually comes on this day' end,
                case when s.time_matches
                    then 'Usually comes around now' end,
                case when s.is_due
                    then 'Due in, about every '
                        || round(s.average_gap_days)::text || ' days' end
            ],
            null
        ) as reasons
    from scored s
    join public.people p on p.id = s.person_id
    where p.is_active = true
      and (s.day_matches or s.is_due)
    order by likelihood desc, p.first_name
    limit greatest(max_results, 1);
$$;


-- Generates today's hospitality tasks from what the café already knows.
--
-- Idempotent: running it twice in a day does not duplicate anything, so it is
-- safe to call on every page load or from a schedule.
create or replace function public.generate_daily_hospitality_tasks(
    target_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  created integer := 0;
  inserted integer;
begin
  -- Birthdays and anniversaries recorded against the guest.
  insert into public.hospitality_tasks (
    person_id, task_type, title, detail, due_on, priority
  )
  select
    d.person_id,
    'milestone',
    'Wish ' || coalesce(p.preferred_name, p.first_name) || ' a happy '
      || coalesce(d.label, d.date_type),
    'Recorded ' || coalesce(d.label, d.date_type) || ' on '
      || to_char(d.date_value, 'DD Mon') || '.',
    target_date,
    1
  from public.important_dates d
  join public.people p on p.id = d.person_id
  where p.is_active = true
    and extract(month from d.date_value) = extract(month from target_date)
    and extract(day from d.date_value) = extract(day from target_date)
  on conflict do nothing;

  get diagnostics inserted = row_count;
  created := created + inserted;

  -- Guests who have drifted further than their own rhythm explains.
  insert into public.hospitality_tasks (
    person_id, task_type, title, detail, due_on, priority
  )
  select
    h.person_id,
    'reconnect',
    'Reconnect with ' || coalesce(p.preferred_name, p.first_name),
    'Last recorded visit was '
      || extract(day from (now() - h.last_visit_at))::integer::text
      || ' days ago.',
    target_date,
    2
  from public.customer_health h
  join public.people p on p.id = h.person_id
  where p.is_active = true
    and h.last_visit_at is not null
    and h.churn_risk >= 60
    and h.total_visits >= 3
  on conflict do nothing;

  get diagnostics inserted = row_count;
  created := created + inserted;

  -- A first visit is the one chance to make somebody feel recognised early.
  insert into public.hospitality_tasks (
    person_id, task_type, title, detail, due_on, priority
  )
  select
    h.person_id,
    'welcome_back',
    'Welcome ' || coalesce(p.preferred_name, p.first_name) || ' properly',
    'First came in on ' || to_char(h.first_visit_at, 'DD Mon') ||
      '. Learn their usual before they have to ask.',
    target_date,
    2
  from public.customer_health h
  join public.people p on p.id = h.person_id
  where p.is_active = true
    and h.total_visits between 1 and 2
    and h.first_visit_at >= now() - interval '21 days'
  on conflict do nothing;

  get diagnostics inserted = row_count;
  created := created + inserted;

  -- Anything the café got wrong, until somebody has put it right.
  insert into public.hospitality_tasks (
    person_id, task_type, title, detail, due_on, priority
  )
  select
    f.person_id,
    'service_recovery',
    'Put things right with ' || coalesce(p.preferred_name, p.first_name),
    coalesce(f.message, 'Unresolved feedback needs a personal response.'),
    target_date,
    1
  from public.customer_feedback f
  join public.people p on p.id = f.person_id
  where p.is_active = true
    and f.resolution_status <> 'resolved'
    and coalesce(f.rating, 5) <= 3
  on conflict do nothing;

  get diagnostics inserted = row_count;
  created := created + inserted;

  return created;
end;
$$;

notify pgrst, 'reload schema';
