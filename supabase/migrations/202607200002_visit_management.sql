alter table public.visits
    add column if not exists visit_type text not null default 'walk_in',
    add column if not exists party_size integer not null default 1
        check (party_size > 0),
    add column if not exists gross_amount numeric(12,2) not null default 0,
    add column if not exists discount_amount numeric(12,2) not null default 0,
    add column if not exists tax_amount numeric(12,2) not null default 0,
    add column if not exists net_amount numeric(12,2) not null default 0,
    add column if not exists payment_method text,
    add column if not exists order_reference text,
    add column if not exists source text not null default 'manual',
    add column if not exists visit_context text,
    add column if not exists seating_area text,
    add column if not exists table_reference text,
    add column if not exists staff_notes text,
    add column if not exists customer_mood text,
    add column if not exists satisfaction_score integer
        check (satisfaction_score between 1 and 5),
    add column if not exists is_first_visit boolean not null default false,
    add column if not exists metadata jsonb not null default '{}'::jsonb,
    add column if not exists updated_at timestamptz not null default now();

create index if not exists visits_person_visited_idx
on public.visits(person_id, visited_at desc);

create index if not exists visits_visited_at_idx
on public.visits(visited_at desc);

create index if not exists visits_source_idx
on public.visits(source);

create index if not exists visits_order_reference_idx
on public.visits(order_reference)
where order_reference is not null;

create table if not exists public.visit_items (
    id uuid primary key default gen_random_uuid(),
    visit_id uuid not null
        references public.visits(id)
        on delete cascade,
    item_name text not null,
    category text,
    quantity numeric(10,2) not null default 1
        check (quantity > 0),
    unit_price numeric(12,2) not null default 0,
    total_amount numeric(12,2) not null default 0,
    notes text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists visit_items_visit_idx
on public.visit_items(visit_id);

create index if not exists visit_items_name_idx
on public.visit_items(lower(item_name));

alter table public.visit_items enable row level security;

drop policy if exists visit_items_staff_read
on public.visit_items;

create policy visit_items_staff_read
on public.visit_items
for select
to authenticated
using (
    public.current_app_role() in ('barista', 'manager', 'admin')
);

drop policy if exists visit_items_staff_write
on public.visit_items;

create policy visit_items_staff_write
on public.visit_items
for all
to authenticated
using (
    public.current_app_role() in ('barista', 'manager', 'admin')
)
with check (
    public.current_app_role() in ('barista', 'manager', 'admin')
);

drop policy if exists visits_staff_read
on public.visits;

create policy visits_staff_read
on public.visits
for select
to authenticated
using (
    public.current_app_role() in ('barista', 'manager', 'admin')
);

drop policy if exists visits_staff_write
on public.visits;

create policy visits_staff_write
on public.visits
for all
to authenticated
using (
    public.current_app_role() in ('barista', 'manager', 'admin')
)
with check (
    public.current_app_role() in ('barista', 'manager', 'admin')
);
