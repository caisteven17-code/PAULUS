-- Run this only if the old detailed parish tables already exist.
-- This migrates their rows into `parishes.iafr_line_items` and removes the old tables.

INSERT INTO parishes.iafr_line_items (
  financial_record_id,
  account_title_id,
  section_code,
  subsection_code,
  item_code,
  item_label,
  item_type,
  amount,
  source_row_number,
  source_label,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  s.financial_record_id,
  s.account_title_id,
  'A' AS section_code,
  s.section_code AS subsection_code,
  NULL AS item_code,
  s.sacrament_name AS item_label,
  'receipt' AS item_type,
  s.total_amount AS amount,
  s.source_row_number,
  s.source_label,
  s.created_at,
  s.updated_at,
  s.deleted_at
FROM parishes.iafr_sacrament_lines s
WHERE NOT EXISTS (
  SELECT 1
  FROM parishes.iafr_line_items li
  WHERE li.financial_record_id = s.financial_record_id
    AND li.section_code = 'A'
    AND li.subsection_code = s.section_code
    AND li.item_label = s.sacrament_name
    AND li.amount = s.total_amount
);

INSERT INTO parishes.iafr_line_items (
  financial_record_id,
  account_title_id,
  section_code,
  subsection_code,
  item_code,
  item_label,
  item_type,
  amount,
  source_row_number,
  source_label,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  e.financial_record_id,
  NULL AS account_title_id,
  'D' AS section_code,
  'D.2' AS subsection_code,
  NULL AS item_code,
  e.contribution_type AS item_label,
  'personal_contribution' AS item_type,
  e.total_amount AS amount,
  e.source_row_number,
  e.source_label,
  e.created_at,
  e.updated_at,
  e.deleted_at
FROM parishes.iafr_employee_contributions e
WHERE NOT EXISTS (
  SELECT 1
  FROM parishes.iafr_line_items li
  WHERE li.financial_record_id = e.financial_record_id
    AND li.section_code = 'D'
    AND li.subsection_code = 'D.2'
    AND li.item_label = e.contribution_type
    AND li.amount = e.total_amount
);

DROP TRIGGER IF EXISTS set_updated_at_parish_sacrament_lines ON parishes.iafr_sacrament_lines;
DROP TRIGGER IF EXISTS set_updated_at_parish_employee_contributions ON parishes.iafr_employee_contributions;

DROP TABLE IF EXISTS parishes.iafr_sacrament_lines;
DROP TABLE IF EXISTS parishes.iafr_employee_contributions;

