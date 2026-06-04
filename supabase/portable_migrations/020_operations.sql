CREATE TABLE IF NOT EXISTS operations.submission_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  institution_type text NOT NULL CHECK (institution_type IN ('parish', 'school', 'seminary')),
  report_type text NOT NULL CHECK (report_type IN ('IAFR', 'School FS', 'Seminary FS')),
  reporting_month smallint NOT NULL CHECK (reporting_month BETWEEN 1 AND 12),
  reporting_year smallint NOT NULL,
  source_file_name text,
  source_file_url text,
  source_file_hash text,
  submitted_by uuid REFERENCES diocese.profiles(id),
  submitted_at timestamptz,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'passed', 'failed', 'warning')),
  verified_by uuid REFERENCES diocese.profiles(id),
  verified_at timestamptz,
  is_late boolean NOT NULL DEFAULT false,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS operations.validation_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_batch_id uuid NOT NULL REFERENCES operations.submission_batches(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  source_sheet_name text,
  source_row_number integer,
  source_column_name text,
  field_name text,
  error_type text NOT NULL CHECK (error_type IN ('missing_required', 'invalid_type', 'invalid_total', 'unknown_account', 'duplicate_record', 'out_of_range')),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'blocker')),
  error_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS operations.reconciliation_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_batch_id uuid NOT NULL REFERENCES operations.submission_batches(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  financial_record_id uuid,
  check_name text NOT NULL,
  check_scope text NOT NULL CHECK (check_scope IN ('operational', 'analytics', 'export')),
  expected_amount numeric(14, 2) NOT NULL DEFAULT 0,
  actual_amount numeric(14, 2) NOT NULL DEFAULT 0,
  difference_amount numeric(14, 2) NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('passed', 'failed', 'warning')),
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_submission_batches_period
  ON operations.submission_batches (institution_id, reporting_year, reporting_month)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_validation_errors_batch
  ON operations.validation_errors (submission_batch_id, severity)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reconciliation_checks_batch
  ON operations.reconciliation_checks (submission_batch_id, status)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_submission_batches ON operations.submission_batches;
CREATE TRIGGER set_updated_at_submission_batches
BEFORE UPDATE ON operations.submission_batches
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_validation_errors ON operations.validation_errors;
CREATE TRIGGER set_updated_at_validation_errors
BEFORE UPDATE ON operations.validation_errors
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_reconciliation_checks ON operations.reconciliation_checks;
CREATE TRIGGER set_updated_at_reconciliation_checks
BEFORE UPDATE ON operations.reconciliation_checks
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

