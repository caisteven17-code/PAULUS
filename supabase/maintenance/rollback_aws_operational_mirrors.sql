-- Immediate rollback for the AWS operational-mirror observation step.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='operations')
     OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='parishes')
     OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='schools')
     OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='seminaries') THEN
    RAISE EXCEPTION 'One or more target schemas already exist; refusing ambiguous rollback';
  END IF;
  ALTER SCHEMA legacy_operations RENAME TO operations;
  ALTER SCHEMA legacy_parishes RENAME TO parishes;
  ALTER SCHEMA legacy_schools RENAME TO schools;
  ALTER SCHEMA legacy_seminaries RENAME TO seminaries;
END $$;

