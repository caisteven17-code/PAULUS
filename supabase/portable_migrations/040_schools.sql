CREATE TABLE IF NOT EXISTS schools.details (
  institution_id uuid PRIMARY KEY REFERENCES diocese.institutions(id) ON DELETE CASCADE,
  principal_id   uuid REFERENCES diocese.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);


CREATE TABLE IF NOT EXISTS schools.fs_account_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_code text,
  subsection_code text,
  account_code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('receipt', 'expense', 'balance', 'memo')),
  receipt_group text,
  receipt_category text,
  expense_group text,
  expense_category text,
  source_template text,
  source_sheet_name text,
  source_row_number integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS schools.financial_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  submission_batch_id uuid REFERENCES operations.submission_batches(id),
  institution_class text CHECK (institution_class IN ('A', 'B', 'C', 'D', 'E') OR institution_class IS NULL),
  month text NOT NULL CHECK (month IN ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')),
  year smallint NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'verified')),
  version_no integer NOT NULL DEFAULT 1,
  is_current_version boolean NOT NULL DEFAULT true,
  record_timestamp timestamptz,
  tuition_revenues numeric(14, 2) NOT NULL DEFAULT 0,
  miscellaneous_fees numeric(14, 2) NOT NULL DEFAULT 0,
  other_income numeric(14, 2) NOT NULL DEFAULT 0,
  subsidy_inflow numeric(14, 2) NOT NULL DEFAULT 0,
  faculty_payroll numeric(14, 2) NOT NULL DEFAULT 0,
  admin_staff_payroll numeric(14, 2) NOT NULL DEFAULT 0,
  utilities numeric(14, 2) NOT NULL DEFAULT 0,
  facilities_maintenance numeric(14, 2) NOT NULL DEFAULT 0,
  supplies numeric(14, 2) NOT NULL DEFAULT 0,
  other_expenses numeric(14, 2) NOT NULL DEFAULT 0,
  net_receipts numeric(14, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_school_current_record
  ON schools.financial_records (institution_id, year, month)
  WHERE is_current_version = true AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS schools.fs_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_record_id uuid NOT NULL REFERENCES schools.financial_records(id) ON DELETE CASCADE,
  account_title_id uuid REFERENCES schools.fs_account_titles(id),
  section_code text,
  subsection_code text,
  item_code text,
  item_label text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('receipt', 'expense', 'balance', 'memo')),
  amount numeric(14, 2) NOT NULL DEFAULT 0,
  notes text,
  source_row_number integer,
  source_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS schools.school_events (
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

DROP TRIGGER IF EXISTS set_updated_at_school_details ON schools.details;
CREATE TRIGGER set_updated_at_school_details
BEFORE UPDATE ON schools.details
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_school_account_titles ON schools.fs_account_titles;
CREATE TRIGGER set_updated_at_school_account_titles
BEFORE UPDATE ON schools.fs_account_titles
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_school_financial_records ON schools.financial_records;
CREATE TRIGGER set_updated_at_school_financial_records
BEFORE UPDATE ON schools.financial_records
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_school_fs_line_items ON schools.fs_line_items;
CREATE TRIGGER set_updated_at_school_fs_line_items
BEFORE UPDATE ON schools.fs_line_items
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_school_events ON schools.school_events;
CREATE TRIGGER set_updated_at_school_events
BEFORE UPDATE ON schools.school_events
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
