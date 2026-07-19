-- Phase 6: durable incremental retries, dead-letter state, and operational alerts.

CREATE TABLE IF NOT EXISTS warehouse_control.etl_retry_queue (
  source_record_id uuid PRIMARY KEY,
  pipeline_name text NOT NULL DEFAULT 'parish_silver_incremental',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_etl_retry_queue_due
  ON warehouse_control.etl_retry_queue (next_attempt_at, updated_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS warehouse_control.etl_alerts (
  alert_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key text NOT NULL UNIQUE,
  pipeline_name text NOT NULL,
  run_id uuid REFERENCES warehouse_control.etl_runs(run_id) ON DELETE SET NULL,
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_etl_alerts_open
  ON warehouse_control.etl_alerts (severity, last_seen_at DESC)
  WHERE status = 'open';

CREATE OR REPLACE VIEW warehouse_control.v_pipeline_latest_runs AS
SELECT DISTINCT ON (pipeline_name)
  pipeline_name,
  run_id,
  run_mode,
  status,
  started_at,
  finished_at,
  extracted_count,
  loaded_count,
  failed_count,
  error_summary
FROM warehouse_control.etl_runs
ORDER BY pipeline_name, started_at DESC, run_id DESC;

COMMENT ON TABLE warehouse_control.etl_retry_queue IS
  'Bounded retry and dead-letter state for incremental source-record processing.';

COMMENT ON TABLE warehouse_control.etl_alerts IS
  'Operational pipeline alerts only; financial payloads must not be stored here.';

COMMENT ON VIEW warehouse_control.v_pipeline_latest_runs IS
  'Latest operational ETL run for each pipeline.';
