CREATE TABLE IF NOT EXISTS parishes.details (
  institution_id      uuid PRIMARY KEY REFERENCES diocese.institutions(id) ON DELETE CASCADE,
  assigned_priest_id  uuid REFERENCES diocese.profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
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
  source_template text NOT NULL,
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
  institution_class text CHECK (institution_class IN ('A', 'B', 'C', 'D', 'E') OR institution_class IS NULL),
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



-- -------------------------------------------------------------
-- Seed iafr_account_titles
-- Section A (beginning_balance) is user-entered directly on
-- financial_records — line items section_code only allows B-F.
-- -------------------------------------------------------------
INSERT INTO parishes.iafr_account_titles
  (section_code, subsection_code, account_code, account_name, account_type, classification, source_template, is_active)
VALUES
  -- Section B: Sacraments / Arancel
  ('B', 'mass_intentions', 'B.01.01', 'Mass Intentions - Claimed by Parish Priest', 'personal_contribution', 'arancel', '2026_IAFR', true),
  ('B', 'mass_intentions', 'B.01.02', 'Mass Intentions - Unclaimed',                'memo',                  'arancel', '2026_IAFR', true),
  ('B', 'confirmation',    'B.02',    'Confirmation',                                'receipt',               'arancel', '2026_IAFR', true),
  ('B', 'charge',          'B.03',    'Charge Over and Above',                       'receipt',               'arancel', '2026_IAFR', true),
  -- Section C: Mass Collections
  ('C', 'mass_collection', 'C.01', 'Mass Collection - Weekday',  'receipt', 'mass_collection', '2026_IAFR', true),
  ('C', 'mass_collection', 'C.02', 'Mass Collection - Sunday',   'receipt', 'mass_collection', '2026_IAFR', true),
  ('C', 'mass_collection', 'C.03', 'Mass Collection - Saturday', 'receipt', 'mass_collection', '2026_IAFR', true),
  -- Section D: Other Collections
  ('D', 'other',   'D.01', 'Consumable Collections', 'receipt', 'other_collection',   '2026_IAFR', true),
  ('D', 'other',   'D.02', 'Other Collections',      'receipt', 'other_collection',   '2026_IAFR', true),
  ('D', 'other',   'D.03', 'Donations',              'receipt', 'other_collection',   '2026_IAFR', true),
  ('D', 'other',   'D.04', 'Interest Income',        'receipt', 'other_collection',   '2026_IAFR', true),
  ('D', 'other',   'D.05', 'Subsidy Inflow',         'receipt', 'other_collection',   '2026_IAFR', true),
  ('D', 'special', 'D.06', 'Special Collections',    'receipt', 'special_collection', '2026_IAFR', true),
  ('D', 'special', 'D.07', 'Second Collections',     'receipt', 'special_collection', '2026_IAFR', true),
  ('D', 'other',   'D.08', 'Other Receipts',         'receipt', 'other_collection',   '2026_IAFR', true),
  -- Section E: Expenses
  ('E', 'pastoral',     'E.01', 'Priest Share',                 'expense', 'pastoral',     '2026_IAFR', true),
  ('E', 'pastoral',     'E.02', 'Mass Stipend',                 'expense', 'pastoral',     '2026_IAFR', true),
  ('E', 'pastoral',     'E.03', 'Other Pastoral Expenses',      'expense', 'pastoral',     '2026_IAFR', true),
  ('E', 'rectory',      'E.04', 'Salaries, Wages and Benefits', 'expense', 'rectory',      '2026_IAFR', true),
  ('E', 'rectory',      'E.05', 'Government Contributions',     'expense', 'rectory',      '2026_IAFR', true),
  ('E', 'rectory',      'E.06', 'Utilities',                    'expense', 'rectory',      '2026_IAFR', true),
  ('E', 'rectory',      'E.07', 'Communications',               'expense', 'rectory',      '2026_IAFR', true),
  ('E', 'rectory',      'E.08', 'Other Rectory Expenses',       'expense', 'rectory',      '2026_IAFR', true),
  ('E', 'construction', 'E.09', 'Construction Receipts',        'receipt', 'construction', '2026_IAFR', true),
  ('E', 'construction', 'E.10', 'Construction Expenses',        'expense', 'construction', '2026_IAFR', true),
  -- Section F: Remittances
  ('F', 'remittance', 'F.01', 'Remittance to Diocese',          'remittance', 'remittance', '2026_IAFR', true),
  ('F', 'remittance', 'F.02', 'Bishop''s Fund Share',           'remittance', 'remittance', '2026_IAFR', true),
  ('F', 'remittance', 'F.03', 'Special Collections Remittance', 'remittance', 'remittance', '2026_IAFR', true)
ON CONFLICT (account_code) DO NOTHING;


-- -------------------------------------------------------------
-- Sync function: fires when any iafr_line_item changes.
-- Single-pass pivot query maps each account_code to its wide column.
-- Balance columns use fr.beginning_balance which is never overwritten.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION parishes.sync_financial_record_from_line_items()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_record_id uuid;
BEGIN
  v_record_id := COALESCE(NEW.financial_record_id, OLD.financial_record_id);

  UPDATE parishes.financial_records fr
  SET
    -- B: Sacraments
    mass_intentions_claimed        = comp.mass_intentions_claimed,
    mass_intentions_unclaimed      = comp.mass_intentions_unclaimed,
    mass_intentions_total          = comp.mass_intentions_claimed + comp.mass_intentions_unclaimed,
    confirmation_total             = comp.confirmation_total,
    charge_over_above              = comp.charge_over_above,
    sacraments_total               = comp.mass_intentions_claimed + comp.mass_intentions_unclaimed
                                     + comp.confirmation_total + comp.charge_over_above,
    -- C: Mass Collections
    mass_collection_weekday        = comp.mass_collection_weekday,
    mass_collection_sunday         = comp.mass_collection_sunday,
    mass_collection_saturday       = comp.mass_collection_saturday,
    -- D: Other Collections
    consumable_collections         = comp.consumable_collections,
    other_collections_total        = comp.other_collections_total,
    donations                      = comp.donations,
    interest_income                = comp.interest_income,
    subsidy_inflow                 = comp.subsidy_inflow,
    special_collections            = comp.special_collections,
    second_collections             = comp.second_collections,
    other_receipts                 = comp.other_receipts,
    -- E: Expenses
    priest_share                   = comp.priest_share,
    mass_stipend                   = comp.mass_stipend,
    other_pastoral_expenses        = comp.other_pastoral_expenses,
    salaries_wages_benefits        = comp.salaries_wages_benefits,
    govt_contributions             = comp.govt_contributions,
    utilities                      = comp.utilities,
    communications                 = comp.communications,
    other_rectory_expenses         = comp.other_rectory_expenses,
    construction_receipts          = comp.construction_receipts,
    construction_expenses          = comp.construction_expenses,
    -- F: Remittances
    remittance_to_diocese          = comp.remittance_to_diocese,
    bishops_fund_share             = comp.bishops_fund_share,
    special_collections_remittance = comp.special_collections_remittance,
    -- Derived totals
    net_receipts = (
        comp.mass_intentions_claimed + comp.confirmation_total     + comp.charge_over_above
      + comp.mass_collection_weekday + comp.mass_collection_sunday + comp.mass_collection_saturday
      + comp.consumable_collections  + comp.other_collections_total + comp.donations
      + comp.interest_income         + comp.subsidy_inflow          + comp.special_collections
      + comp.second_collections      + comp.other_receipts          + comp.construction_receipts
    ) - (
        comp.priest_share            + comp.mass_stipend            + comp.other_pastoral_expenses
      + comp.salaries_wages_benefits + comp.govt_contributions      + comp.utilities
      + comp.communications          + comp.other_rectory_expenses  + comp.construction_expenses
    ),
    ending_balance_before_remit = fr.beginning_balance + (
        comp.mass_intentions_claimed + comp.confirmation_total     + comp.charge_over_above
      + comp.mass_collection_weekday + comp.mass_collection_sunday + comp.mass_collection_saturday
      + comp.consumable_collections  + comp.other_collections_total + comp.donations
      + comp.interest_income         + comp.subsidy_inflow          + comp.special_collections
      + comp.second_collections      + comp.other_receipts          + comp.construction_receipts
    ) - (
        comp.priest_share            + comp.mass_stipend            + comp.other_pastoral_expenses
      + comp.salaries_wages_benefits + comp.govt_contributions      + comp.utilities
      + comp.communications          + comp.other_rectory_expenses  + comp.construction_expenses
    ),
    ending_balance_after_remit = fr.beginning_balance + (
        comp.mass_intentions_claimed + comp.confirmation_total     + comp.charge_over_above
      + comp.mass_collection_weekday + comp.mass_collection_sunday + comp.mass_collection_saturday
      + comp.consumable_collections  + comp.other_collections_total + comp.donations
      + comp.interest_income         + comp.subsidy_inflow          + comp.special_collections
      + comp.second_collections      + comp.other_receipts          + comp.construction_receipts
    ) - (
        comp.priest_share            + comp.mass_stipend            + comp.other_pastoral_expenses
      + comp.salaries_wages_benefits + comp.govt_contributions      + comp.utilities
      + comp.communications          + comp.other_rectory_expenses  + comp.construction_expenses
    ) - (
      comp.remittance_to_diocese + comp.bishops_fund_share + comp.special_collections_remittance
    ),
    -- Pastoral fund = regular receipts/expenses only (excludes construction fund)
    pastoral_parish_fund_total_net_receipts = (
        comp.mass_intentions_claimed + comp.confirmation_total     + comp.charge_over_above
      + comp.mass_collection_weekday + comp.mass_collection_sunday + comp.mass_collection_saturday
      + comp.consumable_collections  + comp.other_collections_total + comp.donations
      + comp.interest_income         + comp.subsidy_inflow          + comp.special_collections
      + comp.second_collections      + comp.other_receipts
    ) - (
        comp.priest_share            + comp.mass_stipend            + comp.other_pastoral_expenses
      + comp.salaries_wages_benefits + comp.govt_contributions      + comp.utilities
      + comp.communications          + comp.other_rectory_expenses
    ) - (
      comp.remittance_to_diocese + comp.bishops_fund_share + comp.special_collections_remittance
    ),
    updated_at = now()
  FROM (
    SELECT
      COALESCE(SUM(CASE WHEN at.account_code = 'B.01.01' THEN li.amount ELSE 0 END), 0) AS mass_intentions_claimed,
      COALESCE(SUM(CASE WHEN at.account_code = 'B.01.02' THEN li.amount ELSE 0 END), 0) AS mass_intentions_unclaimed,
      COALESCE(SUM(CASE WHEN at.account_code = 'B.02'    THEN li.amount ELSE 0 END), 0) AS confirmation_total,
      COALESCE(SUM(CASE WHEN at.account_code = 'B.03'    THEN li.amount ELSE 0 END), 0) AS charge_over_above,
      COALESCE(SUM(CASE WHEN at.account_code = 'C.01'    THEN li.amount ELSE 0 END), 0) AS mass_collection_weekday,
      COALESCE(SUM(CASE WHEN at.account_code = 'C.02'    THEN li.amount ELSE 0 END), 0) AS mass_collection_sunday,
      COALESCE(SUM(CASE WHEN at.account_code = 'C.03'    THEN li.amount ELSE 0 END), 0) AS mass_collection_saturday,
      COALESCE(SUM(CASE WHEN at.account_code = 'D.01'    THEN li.amount ELSE 0 END), 0) AS consumable_collections,
      COALESCE(SUM(CASE WHEN at.account_code = 'D.02'    THEN li.amount ELSE 0 END), 0) AS other_collections_total,
      COALESCE(SUM(CASE WHEN at.account_code = 'D.03'    THEN li.amount ELSE 0 END), 0) AS donations,
      COALESCE(SUM(CASE WHEN at.account_code = 'D.04'    THEN li.amount ELSE 0 END), 0) AS interest_income,
      COALESCE(SUM(CASE WHEN at.account_code = 'D.05'    THEN li.amount ELSE 0 END), 0) AS subsidy_inflow,
      COALESCE(SUM(CASE WHEN at.account_code = 'D.06'    THEN li.amount ELSE 0 END), 0) AS special_collections,
      COALESCE(SUM(CASE WHEN at.account_code = 'D.07'    THEN li.amount ELSE 0 END), 0) AS second_collections,
      COALESCE(SUM(CASE WHEN at.account_code = 'D.08'    THEN li.amount ELSE 0 END), 0) AS other_receipts,
      COALESCE(SUM(CASE WHEN at.account_code = 'E.01'    THEN li.amount ELSE 0 END), 0) AS priest_share,
      COALESCE(SUM(CASE WHEN at.account_code = 'E.02'    THEN li.amount ELSE 0 END), 0) AS mass_stipend,
      COALESCE(SUM(CASE WHEN at.account_code = 'E.03'    THEN li.amount ELSE 0 END), 0) AS other_pastoral_expenses,
      COALESCE(SUM(CASE WHEN at.account_code = 'E.04'    THEN li.amount ELSE 0 END), 0) AS salaries_wages_benefits,
      COALESCE(SUM(CASE WHEN at.account_code = 'E.05'    THEN li.amount ELSE 0 END), 0) AS govt_contributions,
      COALESCE(SUM(CASE WHEN at.account_code = 'E.06'    THEN li.amount ELSE 0 END), 0) AS utilities,
      COALESCE(SUM(CASE WHEN at.account_code = 'E.07'    THEN li.amount ELSE 0 END), 0) AS communications,
      COALESCE(SUM(CASE WHEN at.account_code = 'E.08'    THEN li.amount ELSE 0 END), 0) AS other_rectory_expenses,
      COALESCE(SUM(CASE WHEN at.account_code = 'E.09'    THEN li.amount ELSE 0 END), 0) AS construction_receipts,
      COALESCE(SUM(CASE WHEN at.account_code = 'E.10'    THEN li.amount ELSE 0 END), 0) AS construction_expenses,
      COALESCE(SUM(CASE WHEN at.account_code = 'F.01'    THEN li.amount ELSE 0 END), 0) AS remittance_to_diocese,
      COALESCE(SUM(CASE WHEN at.account_code = 'F.02'    THEN li.amount ELSE 0 END), 0) AS bishops_fund_share,
      COALESCE(SUM(CASE WHEN at.account_code = 'F.03'    THEN li.amount ELSE 0 END), 0) AS special_collections_remittance
    FROM parishes.iafr_line_items li
    LEFT JOIN parishes.iafr_account_titles at ON li.account_title_id = at.id
    WHERE li.financial_record_id = v_record_id
      AND li.deleted_at IS NULL
  ) comp
  WHERE fr.id = v_record_id;

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_iafr_line_items_sync ON parishes.iafr_line_items;
CREATE TRIGGER trg_iafr_line_items_sync
  AFTER INSERT OR UPDATE OR DELETE
  ON parishes.iafr_line_items
  FOR EACH ROW
  EXECUTE FUNCTION parishes.sync_financial_record_from_line_items();


-- -------------------------------------------------------------
-- Balance recompute trigger: fires only on UPDATE OF beginning_balance.
-- Recomputes ending balances using already-stored wide column values.
-- Never triggers the line-items sync above (that trigger is on a
-- different table), so there is no trigger loop.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION parishes.recompute_balances_from_beginning_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total_receipts    numeric;
  v_total_expenses    numeric;
  v_total_remittances numeric;
BEGIN
  v_total_receipts :=
      NEW.mass_intentions_claimed + NEW.confirmation_total     + NEW.charge_over_above
    + NEW.mass_collection_weekday + NEW.mass_collection_sunday + NEW.mass_collection_saturday
    + NEW.consumable_collections  + NEW.other_collections_total + NEW.donations
    + NEW.interest_income         + NEW.subsidy_inflow          + NEW.special_collections
    + NEW.second_collections      + NEW.other_receipts          + NEW.construction_receipts;

  v_total_expenses :=
      NEW.priest_share            + NEW.mass_stipend            + NEW.other_pastoral_expenses
    + NEW.salaries_wages_benefits + NEW.govt_contributions      + NEW.utilities
    + NEW.communications          + NEW.other_rectory_expenses  + NEW.construction_expenses;

  v_total_remittances :=
    NEW.remittance_to_diocese + NEW.bishops_fund_share + NEW.special_collections_remittance;

  NEW.net_receipts                            := v_total_receipts - v_total_expenses;
  NEW.ending_balance_before_remit             := NEW.beginning_balance + NEW.net_receipts;
  NEW.ending_balance_after_remit              := NEW.ending_balance_before_remit - v_total_remittances;
  NEW.pastoral_parish_fund_total_net_receipts :=
      (v_total_receipts - NEW.construction_receipts)
    - (v_total_expenses - NEW.construction_expenses)
    - v_total_remittances;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_records_balance_sync ON parishes.financial_records;
CREATE TRIGGER trg_financial_records_balance_sync
  BEFORE UPDATE OF beginning_balance
  ON parishes.financial_records
  FOR EACH ROW
  EXECUTE FUNCTION parishes.recompute_balances_from_beginning_balance();
