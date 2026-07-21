-- Preserve scheduled special-collection dates when committing manual entries
-- from operations into the production-shaped parish submission sandbox.

BEGIN;

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

COMMIT;
