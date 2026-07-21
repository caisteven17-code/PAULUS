-- Reversible Phase 5 observation step. Run only after migration 073 and a
-- verified schema backup. Permanent DROP is intentionally not included.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'legacy_diocese') THEN
    RAISE EXCEPTION 'legacy_diocese already exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'diocese') THEN
    RAISE EXCEPTION 'diocese schema does not exist';
  END IF;
  ALTER SCHEMA diocese RENAME TO legacy_diocese;
END $$;

