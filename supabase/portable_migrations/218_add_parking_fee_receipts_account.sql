-- Add explicit B.2 canonical account for parish receipts from parking fees.

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
  ('B', 'other_collections', 'B.2.07', 'Receipts from Parking Fees', 'receipt', 'parish_fund_receipts', 'B.2', 'PUSHER_HISTORICAL', 'Historical PUSHER', true)
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
