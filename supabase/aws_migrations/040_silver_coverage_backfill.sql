-- AWS-only coverage register and resumable direct-silver backfill controls.

CREATE TABLE IF NOT EXISTS parish_silver.reporting_coverage (
  institution_id uuid NOT NULL,
  reporting_month date NOT NULL,
  availability_status text NOT NULL CHECK (availability_status IN (
    'available', 'confirmed_unavailable', 'unreviewed_missing', 'not_required'
  )),
  source_record_id uuid,
  source_updated_at timestamptz,
  missing_reason text,
  confirmation_source text,
  confirmed_at timestamptz,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_id, reporting_month),
  CHECK (
    (availability_status = 'available' AND source_record_id IS NOT NULL)
    OR (availability_status <> 'available' AND source_record_id IS NULL)
  ),
  CHECK (
    availability_status NOT IN ('confirmed_unavailable', 'not_required')
    OR (missing_reason IS NOT NULL AND confirmed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_reporting_coverage_status
  ON parish_silver.reporting_coverage (availability_status, reporting_month);

CREATE TABLE IF NOT EXISTS warehouse_control.etl_backfill_items (
  backfill_name text NOT NULL,
  source_record_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  source_updated_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_run_id uuid REFERENCES warehouse_control.etl_runs(run_id) ON DELETE SET NULL,
  error_message text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (backfill_name, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_etl_backfill_items_work
  ON warehouse_control.etl_backfill_items (backfill_name, status, attempts, updated_at);

