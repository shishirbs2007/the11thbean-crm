-- ============================================================================
-- CUSTOMER360 PHASE 2
-- SECTION 1 : HOUSEHOLDS
-- ============================================================================

alter table public.households
    add column if not exists household_name text,
    add column if not exists household_type text default 'family',
    add column if not exists primary_contact_id uuid references public.people(id) on delete set null,
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

create index if not exists households_primary_contact_idx
on public.households(primary_contact_id);

create index if not exists households_active_idx
on public.households(is_active);



alter table public.household_members
    add column if not exists relationship text,
    add column if not exists is_primary boolean not null default false,
    add column if not exists joined_at timestamptz not null default now(),
    add column if not exists left_at timestamptz,
    add column if not exists notes text;

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



alter table public.household_addresses enable row level security;
alter table public.household_preferences enable row level security;

drop policy if exists household_addresses_staff_read
on public.household_addresses;

create policy household_addresses_staff_read
on public.household_addresses
for select
to authenticated
using (
    public.current_app_role()
    in ('barista','manager','admin')
);

drop policy if exists household_addresses_manager_write
on public.household_addresses;

create policy household_addresses_manager_write
on public.household_addresses
for all
to authenticated
using (
    public.current_app_role()
    in ('manager','admin')
)
with check (
    public.current_app_role()
    in ('manager','admin')
);



drop policy if exists household_preferences_staff_read
on public.household_preferences;

create policy household_preferences_staff_read
on public.household_preferences
for select
to authenticated
using (
    public.current_app_role()
    in ('barista','manager','admin')
);

drop policy if exists household_preferences_manager_write
on public.household_preferences;

create policy household_preferences_manager_write
on public.household_preferences
for all
to authenticated
using (
    public.current_app_role()
    in ('manager','admin')
)
with check (
    public.current_app_role()
    in ('manager','admin')
);


-- ============================================================================
-- CUSTOMER360 PHASE 2
-- SECTION 2 : PETS
-- ============================================================================

create table if not exists public.pet_species (

    id uuid primary key default gen_random_uuid(),

    name text not null unique,

    created_at timestamptz not null default now()
);


insert into public.pet_species(name)
values
('Dog'),
('Cat'),
('Rabbit'),
('Bird'),
('Fish'),
('Hamster'),
('Guinea Pig'),
('Reptile'),
('Other')
on conflict do nothing;



alter table public.pets

    add column if not exists household_id uuid
        references public.households(id)
        on delete set null,

    add column if not exists species_id uuid
        references public.pet_species(id),

    add column if not exists gender text,

    add column if not exists colour text,

    add column if not exists birth_date date,

    add column if not exists adoption_date date,

    add column if not exists favourite_treat text,

    add column if not exists favourite_seat text,

    add column if not exists temperament text,

    add column if not exists medical_notes text,

    add column if not exists emergency_contact text,

    add column if not exists profile_photo_url text,

    add column if not exists metadata jsonb not null default '{}'::jsonb,

    add column if not exists updated_at timestamptz not null default now();



create index if not exists pets_household_idx
on public.pets(household_id);

create index if not exists pets_species_idx
on public.pets(species_id);

create index if not exists pets_birthdate_idx
on public.pets(birth_date);



create table if not exists public.pet_visit_history (

    id uuid primary key default gen_random_uuid(),

    pet_id uuid not null
        references public.pets(id)
        on delete cascade,

    visit_id uuid
        references public.visits(id)
        on delete set null,

    notes text,

    created_at timestamptz not null default now()
);

create index if not exists pet_visit_history_pet_idx
on public.pet_visit_history(pet_id);



alter table public.pet_species enable row level security;
alter table public.pet_visit_history enable row level security;

drop policy if exists pet_species_read
on public.pet_species;

create policy pet_species_read
on public.pet_species
for select
to authenticated
using (true);



drop policy if exists pet_visit_history_staff
on public.pet_visit_history;

create policy pet_visit_history_staff
on public.pet_visit_history
for all
to authenticated
using (
    public.current_app_role()
    in ('barista','manager','admin')
)
with check (
    public.current_app_role()
    in ('manager','admin')
);


-- ============================================================================
-- CUSTOMER360 PHASE 2
-- SECTION 3 : RELATIONSHIP GRAPH
-- ============================================================================

