create extension if not exists pgcrypto;

create type public.person_type as enum ('customer', 'staff', 'partner', 'vendor', 'other');
create type public.note_visibility as enum ('barista', 'manager', 'private');
create type public.event_registration_status as enum ('interested', 'registered', 'attended', 'cancelled', 'no_show');
create type public.sync_status as enum ('started', 'succeeded', 'partially_succeeded', 'failed');

create table public.people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  preferred_name text,
  phone text,
  email text,
  date_of_birth date,
  anniversary_date date,
  occupation text,
  company text,
  person_type public.person_type not null default 'customer',
  customer_status text not null default 'new',
  staff_notes text,
  private_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_phone_or_email check (phone is not null or email is not null)
);

create unique index people_phone_unique on public.people(phone) where phone is not null;
create unique index people_email_unique on public.people(lower(email)) where email is not null;

create table public.external_identities (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  provider text not null,
  external_id text not null,
  outlet_external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, external_id)
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  outlet_id text,
  visited_at timestamptz not null,
  source text not null default 'manual',
  external_order_id text,
  gross_amount numeric(12,2),
  net_amount numeric(12,2),
  payment_method text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index visits_source_order_unique
  on public.visits(source, external_order_id)
  where external_order_id is not null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits(id) on delete cascade,
  external_item_id text,
  item_name text not null,
  category text,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(12,2),
  modifiers jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table public.customer_preferences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  preference_type text not null,
  preference_value text not null,
  source text not null default 'staff',
  confidence numeric(4,3),
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(person_id, preference_type, preference_value)
);

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  note text not null,
  visibility public.note_visibility not null default 'barista',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.person_tags (
  person_id uuid not null references public.people(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(person_id, tag_id)
);

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.community_memberships (
  community_id uuid not null references public.communities(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null default 'member',
  joined_at date,
  left_at date,
  metadata jsonb not null default '{}'::jsonb,
  primary key(community_id, person_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  capacity integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.event_registrations (
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status public.event_registration_status not null default 'registered',
  registered_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key(event_id, person_id)
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  purpose text not null,
  channel text,
  granted boolean not null,
  captured_at timestamptz not null default now(),
  source text not null,
  evidence jsonb not null default '{}'::jsonb
);

create table public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  sync_type text not null,
  status public.sync_status not null default 'started',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_received integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_failed integer not null default 0,
  cursor_value text,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.integration_errors (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.integration_sync_runs(id) on delete cascade,
  provider text not null,
  external_record_id text,
  error_code text,
  error_message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table public.app_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('barista', 'manager', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.app_roles
  where user_id = auth.uid() and is_active = true
$$;

alter table public.people enable row level security;
alter table public.external_identities enable row level security;
alter table public.visits enable row level security;
alter table public.order_items enable row level security;
alter table public.customer_preferences enable row level security;
alter table public.customer_notes enable row level security;
alter table public.tags enable row level security;
alter table public.person_tags enable row level security;
alter table public.communities enable row level security;
alter table public.community_memberships enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.consents enable row level security;
alter table public.integration_sync_runs enable row level security;
alter table public.integration_errors enable row level security;
alter table public.app_roles enable row level security;

create policy "staff can read people"
on public.people for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "managers can modify people"
on public.people for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "staff can read visits"
on public.visits for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "staff can read order items"
on public.order_items for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "staff can read non-sensitive preferences"
on public.customer_preferences for select to authenticated
using (
  public.current_app_role() in ('manager', 'admin')
  or (public.current_app_role() = 'barista' and is_sensitive = false)
);

create policy "staff can read visible notes"
on public.customer_notes for select to authenticated
using (
  public.current_app_role() in ('manager', 'admin')
  or (public.current_app_role() = 'barista' and visibility = 'barista')
);

create policy "staff can create barista notes"
on public.customer_notes for insert to authenticated
with check (
  public.current_app_role() in ('barista', 'manager', 'admin')
  and (
    public.current_app_role() in ('manager', 'admin')
    or visibility = 'barista'
  )
);

create policy "authenticated staff can read tags"
on public.tags for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "authenticated staff can read person tags"
on public.person_tags for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "authenticated staff can read communities"
on public.communities for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "authenticated staff can read memberships"
on public.community_memberships for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "authenticated staff can read events"
on public.events for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "authenticated staff can read registrations"
on public.event_registrations for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "managers can read consents"
on public.consents for select to authenticated
using (public.current_app_role() in ('manager', 'admin'));

create policy "admins can read integration runs"
on public.integration_sync_runs for select to authenticated
using (public.current_app_role() = 'admin');

create policy "admins can read integration errors"
on public.integration_errors for select to authenticated
using (public.current_app_role() = 'admin');

create policy "users can read own role"
on public.app_roles for select to authenticated
using (user_id = auth.uid());

create index visits_person_time_idx on public.visits(person_id, visited_at desc);
create index order_items_visit_idx on public.order_items(visit_id);
create index notes_person_time_idx on public.customer_notes(person_id, created_at desc);
create index external_identity_person_idx on public.external_identities(person_id);
create index sync_runs_provider_time_idx on public.integration_sync_runs(provider, started_at desc);
