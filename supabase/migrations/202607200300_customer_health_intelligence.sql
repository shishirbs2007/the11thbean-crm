create or replace function public.refresh_customer_health_after_visit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.person_id, old.person_id);

  if target_id is not null then
    perform public.recalculate_customer_health(target_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists visits_refresh_customer_health on public.visits;

create trigger visits_refresh_customer_health
after insert or update or delete
on public.visits
for each row
execute function public.refresh_customer_health_after_visit();

select public.recalculate_customer_health(null);

notify pgrst, 'reload schema';
