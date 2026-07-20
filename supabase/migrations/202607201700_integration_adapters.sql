-- Phase 8: integration adapters.
--
-- The CRM never learns a provider's name. It knows capabilities — "something
-- can send email", "something can import orders" — and an adapter declares
-- which capabilities it offers. Swapping PetPooja for another till, or one
-- email provider for another, is a row and an adapter module, not a change to
-- any feature.
--
-- Credentials are never stored here. This table records which adapters exist,
-- what they can do and how they are behaving; secrets live in environment
-- configuration where the database cannot leak them.

create table if not exists public.integration_capabilities (
    key text primary key,
    label text not null,
    description text not null
);

insert into public.integration_capabilities (key, label, description)
values
    ('orders.import', 'Import orders', 'Pull completed orders and their items into visits.'),
    ('customers.sync', 'Sync customers', 'Match external customer records to people.'),
    ('email.send', 'Send email', 'Deliver an email message.'),
    ('whatsapp.send', 'Send WhatsApp', 'Deliver a WhatsApp message.'),
    ('sms.send', 'Send SMS', 'Deliver a text message.'),
    ('push.send', 'Send push notification', 'Deliver a push notification.'),
    ('calendar.sync', 'Sync calendar', 'Publish events to a calendar.'),
    ('delivery.webhook', 'Receive delivery events', 'Accept delivery, open and click callbacks.')
on conflict (key) do update set
    label = excluded.label,
    description = excluded.description;


create table if not exists public.integration_adapters (
    key text primary key,
    label text not null,
    vendor text not null,
    description text,
    -- Which capabilities this adapter implements.
    capabilities text[] not null default '{}',
    -- Named environment variables the adapter needs. Never the values.
    required_env text[] not null default '{}',
    is_enabled boolean not null default false,
    branch_id uuid references public.branches(id) on delete set null,
    health_status text not null default 'unknown'
        check (health_status in ('unknown', 'healthy', 'degraded', 'failing')),
    last_checked_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Every adapter ships disabled and unconfigured. A café turns one on after
-- supplying its credentials, and until then the CRM behaves as if it is absent.
insert into public.integration_adapters
    (key, label, vendor, description, capabilities, required_env)
values
    ('petpooja', 'PetPooja', 'PetPooja',
     'Point of sale. Imports orders and their items so favourites can be inferred.',
     array['orders.import', 'customers.sync'],
     array['PETPOOJA_API_KEY', 'PETPOOJA_RESTAURANT_ID']),
    ('generic_pos', 'Generic POS (CSV)', 'None',
     'Imports orders from a CSV export, for tills without an API.',
     array['orders.import'],
     array[]::text[]),
    ('resend', 'Resend', 'Resend',
     'Transactional and campaign email.',
     array['email.send', 'delivery.webhook'],
     array['RESEND_API_KEY']),
    ('whatsapp_cloud', 'WhatsApp Cloud API', 'Meta',
     'WhatsApp business messaging.',
     array['whatsapp.send', 'delivery.webhook'],
     array['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN']),
    ('twilio_sms', 'Twilio SMS', 'Twilio',
     'Text messaging.',
     array['sms.send', 'delivery.webhook'],
     array['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']),
    ('google_calendar', 'Google Calendar', 'Google',
     'Publishes events so staff see them alongside their own diary.',
     array['calendar.sync'],
     array['GOOGLE_CALENDAR_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON'])
on conflict (key) do update set
    label = excluded.label,
    description = excluded.description,
    capabilities = excluded.capabilities,
    required_env = excluded.required_env;

alter table public.integration_adapters enable row level security;
alter table public.integration_capabilities enable row level security;

drop policy if exists integration_adapters_staff_read on public.integration_adapters;

create policy integration_adapters_staff_read
on public.integration_adapters
for select
to authenticated
using (true);

drop policy if exists integration_adapters_admin_write on public.integration_adapters;

create policy integration_adapters_admin_write
on public.integration_adapters
for all
to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

drop policy if exists integration_capabilities_staff_read
on public.integration_capabilities;

create policy integration_capabilities_staff_read
on public.integration_capabilities
for select
to authenticated
using (true);


-- Which adapter should handle a given capability.
--
-- Callers ask for a capability, never for a vendor. If nothing is enabled the
-- answer is null and the feature degrades honestly rather than failing.
create or replace function public.adapter_for_capability(
    capability text,
    target_branch_id uuid default null
)
returns text
language sql
stable
security definer
set search_path = public
as $$
    select a.key
    from public.integration_adapters a
    where a.is_enabled = true
      and capability = any(a.capabilities)
      and (
        a.branch_id is null
        or target_branch_id is null
        or a.branch_id = target_branch_id
      )
    -- A branch-specific adapter beats a global one.
    order by (a.branch_id is not null) desc, a.key
    limit 1;
$$;


-- Records the outcome of talking to a provider, so a café can see which
-- integration is misbehaving without reading logs.
create or replace function public.record_adapter_health(
    adapter_key text,
    is_healthy boolean,
    error_message text default null
)
returns void
language sql
security definer
set search_path = public
as $$
    update public.integration_adapters
    set health_status = case when is_healthy then 'healthy' else 'failing' end,
        last_checked_at = now(),
        last_error = case when is_healthy then null else error_message end,
        updated_at = now()
    where key = adapter_key;
$$;

grant select on public.integration_adapters to authenticated;
grant select on public.integration_capabilities to authenticated;

notify pgrst, 'reload schema';
