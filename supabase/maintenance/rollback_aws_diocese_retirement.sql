-- Immediate rollback for the Phase 5 observation step.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'diocese') THEN
    RAISE EXCEPTION 'diocese already exists; refusing ambiguous rollback';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'legacy_diocese') THEN
    RAISE EXCEPTION 'legacy_diocese schema does not exist';
  END IF;
  ALTER SCHEMA legacy_diocese RENAME TO diocese;
END $$;

