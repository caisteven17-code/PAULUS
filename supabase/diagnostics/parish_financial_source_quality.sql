-- Read-only Supabase source-quality report for the direct-to-silver transition.
-- Run each SELECT separately in the Supabase SQL Editor if the UI shows only
-- the final result set.

-- 1. Overall current financial coverage.
WITH current_records AS (
  SELECT id, institution_id, year, month
  FROM parishes.financial_records
  WHERE is_current_version = true AND deleted_at IS NULL
)
SELECT
  count(*) AS current_records,
  count(DISTINCT institution_id) AS parishes,
  min(year) AS earliest_year,
  max(year) AS latest_year,
  (SELECT count(*) FROM parishes.iafr_line_items li
   JOIN current_records cr ON cr.id = li.financial_record_id
   WHERE li.deleted_at IS NULL) AS current_line_items,
  (SELECT COALESCE(sum(li.amount), 0) FROM parishes.iafr_line_items li
   JOIN current_records cr ON cr.id = li.financial_record_id
   WHERE li.deleted_at IS NULL) AS current_line_amount_total
FROM current_records;

-- 2. Candidate missing months. A row is a review candidate, not proof that a
-- report should exist; parish opening/closure and source-file availability matter.
WITH parish_scope AS (
  SELECT DISTINCT institution_id
  FROM parishes.financial_records
  WHERE is_current_version = true AND deleted_at IS NULL
), year_scope AS (
  SELECT generate_series(min(year)::integer, max(year)::integer)::smallint AS year
  FROM parishes.financial_records
  WHERE is_current_version = true AND deleted_at IS NULL
), expected AS (
  SELECT ps.institution_id, ys.year, month_number
  FROM parish_scope ps
  CROSS JOIN year_scope ys
  CROSS JOIN generate_series(1, 12) AS month_number
), actual AS (
  SELECT institution_id, year, public.month_short_to_int(month) AS month_number
  FROM parishes.financial_records
  WHERE is_current_version = true AND deleted_at IS NULL
)
SELECT e.institution_id, i.name AS parish_name, e.year, e.month_number
FROM expected e
JOIN diocese.institutions i ON i.id = e.institution_id
LEFT JOIN actual a USING (institution_id, year, month_number)
WHERE a.institution_id IS NULL
ORDER BY i.name, e.year, e.month_number;

-- 3. Current records with no active financial detail.
SELECT fr.id, fr.institution_id, i.name AS parish_name, fr.year, fr.month
FROM parishes.financial_records fr
JOIN diocese.institutions i ON i.id = fr.institution_id
LEFT JOIN parishes.iafr_line_items li
  ON li.financial_record_id = fr.id AND li.deleted_at IS NULL
WHERE fr.is_current_version = true AND fr.deleted_at IS NULL
GROUP BY fr.id, i.name
HAVING count(li.id) = 0
ORDER BY i.name, fr.year, public.month_short_to_int(fr.month);

-- 4. Unmapped, inactive, or metadata-mismatched line items.
SELECT
  li.id AS line_item_id,
  li.financial_record_id,
  li.account_title_id,
  li.section_code AS source_section,
  at.section_code AS account_section,
  li.item_type AS source_type,
  at.account_type,
  CASE
    WHEN at.id IS NULL THEN 'UNMAPPED_ACCOUNT'
    WHEN NOT at.is_active OR at.deleted_at IS NOT NULL THEN 'INACTIVE_ACCOUNT'
    WHEN li.section_code IS DISTINCT FROM at.section_code THEN 'SECTION_MISMATCH'
    WHEN li.item_type IS DISTINCT FROM at.account_type THEN 'ACCOUNT_TYPE_MISMATCH'
  END AS issue
FROM parishes.iafr_line_items li
JOIN parishes.financial_records fr ON fr.id = li.financial_record_id
LEFT JOIN parishes.iafr_account_titles at ON at.id = li.account_title_id
WHERE fr.is_current_version = true
  AND fr.deleted_at IS NULL
  AND li.deleted_at IS NULL
  AND (
    at.id IS NULL OR NOT at.is_active OR at.deleted_at IS NOT NULL
    OR li.section_code IS DISTINCT FROM at.section_code
    OR li.item_type IS DISTINCT FROM at.account_type
  )
ORDER BY li.financial_record_id, li.id;

-- 5. Missing administrative metadata. These are warnings, not missing money.
SELECT
  count(*) AS current_records,
  count(*) FILTER (WHERE submission_batch_id IS NULL) AS missing_submission_batch,
  count(*) FILTER (WHERE NULLIF(btrim(prepared_by), '') IS NULL) AS missing_prepared_by,
  count(*) FILTER (WHERE NULLIF(btrim(certified_by), '') IS NULL) AS missing_certified_by,
  count(*) FILTER (WHERE NULLIF(btrim(validation_status), '') IS NULL) AS missing_validation_status
FROM parishes.financial_records
WHERE is_current_version = true AND deleted_at IS NULL;
