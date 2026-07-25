-- RDS-native Weather Bronze for the capstone deployment.
-- Raw payloads are immutable; workflow state remains in operations.

CREATE SCHEMA IF NOT EXISTS reference_bronze;

CREATE TABLE IF NOT EXISTS reference_bronze.weather_api_raw (
  raw_weather_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL
    REFERENCES operations.weather_ingestion_runs(run_id) ON DELETE RESTRICT,
  artifact_type text NOT NULL,
  source_name text NOT NULL,
  municipality text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  extracted_at timestamptz NOT NULL DEFAULT now(),
  source_filename text NOT NULL,
  raw_payload jsonb NOT NULL,
  payload_checksum text NOT NULL,
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, source_filename, payload_checksum),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_weather_api_raw_period_source
  ON reference_bronze.weather_api_raw (period_start, period_end, source_name);
CREATE INDEX IF NOT EXISTS idx_weather_api_raw_run
  ON reference_bronze.weather_api_raw (run_id);

ALTER TABLE operations.weather_ingestion_items
  ADD COLUMN IF NOT EXISTS bronze_weather_id uuid
    REFERENCES reference_bronze.weather_api_raw(raw_weather_id) ON DELETE RESTRICT;
ALTER TABLE operations.weather_ingestion_items
  ALTER COLUMN s3_bucket DROP NOT NULL,
  ALTER COLUMN s3_key DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_ingestion_items_bronze
  ON operations.weather_ingestion_items (run_id, bronze_weather_id)
  WHERE bronze_weather_id IS NOT NULL;

GRANT USAGE ON SCHEMA reference_bronze TO service_role;
GRANT SELECT, INSERT ON reference_bronze.weather_api_raw TO service_role;

COMMENT ON SCHEMA reference_bronze IS
  'Immutable raw reference-source payloads retained for replay and audit.';
COMMENT ON TABLE reference_bronze.weather_api_raw IS
  'Original parsed API-source artifact before Silver validation/classification.';
