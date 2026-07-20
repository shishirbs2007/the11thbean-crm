-- Table privileges for the standard Supabase roles.
--
-- The production project received these grants when it was provisioned, so the
-- schema worked there while a database built purely from these migrations did
-- not. Recording them here makes any environment reproducible from the
-- migration history alone.
--
-- Row Level Security remains the access control boundary: these grants only
-- allow a role to attempt a query, and every table below has RLS enabled with
-- explicit policies. Without the grant, even a passing policy returns a
-- permission error.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
on all tables in schema public
to authenticated, service_role;

grant select on all tables in schema public to anon;

grant usage, select on all sequences in schema public
to anon, authenticated, service_role;

grant execute on all functions in schema public
to anon, authenticated, service_role;

-- Anything added by a later migration inherits the same grants.
alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
grant select on tables to anon;

alter default privileges in schema public
grant usage, select on sequences to anon, authenticated, service_role;

alter default privileges in schema public
grant execute on functions to anon, authenticated, service_role;

notify pgrst, 'reload schema';
