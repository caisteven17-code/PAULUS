CREATE TABLE IF NOT EXISTS reference.liturgical_calendar (
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

CREATE INDEX IF NOT EXISTS idx_liturgical_calendar_date
  ON reference.liturgical_calendar (date);

CREATE INDEX IF NOT EXISTS idx_liturgical_calendar_year
  ON reference.liturgical_calendar (year);

CREATE INDEX IF NOT EXISTS idx_liturgical_calendar_source_name
  ON reference.liturgical_calendar (source_name);

CREATE INDEX IF NOT EXISTS idx_liturgical_calendar_review_status
  ON reference.liturgical_calendar (review_status);

GRANT USAGE ON SCHEMA reference TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON reference.liturgical_calendar TO service_role;

CREATE TABLE IF NOT EXISTS reference.weather_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  institution_id uuid REFERENCES diocese.institutions(id),
  location text,
  condition text CHECK (condition IN ('sunny', 'rainy', 'stormy', 'cloudy') OR condition IS NULL),
  temp_avg_c numeric(6, 2),
  rainfall_mm numeric(14, 2) NOT NULL DEFAULT 0,
  typhoon_signal smallint CHECK (typhoon_signal BETWEEN 0 AND 5 OR typhoon_signal IS NULL),
  is_extreme_event boolean NOT NULL DEFAULT false,
  source text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One weather record per (date, institution_id). NULLS NOT DISTINCT ensures
-- diocese-wide records (institution_id IS NULL) are also deduplicated per date.
CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_date_institution
  ON reference.weather_observations (date, institution_id)
  NULLS NOT DISTINCT;

DROP TRIGGER IF EXISTS set_updated_at_liturgical_calendar ON reference.liturgical_calendar;
CREATE TRIGGER set_updated_at_liturgical_calendar
BEFORE UPDATE ON reference.liturgical_calendar
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_weather_observations ON reference.weather_observations;
CREATE TRIGGER set_updated_at_weather_observations
BEFORE UPDATE ON reference.weather_observations
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

