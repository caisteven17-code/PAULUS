-- Liturgical calendar v2: source-of-truth JSON with GCatholic + Romcal validation.
--
-- Fresh start for reference.liturgical_calendar because the ingestion model has
-- changed:
--   Source of truth : local JSON files in liturgical_calendar_sources/
--   Validators      : GCatholic + Romcal
--   Fallback        : LitCal only when GCatholic and Romcal do not match
--
-- Matching rule:
--   at least one validator matches  -> matched
--   all validators mismatch/missing -> pending human review
--   LitCal-only match -> matched_litcal_only
--   Simbang Gabi / Misa de Aguinaldo -> source_of_truth_only
--   resolver order: normalized name -> canonical pattern -> alias crosswalk
--                   -> conservative fuzzy fallback
--
-- psalter_week is intentionally removed because the source-of-truth JSON does
-- not provide it.

DROP TABLE IF EXISTS staging.liturgical_calendar;

DO $$
BEGIN
  IF to_regclass('reference.liturgical_calendar') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS audit_change ON reference.liturgical_calendar;
    DROP TRIGGER IF EXISTS set_updated_at_liturgical_calendar ON reference.liturgical_calendar;
  END IF;
END;
$$;

DROP TABLE IF EXISTS reference.liturgical_calendar;

CREATE TABLE reference.liturgical_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  year smallint NOT NULL,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  weekday text NOT NULL,

  celebration_name text NOT NULL,
  rank text,
  liturgical_season text,

  source_name text NOT NULL,
  source_url text NOT NULL,
  source_reference text,
  raw_payload jsonb NOT NULL,

  validation_status text NOT NULL
    CHECK (validation_status IN (
      'matched_both',
      'matched_gcatholic_only',
      'matched_romcal_only',
      'matched_litcal_only',
      'source_of_truth_only',
      'mismatched_all',
      'validator_missing'
    )),
  validation_reason text,
  gcatholic_match_status text NOT NULL
    CHECK (gcatholic_match_status IN ('matched', 'mismatched', 'missing')),
  romcal_match_status text NOT NULL
    CHECK (romcal_match_status IN ('matched', 'mismatched', 'missing')),
  litcal_match_status text NOT NULL DEFAULT 'not_applied'
    CHECK (litcal_match_status IN ('matched', 'mismatched', 'missing', 'not_applied')),
  gcatholic_celebration_name text,
  romcal_celebration_name text,
  litcal_celebration_name text,

  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'approved_with_revisions', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  revision_payload jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_liturgical_calendar_date_source UNIQUE (date, source_name)
);

CREATE INDEX idx_liturgical_calendar_date
  ON reference.liturgical_calendar (date);

CREATE INDEX idx_liturgical_calendar_year
  ON reference.liturgical_calendar (year);

CREATE INDEX idx_liturgical_calendar_source_name
  ON reference.liturgical_calendar (source_name);

CREATE INDEX idx_liturgical_calendar_review_status
  ON reference.liturgical_calendar (review_status);

CREATE INDEX idx_liturgical_calendar_validation_status
  ON reference.liturgical_calendar (validation_status);

CREATE TRIGGER set_updated_at_liturgical_calendar
BEFORE UPDATE ON reference.liturgical_calendar
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- Recreate audit trigger if the audit helper function already exists. This
-- keeps this migration portable across fresh databases and partially applied
-- local databases.
DO $$
BEGIN
  IF to_regprocedure('audit.log_change()') IS NOT NULL THEN
    CREATE TRIGGER audit_change
      AFTER INSERT OR UPDATE OR DELETE ON reference.liturgical_calendar
      FOR EACH ROW EXECUTE FUNCTION audit.log_change();
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE staging.liturgical_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES reference.liturgical_calendar_runs(id) ON DELETE CASCADE,

  date date NOT NULL,
  year smallint NOT NULL,
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  weekday text,

  celebration_name text,
  rank text,
  liturgical_season text,

  source_name text NOT NULL,
  source_url text,
  source_reference text,
  raw_payload jsonb,

  validation_status text,
  validation_reason text,
  gcatholic_match_status text,
  romcal_match_status text,
  litcal_match_status text,
  gcatholic_celebration_name text,
  romcal_celebration_name text,
  litcal_celebration_name text,

  revision_payload jsonb,
  review_status text DEFAULT 'pending',
  review_notes text,

  action text CHECK (action IN ('insert', 'update', 'skip_approved', 'no_change')),
  promoted_record_id uuid REFERENCES reference.liturgical_calendar(id) ON DELETE SET NULL,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staging_litcal_run_id
  ON staging.liturgical_calendar (run_id);

CREATE INDEX idx_staging_litcal_date
  ON staging.liturgical_calendar (date);

CREATE INDEX idx_staging_litcal_action
  ON staging.liturgical_calendar (action)
  WHERE action IS NOT NULL;

GRANT USAGE ON SCHEMA reference TO service_role;
GRANT USAGE ON SCHEMA staging TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON reference.liturgical_calendar TO service_role;
GRANT SELECT, INSERT, UPDATE ON staging.liturgical_calendar TO service_role;
