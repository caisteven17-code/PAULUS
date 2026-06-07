-- Staging table for the liturgical calendar ETL pipeline.
-- One row per incoming record per pipeline run.
-- The main reference.liturgical_calendar table never references staging;
-- staging tracks promotion via promoted_record_id.

CREATE SCHEMA IF NOT EXISTS staging;

CREATE TABLE IF NOT EXISTS staging.liturgical_calendar (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     uuid NOT NULL REFERENCES reference.liturgical_calendar_runs(id) ON DELETE CASCADE,

  -- Proposed values — mirrors reference.liturgical_calendar columns
  date               date      NOT NULL,
  year               smallint  NOT NULL,
  month              smallint  NOT NULL CHECK (month BETWEEN 1 AND 12),
  day                smallint  NOT NULL CHECK (day BETWEEN 1 AND 31),
  weekday            text,
  celebration_name   text,
  rank               text,
  liturgical_season  text,
  psalter_week       text      CHECK (psalter_week IN ('I', 'II', 'III', 'IV') OR psalter_week IS NULL),
  source_name        text      NOT NULL,
  source_url         text,
  source_reference   text,
  raw_payload        jsonb,
  revision_payload   jsonb,
  review_status      text      DEFAULT 'pending',

  -- Staging metadata
  action             text      CHECK (action IN ('insert', 'update', 'skip_approved', 'no_change')),
  promoted_record_id uuid      REFERENCES reference.liturgical_calendar(id) ON DELETE SET NULL,
  applied_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staging_litcal_run_id
  ON staging.liturgical_calendar (run_id);

CREATE INDEX idx_staging_litcal_date
  ON staging.liturgical_calendar (date);

CREATE INDEX idx_staging_litcal_action
  ON staging.liturgical_calendar (action)
  WHERE action IS NOT NULL;

GRANT USAGE ON SCHEMA staging TO service_role;
GRANT SELECT, INSERT, UPDATE ON staging.liturgical_calendar TO service_role;
