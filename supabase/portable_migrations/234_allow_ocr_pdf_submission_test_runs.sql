-- Allow parish submission sandbox runs created from scanned PDF OCR drafts.

BEGIN;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'operations.parish_submission_test_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%input_method%'
  ORDER BY conname
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE operations.parish_submission_test_runs DROP CONSTRAINT %I', constraint_name);
  END IF;

  ALTER TABLE operations.parish_submission_test_runs
    ADD CONSTRAINT parish_submission_test_runs_input_method_check
    CHECK (input_method IN ('file', 'manual', 'ocr_pdf'));
END;
$$;

COMMIT;
