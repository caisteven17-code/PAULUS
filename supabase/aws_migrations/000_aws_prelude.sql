-- AWS RDS prelude — run once, before the portable_migrations chain.
-- Plain PostgreSQL (RDS) has neither Supabase's `anon`/`authenticated`/`service_role`
-- roles nor its built-in `auth` schema. The portable migrations GRANT to those roles
-- and one trigger (audit.log_change, in 173_audit_schema.sql) calls auth.uid() at
-- runtime. This file creates harmless shims so the migrations run unmodified.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

-- Stub for Supabase's auth.uid(): there is no logged-in Supabase user on this
-- database, so this always returns NULL — matching how the audit trigger already
-- treats service-role/pipeline writes ("NULL for service-role / pipeline ops").
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT NULL::uuid $$;
