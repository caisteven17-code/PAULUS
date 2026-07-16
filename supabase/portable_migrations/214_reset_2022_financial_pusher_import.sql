-- Reset the 2022 historical PUSHER import so the year can be re-validated
-- and pushed fresh.
--
-- This removes:
-- - 2022 PUSHER staging batches/rows
-- - final IAFR line items attached to 2022 records touched by PUSHER
-- - final 2022 parish financial records created/touched by the PUSHER attempt
--
-- This keeps:
-- - canonical accounts
-- - parish/institution records
-- - parish import aliases
-- - column mapping memory
--
-- NOTE:
-- Run this only when you intentionally want to clear the 2022 PUSHER push.
-- If you used "replace existing", records touched by that push are included.

BEGIN;

CREATE TEMP TABLE _pusher_2022_batches ON COMMIT DROP AS
SELECT id
FROM operations.financial_push_batches
WHERE detected_year = 2022
  AND source_file_name ILIKE '%2022%'
  AND deleted_at IS NULL;

CREATE TEMP TABLE _pusher_2022_records ON COMMIT DROP AS
SELECT DISTINCT r.financial_record_id AS id
FROM operations.financial_push_rows r
JOIN _pusher_2022_batches b ON b.id = r.push_batch_id
WHERE r.financial_record_id IS NOT NULL

UNION

SELECT fr.id
FROM parishes.financial_records fr
WHERE fr.year = 2022
  AND fr.deleted_at IS NULL
  AND fr.submitted_at >= timestamptz '2026-07-15 14:00:00+00';

DELETE FROM operations.financial_push_rows r
USING _pusher_2022_batches b
WHERE r.push_batch_id = b.id;

DELETE FROM operations.financial_push_batches b
USING _pusher_2022_batches tb
WHERE b.id = tb.id;

DELETE FROM parishes.iafr_line_items li
USING _pusher_2022_records tr
WHERE li.financial_record_id = tr.id;

DELETE FROM parishes.financial_records fr
USING _pusher_2022_records tr
WHERE fr.id = tr.id;

COMMIT;

-- Optional space cleanup for the big mutation audit table.
-- This clears internal before/after mutation history only.
-- It does NOT delete final financial data.
--
-- TRUNCATE TABLE audit.change_log;
-- ANALYZE audit.change_log;

-- Optional verification after running:
--
-- SELECT count(*) AS financial_records_2022
-- FROM parishes.financial_records
-- WHERE year = 2022 AND deleted_at IS NULL;
--
-- SELECT count(*) AS iafr_line_items_2022
-- FROM parishes.iafr_line_items li
-- JOIN parishes.financial_records fr ON fr.id = li.financial_record_id
-- WHERE fr.year = 2022 AND fr.deleted_at IS NULL;
--
-- SELECT count(*) AS pusher_batches_2022
-- FROM operations.financial_push_batches
-- WHERE detected_year = 2022 AND deleted_at IS NULL;
--
-- SELECT count(*) AS pusher_rows_2022
-- FROM operations.financial_push_rows r
-- JOIN operations.financial_push_batches b ON b.id = r.push_batch_id
-- WHERE b.detected_year = 2022;
