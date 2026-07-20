-- Say why an order could not be attributed.
--
-- The importer refuses to guess when contact details identify more than one
-- guest, which is right. But it reported that identically to "nobody matched",
-- and those need opposite responses: one means add the guest, the other means
-- two records exist for the same person and should be merged.
--
-- Duplicate guest records are an ordinary café problem — somebody is entered
-- twice with the number written differently — and this is the moment the CRM
-- can notice. Reporting it as "unmatched" wasted that.

-- Returns the match and the evidence behind it, so callers can explain
-- themselves rather than just failing.
create or replace function public.match_guest_detail(
    contact_phone text default null,
    contact_email text default null
)
returns table (
    person_id uuid,
    candidate_count integer,
    candidate_ids uuid[]
)
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
    select
        case when count(*) = 1 then (array_agg(id))[1] else null end,
        count(*)::integer,
        coalesce(array_agg(id), array[]::uuid[])
    from candidates;
$$;

-- Kept so existing callers keep working, now defined in terms of the above.
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
    select person_id
    from public.match_guest_detail(contact_phone, contact_email);
$$;


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
  match record;
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

      if exists (
        select 1 from public.visits v where v.external_order_id = external_id
      ) then
        skipped := skipped + 1;
        insert into public.import_run_items (run_id, external_id, outcome, reason, payload)
        values (run_id, external_id, 'skipped', 'Already imported', order_row);
        continue;
      end if;

      occurred_at := coalesce((order_row->>'occurred_at')::timestamptz, now());

      select * into match
      from public.match_guest_detail(
        order_row->>'phone',
        order_row->>'email'
      );

      if match.person_id is null then
        unmatched := unmatched + 1;

        insert into public.import_run_items (
          run_id, external_id, outcome, reason, payload
        )
        values (
          run_id, external_id, 'unmatched',
          case
            when match.candidate_count > 1 then
              -- The café has the same person twice. Worth knowing.
              match.candidate_count::text
                || ' guests share these contact details. Merge them, then re-import.'
            else
              'No guest has these contact details yet. Adding them will attach future orders automatically.'
          end,
          order_row || jsonb_build_object(
            'candidate_count', match.candidate_count,
            'candidate_ids', to_jsonb(match.candidate_ids)
          )
        );
        continue;
      end if;

      matched_count := matched_count + 1;

      insert into public.visits (
        person_id, visited_at, visit_type, party_size,
        gross_amount, net_amount, source, external_order_id, branch_id
      )
      values (
        match.person_id,
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
        'Matched and recorded', match.person_id, new_visit_id, order_row
      );

    exception when others then
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
