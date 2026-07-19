create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at
before update on public.people
for each row execute function public.set_updated_at();

drop trigger if exists external_identities_set_updated_at on public.external_identities;
create trigger external_identities_set_updated_at
before update on public.external_identities
for each row execute function public.set_updated_at();

drop trigger if exists preferences_set_updated_at on public.customer_preferences;
create trigger preferences_set_updated_at
before update on public.customer_preferences
for each row execute function public.set_updated_at();

create or replace function public.claim_first_admin()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  active_roles integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select count(*) into active_roles from public.app_roles where is_active = true;

  if active_roles > 0 then
    raise exception 'An administrator already exists';
  end if;

  insert into public.app_roles(user_id, role, is_active)
  values (auth.uid(), 'admin', true)
  on conflict (user_id)
  do update set role = 'admin', is_active = true;

  return 'admin';
end;
$$;

revoke all on function public.claim_first_admin() from public;
grant execute on function public.claim_first_admin() to authenticated;
grant execute on function public.current_app_role() to authenticated;

drop policy if exists "managers can modify people" on public.people;
create policy "staff can create people"
on public.people for insert to authenticated
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "staff can update people"
on public.people for update to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'))
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "managers can delete people"
on public.people for delete to authenticated
using (public.current_app_role() in ('manager', 'admin'));

create policy "managers manage external identities"
on public.external_identities for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "staff can create visits"
on public.visits for insert to authenticated
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "managers can update visits"
on public.visits for update to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "staff can create order items"
on public.order_items for insert to authenticated
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "staff can create preferences"
on public.customer_preferences for insert to authenticated
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "staff can update preferences"
on public.customer_preferences for update to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'))
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "managers can manage tags"
on public.tags for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "staff can read person tags"
on public.person_tags for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "managers can manage person tags"
on public.person_tags for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can create communities"
on public.communities for insert to authenticated
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can update communities"
on public.communities for update to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can manage memberships"
on public.community_memberships for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can create events"
on public.events for insert to authenticated
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can update events"
on public.events for update to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can manage event registrations"
on public.event_registrations for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can create consents"
on public.consents for insert to authenticated
with check (public.current_app_role() in ('manager', 'admin'));

create policy "admins manage roles"
on public.app_roles for all to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create index if not exists people_name_idx
on public.people(lower(first_name), lower(last_name));

create index if not exists people_phone_idx on public.people(phone);
create index if not exists people_email_idx on public.people(lower(email));
create index if not exists events_starts_at_idx on public.events(starts_at desc);
