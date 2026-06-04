CREATE TABLE IF NOT EXISTS parishes.details (
  institution_id uuid PRIMARY KEY REFERENCES diocese.institutions(id) ON DELETE CASCADE,
  assigned_priest text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS parishes.iafr_account_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_code text NOT NULL CHECK (section_code IN ('A', 'B', 'C', 'D', 'E', 'F')),
  subsection_code text,
  account_code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('receipt', 'expense', 'remittance', 'balance', 'personal_contribution', 'memo')),
  classification text,
  parent_account_code text,
  source_template text NOT NULL DEFAULT '2026_IAFR',
  source_sheet_name text,
  source_row_number integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS parishes.financial_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  submission_batch_id uuid REFERENCES operations.submission_batches(id),
  institution_class text CHECK (institution_class IN ('Class A', 'Class B', 'Class C', 'Class D', 'Class E') OR institution_class IS NULL),
  month text NOT NULL CHECK (month IN ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')),
  year smallint NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'verified')),
  prepared_by text,
  certified_by text,
  submitted_at timestamptz,
  record_timestamp timestamptz,
  version_no integer NOT NULL DEFAULT 1,
  is_current_version boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES parishes.financial_records(id),
  correction_reason text,
  validation_status text,
  validation_errors jsonb,
  sacraments_total numeric(14, 2) NOT NULL DEFAULT 0,
  confirmation_total numeric(14, 2) NOT NULL DEFAULT 0,
  mass_intentions_total numeric(14, 2) NOT NULL DEFAULT 0,
  mass_intentions_claimed numeric(14, 2) NOT NULL DEFAULT 0,
  mass_intentions_unclaimed numeric(14, 2) NOT NULL DEFAULT 0,
  mass_collection_weekday numeric(14, 2) NOT NULL DEFAULT 0,
  mass_collection_sunday numeric(14, 2) NOT NULL DEFAULT 0,
  mass_collection_saturday numeric(14, 2) NOT NULL DEFAULT 0,
  consumable_collections numeric(14, 2) NOT NULL DEFAULT 0,
  other_collections_total numeric(14, 2) NOT NULL DEFAULT 0,
  donations numeric(14, 2) NOT NULL DEFAULT 0,
  interest_income numeric(14, 2) NOT NULL DEFAULT 0,
  subsidy_inflow numeric(14, 2) NOT NULL DEFAULT 0,
  special_collections numeric(14, 2) NOT NULL DEFAULT 0,
  second_collections numeric(14, 2) NOT NULL DEFAULT 0,
  charge_over_above numeric(14, 2) NOT NULL DEFAULT 0,
  other_receipts numeric(14, 2) NOT NULL DEFAULT 0,
  priest_share numeric(14, 2) NOT NULL DEFAULT 0,
  mass_stipend numeric(14, 2) NOT NULL DEFAULT 0,
  other_pastoral_expenses numeric(14, 2) NOT NULL DEFAULT 0,
  salaries_wages_benefits numeric(14, 2) NOT NULL DEFAULT 0,
  govt_contributions numeric(14, 2) NOT NULL DEFAULT 0,
  utilities numeric(14, 2) NOT NULL DEFAULT 0,
  communications numeric(14, 2) NOT NULL DEFAULT 0,
  other_rectory_expenses numeric(14, 2) NOT NULL DEFAULT 0,
  construction_receipts numeric(14, 2) NOT NULL DEFAULT 0,
  construction_expenses numeric(14, 2) NOT NULL DEFAULT 0,
  remittance_to_diocese numeric(14, 2) NOT NULL DEFAULT 0,
  bishops_fund_share numeric(14, 2) NOT NULL DEFAULT 0,
  special_collections_remittance numeric(14, 2) NOT NULL DEFAULT 0,
  beginning_balance numeric(14, 2) NOT NULL DEFAULT 0,
  ending_balance_before_remit numeric(14, 2) NOT NULL DEFAULT 0,
  ending_balance_after_remit numeric(14, 2) NOT NULL DEFAULT 0,
  net_receipts numeric(14, 2) NOT NULL DEFAULT 0,
  pastoral_parish_fund_total_net_receipts numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_parish_current_record
  ON parishes.financial_records (institution_id, year, month)
  WHERE is_current_version = true AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS parishes.iafr_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_record_id uuid NOT NULL REFERENCES parishes.financial_records(id) ON DELETE CASCADE,
  account_title_id uuid REFERENCES parishes.iafr_account_titles(id),
  section_code text NOT NULL CHECK (section_code IN ('A', 'B', 'C', 'D', 'E', 'F')),
  subsection_code text,
  item_code text,
  item_label text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('receipt', 'expense', 'remittance', 'balance', 'personal_contribution', 'memo')),
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  tax_rate numeric(8, 4),
  is_remittable boolean NOT NULL DEFAULT false,
  event_date date,
  notes text,
  source_row_number integer,
  source_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS parishes.parish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  event_name text NOT NULL,
  event_level text NOT NULL CHECK (event_level IN ('Major event', 'Minor event')),
  start_date date NOT NULL,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_parish_records_period
  ON parishes.financial_records (institution_id, year, month)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_parish_lines_record
  ON parishes.iafr_line_items (financial_record_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_parish_details ON parishes.details;
CREATE TRIGGER set_updated_at_parish_details
BEFORE UPDATE ON parishes.details
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_parish_account_titles ON parishes.iafr_account_titles;
CREATE TRIGGER set_updated_at_parish_account_titles
BEFORE UPDATE ON parishes.iafr_account_titles
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_parish_financial_records ON parishes.financial_records;
CREATE TRIGGER set_updated_at_parish_financial_records
BEFORE UPDATE ON parishes.financial_records
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_parish_line_items ON parishes.iafr_line_items;
CREATE TRIGGER set_updated_at_parish_line_items
BEFORE UPDATE ON parishes.iafr_line_items
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_parish_events ON parishes.parish_events;
CREATE TRIGGER set_updated_at_parish_events
BEFORE UPDATE ON parishes.parish_events
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
