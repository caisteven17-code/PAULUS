CREATE TABLE IF NOT EXISTS reference.weather_runs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mode          text        NOT NULL CHECK (mode IN ('incremental', 'full')),
  status        text        NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'success', 'failed')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  period_start  date,
  period_end    date,
  municipalities_count integer,
  records_loaded       integer,
  error_detail  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_weather_runs_status
  ON reference.weather_runs (status);

CREATE INDEX idx_weather_runs_started_at
  ON reference.weather_runs (started_at DESC);

GRANT USAGE ON SCHEMA reference TO service_role;
GRANT SELECT, INSERT, UPDATE ON reference.weather_runs TO service_role;
