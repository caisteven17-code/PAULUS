-- Reference-data medallion foundation.
-- DDL only: this migration intentionally does not copy live values or switch
-- readers. Backfill/reconciliation and cutover require separate approval.

CREATE SCHEMA IF NOT EXISTS reference_silver;

CREATE TABLE IF NOT EXISTS operations.weather_ingestion_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_mode text NOT NULL CHECK (run_mode IN ('full', 'incremental', 'manual')),
  status text NOT NULL CHECK (
    status IN (
      'pending', 'extracting', 'bronze_loaded', 'validating',
      'silver_loaded', 'gold_loaded', 'completed', 'partial', 'failed'
    )
  ),
  period_start date NOT NULL,
  period_end date NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  bronze_object_count integer NOT NULL DEFAULT 0 CHECK (bronze_object_count >= 0),
  silver_row_count integer NOT NULL DEFAULT 0 CHECK (silver_row_count >= 0),
  gold_row_count integer NOT NULL DEFAULT 0 CHECK (gold_row_count >= 0),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS operations.weather_ingestion_items (
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL
    REFERENCES operations.weather_ingestion_runs(run_id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  source_name text NOT NULL,
  municipality text,
  s3_bucket text NOT NULL,
  s3_key text NOT NULL,
  payload_checksum text NOT NULL,
  extracted_at timestamptz NOT NULL,
  processing_status text NOT NULL CHECK (
    processing_status IN (
      'bronze_loaded', 'validating', 'silver_loaded', 'failed', 'skipped'
    )
  ),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  error_detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, s3_key),
  UNIQUE (s3_bucket, s3_key)
);

CREATE TABLE IF NOT EXISTS operations.weather_ingestion_failures (
  failure_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL
    REFERENCES operations.weather_ingestion_runs(run_id) ON DELETE CASCADE,
  item_id uuid
    REFERENCES operations.weather_ingestion_items(item_id) ON DELETE SET NULL,
  stage text NOT NULL,
  error_type text NOT NULL,
  error_detail text NOT NULL,
  retryable boolean NOT NULL DEFAULT true,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_weather_ingestion_runs_status_started
  ON operations.weather_ingestion_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_weather_ingestion_items_run_status
  ON operations.weather_ingestion_items (run_id, processing_status);
CREATE INDEX IF NOT EXISTS idx_weather_ingestion_failures_open
  ON operations.weather_ingestion_failures (run_id, occurred_at DESC)
  WHERE resolved_at IS NULL;

-- Shadow Silver structures. `LIKE ... INCLUDING ALL` preserves the deployed
-- column/default/check/index contract without reading or copying any rows.
CREATE TABLE IF NOT EXISTS reference_silver.weather_rainfall_daily
  (LIKE reference.weather_rainfall_daily INCLUDING ALL);
CREATE TABLE IF NOT EXISTS reference_silver.weather_temperature_daily
  (LIKE reference.weather_temperature_daily INCLUDING ALL);
CREATE TABLE IF NOT EXISTS reference_silver.weather_wind_daily
  (LIKE reference.weather_wind_daily INCLUDING ALL);
CREATE TABLE IF NOT EXISTS reference_silver.weather_municipality_monthly
  (LIKE reference.weather_monthly_summary INCLUDING ALL);
CREATE TABLE IF NOT EXISTS reference_silver.liturgical_calendar
  (LIKE reference.liturgical_calendar INCLUDING ALL);
CREATE TABLE IF NOT EXISTS reference_silver.liturgical_calendar_runs
  (LIKE reference.liturgical_calendar_runs INCLUDING ALL);

COMMENT ON SCHEMA reference_silver IS
  'Validated contextual Silver data. Populated only after Bronze/workflow processing.';
COMMENT ON TABLE operations.weather_ingestion_runs IS
  'Workflow state for weather ingestion; never stores raw weather payloads.';
COMMENT ON TABLE operations.weather_ingestion_items IS
  'Lineage pointers to immutable S3 Bronze objects and their processing state.';
COMMENT ON TABLE reference_silver.weather_municipality_monthly IS
  'Curated municipality-month weather used to build parish Gold aggregates.';
