create table if not exists public.operational_checklists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  checklist_type text not null default 'daily',
  description text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operational_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.operational_checklists(id) on delete cascade,
  item_text text not null,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  role_scope text not null default 'all',
  created_at timestamptz not null default now()
);

create table if not exists public.operational_runs (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.operational_checklists(id) on delete restrict,
  business_date date not null default current_date,
  shift_name text,
  status text not null default 'open',
  started_by uuid references auth.users(id),
  completed_by uuid references auth.users(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  unique(checklist_id, business_date, shift_name)
);

create table if not exists public.operational_run_items (
  run_id uuid not null references public.operational_runs(id) on delete cascade,
  checklist_item_id uuid not null references public.operational_checklist_items(id) on delete restrict,
  is_complete boolean not null default false,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  notes text,
  primary key(run_id, checklist_item_id)
);

create table if not exists public.customer_tasks (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete cascade,
  task_type text not null default 'follow_up',
  title text not null,
  description text,
  due_at timestamptz,
  priority text not null default 'normal',
  status text not null default 'open',
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  filter_definition jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_tasks_person_status_idx
on public.customer_tasks(person_id, status, due_at);

create index if not exists customer_tasks_assignee_status_idx
on public.customer_tasks(assigned_to, status, due_at);

create index if not exists operational_runs_date_idx
on public.operational_runs(business_date desc, status);

create index if not exists audit_log_created_idx
on public.audit_log(created_at desc);

alter table public.operational_checklists enable row level security;
alter table public.operational_checklist_items enable row level security;
alter table public.operational_runs enable row level security;
alter table public.operational_run_items enable row level security;
alter table public.customer_tasks enable row level security;
alter table public.saved_segments enable row level security;
alter table public.audit_log enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'operational_checklists',
    'operational_checklist_items',
    'operational_runs',
    'operational_run_items',
    'customer_tasks',
    'saved_segments',
    'audit_log'
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

drop policy if exists "staff manage own tasks" on public.customer_tasks;
create policy "staff manage own tasks"
on public.customer_tasks for all to authenticated
using (
  public.current_app_role() in ('manager', 'admin')
  or assigned_to = auth.uid()
  or created_by = auth.uid()
)
with check (
  public.current_app_role() in ('manager', 'admin')
  or assigned_to = auth.uid()
  or created_by = auth.uid()
);

drop policy if exists "staff update run items" on public.operational_run_items;
create policy "staff update run items"
on public.operational_run_items for update to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'))
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create or replace function public.platform_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists operational_checklists_updated_at
on public.operational_checklists;
create trigger operational_checklists_updated_at
before update on public.operational_checklists
for each row execute function public.platform_touch_updated_at();

drop trigger if exists saved_segments_updated_at
on public.saved_segments;
create trigger saved_segments_updated_at
before update on public.saved_segments
for each row execute function public.platform_touch_updated_at();

insert into public.operational_checklists(name, checklist_type, description)
values
  ('Opening Checklist', 'daily', 'Prepare the café before opening'),
  ('Closing Checklist', 'daily', 'Close the café safely and completely'),
  ('Weekly Equipment Check', 'weekly', 'Inspect and maintain critical café equipment')
on conflict (name) do nothing;

insert into public.operational_checklist_items(
  checklist_id,
  item_text,
  sort_order,
  role_scope
)
select c.id, item_text, sort_order, role_scope
from (
  values
    ('Opening Checklist', 'Unlock and inspect the premises', 10, 'all'),
    ('Opening Checklist', 'Switch on coffee equipment and verify warm-up', 20, 'barista'),
    ('Opening Checklist', 'Check grinder calibration and espresso recipe', 30, 'barista'),
    ('Opening Checklist', 'Check milk, ice, water and essential stock', 40, 'all'),
    ('Opening Checklist', 'Verify POS, UPI and internet connectivity', 50, 'manager'),
    ('Opening Checklist', 'Inspect seating, washroom and rabbit area', 60, 'all'),
    ('Closing Checklist', 'Reconcile POS and payment totals', 10, 'manager'),
    ('Closing Checklist', 'Backflush and clean espresso equipment', 20, 'barista'),
    ('Closing Checklist', 'Clean grinders, counters and food-contact surfaces', 30, 'all'),
    ('Closing Checklist', 'Record low-stock and maintenance issues', 40, 'all'),
    ('Closing Checklist', 'Secure cash, doors, utilities and premises', 50, 'manager'),
    ('Weekly Equipment Check', 'Inspect espresso machine for leaks and pressure issues', 10, 'barista'),
    ('Weekly Equipment Check', 'Inspect grinders and burr condition', 20, 'barista'),
    ('Weekly Equipment Check', 'Clean refrigeration and ice-machine contact areas', 30, 'all'),
    ('Weekly Equipment Check', 'Review maintenance log and unresolved faults', 40, 'manager')
) seed(checklist_name, item_text, sort_order, role_scope)
join public.operational_checklists c
  on c.name = seed.checklist_name
where not exists (
  select 1
  from public.operational_checklist_items i
  where i.checklist_id = c.id
    and i.item_text = seed.item_text
);

insert into public.tags(name, description)
values
  ('VIP', 'High-value or strategically important customer'),
  ('Regular', 'Frequent returning customer'),
  ('Parent', 'Often visits with children'),
  ('Remote Worker', 'Uses the café for focused work'),
  ('Coffee Enthusiast', 'Shows strong interest in coffee'),
  ('Book Club', 'Book Club participant'),
  ('Run Club', 'Run Club participant'),
  ('Neighbour', 'Lives or works nearby'),
  ('Re-engage', 'Needs a thoughtful follow-up'),
  ('Introducer', 'Has referred other customers')
on conflict do nothing;

insert into public.saved_segments(name, description, filter_definition)
values
  (
    'Dormant 45 Days',
    'Active customers without a visit in the last 45 days',
    '{"type":"dormant","days":45}'::jsonb
  ),
  (
    'Birthdays and Important Dates',
    'Customers with important dates recorded',
    '{"type":"important_dates"}'::jsonb
  ),
  (
    'Top Referrers',
    'Customers who have introduced other customers',
    '{"type":"referrers"}'::jsonb
  ),
  (
    'Open Follow-ups',
    'Customers with incomplete follow-up tasks',
    '{"type":"tasks","status":"open"}'::jsonb
  )
on conflict (name) do nothing;


create table if not exists public.communication_channel_preferences (
  person_id uuid not null references public.people(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'push')),
  status text not null default 'unknown'
    check (status in ('unknown', 'opted_in', 'opted_out', 'blocked')),
  preferred boolean not null default false,
  consent_source text,
  consent_text text,
  consented_at timestamptz,
  opted_out_at timestamptz,
  quiet_hours_start time,
  quiet_hours_end time,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(person_id, channel)
);

create table if not exists public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'push')),
  category text not null default 'marketing',
  subject text,
  body_text text not null,
  body_html text,
  provider_template_id text,
  provider_template_status text,
  variables jsonb not null default '[]'::jsonb,
  language_code text not null default 'en',
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'push', 'mixed')),
  template_id uuid references public.communication_templates(id) on delete set null,
  segment_id uuid references public.saved_segments(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled')),
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.communication_campaigns(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'push')),
  destination text,
  status text not null default 'pending'
    check (status in ('pending', 'queued', 'sent', 'delivered', 'read', 'clicked', 'replied', 'failed', 'suppressed', 'cancelled')),
  personalization jsonb not null default '{}'::jsonb,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.communication_messages (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.communication_recipients(id) on delete set null,
  person_id uuid references public.people(id) on delete cascade,
  campaign_id uuid references public.communication_campaigns(id) on delete set null,
  template_id uuid references public.communication_templates(id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'push')),
  direction text not null default 'outbound'
    check (direction in ('outbound', 'inbound')),
  subject text,
  body_text text,
  provider text,
  provider_message_id text,
  status text not null default 'queued',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.communication_delivery_events (
  id bigserial primary key,
  message_id uuid references public.communication_messages(id) on delete cascade,
  provider text,
  provider_event_id text,
  event_type text not null,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique(provider, provider_event_id)
);

