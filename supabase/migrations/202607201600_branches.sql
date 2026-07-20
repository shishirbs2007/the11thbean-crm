-- Phase 8: branches.
--
-- The 11th Bean is one café today. This makes a second one possible without
-- making the first one harder to use: every existing row is assigned to a
-- default branch, branch_id is nullable everywhere it appears, and a café
-- running a single site never has to think about any of it.
--
-- The rule for branch-aware intelligence: the predicate goes *inside* the
-- functions that already scan people and visits, never around them. Filtering
-- after the fact would scan every branch to answer a question about one.

create table if not exists public.branches (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    slug text not null unique,
    address text,
    timezone text not null default 'Asia/Kolkata',
    opened_on date,
    is_active boolean not null default true,
    -- The branch new records belong to when nobody says otherwise. Exactly one
    -- branch may hold this, enforced by the partial index below.
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists branches_single_default
on public.branches (is_default)
where is_default = true;

alter table public.branches enable row level security;

drop policy if exists branches_staff_read on public.branches;

create policy branches_staff_read
on public.branches
for select
to authenticated
using (true);

drop policy if exists branches_admin_write on public.branches;

create policy branches_admin_write
on public.branches
for all
to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

-- The café that already exists.
insert into public.branches (name, slug, address, is_default, opened_on)
select
    'The 11th Bean',
    'the-11th-bean',
    'South End Road, Basavanagudi, Bengaluru 560004',
    true,
    current_date
where not exists (select 1 from public.branches);


-- Branch on the records where it actually means something: where a guest was
-- served, which café hosts a group, which site an event runs at, and which
-- branches a member of staff works across.
alter table public.visits
    add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table public.events
    add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table public.communities
    add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table public.people
    add column if not exists home_branch_id uuid references public.branches(id) on delete set null;

alter table public.communication_campaigns
    add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table public.hospitality_tasks
    add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table public.hospitality_automations
    add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table public.audiences
    add column if not exists branch_id uuid references public.branches(id) on delete set null;

create index if not exists visits_branch_idx on public.visits(branch_id, visited_at desc);
create index if not exists events_branch_idx on public.events(branch_id);
create index if not exists people_home_branch_idx on public.people(home_branch_id);
create index if not exists hospitality_tasks_branch_idx on public.hospitality_tasks(branch_id, due_on);

-- Existing rows belong to the café that recorded them.
update public.visits
set branch_id = (select id from public.branches where is_default)
where branch_id is null;

update public.events
set branch_id = (select id from public.branches where is_default)
where branch_id is null;

update public.communities
set branch_id = (select id from public.branches where is_default)
where branch_id is null;

update public.people
set home_branch_id = (select id from public.branches where is_default)
where home_branch_id is null;


-- Which branches a member of staff works at. A café with one site never
-- populates this: an empty assignment means "everywhere", so single-site
-- deployments carry no extra setup.
create table if not exists public.staff_branches (
    user_id uuid not null references auth.users(id) on delete cascade,
    branch_id uuid not null references public.branches(id) on delete cascade,
    is_primary boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (user_id, branch_id)
);

alter table public.staff_branches enable row level security;

drop policy if exists staff_branches_staff_read on public.staff_branches;

create policy staff_branches_staff_read
on public.staff_branches
for select
to authenticated
using (true);

drop policy if exists staff_branches_admin_write on public.staff_branches;

create policy staff_branches_admin_write
on public.staff_branches
for all
to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));


-- The branches the current user may see.
--
-- An admin, or anyone with no explicit assignment, sees everything. This is
-- what keeps a single-café deployment free of branch administration.
create or replace function public.visible_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
    select b.id
    from public.branches b
    where b.is_active = true
      and (
        public.current_app_role() = 'admin'
        or not exists (
            select 1 from public.staff_branches sb
            where sb.user_id = auth.uid()
        )
        or exists (
            select 1 from public.staff_branches sb
            where sb.user_id = auth.uid()
              and sb.branch_id = b.id
        )
      );
$$;


-- The branch to attribute new records to: the user's primary branch, or the
-- café's default.
create or replace function public.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(
        (
            select sb.branch_id
            from public.staff_branches sb
            where sb.user_id = auth.uid()
              and sb.is_primary = true
            limit 1
        ),
        (select id from public.branches where is_default limit 1)
    );
$$;


-- New records land in the right café without anyone selecting it.
create or replace function public.set_branch_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_id is null then
    new.branch_id := public.current_branch_id();
  end if;
  return new;
end;
$$;

drop trigger if exists visits_set_branch on public.visits;

create trigger visits_set_branch
before insert on public.visits
for each row
execute function public.set_branch_default();

drop trigger if exists events_set_branch on public.events;

create trigger events_set_branch
before insert on public.events
for each row
execute function public.set_branch_default();

drop trigger if exists hospitality_tasks_set_branch on public.hospitality_tasks;

create trigger hospitality_tasks_set_branch
before insert on public.hospitality_tasks
for each row
execute function public.set_branch_default();


-- Branch-aware business facts.
--
-- Passing null keeps the existing whole-café behaviour, so every caller that
-- has not been taught about branches keeps working unchanged.
create or replace function public.branch_period_facts(
    target_branch_id uuid default null,
    period_days integer default 30,
    reference_time timestamptz default now()
)
returns table (
    branch_id uuid,
    branch_name text,
    revenue numeric,
    visits integer,
    guests integer,
    average_spend numeric
)
language sql
stable
security definer
set search_path = public
as $$
    select
        b.id,
        b.name,
        round(coalesce(sum(v.net_amount), 0), 2),
        count(v.id)::integer,
        count(distinct v.person_id)::integer,
        round(
            case when count(v.id) = 0 then 0
                 else coalesce(sum(v.net_amount), 0) / count(v.id) end,
            2
        )
    from public.branches b
    left join public.visits v
      on v.branch_id = b.id
     and v.visited_at >= reference_time - make_interval(days => period_days)
     and v.visited_at <= reference_time
    where b.is_active = true
      and (target_branch_id is null or b.id = target_branch_id)
      and b.id in (select public.visible_branch_ids())
    group by b.id, b.name
    order by b.name;
$$;

grant select on public.branches to authenticated;
grant select on public.staff_branches to authenticated;

notify pgrst, 'reload schema';
