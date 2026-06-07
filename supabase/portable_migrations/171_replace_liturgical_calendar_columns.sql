DROP TRIGGER IF EXISTS set_updated_at_liturgical_calendar ON reference.liturgical_calendar;

-- Intentionally no CASCADE: if another object depends on this table, the migration
-- should stop so the dependency can be handled deliberately.
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
  psalter_week text CHECK (psalter_week IN ('I', 'II', 'III', 'IV') OR psalter_week IS NULL),
  source_name text NOT NULL,
  source_url text NOT NULL,
  source_reference text,
  raw_payload jsonb NOT NULL,
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

GRANT USAGE ON SCHEMA reference TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON reference.liturgical_calendar TO service_role;

CREATE TRIGGER set_updated_at_liturgical_calendar
BEFORE UPDATE ON reference.liturgical_calendar
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
