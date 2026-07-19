-- Correct historical PUSHER receipt rows that were classified as the
-- sacramental A.1.11 aggregate instead of B.3.06 Other Receipts.
--
-- Exact labels deliberately exclude per-sacrament "... Amount" fields and
-- the "Total Charge Over/Above" aggregate, which have different meanings.

BEGIN;

WITH target_account AS (
  SELECT id
  FROM parishes.iafr_account_titles
  WHERE account_code = 'B.3.06'
    AND deleted_at IS NULL
), source_account AS (
  SELECT id
  FROM parishes.iafr_account_titles
  WHERE account_code = 'A.1.11'
    AND deleted_at IS NULL
)
UPDATE parishes.iafr_line_items li
SET account_title_id = target_account.id,
    section_code = 'B',
    subsection_code = 'other_receipts',
    item_type = 'receipt',
    updated_at = now()
FROM target_account, source_account
WHERE li.account_title_id = source_account.id
  AND lower(regexp_replace(btrim(COALESCE(li.item_label, li.source_label, '')), '\s+', ' ', 'g'))
      IN ('charge over/above', 'charge over / above')
  AND li.deleted_at IS NULL;

UPDATE operations.financial_import_column_map
SET canonical_account_code = 'B.3.06',
    confidence = 0.98,
    status = 'approved',
    notes = 'Collection-level Charge Over/Above maps to B.3.06 Other Receipts.',
    updated_at = now()
WHERE lower(btrim(source_header)) IN ('charge over/above', 'charge over / above')
  AND lower(btrim(source_header)) NOT LIKE 'total%'
  AND lower(COALESCE(source_section, '')) <> 'sacraments'
  AND deleted_at IS NULL;

COMMIT;
