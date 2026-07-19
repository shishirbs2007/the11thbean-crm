create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  transaction_type text not null check (
    transaction_type in ('earn', 'redeem', 'adjustment', 'expiry', 'wallet_credit', 'wallet_debit')
  ),
  points numeric(14,2) not null default 0,
  wallet_amount numeric(14,2) not null default 0,
  description text,
  source_type text,
  source_id text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists loyalty_ledger_person_created_idx
on public.loyalty_ledger(person_id, created_at desc);

create table if not exists public.segment_memberships (
  segment_id uuid not null references public.saved_segments(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users(id),
  primary key(segment_id, person_id)
);

create index if not exists segment_memberships_person_idx
on public.segment_memberships(person_id);

alter table public.events
  add column if not exists description text,
  add column if not exists status text not null default 'draft',
  add column if not exists registration_deadline timestamptz,
  add column if not exists price numeric(12,2) not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.communities
  add column if not exists category text,
  add column if not exists meeting_frequency text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists operational_run_items_run_idx
on public.operational_run_items(run_id);

create or replace function public.recalculate_customer_health(target_person_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  insert into public.customer_health (
    person_id,
    health_score,
    engagement_score,
    loyalty_score,
    recency_score,
    frequency_score,
    monetary_score,
    churn_risk,
    lifetime_value,
    average_ticket,
    total_visits,
    last_visit_at,
    first_visit_at,
    preferred_visit_day,
    preferred_visit_time,
    calculated_at
  )
  select
    p.id,
    greatest(
      0,
      least(
        100,
        coalesce(
          case
            when max(v.visited_at) is null then 25
            when max(v.visited_at) >= now() - interval '14 days' then 100
            when max(v.visited_at) >= now() - interval '30 days' then 80
            when max(v.visited_at) >= now() - interval '60 days' then 55
            when max(v.visited_at) >= now() - interval '90 days' then 35
            else 15
          end,
          0
        ) * 0.45
        + least(count(v.id) * 8, 100) * 0.30
        + least(coalesce(sum(v.net_amount), 0) / 50, 100) * 0.25
      )
    ),
    least(count(v.id) * 10, 100),
    least(coalesce(la.lifetime_points, 0) / 10, 100),
    case
      when max(v.visited_at) is null then 0
      when max(v.visited_at) >= now() - interval '14 days' then 100
      when max(v.visited_at) >= now() - interval '30 days' then 80
      when max(v.visited_at) >= now() - interval '60 days' then 55
      when max(v.visited_at) >= now() - interval '90 days' then 35
      else 15
    end,
    least(count(v.id) * 8, 100),
    least(coalesce(sum(v.net_amount), 0) / 50, 100),
    case
      when max(v.visited_at) is null then 90
      when max(v.visited_at) < now() - interval '90 days' then 90
      when max(v.visited_at) < now() - interval '60 days' then 70
      when max(v.visited_at) < now() - interval '30 days' then 45
      else 15
    end,
    coalesce(sum(v.net_amount), 0),
    case when count(v.id) = 0 then 0 else coalesce(sum(v.net_amount), 0) / count(v.id) end,
    count(v.id)::integer,
    max(v.visited_at),
    min(v.visited_at),
    trim(to_char(mode() within group (order by extract(dow from v.visited_at)), '9')),
    to_char(
      mode() within group (order by date_trunc('hour', v.visited_at)),
      'HH24:MI'
    ),
    now()
  from public.people p
  left join public.visits v on v.person_id = p.id
  left join public.loyalty_accounts la on la.person_id = p.id
  where p.is_active = true
    and (target_person_id is null or p.id = target_person_id)
  group by p.id, la.lifetime_points
  on conflict (person_id) do update set
    health_score = excluded.health_score,
    engagement_score = excluded.engagement_score,
    loyalty_score = excluded.loyalty_score,
    recency_score = excluded.recency_score,
    frequency_score = excluded.frequency_score,
    monetary_score = excluded.monetary_score,
    churn_risk = excluded.churn_risk,
    lifetime_value = excluded.lifetime_value,
    average_ticket = excluded.average_ticket,
    total_visits = excluded.total_visits,
    last_visit_at = excluded.last_visit_at,
    first_visit_at = excluded.first_visit_at,
    preferred_visit_day = excluded.preferred_visit_day,
    preferred_visit_time = excluded.preferred_visit_time,
    calculated_at = now();

  get diagnostics affected = row_count;

  insert into public.customer_health_history (
    person_id,
    health_score,
    engagement_score,
    churn_risk,
    lifetime_value,
    calculated_at
  )
  select
    person_id,
    health_score,
    engagement_score,
    churn_risk,
    lifetime_value,
    calculated_at
  from public.customer_health
  where target_person_id is null or person_id = target_person_id;

  return affected;
end;
$$;

create or replace function public.apply_loyalty_transaction(
  target_person_id uuid,
  target_type text,
  target_points numeric default 0,
  target_wallet numeric default 0,
  target_description text default null,
  target_source_type text default null,
  target_source_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ledger_id uuid;
begin
  if target_type not in (
    'earn', 'redeem', 'adjustment', 'expiry', 'wallet_credit', 'wallet_debit'
  ) then
    raise exception 'Invalid loyalty transaction type';
  end if;

  insert into public.loyalty_accounts(person_id)
  values(target_person_id)
  on conflict (person_id) do nothing;

  if target_type in ('redeem', 'expiry') then
    target_points := -abs(target_points);
  elsif target_type = 'earn' then
    target_points := abs(target_points);
  end if;

  if target_type = 'wallet_debit' then
    target_wallet := -abs(target_wallet);
  elsif target_type = 'wallet_credit' then
    target_wallet := abs(target_wallet);
  end if;

  update public.loyalty_accounts
  set
    points_balance = greatest(0, points_balance + target_points),
    lifetime_points = lifetime_points + greatest(target_points, 0),
    wallet_balance = greatest(0, wallet_balance + target_wallet),
    last_activity_at = now(),
    tier = case
      when lifetime_points + greatest(target_points, 0) >= 5000 then 'platinum'
      when lifetime_points + greatest(target_points, 0) >= 2500 then 'gold'
      when lifetime_points + greatest(target_points, 0) >= 1000 then 'silver'
      else 'standard'
    end,
    updated_at = now()
  where person_id = target_person_id;

  insert into public.loyalty_ledger (
    person_id,
    transaction_type,
    points,
    wallet_amount,
    description,
    source_type,
    source_id,
    created_by
  )
  values (
    target_person_id,
    target_type,
    target_points,
    target_wallet,
    target_description,
    target_source_type,
    target_source_id,
    auth.uid()
  )
  returning id into ledger_id;

  return ledger_id;
end;
$$;

alter table public.loyalty_ledger enable row level security;
alter table public.segment_memberships enable row level security;
alter table public.operational_run_items enable row level security;

drop policy if exists loyalty_ledger_staff_read on public.loyalty_ledger;
create policy loyalty_ledger_staff_read
on public.loyalty_ledger for select to authenticated
using (public.current_app_role() in ('barista','manager','admin'));

drop policy if exists loyalty_ledger_manager_write on public.loyalty_ledger;
create policy loyalty_ledger_manager_write
on public.loyalty_ledger for all to authenticated
using (public.current_app_role() in ('manager','admin'))
with check (public.current_app_role() in ('manager','admin'));

drop policy if exists segment_memberships_staff_read on public.segment_memberships;
create policy segment_memberships_staff_read
on public.segment_memberships for select to authenticated
using (public.current_app_role() in ('barista','manager','admin'));

drop policy if exists segment_memberships_manager_write on public.segment_memberships;
create policy segment_memberships_manager_write
on public.segment_memberships for all to authenticated
using (public.current_app_role() in ('manager','admin'))
with check (public.current_app_role() in ('manager','admin'));

drop policy if exists operational_run_items_staff on public.operational_run_items;
create policy operational_run_items_staff
on public.operational_run_items for all to authenticated
using (public.current_app_role() in ('barista','manager','admin'))
with check (public.current_app_role() in ('barista','manager','admin'));