create table if not exists public.communication_suppressions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'push', 'all')),
  destination text,
  reason text not null,
  source text,
  suppressed_at timestamptz not null default now(),
  expires_at timestamptz,
  unique(person_id, channel)
);

create table if not exists public.communication_frequency_limits (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'push')),
  message_type text not null default 'marketing',
  max_messages integer not null,
  period_hours integer not null,
  is_active boolean not null default true,
  unique(channel, message_type)
);

create table if not exists public.communication_provider_configs (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp', 'sms', 'push')),
  provider text not null,
  is_active boolean not null default false,
  public_config jsonb not null default '{}'::jsonb,
  secret_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel, provider)
);

create index if not exists communication_recipients_campaign_status_idx
on public.communication_recipients(campaign_id, status);

create index if not exists communication_messages_person_created_idx
on public.communication_messages(person_id, created_at desc);

create index if not exists communication_events_message_idx
on public.communication_delivery_events(message_id, event_at desc);

alter table public.communication_channel_preferences enable row level security;
alter table public.communication_templates enable row level security;
alter table public.communication_campaigns enable row level security;
alter table public.communication_recipients enable row level security;
alter table public.communication_messages enable row level security;
alter table public.communication_delivery_events enable row level security;
alter table public.communication_suppressions enable row level security;
alter table public.communication_frequency_limits enable row level security;
alter table public.communication_provider_configs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'communication_channel_preferences',
    'communication_templates',
    'communication_campaigns',
    'communication_recipients',
    'communication_messages',
    'communication_delivery_events',
    'communication_suppressions',
    'communication_frequency_limits',
    'communication_provider_configs'
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

