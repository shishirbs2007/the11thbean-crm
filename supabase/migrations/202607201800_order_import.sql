-- Order import.
--
-- Until now every visit reached the CRM because somebody typed it in during
-- service. That is the one assumption the whole system rests on and the one
-- least likely to hold in a busy café: order_items has never held a single
-- row. This lets the till feed the CRM instead.
--
-- Two properties matter more than anything else here:
--
--   Idempotency. Importing the same export twice must not double a guest's
--   visit history, because it will happen — somebody will re-upload a file.
--   External order ids are the key.
--
--   Honest matching. An order is attached to a guest only when the contact
--   details identify one unambiguously. A misattributed visit is worse than an
--   unattributed one: it teaches the CRM something false about a real person.

create table if not exists public.import_runs (
    id uuid primary key default gen_random_uuid(),
    adapter_key text not null,
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running'
        check (status in ('running', 'succeeded', 'partially_failed', 'failed')),
    orders_seen integer not null default 0,
    orders_imported integer not null default 0,
    orders_skipped integer not null default 0,
    orders_failed integer not null default 0,
    guests_matched integer not null default 0,
    guests_unmatched integer not null default 0,
    summary text,
    triggered_by uuid references auth.users(id) on delete set null,
    branch_id uuid references public.branches(id) on delete set null
);

create index if not exists import_runs_started_idx
on public.import_runs(started_at desc);

-- One row per order the importer saw, whatever happened to it. An order that
-- could not be matched is kept here rather than discarded, so staff can see
-- what the till knows that the CRM does not.
create table if not exists public.import_run_items (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references public.import_runs(id) on delete cascade,
    external_id text not null,
    outcome text not null
        check (outcome in ('imported', 'skipped', 'unmatched', 'failed')),
    reason text not null,
    person_id uuid references public.people(id) on delete set null,
    visit_id uuid references public.visits(id) on delete set null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists import_run_items_run_idx
on public.import_run_items(run_id);

create index if not exists import_run_items_outcome_idx
on public.import_run_items(outcome);

-- The external order reference lives on the visit, and is what makes a repeat
-- import a no-op rather than a duplicate.
alter table public.visits
    add column if not exists external_order_id text;

create unique index if not exists visits_external_order_unique
on public.visits(external_order_id)
where external_order_id is not null;

alter table public.import_runs enable row level security;
alter table public.import_run_items enable row level security;

drop policy if exists import_runs_staff_read on public.import_runs;

create policy import_runs_staff_read
on public.import_runs for select to authenticated using (true);

drop policy if exists import_runs_manager_write on public.import_runs;

create policy import_runs_manager_write
on public.import_runs for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

drop policy if exists import_run_items_staff_read on public.import_run_items;

create policy import_run_items_staff_read
on public.import_run_items for select to authenticated using (true);

drop policy if exists import_run_items_manager_write on public.import_run_items;

create policy import_run_items_manager_write
on public.import_run_items for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));


