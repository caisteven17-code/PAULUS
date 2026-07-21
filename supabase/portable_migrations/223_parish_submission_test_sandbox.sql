-- Isolated parish IAFR submission sandbox.
--
-- The parishes_submission_test tables mirror the current production-shaped
-- parish tables, while test workflow metadata remains in operations. Only the
-- canonical account catalog is copied; financial transactions are never copied.

BEGIN;

CREATE SCHEMA IF NOT EXISTS parishes_submission_test;

CREATE TABLE IF NOT EXISTS parishes_submission_test.details
  (LIKE parishes.details INCLUDING ALL);

CREATE TABLE IF NOT EXISTS parishes_submission_test.iafr_account_titles
  (LIKE parishes.iafr_account_titles INCLUDING ALL);

CREATE TABLE IF NOT EXISTS parishes_submission_test.financial_records
  (LIKE parishes.financial_records INCLUDING ALL);

CREATE TABLE IF NOT EXISTS parishes_submission_test.iafr_line_items
  (LIKE parishes.iafr_line_items INCLUDING ALL);

-- LIKE does not copy foreign keys. Add the relationships that are required to
-- prove that a test submission would fit the production-shaped model.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pst_details_institution_fk') THEN
    ALTER TABLE parishes_submission_test.details
      ADD CONSTRAINT pst_details_institution_fk
      FOREIGN KEY (institution_id) REFERENCES diocese.institutions(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pst_details_priest_fk') THEN
    ALTER TABLE parishes_submission_test.details
      ADD CONSTRAINT pst_details_priest_fk
      FOREIGN KEY (assigned_priest_id) REFERENCES diocese.profiles(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pst_financial_institution_fk') THEN
    ALTER TABLE parishes_submission_test.financial_records
      ADD CONSTRAINT pst_financial_institution_fk
      FOREIGN KEY (institution_id) REFERENCES diocese.institutions(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pst_financial_superseded_fk') THEN
    ALTER TABLE parishes_submission_test.financial_records
      ADD CONSTRAINT pst_financial_superseded_fk
      FOREIGN KEY (superseded_by) REFERENCES parishes_submission_test.financial_records(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pst_line_record_fk') THEN
    ALTER TABLE parishes_submission_test.iafr_line_items
      ADD CONSTRAINT pst_line_record_fk
      FOREIGN KEY (financial_record_id)
      REFERENCES parishes_submission_test.financial_records(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pst_line_account_fk') THEN
    ALTER TABLE parishes_submission_test.iafr_line_items
      ADD CONSTRAINT pst_line_account_fk
      FOREIGN KEY (account_title_id)
      REFERENCES parishes_submission_test.iafr_account_titles(id);
  END IF;
END;
$$;

-- Preserve canonical IDs so the same account mapping can be reconciled in the
-- sandbox and production. This intentionally copies lookup rows only.
INSERT INTO parishes_submission_test.iafr_account_titles
SELECT * FROM parishes.iafr_account_titles
ON CONFLICT (id) DO UPDATE SET
  section_code = EXCLUDED.section_code,
  subsection_code = EXCLUDED.subsection_code,
  account_code = EXCLUDED.account_code,
  account_name = EXCLUDED.account_name,
  account_type = EXCLUDED.account_type,
  classification = EXCLUDED.classification,
  parent_account_code = EXCLUDED.parent_account_code,
  source_template = EXCLUDED.source_template,
  source_sheet_name = EXCLUDED.source_sheet_name,
  source_row_number = EXCLUDED.source_row_number,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at,
  deleted_at = EXCLUDED.deleted_at;

CREATE TABLE IF NOT EXISTS operations.parish_submission_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  reporting_month smallint NOT NULL CHECK (reporting_month BETWEEN 1 AND 12),
  reporting_year smallint NOT NULL,
  form_version text NOT NULL DEFAULT 'iafr_2026_v1',
  input_method text NOT NULL CHECK (input_method IN ('file', 'manual')),
  source_file_name text,
  source_file_path text,
  source_file_hash text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'warning', 'failed', 'completed')),
  current_stage text,
  progress_percent smallint NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  error_summary text,
  created_by uuid REFERENCES diocese.profiles(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operations.parish_submission_test_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES operations.parish_submission_test_runs(id) ON DELETE CASCADE,
  stage_code text NOT NULL,
  sequence_no smallint NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'warning', 'failed')),
  message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, stage_code)
);

CREATE TABLE IF NOT EXISTS operations.parish_submission_test_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES operations.parish_submission_test_runs(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  section_code text NOT NULL CHECK (section_code IN ('A', 'B', 'C', 'D', 'E', 'F')),
  subsection_code text,
  canonical_account_code text,
  source_label text NOT NULL,
  raw_value text,
  cleaned_amount numeric(14, 2),
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'warning', 'invalid')),
  validation_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, field_key)
);

CREATE TABLE IF NOT EXISTS operations.parish_submission_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES operations.parish_submission_test_runs(id) ON DELETE CASCADE,
  test_financial_record_id uuid NOT NULL
    REFERENCES parishes_submission_test.financial_records(id) ON DELETE CASCADE,
  check_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('passed', 'warning', 'failed')),
  expected_value text,
  actual_value text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, check_code)
);