create table if not exists public.relationship_types (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    display_name text not null,
    is_bidirectional boolean not null default false,
    created_at timestamptz not null default now()
);

insert into public.relationship_types
(code, display_name, is_bidirectional)
values
('spouse','Spouse',true),
('parent','Parent',false),
('child','Child',false),
('sibling','Sibling',true),
('friend','Friend',true),
('colleague','Colleague',true),
('referrer','Referrer',false),
('referred','Referred',false),
('coach','Coach',false),
('student','Student',false),
('other','Other',false)
on conflict (code) do nothing;

alter table public.person_relationships
    add column if not exists relationship_type_id uuid
        references public.relationship_types(id),
    add column if not exists strength integer not null default 5
        check (strength between 1 and 10),
    add column if not exists metadata jsonb not null default '{}'::jsonb,
    add column if not exists updated_at timestamptz not null default now();

update public.person_relationships pr
set relationship_type_id = rt.id
from public.relationship_types rt
where pr.relationship_type_id is null
  and rt.code = case
      when lower(pr.relationship_type) in (
          'spouse','parent','child','sibling','friend','colleague',
          'referrer','referred','coach','student','other'
      )
      then lower(pr.relationship_type)
      else 'other'
  end;

create index if not exists person_relationships_person_idx
on public.person_relationships(person_id);

create index if not exists person_relationships_related_person_idx
on public.person_relationships(related_person_id);

create index if not exists person_relationships_type_id_idx
on public.person_relationships(relationship_type_id);

alter table public.relationship_types enable row level security;

drop policy if exists relationship_types_read
on public.relationship_types;

create policy relationship_types_read
on public.relationship_types
for select
to authenticated
using (true);

drop policy if exists person_relationships_staff_read
on public.person_relationships;

create policy person_relationships_staff_read
on public.person_relationships
for select
to authenticated
using (
    public.current_app_role()
    in ('barista','manager','admin')
);

drop policy if exists person_relationships_manager_write
on public.person_relationships;

create policy person_relationships_manager_write
on public.person_relationships
for all
to authenticated
using (
    public.current_app_role()
    in ('manager','admin')
)
with check (
    public.current_app_role()
    in ('manager','admin')
);


-- CUSTOMER360 PHASE 2
-- SECTION 4 : CUSTOMER HEALTH
-- ============================================================================

create table if not exists public.customer_health (

    person_id uuid primary key
        references public.people(id)
        on delete cascade,

    health_score numeric(5,2) not null default 100,

    engagement_score numeric(5,2) not null default 0,

    loyalty_score numeric(5,2) not null default 0,

    recency_score numeric(5,2) not null default 0,

    frequency_score numeric(5,2) not null default 0,

    monetary_score numeric(5,2) not null default 0,

    churn_risk numeric(5,2) not null default 0,

    lifetime_value numeric(12,2) not null default 0,

    average_ticket numeric(12,2) not null default 0,

    total_visits integer not null default 0,

    last_visit_at timestamptz,

    first_visit_at timestamptz,

    preferred_visit_day text,

    preferred_visit_time text,

    calculated_at timestamptz not null default now(),

    metadata jsonb not null default '{}'::jsonb
);

create index if not exists customer_health_score_idx
on public.customer_health(health_score desc);

create index if not exists customer_health_churn_idx
on public.customer_health(churn_risk desc);

create index if not exists customer_health_last_visit_idx
on public.customer_health(last_visit_at desc);



create table if not exists public.customer_health_history (

    id uuid primary key default gen_random_uuid(),

    person_id uuid not null
        references public.people(id)
        on delete cascade,

    health_score numeric(5,2) not null,

    engagement_score numeric(5,2),

    churn_risk numeric(5,2),

    lifetime_value numeric(12,2),

    calculated_at timestamptz not null default now()
);

create index if not exists customer_health_history_person_idx
on public.customer_health_history(person_id);

create index if not exists customer_health_history_date_idx
on public.customer_health_history(calculated_at desc);



alter table public.customer_health enable row level security;
alter table public.customer_health_history enable row level security;

drop policy if exists customer_health_staff_read
on public.customer_health;

create policy customer_health_staff_read
on public.customer_health
for select
to authenticated
using (
    public.current_app_role()
    in ('barista','manager','admin')
);

drop policy if exists customer_health_manager_write
on public.customer_health;

