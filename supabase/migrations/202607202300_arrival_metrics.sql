-- Arrival metrics.
--
-- We need to know whether Arrival is actually used at the counter, and whether
-- it is fast enough, before deciding what to build next. But operational
-- metrics must not become surveillance: this records what happened and how
-- long it took, never who did it or which guest it was about.
--
-- Every column here is a count, a duration, or an anonymous category. There is
-- no person_id, no staff id, no guest name, no search text. A row says
-- "an arrival completed in 2.1 seconds using the keyboard" and nothing that
-- could identify the barista or the guest.

create table if not exists public.arrival_events (
    id uuid primary key default gen_random_uuid(),
    occurred_at timestamptz not null default now(),
    -- What kind of interaction this row measures.
    event_type text not null
        check (event_type in (
            'search',              -- a search was performed
            'arrival',             -- a guest was welcomed
            'quick_add',           -- a new guest was added at the counter
            'duplicate_prevented', -- quick-add recognised an existing guest
            'retry',               -- a failed record was retried
            'abandoned_search'     -- searched, saw results, welcomed nobody
        )),
    -- How the interaction was driven, aggregated only. Never tied to a person.
    input_method text
        check (input_method is null or input_method in ('keyboard', 'pointer', 'scan')),
    -- Milliseconds. Search latency, or time from first keystroke to welcome.
    duration_ms integer check (duration_ms is null or duration_ms >= 0),
    -- The day, for daily rollups without needing the timestamp.
    event_date date not null default current_date
);

create index if not exists arrival_events_date_idx
on public.arrival_events(event_date, event_type);

alter table public.arrival_events enable row level security;

-- Any signed-in member of staff may record an event and read the aggregates.
-- The rows carry nothing sensitive, so there is nothing to restrict.
drop policy if exists arrival_events_staff_read on public.arrival_events;

create policy arrival_events_staff_read
on public.arrival_events for select to authenticated using (true);

drop policy if exists arrival_events_staff_write on public.arrival_events;

create policy arrival_events_staff_write
on public.arrival_events for insert to authenticated with check (true);


-- Records one anonymous operational event.
--
-- Deliberately forgiving and side-effect-free on failure: instrumentation that
-- can break the thing it measures is worse than no instrumentation. A bad
-- value is clamped or dropped, never raised.
create or replace function public.record_arrival_event(
    p_event_type text,
    p_input_method text default null,
    p_duration_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_type not in (
    'search', 'arrival', 'quick_add', 'duplicate_prevented',
    'retry', 'abandoned_search'
  ) then
    return;
  end if;

  insert into public.arrival_events (event_type, input_method, duration_ms)
  values (
    p_event_type,
    case
      when p_input_method in ('keyboard', 'pointer', 'scan') then p_input_method
      else null
    end,
    case
      -- Clamp obviously wrong durations rather than storing noise. Nothing at a
      -- counter legitimately takes longer than a few minutes.
      when p_duration_ms is null then null
      when p_duration_ms < 0 then null
      when p_duration_ms > 600000 then null
      else p_duration_ms
    end
  );
exception when others then
  -- Never let measuring an arrival interfere with recording one.
  return;
end;
$$;


-- The operational picture for a period, all aggregate, safe to show anyone.
create or replace function public.arrival_metrics(period_days integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    with window_events as (
        select *
        from public.arrival_events
        where occurred_at >= now() - make_interval(days => greatest(period_days, 1))
    ),
    searches as (
        select duration_ms from window_events where event_type = 'search'
    ),
    arrivals as (
        select duration_ms, input_method from window_events where event_type = 'arrival'
    )
    select jsonb_build_object(
        'period_days', greatest(period_days, 1),
        'arrivals', (select count(*) from window_events where event_type = 'arrival'),
        'searches', (select count(*) from window_events where event_type = 'search'),
        'quick_adds', (select count(*) from window_events where event_type = 'quick_add'),
        'duplicates_prevented',
            (select count(*) from window_events where event_type = 'duplicate_prevented'),
        'retries', (select count(*) from window_events where event_type = 'retry'),
        'abandoned_searches',
            (select count(*) from window_events where event_type = 'abandoned_search'),
        -- Median is more honest than mean for latency: one slow outlier does
        -- not make the counter look worse than it feels.
        'median_search_ms', (
            select round(percentile_cont(0.5) within group (order by duration_ms))
            from searches where duration_ms is not null
        ),
        'p90_search_ms', (
            select round(percentile_cont(0.9) within group (order by duration_ms))
            from searches where duration_ms is not null
        ),
        'median_arrival_ms', (
            select round(percentile_cont(0.5) within group (order by duration_ms))
            from arrivals where duration_ms is not null
        ),
        'p90_arrival_ms', (
            select round(percentile_cont(0.9) within group (order by duration_ms))
            from arrivals where duration_ms is not null
        ),
        'keyboard_arrivals',
            (select count(*) from arrivals where input_method = 'keyboard'),
        'pointer_arrivals',
            (select count(*) from arrivals where input_method = 'pointer'),
        'scan_arrivals',
            (select count(*) from arrivals where input_method = 'scan'),
        -- What share of searches led to a welcome, as a whole percent.
        'search_to_arrival_percent', (
            case
                when (select count(*) from window_events where event_type = 'search') = 0
                    then null
                else round(
                    (select count(*) from window_events where event_type = 'arrival')::numeric
                    * 100
                    / (select count(*) from window_events where event_type = 'search'),
                    0
                )
            end
        )
    );
$$;


-- A daily breakdown, for spotting a trend across the observation week.
create or replace view public.arrival_daily as
select
    event_date,
    count(*) filter (where event_type = 'arrival')::integer as arrivals,
    count(*) filter (where event_type = 'quick_add')::integer as quick_adds,
    count(*) filter (where event_type = 'duplicate_prevented')::integer as duplicates_prevented,
    count(*) filter (where event_type = 'retry')::integer as retries,
    count(*) filter (where event_type = 'abandoned_search')::integer as abandoned_searches,
    round(
        percentile_cont(0.5) within group (
            order by duration_ms
        ) filter (where event_type = 'arrival' and duration_ms is not null)
    ) as median_arrival_ms
from public.arrival_events
group by event_date
order by event_date desc;

grant select on public.arrival_daily to authenticated;

notify pgrst, 'reload schema';
