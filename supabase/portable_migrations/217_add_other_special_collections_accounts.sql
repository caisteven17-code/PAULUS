-- Add explicit canonical account for source workbooks that separate
-- Other Special Collections from the generic Special Collections bucket.
--
-- F.3.02 is the remittance/outflow-to-diocese side.

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
VALUES
  ('F', 'special_collections', 'F.3.02', 'Other Special Collections', 'remittance', 'remittance', 'F.3', 'PUSHER_HISTORICAL', 'Historical PUSHER', true)
ON CONFLICT (account_code) DO UPDATE SET
  section_code = EXCLUDED.section_code,
  subsection_code = EXCLUDED.subsection_code,
  account_name = EXCLUDED.account_name,
  account_type = EXCLUDED.account_type,
  classification = EXCLUDED.classification,
  parent_account_code = EXCLUDED.parent_account_code,
  source_template = EXCLUDED.source_template,
  source_sheet_name = EXCLUDED.source_sheet_name,
  is_active = true,
  deleted_at = NULL,
  updated_at = now();