-- Finds the one guest these contact details identify, or nobody.
--
-- Deliberately conservative: if a phone number or address matches more than
-- one active person the answer is null. Guessing would attach somebody else's
-- coffee to a guest's history, and the CRM would then confidently tell staff
-- the wrong thing about a real person.
create or replace function public.match_guest_for_import(
    contact_phone text default null,
    contact_email text default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    with candidates as (
        select p.id
        from public.people p
        where p.is_active = true
          and (
            (contact_phone is not null and contact_phone <> ''
              and regexp_replace(p.phone, '[^0-9]', '', 'g')
                  = regexp_replace(contact_phone, '[^0-9]', '', 'g')
              and length(regexp_replace(contact_phone, '[^0-9]', '', 'g')) >= 8)
            or
            (contact_email is not null and contact_email <> ''
              and lower(p.email) = lower(contact_email))
          )
    )
    -- min() has no uuid overload, so the single match is taken from an array.
    select case when count(*) = 1 then (array_agg(id))[1] else null end
    from candidates;
$$;


-- Imports one batch of orders.
--
-- The payload is provider-neutral: whatever adapter produced it, the shape is
-- the same, so there is one import path rather than one per till.
--
--   [{ "external_id": "...", "occurred_at": "...", "phone": "...",
--      "email": "...", "net_amount": 0, "party_size": 1,
--      "items": [{ "item_name": "...", "category": "...",
--                  "quantity": 1, "unit_price": 0 }] }]
create or replace function public.import_orders(
    adapter text,
    orders jsonb,
    actor uuid default null,
    target_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid;
  order_row jsonb;
  item_row jsonb;
  external_id text;
  occurred_at timestamptz;
  matched_person uuid;
  new_visit_id uuid;
  seen integer := 0;
  imported integer := 0;
  skipped integer := 0;
  unmatched integer := 0;
  failed integer := 0;
  matched_count integer := 0;
begin
  if jsonb_typeof(orders) <> 'array' then
    raise exception 'Orders payload must be an array';
  end if;

  insert into public.import_runs (adapter_key, triggered_by, branch_id)
  values (adapter, actor, coalesce(target_branch_id, public.current_branch_id()))
  returning id into run_id;

  for order_row in select * from jsonb_array_elements(orders)
  loop
    seen := seen + 1;
    external_id := order_row->>'external_id';

    begin
      if external_id is null or external_id = '' then
        failed := failed + 1;
        insert into public.import_run_items (run_id, external_id, outcome, reason, payload)
        values (run_id, '(none)', 'failed', 'Order has no external id', order_row);
        continue;
      end if;

      -- Already imported. This is the ordinary case on a repeat upload and is
      -- not a problem worth reporting as one.
      if exists (
        select 1 from public.visits v where v.external_order_id = external_id
      ) then
        skipped := skipped + 1;
        insert into public.import_run_items (run_id, external_id, outcome, reason, payload)
        values (run_id, external_id, 'skipped', 'Already imported', order_row);
        continue;
      end if;

      occurred_at := coalesce(
        (order_row->>'occurred_at')::timestamptz,
        now()
      );

      matched_person := public.match_guest_for_import(
        order_row->>'phone',
        order_row->>'email'
      );

      if matched_person is null then
        -- Kept, not discarded: staff can see what the till knows that the CRM
        -- does not, and decide whether to create the guest.
        unmatched := unmatched + 1;
        insert into public.import_run_items (run_id, external_id, outcome, reason, payload)
        values (
          run_id, external_id, 'unmatched',
          'No single guest matched these contact details',
          order_row
        );
        continue;
      end if;

      matched_count := matched_count + 1;

      insert into public.visits (
        person_id, visited_at, visit_type, party_size,
        gross_amount, net_amount, source, external_order_id, branch_id
      )
      values (
        matched_person,
        occurred_at,
        'walk_in',
        greatest(coalesce((order_row->>'party_size')::integer, 1), 1),
        coalesce((order_row->>'net_amount')::numeric, 0),
        coalesce((order_row->>'net_amount')::numeric, 0),
        adapter,
        external_id,
        coalesce(target_branch_id, public.current_branch_id())
      )
      returning id into new_visit_id;

      for item_row in
        select * from jsonb_array_elements(
          coalesce(order_row->'items', '[]'::jsonb)
        )
      loop
        if coalesce(item_row->>'item_name', '') = '' then
          continue;
        end if;

        insert into public.order_items (
          visit_id, external_item_id, item_name, category, quantity, unit_price
        )
        values (
          new_visit_id,
          item_row->>'external_item_id',
          item_row->>'item_name',
          nullif(item_row->>'category', ''),
          greatest(coalesce((item_row->>'quantity')::numeric, 1), 0.01),
          coalesce((item_row->>'unit_price')::numeric, 0)
        );
      end loop;

      imported := imported + 1;
      insert into public.import_run_items (
        run_id, external_id, outcome, reason, person_id, visit_id, payload
      )
      values (
        run_id, external_id, 'imported',
        'Matched and recorded', matched_person, new_visit_id, order_row
      );

    exception when others then
      -- One bad order must not lose the rest of the day's takings.
      failed := failed + 1;
      insert into public.import_run_items (run_id, external_id, outcome, reason, payload)
      values (
        run_id, coalesce(external_id, '(none)'), 'failed',
        'Import failed: ' || sqlerrm, order_row
      );
    end;
  end loop;

  update public.import_runs
  set finished_at = now(),
      status = case
        when failed = 0 then 'succeeded'
        when imported = 0 then 'failed'
        else 'partially_failed'
      end,
      orders_seen = seen,
      orders_imported = imported,
      orders_skipped = skipped,
      orders_failed = failed,
      guests_matched = matched_count,
      guests_unmatched = unmatched,
      summary = adapter || ': ' || seen::text || ' orders seen, '
        || imported::text || ' imported, ' || skipped::text || ' already known, '
        || unmatched::text || ' unmatched, ' || failed::text || ' failed.'
  where id = run_id;

  return run_id;
end;
$$;

notify pgrst, 'reload schema';
