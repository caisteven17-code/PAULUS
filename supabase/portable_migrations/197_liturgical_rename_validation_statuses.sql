-- Rename LitCal and all-validator mismatch statuses to clearer labels.
--
-- Fresh installs get these names from migration 195. This migration is for
-- databases that already loaded rows with the previous status values.

UPDATE reference.liturgical_calendar
SET validation_status = CASE validation_status
  WHEN 'matched_litcal_fallback' THEN 'matched_litcal_only'
  WHEN 'mismatched_both' THEN 'mismatched_all'
  ELSE validation_status
END
WHERE validation_status IN ('matched_litcal_fallback', 'mismatched_both');

UPDATE staging.liturgical_calendar
SET validation_status = CASE validation_status
  WHEN 'matched_litcal_fallback' THEN 'matched_litcal_only'
  WHEN 'mismatched_both' THEN 'mismatched_all'
  ELSE validation_status
END
WHERE validation_status IN ('matched_litcal_fallback', 'mismatched_both');

ALTER TABLE reference.liturgical_calendar
  DROP CONSTRAINT IF EXISTS liturgical_calendar_validation_status_check;

ALTER TABLE reference.liturgical_calendar
  ADD CONSTRAINT liturgical_calendar_validation_status_check
  CHECK (validation_status IN (
    'matched_both',
    'matched_gcatholic_only',
    'matched_romcal_only',
    'matched_litcal_only',
    'source_of_truth_only',
    'mismatched_all',
    'validator_missing'
  ));