CREATE INDEX IF NOT EXISTS idx_parish_submission_test_runs_period
  ON operations.parish_submission_test_runs (institution_id, reporting_year, reporting_month, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parish_submission_test_entries_run
  ON operations.parish_submission_test_entries (run_id, section_code, canonical_account_code);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pst_financial_submission_run_fk') THEN
    ALTER TABLE parishes_submission_test.financial_records
      ADD CONSTRAINT pst_financial_submission_run_fk
      FOREIGN KEY (submission_batch_id)
      REFERENCES operations.parish_submission_test_runs(id) ON DELETE SET NULL;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_parish_submission_test_runs
  ON operations.parish_submission_test_runs;
CREATE TRIGGER set_updated_at_parish_submission_test_runs
BEFORE UPDATE ON operations.parish_submission_test_runs
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_parish_submission_test_entries
  ON operations.parish_submission_test_entries;
CREATE TRIGGER set_updated_at_parish_submission_test_entries
BEFORE UPDATE ON operations.parish_submission_test_entries
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- Writes validated manual entries into the production-shaped clone only.
CREATE OR REPLACE FUNCTION operations.commit_parish_submission_test_run(p_run_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = operations, parishes_submission_test, public
AS $$
DECLARE
  v_run operations.parish_submission_test_runs%ROWTYPE;
  v_record_id uuid;
  v_month text;
  v_unmapped_count integer;
BEGIN
  SELECT * INTO v_run
  FROM operations.parish_submission_test_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test submission run % was not found', p_run_id;
  END IF;

  SELECT count(*) INTO v_unmapped_count
  FROM operations.parish_submission_test_entries e
  LEFT JOIN parishes_submission_test.iafr_account_titles a
    ON a.account_code = e.canonical_account_code
   AND a.is_active = true
   AND a.deleted_at IS NULL
  WHERE e.run_id = p_run_id
    AND e.cleaned_amount IS NOT NULL
    AND e.cleaned_amount <> 0
    AND a.id IS NULL;

  IF v_unmapped_count > 0 THEN
    RAISE EXCEPTION 'Test submission has % unmapped canonical account(s)', v_unmapped_count;
  END IF;

  v_month := (ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[v_run.reporting_month];

  INSERT INTO parishes_submission_test.financial_records (
    institution_id, submission_batch_id, month, year, status, validation_status, submitted_at
  ) VALUES (
    v_run.institution_id, p_run_id, v_month, v_run.reporting_year, 'submitted', 'passed', now()
  ) RETURNING id INTO v_record_id;

  INSERT INTO parishes_submission_test.iafr_line_items (
    financial_record_id,
    account_title_id,
    section_code,
    subsection_code,
    item_code,
    item_label,
    item_type,
    amount,
    event_date,
    source_label,
    notes
  )
  SELECT
    v_record_id,
    a.id,
    e.section_code,
    e.subsection_code,
    e.canonical_account_code,
    e.source_label,
    a.account_type,
    e.cleaned_amount,
    CASE
      WHEN e.source_metadata->>'collectionDate' ~ '^\d{4}-\d{2}-\d{2}$'
        THEN (e.source_metadata->>'collectionDate')::date
      ELSE NULL
    END,
    e.source_label,
    'IAFR manual-entry sandbox; run=' || p_run_id::text
  FROM operations.parish_submission_test_entries e
  JOIN parishes_submission_test.iafr_account_titles a
    ON a.account_code = e.canonical_account_code
   AND a.is_active = true
   AND a.deleted_at IS NULL
  WHERE e.run_id = p_run_id
    AND e.cleaned_amount IS NOT NULL
    AND e.cleaned_amount <> 0;

  INSERT INTO operations.parish_submission_test_results (
    run_id, test_financial_record_id, check_code, status, expected_value, actual_value, details
  )
  SELECT
    p_run_id,
    v_record_id,
    'canonical_account_mapping',
    CASE WHEN count(*) FILTER (WHERE a.id IS NULL) = 0 THEN 'passed' ELSE 'failed' END,
    count(*) FILTER (WHERE e.cleaned_amount IS NOT NULL AND e.cleaned_amount <> 0)::text,
    count(a.id)::text,
    jsonb_build_object('form_version', v_run.form_version)
  FROM operations.parish_submission_test_entries e
  LEFT JOIN parishes_submission_test.iafr_account_titles a
    ON a.account_code = e.canonical_account_code
   AND a.is_active = true
   AND a.deleted_at IS NULL
  WHERE e.run_id = p_run_id;

  UPDATE operations.parish_submission_test_runs
  SET status = 'completed', current_stage = 'completed', progress_percent = 100, completed_at = now()
  WHERE id = p_run_id;

  RETURN v_record_id;
EXCEPTION WHEN OTHERS THEN
  UPDATE operations.parish_submission_test_runs
  SET status = 'failed', current_stage = 'failed', error_summary = SQLERRM
  WHERE id = p_run_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION operations.commit_parish_submission_test_run(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION operations.commit_parish_submission_test_run(uuid) TO service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA parishes_submission_test FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA parishes_submission_test TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA parishes_submission_test TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  operations.parish_submission_test_runs,
  operations.parish_submission_test_stage_events,
  operations.parish_submission_test_entries,
  operations.parish_submission_test_results
TO service_role;

COMMIT;
