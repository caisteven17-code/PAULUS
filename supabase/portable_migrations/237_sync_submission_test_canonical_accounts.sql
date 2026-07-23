-- Keep the parish submission sandbox canonical account catalog synchronized.

BEGIN;

INSERT INTO parishes.iafr_account_titles (
  section_code,
  subsection_code,
  account_code,
  account_name,
  account_type,
  classification,
  parent_account_code,
  source_template,
  source_sheet_name,
  is_active
)
VALUES (
  'F',
  'remittance_to_diocese',
  'F.1.04',
  'Progressive Tax Collections - Diocese Share',
  'remittance',
  'remittance',
  'F.1',
  'IAFR_SAMPLE_2024_2026',
  'IAFR SAMPLE.xlsx',
  true
)
ON CONFLICT (account_code) DO UPDATE SET
  section_code = EXCLUDED.section_code,
  subsection_code = EXCLUDED.subsection_code,
  account_name = EXCLUDED.account_name,
  account_type = EXCLUDED.account_type,
  classification = EXCLUDED.classification,
  parent_account_code = EXCLUDED.parent_account_code,
  source_template = EXCLUDED.source_template,
  source_sheet_name = EXCLUDED.source_sheet_name,
  is_active = EXCLUDED.is_active,
  deleted_at = NULL,
  updated_at = now();

INSERT INTO parishes_submission_test.iafr_account_titles (
  id,
  section_code,
  subsection_code,
  account_code,
  account_name,
  account_type,
  classification,
  parent_account_code,
  source_template,
  source_sheet_name,
  source_row_number,
  is_active,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  id,
  section_code,
  subsection_code,
  account_code,
  account_name,
  account_type,
  classification,
  parent_account_code,
  source_template,
  source_sheet_name,
  source_row_number,
  is_active,
  created_at,
  updated_at,
  deleted_at
FROM parishes.iafr_account_titles
ON CONFLICT (account_code) DO UPDATE SET
  section_code = EXCLUDED.section_code,
  subsection_code = EXCLUDED.subsection_code,
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

CREATE OR REPLACE FUNCTION operations.sync_parish_submission_test_account_title()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = operations, parishes, parishes_submission_test, public
AS $$
BEGIN
  INSERT INTO parishes_submission_test.iafr_account_titles (
    id,
    section_code,
    subsection_code,
    account_code,
    account_name,
    account_type,
    classification,
    parent_account_code,
    source_template,
    source_sheet_name,
    source_row_number,
    is_active,
    created_at,
    updated_at,
    deleted_at
  )
  VALUES (
    NEW.id,
    NEW.section_code,
    NEW.subsection_code,
    NEW.account_code,
    NEW.account_name,
    NEW.account_type,
    NEW.classification,
    NEW.parent_account_code,
    NEW.source_template,
    NEW.source_sheet_name,
    NEW.source_row_number,
    NEW.is_active,
    NEW.created_at,
    NEW.updated_at,
    NEW.deleted_at
  )
  ON CONFLICT (account_code) DO UPDATE SET
    section_code = EXCLUDED.section_code,
    subsection_code = EXCLUDED.subsection_code,
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_parish_submission_test_account_title
  ON parishes.iafr_account_titles;
CREATE TRIGGER sync_parish_submission_test_account_title
AFTER INSERT OR UPDATE ON parishes.iafr_account_titles
FOR EACH ROW EXECUTE FUNCTION operations.sync_parish_submission_test_account_title();

REVOKE ALL ON FUNCTION operations.sync_parish_submission_test_account_title()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION operations.sync_parish_submission_test_account_title()
  TO service_role;

COMMIT;
