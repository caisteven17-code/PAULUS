CREATE SCHEMA IF NOT EXISTS warehouse_control;

CREATE TABLE IF NOT EXISTS warehouse_control.etl_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_name text NOT NULL,
  run_mode text NOT NULL CHECK (run_mode IN ('dry_run', 'pilot', 'manual', 'backfill', 'incremental')),
  source_system text NOT NULL DEFAULT 'supabase',
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  extracted_count bigint NOT NULL DEFAULT 0,
  loaded_count bigint NOT NULL DEFAULT 0,
  skipped_count bigint NOT NULL DEFAULT 0,
  failed_count bigint NOT NULL DEFAULT 0,
  table_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouse_control.etl_watermarks (
  pipeline_name text NOT NULL,
  source_schema text NOT NULL,
  source_table text NOT NULL,
  last_source_updated_at timestamptz,
  last_source_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pipeline_name, source_schema, source_table)
);

CREATE TABLE IF NOT EXISTS warehouse_control.etl_failures (
  failure_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES warehouse_control.etl_runs(run_id) ON DELETE CASCADE,
  source_schema text NOT NULL,
  source_table text NOT NULL,
  source_id text,
  error_code text,
  error_message text NOT NULL,
  payload_hash text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS warehouse_control.etl_reconciliation_results (
  result_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES warehouse_control.etl_runs(run_id) ON DELETE CASCADE,
  check_name text NOT NULL,
  source_value text,
  target_value text,
  difference_value text,
  status text NOT NULL CHECK (status IN ('passed', 'warning', 'failed')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_etl_runs_pipeline_started
  ON warehouse_control.etl_runs (pipeline_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_etl_failures_status
  ON warehouse_control.etl_failures (status, created_at);

CREATE INDEX IF NOT EXISTS idx_etl_reconciliation_run
  ON warehouse_control.etl_reconciliation_results (run_id, status);
