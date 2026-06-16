-- Add explicit LitCal fallback columns to existing liturgical calendar tables.
--
-- Use this when migration 195 was already applied before LitCal was promoted
-- from revision_payload-only metadata into queryable columns.

ALTER TABLE reference.liturgical_calendar
  ADD COLUMN IF NOT EXISTS litcal_match_status text NOT NULL DEFAULT 'not_applied',
  ADD COLUMN IF NOT EXISTS litcal_celebration_name text;

ALTER TABLE reference.liturgical_calendar
  DROP CONSTRAINT IF EXISTS liturgical_calendar_litcal_match_status_check;

ALTER TABLE reference.liturgical_calendar
  ADD CONSTRAINT liturgical_calendar_litcal_match_status_check
  CHECK (litcal_match_status IN ('matched', 'mismatched', 'missing', 'not_applied'));

ALTER TABLE staging.liturgical_calendar
  ADD COLUMN IF NOT EXISTS litcal_match_status text,
  ADD COLUMN IF NOT EXISTS litcal_celebration_name text;
