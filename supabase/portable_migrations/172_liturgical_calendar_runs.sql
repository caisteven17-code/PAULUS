CREATE TABLE IF NOT EXISTS reference.liturgical_calendar_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  years integer[] NOT NULL,
  completed_years integer[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'partial', 'failed')),
  clean_count integer,
  review_count integer,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_liturgical_calendar_runs_status
  ON reference.liturgical_calendar_runs (status);

CREATE INDEX idx_liturgical_calendar_runs_started_at
  ON reference.liturgical_calendar_runs (started_at DESC);

GRANT USAGE ON SCHEMA reference TO service_role;
GRANT SELECT, INSERT, UPDATE ON reference.liturgical_calendar_runs TO service_role;