insert into public.communication_frequency_limits(
  channel,
  message_type,
  max_messages,
  period_hours
)
values
  ('email', 'marketing', 2, 168),
  ('whatsapp', 'marketing', 2, 168),
  ('email', 'transactional', 10, 24),
  ('whatsapp', 'transactional', 10, 24)
on conflict (channel, message_type) do nothing;

insert into public.communication_templates(
  name,
  channel,
  category,
  subject,
  body_text,
  variables
)
values
  (
    'Birthday Greeting Email',
    'email',
    'relationship',
    'A small birthday note from The 11th Bean',
    'Happy birthday, {{preferred_name}}. We hope your day contains good people, good coffee and a little time to breathe.',
    '["preferred_name"]'::jsonb
  ),
  (
    'Event Invitation WhatsApp',
    'whatsapp',
    'marketing',
    null,
    'Hi {{preferred_name}}, we thought you may enjoy {{event_name}} at The 11th Bean on {{event_date}}. Reply here if you would like the details.',
    '["preferred_name","event_name","event_date"]'::jsonb
  ),
  (
    'Thoughtful Reconnect Email',
    'email',
    'relationship',
    'We have missed seeing you',
    'Hi {{preferred_name}}, it has been a while. No sales pitch, just a note to say we hope you are doing well.',
    '["preferred_name"]'::jsonb
  )
on conflict (name) do nothing;

create or replace function public.log_communication_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.person_id is not null then
    insert into public.timeline_entries(
      person_id,
      event_type,
      title,
      summary,
      occurred_at,
      source_type,
      source_id,
      visibility,
      metadata
    )
    values (
      new.person_id,
      'communication',
      case
        when new.direction = 'inbound' then 'Customer message received'
        else initcap(new.channel) || ' message'
      end,
      left(coalesce(new.subject || ': ', '') || coalesce(new.body_text, ''), 240),
      new.created_at,
      'communication_message',
      new.id,
      'barista',
      jsonb_build_object(
        'channel', new.channel,
        'direction', new.direction,
        'status', new.status,
        'campaign_id', new.campaign_id
      )
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists communication_message_timeline
on public.communication_messages;

create trigger communication_message_timeline
after insert on public.communication_messages
for each row execute function public.log_communication_timeline();


create or replace function public.platform_overview()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'open_tasks', (
      select count(*) from public.customer_tasks where status = 'open'
    ),
    'overdue_tasks', (
      select count(*) from public.customer_tasks
      where status = 'open'
        and due_at is not null
        and due_at < now()
    ),
    'open_feedback', (
      select count(*) from public.customer_feedback
      where resolution_status = 'open'
    ),
    'active_loyalty_accounts', (
      select count(*) from public.loyalty_accounts
    ),
    'active_gift_cards', (
      select count(*) from public.gift_cards
      where status = 'active'
        and remaining_value > 0
    ),
    'failed_syncs', (
      select count(*) from public.integration_sync_runs
      where status = 'failed'
        and started_at >= now() - interval '7 days'
    )
  );
$$;

revoke all on function public.platform_overview() from public;
grant execute on function public.platform_overview() to authenticated;

create or replace function public.upcoming_important_dates(days_ahead integer default 45)
returns table (
  important_date_id uuid,
  person_id uuid,
  customer_name text,
  date_type text,
  label text,
  original_date date,
  next_occurrence date,
  days_until integer
)
language sql
security definer
set search_path = public
as $$
  with calculated as (
    select
      d.id,
      d.person_id,
      trim(
        coalesce(nullif(p.preferred_name, ''), p.first_name) || ' ' ||
        coalesce(p.last_name, '')
      ) as customer_name,
      d.date_type,
      d.label,
      d.date_value,
      make_date(
        extract(year from current_date)::integer,
        extract(month from d.date_value)::integer,
        least(
          extract(day from d.date_value)::integer,
          extract(
            day from (
              date_trunc(
                'month',
                make_date(
                  extract(year from current_date)::integer,
                  extract(month from d.date_value)::integer,
                  1
                )
              ) + interval '1 month - 1 day'
            )
          )::integer
        )
      ) as occurrence_this_year
    from public.important_dates d
    join public.people p on p.id = d.person_id
    where p.is_active = true
  ),
  next_dates as (
    select
      *,
      case
        when occurrence_this_year >= current_date
          then occurrence_this_year
        else occurrence_this_year + interval '1 year'
      end::date as next_occurrence
    from calculated
  )
  select
    id,
    person_id,
    customer_name,
    date_type,
    label,
    date_value,
    next_occurrence,
    (next_occurrence - current_date)::integer
  from next_dates
  where next_occurrence <= current_date + days_ahead
  order by next_occurrence, customer_name;
$$;

revoke all on function public.upcoming_important_dates(integer) from public;
grant execute on function public.upcoming_important_dates(integer) to authenticated;