create policy customer_health_manager_write
on public.customer_health
for all
to authenticated
using (
    public.current_app_role()
    in ('manager','admin')
)
with check (
    public.current_app_role()
    in ('manager','admin')
);

drop policy if exists customer_health_history_staff_read
on public.customer_health_history;

create policy customer_health_history_staff_read
on public.customer_health_history
for select
to authenticated
using (
    public.current_app_role()
    in ('barista','manager','admin')
);


-- ============================================================================
-- CUSTOMER360 PHASE 2
-- SECTION 5 : TIMELINE
-- ============================================================================

create type public.timeline_source as enum (
    'visit',
    'order',
    'event',
    'community',
    'feedback',
    'communication',
    'note',
    'referral',
    'loyalty',
    'manual',
    'system'
);

create table if not exists public.customer_timeline (

    id uuid primary key default gen_random_uuid(),

    person_id uuid not null
        references public.people(id)
        on delete cascade,

    occurred_at timestamptz not null default now(),

    source public.timeline_source not null,

    reference_table text,

    reference_id uuid,

    title text not null,

    description text,

    icon text,

    colour text,

    importance integer not null default 3
        check (importance between 1 and 5),

    created_by uuid,

    metadata jsonb not null default '{}'::jsonb,

    created_at timestamptz not null default now()
);

create index if not exists customer_timeline_person_idx
on public.customer_timeline(person_id, occurred_at desc);

create index if not exists customer_timeline_source_idx
on public.customer_timeline(source);

create index if not exists customer_timeline_reference_idx
on public.customer_timeline(reference_table, reference_id);

alter table public.customer_timeline enable row level security;

drop policy if exists customer_timeline_staff_read
on public.customer_timeline;

create policy customer_timeline_staff_read
on public.customer_timeline
for select
to authenticated
using (
    public.current_app_role()
    in ('barista','manager','admin')
);

drop policy if exists customer_timeline_manager_write
on public.customer_timeline;

create policy customer_timeline_manager_write
on public.customer_timeline
for all
to authenticated
using (
    public.current_app_role()
    in ('manager','admin')
)
with check (
    public.current_app_role()
    in ('manager','admin')
);


-- ============================================================================
-- CUSTOMER360 PHASE 2
-- SECTION 6 : UPDATED_AT TRIGGER
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists households_updated_at on public.households;
create trigger households_updated_at
before update on public.households
for each row execute function public.set_updated_at();

drop trigger if exists household_addresses_updated_at on public.household_addresses;
create trigger household_addresses_updated_at
before update on public.household_addresses
for each row execute function public.set_updated_at();

drop trigger if exists household_preferences_updated_at on public.household_preferences;
create trigger household_preferences_updated_at
before update on public.household_preferences
for each row execute function public.set_updated_at();

drop trigger if exists pets_updated_at on public.pets;
create trigger pets_updated_at
before update on public.pets
for each row execute function public.set_updated_at();

drop trigger if exists person_relationships_updated_at on public.person_relationships;
create trigger person_relationships_updated_at
before update on public.person_relationships
for each row execute function public.set_updated_at();


-- ============================================================================
-- SECTION 7 : CUSTOMER HEALTH REFRESH
-- ============================================================================

create or replace function public.refresh_customer_health(
    p_person_id uuid
)
returns void
language plpgsql
security definer
as $$
begin

insert into public.customer_health(person_id)
values(p_person_id)
on conflict (person_id)
do update
set
    calculated_at = now();

end;
$$;


-- ============================================================================
-- SECTION 8 : TIMELINE HELPER
-- ============================================================================

create or replace function public.add_customer_timeline_event(

    p_person_id uuid,

    p_source public.timeline_source,

    p_title text,

    p_description text default null,

    p_reference_table text default null,

    p_reference_id uuid default null,

    p_importance integer default 3,

    p_metadata jsonb default '{}'::jsonb

)
returns uuid
language plpgsql
security definer
as $$

declare

v_id uuid;

begin

insert into public.customer_timeline(

person_id,
source,
title,
description,
reference_table,
reference_id,
importance,
metadata

)

values(

p_person_id,
p_source,
p_title,
p_description,
p_reference_table,
p_reference_id,
p_importance,
p_metadata

)

returning id
into v_id;

return v_id;

end;

$$;