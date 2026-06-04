-- =============================================================================
-- PAULUS Base
-- Extensions, schemas, and shared helper functions.
-- =============================================================================

create extension if not exists "pgcrypto";

create schema if not exists diocese;
create schema if not exists operations;
create schema if not exists parishes;
create schema if not exists schools;
create schema if not exists seminaries;
create schema if not exists shared_analytics;
create schema if not exists parish_analytics;
create schema if not exists school_analytics;
create schema if not exists seminary_analytics;
create schema if not exists priest_assignment_analytics;
create schema if not exists reference;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.attach_updated_at_trigger(target_table regclass)
returns void
language plpgsql
as $$
declare
  trigger_name text := replace(target_table::text, '.', '_') || '_set_updated_at';
begin
  execute format('drop trigger if exists %I on %s', trigger_name, target_table);
  execute format(
    'create trigger %I before update on %s for each row execute function public.set_updated_at()',
    trigger_name,
    target_table
  );
end;
$$;
