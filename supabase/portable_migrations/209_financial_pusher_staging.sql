-- Temporary historical financial PUSHER support.
-- Keeps annual Excel imports reviewable before they are committed into
-- parishes.financial_records and parishes.iafr_line_items.

CREATE TABLE IF NOT EXISTS operations.financial_push_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file_name text NOT NULL,
  source_file_hash text,
  detected_year smallint,
  upload_mode text NOT NULL DEFAULT 'preview' CHECK (upload_mode IN ('preview', 'committed')),
  import_mode text NOT NULL DEFAULT 'skip_existing' CHECK (import_mode IN ('skip_existing', 'replace_existing', 'version_existing')),
  status text NOT NULL DEFAULT 'validated' CHECK (status IN ('uploaded', 'validated', 'mapped', 'committing', 'committed', 'failed')),
  uploaded_by text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  committed_by text,
  committed_at timestamptz,
  month_count integer NOT NULL DEFAULT 0,
  parish_count integer NOT NULL DEFAULT 0,
  extracted_row_count integer NOT NULL DEFAULT 0,
  valid_row_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  zero_filled_cell_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS operations.financial_push_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  push_batch_id uuid NOT NULL REFERENCES operations.financial_push_batches(id) ON DELETE CASCADE,
  sheet_name text NOT NULL,
  source_row_number integer NOT NULL,
  parish_code text,
  parish_name text NOT NULL,
  institution_id uuid REFERENCES diocese.institutions(id),
  reporting_month smallint NOT NULL CHECK (reporting_month BETWEEN 1 AND 12),
  reporting_year smallint NOT NULL,
  validation_status text NOT NULL DEFAULT 'warning' CHECK (validation_status IN ('ready', 'warning', 'blocked', 'committed', 'skipped')),
  raw_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  cleaned_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapped_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  zero_filled_fields integer NOT NULL DEFAULT 0,
  financial_record_id uuid REFERENCES parishes.financial_records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS operations.financial_import_column_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_year smallint,
  source_header text NOT NULL,
  source_section text,
  source_column text,
  canonical_account_code text REFERENCES parishes.iafr_account_titles(account_code),
  canonical_field text,
  aggregation_rule text NOT NULL DEFAULT 'sum' CHECK (aggregation_rule IN ('sum', 'direct', 'memo', 'ignore', 'not_in_template')),
  is_combined boolean NOT NULL DEFAULT false,
  confidence numeric(5, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'approved', 'needs_review', 'ignored')),
  notes text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (template_year, source_header, source_section, source_column)
);

CREATE TABLE IF NOT EXISTS operations.parish_import_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_code text,
  source_name text NOT NULL,
  normalized_source_name text NOT NULL,
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  confidence numeric(5, 2) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('suggested', 'approved', 'retired')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (source_code, normalized_source_name)
);

CREATE TABLE IF NOT EXISTS operations.canonical_account_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_from_push_batch_id uuid REFERENCES operations.financial_push_batches(id) ON DELETE SET NULL,
  source_header text NOT NULL,
  source_section text,
  suggested_account_code text,
  suggested_account_name text,
  suggested_section_code text CHECK (suggested_section_code IN ('A', 'B', 'C', 'D', 'E', 'F') OR suggested_section_code IS NULL),
  suggested_subsection_code text,
  suggested_account_type text CHECK (
    suggested_account_type IN ('receipt', 'expense', 'remittance', 'balance', 'personal_contribution', 'memo')
    OR suggested_account_type IS NULL
  ),
  suggested_classification text,
  effective_year smallint,
  reason text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'created')),
  requested_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_account_title_id uuid REFERENCES parishes.iafr_account_titles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_financial_push_batches_year
  ON operations.financial_push_batches (detected_year, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_push_rows_batch
  ON operations.financial_push_rows (push_batch_id, validation_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_push_rows_period
  ON operations.financial_push_rows (institution_id, reporting_year, reporting_month)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_financial_import_column_map_lookup
  ON operations.financial_import_column_map (template_year, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_parish_import_aliases_normalized
  ON operations.parish_import_aliases (normalized_source_name)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_financial_push_batches ON operations.financial_push_batches;
CREATE TRIGGER set_updated_at_financial_push_batches
BEFORE UPDATE ON operations.financial_push_batches
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_financial_push_rows ON operations.financial_push_rows;
CREATE TRIGGER set_updated_at_financial_push_rows
BEFORE UPDATE ON operations.financial_push_rows
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_financial_import_column_map ON operations.financial_import_column_map;
CREATE TRIGGER set_updated_at_financial_import_column_map
BEFORE UPDATE ON operations.financial_import_column_map
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_parish_import_aliases ON operations.parish_import_aliases;
CREATE TRIGGER set_updated_at_parish_import_aliases
BEFORE UPDATE ON operations.parish_import_aliases
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_canonical_account_requests ON operations.canonical_account_requests;
CREATE TRIGGER set_updated_at_canonical_account_requests
BEFORE UPDATE ON operations.canonical_account_requests
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
