create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  household_name text not null,
  primary_person_id uuid references public.people(id) on delete set null,
  address_line text,
  locality text,
  city text,
  postal_code text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.person_relationships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  related_person_id uuid not null references public.people(id) on delete cascade,
  relationship_type text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique(person_id, related_person_id, relationship_type),
  check (person_id <> related_person_id)
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  household_role text not null default 'member',
  joined_at date,
  left_at date,
  is_primary_contact boolean not null default false,
  notes text,
  primary key(household_id, person_id)
);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  name text not null,
  species text,
  breed text,
  birthday date,
  temperament text,
  favourite_treat text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_hospitality_profiles (
  person_id uuid primary key references public.people(id) on delete cascade,
  preferred_table text,
  preferred_zone text,
  preferred_visit_time text,
  typical_visit_context text,
  coffee_preferences jsonb not null default '{}'::jsonb,
  food_preferences jsonb not null default '{}'::jsonb,
  dietary_restrictions text[] not null default '{}',
  allergies text[] not null default '{}',
  languages text[] not null default '{}',
  accessibility_needs text,
  children_notes text,
  work_style text,
  conversation_preferences text,
  do_not_mention text,
  staff_summary text,
  updated_at timestamptz not null default now()
);

create table if not exists public.important_dates (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  date_type text not null,
  date_value date not null,
  label text,
  recurring_annually boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_person_id uuid not null references public.people(id) on delete cascade,
  referred_person_id uuid not null references public.people(id) on delete cascade,
  referred_at timestamptz not null default now(),
  source_context text,
  notes text,
  unique(referrer_person_id, referred_person_id),
  check (referrer_person_id <> referred_person_id)
);

create table if not exists public.customer_milestones (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  milestone_type text not null,
  title text not null,
  description text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.loyalty_accounts (
  person_id uuid primary key references public.people(id) on delete cascade,
  tier text not null default 'standard',
  points_balance numeric(14,2) not null default 0,
  lifetime_points numeric(14,2) not null default 0,
  wallet_balance numeric(14,2) not null default 0,
  joined_at date not null default current_date,
  last_activity_at timestamptz,
  external_provider text,
  external_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  owner_person_id uuid references public.people(id) on delete set null,
  purchaser_person_id uuid references public.people(id) on delete set null,
  original_value numeric(12,2) not null,
  remaining_value numeric(12,2) not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active',
  notes text
);

create table if not exists public.customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  subscription_type text not null,
  status text not null default 'active',
  started_at date not null default current_date,
  ends_at date,
  renewal_frequency text,
  price numeric(12,2),
  benefits jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete set null,
  visit_id uuid references public.visits(id) on delete set null,
  rating integer check (rating between 1 and 5),
  feedback_type text not null default 'general',
  message text,
  resolution_status text not null default 'open',
  resolution_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.timeline_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  event_type text not null,
  title text not null,
  summary text,
  occurred_at timestamptz not null default now(),
  source_type text not null default 'manual',
  source_id uuid,
  visibility text not null default 'barista',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists timeline_source_unique
on public.timeline_entries(source_type, source_id, event_type)
where source_id is not null;

create index if not exists timeline_person_time_idx
on public.timeline_entries(person_id, occurred_at desc);

create index if not exists relationships_person_idx
on public.person_relationships(person_id);

create index if not exists referrals_referrer_idx
on public.referrals(referrer_person_id);

alter table public.households enable row level security;
alter table public.person_relationships enable row level security;
alter table public.household_members enable row level security;
alter table public.pets enable row level security;
alter table public.customer_hospitality_profiles enable row level security;
alter table public.important_dates enable row level security;
alter table public.referrals enable row level security;
alter table public.customer_milestones enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.gift_cards enable row level security;
alter table public.customer_subscriptions enable row level security;
alter table public.customer_feedback enable row level security;
alter table public.timeline_entries enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'households',
    'person_relationships',
    'household_members',
    'pets',
    'customer_hospitality_profiles',
    'important_dates',
    'referrals',
    'customer_milestones',
    'loyalty_accounts',
    'gift_cards',
    'customer_subscriptions',
    'customer_feedback',
    'timeline_entries'
  ]
  loop
    execute format('drop policy if exists "staff read %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "staff read %s" on public.%I for select to authenticated using (public.current_app_role() in (''barista'', ''manager'', ''admin''))',
      table_name,
      table_name
    );
    execute format('drop policy if exists "managers manage %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "managers manage %s" on public.%I for all to authenticated using (public.current_app_role() in (''manager'', ''admin'')) with check (public.current_app_role() in (''manager'', ''admin''))',
      table_name,
      table_name
    );
  end loop;
end $$;

drop policy if exists "staff create timeline" on public.timeline_entries;
create policy "staff create timeline"
on public.timeline_entries for insert to authenticated
with check (
  public.current_app_role() in ('barista', 'manager', 'admin')
  and (
    public.current_app_role() in ('manager', 'admin')
    or visibility = 'barista'
  )
);

create or replace function public.sync_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hospitality_profiles_updated_at
on public.customer_hospitality_profiles;
create trigger hospitality_profiles_updated_at
before update on public.customer_hospitality_profiles
for each row execute function public.sync_updated_at();

drop trigger if exists households_updated_at on public.households;
create trigger households_updated_at
before update on public.households
for each row execute function public.sync_updated_at();

drop trigger if exists loyalty_accounts_updated_at on public.loyalty_accounts;
create trigger loyalty_accounts_updated_at
before update on public.loyalty_accounts
for each row execute function public.sync_updated_at();

create or replace function public.add_timeline_from_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.timeline_entries(
    person_id, event_type, title, summary, occurred_at,
    source_type, source_id, visibility, created_by
  )
  values (
    new.person_id, 'note', 'Staff note', new.note, new.created_at,
    'customer_note', new.id, new.visibility::text, new.created_by
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists customer_note_timeline on public.customer_notes;
create trigger customer_note_timeline
after insert on public.customer_notes
for each row execute function public.add_timeline_from_note();

create or replace function public.add_timeline_from_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.timeline_entries(
    person_id, event_type, title, summary, occurred_at,
    source_type, source_id, visibility, metadata
  )
  values (
    new.person_id,
    'visit',
    'Café visit',
    case
      when new.net_amount is not null then 'Spend ₹' || new.net_amount::text
      else coalesce(new.source, 'Visit recorded')
    end,
    new.visited_at,
    'visit',
    new.id,
    'barista',
    jsonb_build_object(
      'outlet_id', new.outlet_id,
      'payment_method', new.payment_method
    )
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists visit_timeline on public.visits;
create trigger visit_timeline
after insert on public.visits
for each row execute function public.add_timeline_from_visit();

insert into public.timeline_entries(
  person_id, event_type, title, summary, occurred_at,
  source_type, source_id, visibility, created_by
)
select
  n.person_id, 'note', 'Staff note', n.note, n.created_at,
  'customer_note', n.id, n.visibility::text, n.created_by
from public.customer_notes n
on conflict do nothing;

insert into public.timeline_entries(
  person_id, event_type, title, summary, occurred_at,
  source_type, source_id, visibility, metadata
)
select
  v.person_id,
  'visit',
  'Café visit',
  case
    when v.net_amount is not null then 'Spend ₹' || v.net_amount::text
    else coalesce(v.source, 'Visit recorded')
  end,
  v.visited_at,
  'visit',
  v.id,
  'barista',
  jsonb_build_object(
    'outlet_id', v.outlet_id,
    'payment_method', v.payment_method
  )
from public.visits v
on conflict do nothing;
