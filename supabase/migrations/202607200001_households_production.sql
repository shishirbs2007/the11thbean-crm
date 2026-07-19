alter table public.households
    add column if not exists household_name text,
    add column if not exists household_type text default 'family',
    add column if not exists primary_contact_id uuid
        references public.people(id)
        on delete set null,
    add column if not exists address text,
    add column if not exists city text,
    add column if not exists state text,
    add column if not exists country text default 'India',
    add column if not exists postal_code text,
    add column if not exists notes text,
    add column if not exists is_active boolean not null default true,
    add column if not exists metadata jsonb not null default '{}'::jsonb,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

alter table public.household_members
    add column if not exists relationship text,
    add column if not exists is_primary boolean not null default false,
    add column if not exists joined_at timestamptz not null default now(),
    add column if not exists left_at timestamptz,
    add column if not exists notes text;

create unique index if not exists household_members_household_person_unique
on public.household_members(household_id, person_id);

create index if not exists households_name_idx
on public.households(lower(household_name));

create index if not exists households_active_idx
on public.households(is_active);

create index if not exists households_primary_contact_idx
on public.households(primary_contact_id);

create index if not exists household_members_household_idx
on public.household_members(household_id);

create index if not exists household_members_person_idx
on public.household_members(person_id);

create table if not exists public.household_addresses (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null
        references public.households(id)
        on delete cascade,
    label text not null default 'Home',
    address_line_1 text,
    address_line_2 text,
    city text,
    state text,
    country text default 'India',
    postal_code text,
    latitude double precision,
    longitude double precision,
    is_primary boolean not null default false,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists household_addresses_household_idx
on public.household_addresses(household_id);

create unique index if not exists household_addresses_one_primary
on public.household_addresses(household_id)
where is_primary = true;

create table if not exists public.household_preferences (
    household_id uuid primary key
        references public.households(id)
        on delete cascade,
    favourite_table text,
    favourite_area text,
    seating_notes text,
    dietary_notes text,
    allergies text,
    preferred_visit_time text,
    preferred_temperature text,
    music_preferences text,
    lighting_preferences text,
    celebration_notes text,
    metadata jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_addresses enable row level security;
alter table public.household_preferences enable row level security;

drop policy if exists households_staff_read on public.households;
create policy households_staff_read
on public.households
for select
to authenticated
using (
    public.current_app_role() in ('barista', 'manager', 'admin')
);

drop policy if exists households_manager_write on public.households;
create policy households_manager_write
on public.households
for all
to authenticated
using (
    public.current_app_role() in ('manager', 'admin')
)
with check (
    public.current_app_role() in ('manager', 'admin')
);

drop policy if exists household_members_staff_read
on public.household_members;

create policy household_members_staff_read
on public.household_members
for select
to authenticated
using (
    public.current_app_role() in ('barista', 'manager', 'admin')
);

drop policy if exists household_members_manager_write
on public.household_members;

create policy household_members_manager_write
on public.household_members
for all
to authenticated
using (
    public.current_app_role() in ('manager', 'admin')
)
with check (
    public.current_app_role() in ('manager', 'admin')
);

drop policy if exists household_addresses_staff_read
on public.household_addresses;

create policy household_addresses_staff_read
on public.household_addresses
for select
to authenticated
using (
    public.current_app_role() in ('barista', 'manager', 'admin')
);

drop policy if exists household_addresses_manager_write
on public.household_addresses;

create policy household_addresses_manager_write
on public.household_addresses
for all
to authenticated
using (
    public.current_app_role() in ('manager', 'admin')
)
with check (
    public.current_app_role() in ('manager', 'admin')
);

drop policy if exists household_preferences_staff_read
on public.household_preferences;

create policy household_preferences_staff_read
on public.household_preferences
for select
to authenticated
using (
    public.current_app_role() in ('barista', 'manager', 'admin')
);

drop policy if exists household_preferences_manager_write
on public.household_preferences;

create policy household_preferences_manager_write
on public.household_preferences
for all
to authenticated
using (
    public.current_app_role() in ('manager', 'admin')
)
with check (
    public.current_app_role() in ('manager', 'admin')
);
