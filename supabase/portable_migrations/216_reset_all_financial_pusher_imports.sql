-- FAST reset for historical PUSHER imports across selected years.
--
-- Use this when Supabase SQL Editor times out on the slower joined-delete
-- reset. This version clears staging with TRUNCATE first, then deletes final
-- parish financial records for the selected years. The line items are removed
-- by the existing ON DELETE CASCADE relationship from financial_records.
--
-- This removes:
-- - all temporary PUSHER staging rows
-- - PUSHER staging batches for the selected years
-- - parish financial records for the selected years that were touched during
--   the historical PUSHER work window
-- - line items attached to those financial records
--
-- This keeps:
-- - canonical accounts
-- - parish/institution records
-- - official parish institution codes / IAFR source codes
-- - parish import aliases
-- - column mapping memory
--
-- IMPORTANT:
-- 1. Stop the local app/PUSHER before running this.
-- 2. Run the whole script once.
-- 3. If the SQL Editor still times out, run the PER-YEAR fallback blocks at
--    the bottom one year at a time.

BEGIN;

-- Keep this timestamp conservative. It protects older manually-entered data
-- by only removing records submitted/updated during the recent PUSHER import
-- work window.
CREATE TEMP TABLE _pusher_reset_config (
  started_at timestamptz NOT NULL
) ON COMMIT DROP;

INSERT INTO _pusher_reset_config (started_at)
VALUES (timestamptz '2026-07-15 14:00:00+00');

CREATE TEMP TABLE _pusher_reset_years (
  year smallint PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _pusher_reset_years (year)
VALUES
  (2021),
  (2022),
  (2023),
  (2024),
  (2025);

CREATE TEMP TABLE _pusher_reset_batches ON COMMIT DROP AS
SELECT DISTINCT b.id
FROM operations.financial_push_batches b
LEFT JOIN _pusher_reset_years y
  ON y.year = b.detected_year
WHERE b.deleted_at IS NULL
  AND (
    y.year IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM _pusher_reset_years fy
      WHERE b.source_file_name ILIKE '%' || fy.year::text || '%'
    )
  );

-- The batch FK uses ON DELETE SET NULL. Do it explicitly before deleting
-- batches so this reset stays predictable and avoids extra FK work.
UPDATE operations.canonical_account_requests car
SET requested_from_push_batch_id = NULL,
    updated_at = now()
WHERE car.requested_from_push_batch_id IN (
  SELECT id FROM _pusher_reset_batches
);

-- Staging rows are temporary review data only. TRUNCATE is much faster than a
-- large DELETE and is safe here because we are resetting the PUSHER workspace.
TRUNCATE TABLE operations.financial_push_rows;

DELETE FROM operations.financial_push_batches b
USING _pusher_reset_batches rb
WHERE b.id = rb.id;

CREATE TEMP TABLE _pusher_reset_records ON COMMIT DROP AS
SELECT fr.id
FROM parishes.financial_records fr
JOIN _pusher_reset_years y ON y.year = fr.year
CROSS JOIN _pusher_reset_config cfg
WHERE fr.deleted_at IS NULL
  AND fr.submitted_at >= cfg.started_at;

-- Prevent self-reference conflicts if a versioned record points at a record
-- that is about to be deleted.
UPDATE parishes.financial_records fr
SET superseded_by = NULL,
    updated_at = now()
WHERE fr.superseded_by IN (
  SELECT id FROM _pusher_reset_records
);

-- Disable user triggers only inside this transaction so bulk cleanup does not
-- spend most of its time recalculating balances or writing mutation audit rows.
-- FK constraints still remain active.
ALTER TABLE parishes.iafr_line_items DISABLE TRIGGER USER;
ALTER TABLE parishes.financial_records DISABLE TRIGGER USER;

DELETE FROM parishes.financial_records fr
USING _pusher_reset_records rr
WHERE fr.id = rr.id;

ALTER TABLE parishes.financial_records ENABLE TRIGGER USER;
ALTER TABLE parishes.iafr_line_items ENABLE TRIGGER USER;

COMMIT;

-- Optional space cleanup for the big mutation audit table.
-- This clears internal before/after mutation history only.
-- It does NOT delete final financial data, parishes, users, or canonical accounts.
--
-- TRUNCATE TABLE audit.change_log;
-- ANALYZE audit.change_log;

-- Optional verification after running:
--
-- SELECT year, count(*) AS remaining_financial_records
-- FROM parishes.financial_records
-- WHERE year IN (2021, 2022, 2023, 2024, 2025)
--   AND deleted_at IS NULL
-- GROUP BY year
-- ORDER BY year;
--
-- SELECT fr.year, count(*) AS remaining_iafr_line_items
-- FROM parishes.iafr_line_items li
-- JOIN parishes.financial_records fr ON fr.id = li.financial_record_id
-- WHERE fr.year IN (2021, 2022, 2023, 2024, 2025)
--   AND fr.deleted_at IS NULL
--   AND li.deleted_at IS NULL
-- GROUP BY fr.year
-- ORDER BY fr.year;
--
-- SELECT detected_year, count(*) AS remaining_pusher_batches
-- FROM operations.financial_push_batches
-- WHERE detected_year IN (2021, 2022, 2023, 2024, 2025)
--   AND deleted_at IS NULL
-- GROUP BY detected_year
-- ORDER BY detected_year;

-- PER-YEAR FALLBACK:
-- If Supabase SQL Editor still times out, run the shorter block below one year
-- at a time by changing the value in _target_year.
--
-- BEGIN;
-- CREATE TEMP TABLE _target_year (year smallint PRIMARY KEY) ON COMMIT DROP;
-- INSERT INTO _target_year VALUES (2021);
--
-- TRUNCATE TABLE operations.financial_push_rows;
--
-- DELETE FROM operations.financial_push_batches b
-- USING _target_year y
-- WHERE b.deleted_at IS NULL
--   AND (
--     b.detected_year = y.year
--     OR b.source_file_name ILIKE '%' || y.year::text || '%'
--   );
--
-- CREATE TEMP TABLE _target_records ON COMMIT DROP AS
-- SELECT fr.id
-- FROM parishes.financial_records fr
-- JOIN _target_year y ON y.year = fr.year
-- WHERE fr.deleted_at IS NULL
--   AND fr.submitted_at >= timestamptz '2026-07-15 14:00:00+00';
--
-- UPDATE parishes.financial_records fr
-- SET superseded_by = NULL,
--     updated_at = now()
-- WHERE fr.superseded_by IN (SELECT id FROM _target_records);
--
-- ALTER TABLE parishes.iafr_line_items DISABLE TRIGGER USER;
-- ALTER TABLE parishes.financial_records DISABLE TRIGGER USER;
--
-- DELETE FROM parishes.financial_records fr
-- USING _target_records tr
-- WHERE fr.id = tr.id;
--
-- ALTER TABLE parishes.financial_records ENABLE TRIGGER USER;
-- ALTER TABLE parishes.iafr_line_items ENABLE TRIGGER USER;
-- COMMIT;
