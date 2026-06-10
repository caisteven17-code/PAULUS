CREATE TABLE IF NOT EXISTS seminaries.details (
  institution_id uuid PRIMARY KEY REFERENCES diocese.institutions(id) ON DELETE CASCADE,
  rector_id      uuid REFERENCES diocese.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);


CREATE TABLE IF NOT EXISTS seminaries.fs_account_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_code text,
  subsection_code text,
  account_code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('receipt', 'expense', 'balance', 'memo')),
  classification text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS seminaries.financial_records (
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
  donations numeric(14, 2) NOT NULL DEFAULT 0,
  seminary_fees numeric(14, 2) NOT NULL DEFAULT 0,
  mass_collections numeric(14, 2) NOT NULL DEFAULT 0,
  other_sources numeric(14, 2) NOT NULL DEFAULT 0,
  subsidy_from_rbscp numeric(14, 2) NOT NULL DEFAULT 0,
  tuition_fees numeric(14, 2) NOT NULL DEFAULT 0,
  board_lodging_fees numeric(14, 2) NOT NULL DEFAULT 0,
  drm_modules numeric(14, 2) NOT NULL DEFAULT 0,
  sra_reading_lab numeric(14, 2) NOT NULL DEFAULT 0,
  retreat numeric(14, 2) NOT NULL DEFAULT 0,
  honorarium_fee numeric(14, 2) NOT NULL DEFAULT 0,
  miscellaneous_fees numeric(14, 2) NOT NULL DEFAULT 0,
  daily_food numeric(14, 2) NOT NULL DEFAULT 0,
  food_others numeric(14, 2) NOT NULL DEFAULT 0,
  gasoline_seminary numeric(14, 2) NOT NULL DEFAULT 0,
  gasoline_vocation numeric(14, 2) NOT NULL DEFAULT 0,
  permits_licenses numeric(14, 2) NOT NULL DEFAULT 0,
  office_supplies numeric(14, 2) NOT NULL DEFAULT 0,
  kitchen_equipment numeric(14, 2) NOT NULL DEFAULT 0,
  medical_supplies numeric(14, 2) NOT NULL DEFAULT 0,
  liturgical_supplies numeric(14, 2) NOT NULL DEFAULT 0,
  construction_materials numeric(14, 2) NOT NULL DEFAULT 0,
  other_supplies numeric(14, 2) NOT NULL DEFAULT 0,
  lpg numeric(14, 2) NOT NULL DEFAULT 0,
  repairs_maintenance numeric(14, 2) NOT NULL DEFAULT 0,
  equipment_furniture numeric(14, 2) NOT NULL DEFAULT 0,
  utilities numeric(14, 2) NOT NULL DEFAULT 0,
  labor numeric(14, 2) NOT NULL DEFAULT 0,
  professional_driver_fee numeric(14, 2) NOT NULL DEFAULT 0,
  salaries_wages numeric(14, 2) NOT NULL DEFAULT 0,
  contribution_benefits numeric(14, 2) NOT NULL DEFAULT 0,
  cash_incentives numeric(14, 2) NOT NULL DEFAULT 0,
  transportation_bank_charges numeric(14, 2) NOT NULL DEFAULT 0,
  other_expenses numeric(14, 2) NOT NULL DEFAULT 0,
  total_expenses numeric(14, 2) NOT NULL DEFAULT 0,
  net_surplus numeric(14, 2) NOT NULL DEFAULT 0,
  dependency_ratio numeric(14, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seminary_current_record
  ON seminaries.financial_records (institution_id, year, month)
  WHERE is_current_version = true AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS seminaries.fs_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_record_id uuid NOT NULL REFERENCES seminaries.financial_records(id) ON DELETE CASCADE,
  account_title_id uuid REFERENCES seminaries.fs_account_titles(id),
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

DROP TRIGGER IF EXISTS set_updated_at_seminary_details ON seminaries.details;
CREATE TRIGGER set_updated_at_seminary_details
BEFORE UPDATE ON seminaries.details
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_seminary_account_titles ON seminaries.fs_account_titles;
CREATE TRIGGER set_updated_at_seminary_account_titles
BEFORE UPDATE ON seminaries.fs_account_titles
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_seminary_financial_records ON seminaries.financial_records;
CREATE TRIGGER set_updated_at_seminary_financial_records
BEFORE UPDATE ON seminaries.financial_records
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_seminary_fs_line_items ON seminaries.fs_line_items;
CREATE TRIGGER set_updated_at_seminary_fs_line_items
BEFORE UPDATE ON seminaries.fs_line_items
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();
