-- Reversible AWS observation step. Requires migrations 074/075, completed
-- school/seminary backfills, backups, and a zero-dependency audit.

DO $$
DECLARE
  schema_name text;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY['operations', 'parishes', 'schools', 'seminaries'] LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='legacy_' || schema_name) THEN
      RAISE EXCEPTION 'legacy_% already exists', schema_name;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname=schema_name) THEN
      RAISE EXCEPTION '% schema does not exist', schema_name;
    END IF;
  END LOOP;

  ALTER SCHEMA operations RENAME TO legacy_operations;
  ALTER SCHEMA parishes RENAME TO legacy_parishes;
  ALTER SCHEMA schools RENAME TO legacy_schools;
  ALTER SCHEMA seminaries RENAME TO legacy_seminaries;
END $$;

