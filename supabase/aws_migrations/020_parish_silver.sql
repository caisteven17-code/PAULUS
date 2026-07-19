-- AWS-only parish finance silver layer.
-- Grain: one current record per parish/month and one row per source line item.

CREATE SCHEMA IF NOT EXISTS parish_silver;

CREATE TABLE IF NOT EXISTS parish_silver.financial_records (
  source_record_id uuid PRIMARY KEY REFERENCES parishes.financial_records(id),
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  submission_batch_id uuid REFERENCES operations.submission_batches(id),
  reporting_month date NOT NULL,
  reporting_year smallint NOT NULL,
  reporting_month_number smallint NOT NULL CHECK (reporting_month_number BETWEEN 1 AND 12),
  institution_class text,
  record_status text NOT NULL,
  prepared_by text,
  certified_by text,
  submitted_at timestamptz,
  record_timestamp timestamptz,
  source_version_no integer NOT NULL,
  source_validation_status text,
  sacraments_total numeric(14, 2) NOT NULL,
  confirmation_total numeric(14, 2) NOT NULL,
  mass_intentions_total numeric(14, 2) NOT NULL,
  mass_intentions_claimed numeric(14, 2) NOT NULL,
  mass_intentions_unclaimed numeric(14, 2) NOT NULL,
  mass_collection_weekday numeric(14, 2) NOT NULL,
  mass_collection_sunday numeric(14, 2) NOT NULL,
  mass_collection_saturday numeric(14, 2) NOT NULL,
  consumable_collections numeric(14, 2) NOT NULL,
  other_collections_total numeric(14, 2) NOT NULL,
  donations numeric(14, 2) NOT NULL,
  interest_income numeric(14, 2) NOT NULL,
  subsidy_inflow numeric(14, 2) NOT NULL,
  special_collections numeric(14, 2) NOT NULL,
  second_collections numeric(14, 2) NOT NULL,
  charge_over_above numeric(14, 2) NOT NULL,
  other_receipts numeric(14, 2) NOT NULL,
  priest_share numeric(14, 2) NOT NULL,
  mass_stipend numeric(14, 2) NOT NULL,
  other_pastoral_expenses numeric(14, 2) NOT NULL,
  salaries_wages_benefits numeric(14, 2) NOT NULL,
  govt_contributions numeric(14, 2) NOT NULL,
  utilities numeric(14, 2) NOT NULL,
  communications numeric(14, 2) NOT NULL,
  other_rectory_expenses numeric(14, 2) NOT NULL,
  construction_receipts numeric(14, 2) NOT NULL,
  construction_expenses numeric(14, 2) NOT NULL,
  remittance_to_diocese numeric(14, 2) NOT NULL,
  bishops_fund_share numeric(14, 2) NOT NULL,
  special_collections_remittance numeric(14, 2) NOT NULL,
  beginning_balance numeric(14, 2) NOT NULL,
  ending_balance_before_remit numeric(14, 2) NOT NULL,
  ending_balance_after_remit numeric(14, 2) NOT NULL,
  net_receipts numeric(14, 2) NOT NULL,
  pastoral_parish_fund_total_net_receipts numeric(14, 2) NOT NULL,
  line_item_count integer NOT NULL DEFAULT 0,
  line_item_amount_total numeric(18, 2) NOT NULL DEFAULT 0,
  quality_status text NOT NULL CHECK (quality_status IN ('passed', 'warning', 'failed')),
  quality_flags text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz NOT NULL,
  transformed_at timestamptz NOT NULL DEFAULT now(),
  etl_run_id uuid NOT NULL REFERENCES warehouse_control.etl_runs(run_id),
  UNIQUE (institution_id, reporting_month)
);

CREATE TABLE IF NOT EXISTS parish_silver.financial_line_items (
  source_line_item_id uuid PRIMARY KEY,
  source_record_id uuid NOT NULL REFERENCES parish_silver.financial_records(source_record_id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id),
  reporting_month date NOT NULL,
  source_account_title_id uuid,
  account_code text,
  account_name text,
  section_code text NOT NULL,
  subsection_code text,
  account_type text NOT NULL,
  classification text,
  amount numeric(14, 2) NOT NULL,
  tax_rate numeric(8, 4),
  is_remittable boolean NOT NULL,
  event_date date,
  item_code text,
  item_label text NOT NULL,
  notes text,
  source_row_number integer,
  source_label text,
  quality_status text NOT NULL CHECK (quality_status IN ('passed', 'warning', 'failed')),
  quality_flags text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz NOT NULL,
  transformed_at timestamptz NOT NULL DEFAULT now(),
  etl_run_id uuid NOT NULL REFERENCES warehouse_control.etl_runs(run_id)
);

-- Bronze child snapshots are replaced with DELETE + INSERT. Keep the source
-- UUID for lineage without an FK that would block that idempotent operation.
ALTER TABLE parish_silver.financial_line_items
  DROP CONSTRAINT IF EXISTS financial_line_items_source_line_item_id_fkey;

CREATE INDEX IF NOT EXISTS idx_silver_financial_records_period
  ON parish_silver.financial_records (institution_id, reporting_month);
CREATE INDEX IF NOT EXISTS idx_silver_line_items_record
  ON parish_silver.financial_line_items (source_record_id);
CREATE INDEX IF NOT EXISTS idx_silver_line_items_account
  ON parish_silver.financial_line_items (account_code, reporting_month);
CREATE INDEX IF NOT EXISTS idx_silver_financial_quality
  ON parish_silver.financial_records (quality_status, reporting_month);

CREATE OR REPLACE FUNCTION parish_silver.refresh_financial_record(
  p_source_record_id uuid,
  p_etl_run_id uuid
)
RETURNS TABLE(record_count integer, line_item_count integer, quality_status text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_record parishes.financial_records%ROWTYPE;
  v_month_number smallint;
  v_reporting_month date;
  v_record_flags text[] := ARRAY[]::text[];
  v_record_quality text := 'passed';
  v_line_count integer := 0;
  v_line_total numeric(18, 2) := 0;
  v_failed_line_count integer := 0;
  v_warning_line_count integer := 0;
BEGIN
  SELECT * INTO v_record
  FROM parishes.financial_records
  WHERE id = p_source_record_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, 'passed'::text;
    RETURN;
  END IF;

  IF NOT v_record.is_current_version OR v_record.deleted_at IS NOT NULL THEN
    DELETE FROM parish_silver.financial_records
    WHERE source_record_id = p_source_record_id;
    RETURN QUERY SELECT 0, 0, 'passed'::text;
    RETURN;
  END IF;

  v_month_number := public.month_short_to_int(v_record.month)::smallint;
  v_reporting_month := make_date(v_record.year, v_month_number, 1);

  DELETE FROM parish_silver.financial_records
  WHERE institution_id = v_record.institution_id
    AND reporting_month = v_reporting_month
    AND source_record_id <> p_source_record_id;

  DELETE FROM parish_silver.financial_line_items
  WHERE source_record_id = p_source_record_id;

  INSERT INTO parish_silver.financial_records (
    source_record_id, institution_id, submission_batch_id, reporting_month,
    reporting_year, reporting_month_number, institution_class, record_status,
    prepared_by, certified_by, submitted_at, record_timestamp, source_version_no,
    source_validation_status, sacraments_total, confirmation_total,
    mass_intentions_total, mass_intentions_claimed, mass_intentions_unclaimed,
    mass_collection_weekday, mass_collection_sunday, mass_collection_saturday,
    consumable_collections, other_collections_total, donations, interest_income,
    subsidy_inflow, special_collections, second_collections, charge_over_above,
    other_receipts, priest_share, mass_stipend, other_pastoral_expenses,
    salaries_wages_benefits, govt_contributions, utilities, communications,
    other_rectory_expenses, construction_receipts, construction_expenses,
    remittance_to_diocese, bishops_fund_share, special_collections_remittance,
    beginning_balance, ending_balance_before_remit, ending_balance_after_remit,
    net_receipts, pastoral_parish_fund_total_net_receipts, quality_status,
    quality_flags, source_created_at, source_updated_at, transformed_at, etl_run_id
  ) VALUES (
    v_record.id, v_record.institution_id, v_record.submission_batch_id,
    v_reporting_month, v_record.year, v_month_number,
    NULLIF(upper(btrim(v_record.institution_class)), ''), lower(btrim(v_record.status)),
    NULLIF(btrim(v_record.prepared_by), ''), NULLIF(btrim(v_record.certified_by), ''),
    v_record.submitted_at, v_record.record_timestamp, v_record.version_no,
    NULLIF(lower(btrim(v_record.validation_status)), ''),
    COALESCE(v_record.sacraments_total, 0), COALESCE(v_record.confirmation_total, 0),
    COALESCE(v_record.mass_intentions_total, 0), COALESCE(v_record.mass_intentions_claimed, 0),
    COALESCE(v_record.mass_intentions_unclaimed, 0), COALESCE(v_record.mass_collection_weekday, 0),
    COALESCE(v_record.mass_collection_sunday, 0), COALESCE(v_record.mass_collection_saturday, 0),
    COALESCE(v_record.consumable_collections, 0), COALESCE(v_record.other_collections_total, 0),
    COALESCE(v_record.donations, 0), COALESCE(v_record.interest_income, 0),
    COALESCE(v_record.subsidy_inflow, 0), COALESCE(v_record.special_collections, 0),
    COALESCE(v_record.second_collections, 0), COALESCE(v_record.charge_over_above, 0),
    COALESCE(v_record.other_receipts, 0), COALESCE(v_record.priest_share, 0),
    COALESCE(v_record.mass_stipend, 0), COALESCE(v_record.other_pastoral_expenses, 0),
    COALESCE(v_record.salaries_wages_benefits, 0), COALESCE(v_record.govt_contributions, 0),
    COALESCE(v_record.utilities, 0), COALESCE(v_record.communications, 0),
    COALESCE(v_record.other_rectory_expenses, 0), COALESCE(v_record.construction_receipts, 0),
    COALESCE(v_record.construction_expenses, 0), COALESCE(v_record.remittance_to_diocese, 0),
    COALESCE(v_record.bishops_fund_share, 0), COALESCE(v_record.special_collections_remittance, 0),
    COALESCE(v_record.beginning_balance, 0), COALESCE(v_record.ending_balance_before_remit, 0),
    COALESCE(v_record.ending_balance_after_remit, 0), COALESCE(v_record.net_receipts, 0),
    COALESCE(v_record.pastoral_parish_fund_total_net_receipts, 0), 'passed',
    ARRAY[]::text[], v_record.created_at, v_record.updated_at, now(), p_etl_run_id
  )
  ON CONFLICT (source_record_id) DO UPDATE SET
    institution_id = EXCLUDED.institution_id,
    submission_batch_id = EXCLUDED.submission_batch_id,
    reporting_month = EXCLUDED.reporting_month,
    reporting_year = EXCLUDED.reporting_year,
    reporting_month_number = EXCLUDED.reporting_month_number,
    institution_class = EXCLUDED.institution_class,
    record_status = EXCLUDED.record_status,
    prepared_by = EXCLUDED.prepared_by,
    certified_by = EXCLUDED.certified_by,
    submitted_at = EXCLUDED.submitted_at,
    record_timestamp = EXCLUDED.record_timestamp,
    source_version_no = EXCLUDED.source_version_no,
    source_validation_status = EXCLUDED.source_validation_status,
    sacraments_total = EXCLUDED.sacraments_total,
    confirmation_total = EXCLUDED.confirmation_total,
    mass_intentions_total = EXCLUDED.mass_intentions_total,
    mass_intentions_claimed = EXCLUDED.mass_intentions_claimed,
    mass_intentions_unclaimed = EXCLUDED.mass_intentions_unclaimed,
    mass_collection_weekday = EXCLUDED.mass_collection_weekday,
    mass_collection_sunday = EXCLUDED.mass_collection_sunday,
    mass_collection_saturday = EXCLUDED.mass_collection_saturday,
    consumable_collections = EXCLUDED.consumable_collections,
    other_collections_total = EXCLUDED.other_collections_total,
    donations = EXCLUDED.donations,
    interest_income = EXCLUDED.interest_income,
    subsidy_inflow = EXCLUDED.subsidy_inflow,
    special_collections = EXCLUDED.special_collections,
    second_collections = EXCLUDED.second_collections,
    charge_over_above = EXCLUDED.charge_over_above,
    other_receipts = EXCLUDED.other_receipts,
    priest_share = EXCLUDED.priest_share,
    mass_stipend = EXCLUDED.mass_stipend,
    other_pastoral_expenses = EXCLUDED.other_pastoral_expenses,
    salaries_wages_benefits = EXCLUDED.salaries_wages_benefits,
    govt_contributions = EXCLUDED.govt_contributions,
    utilities = EXCLUDED.utilities,
    communications = EXCLUDED.communications,
    other_rectory_expenses = EXCLUDED.other_rectory_expenses,
    construction_receipts = EXCLUDED.construction_receipts,
    construction_expenses = EXCLUDED.construction_expenses,
    remittance_to_diocese = EXCLUDED.remittance_to_diocese,
    bishops_fund_share = EXCLUDED.bishops_fund_share,
    special_collections_remittance = EXCLUDED.special_collections_remittance,
    beginning_balance = EXCLUDED.beginning_balance,
    ending_balance_before_remit = EXCLUDED.ending_balance_before_remit,
    ending_balance_after_remit = EXCLUDED.ending_balance_after_remit,
    net_receipts = EXCLUDED.net_receipts,
    pastoral_parish_fund_total_net_receipts = EXCLUDED.pastoral_parish_fund_total_net_receipts,
    source_updated_at = EXCLUDED.source_updated_at,
    transformed_at = EXCLUDED.transformed_at,
    etl_run_id = EXCLUDED.etl_run_id;

  INSERT INTO parish_silver.financial_line_items (
    source_line_item_id, source_record_id, institution_id, reporting_month,
    source_account_title_id, account_code, account_name, section_code,
    subsection_code, account_type, classification, amount, tax_rate,
    is_remittable, event_date, item_code, item_label, notes, source_row_number,
    source_label, quality_status, quality_flags, source_created_at,
    source_updated_at, transformed_at, etl_run_id
  )
  SELECT
    li.id, li.financial_record_id, v_record.institution_id, v_reporting_month,
    li.account_title_id, NULLIF(btrim(at.account_code), ''),
    NULLIF(btrim(at.account_name), ''), COALESCE(at.section_code, li.section_code),
    COALESCE(NULLIF(btrim(at.subsection_code), ''), NULLIF(btrim(li.subsection_code), '')),
    COALESCE(at.account_type, li.item_type), NULLIF(btrim(at.classification), ''),
    COALESCE(li.amount, 0), li.tax_rate, COALESCE(li.is_remittable, false),
    li.event_date, NULLIF(btrim(li.item_code), ''), btrim(li.item_label),
    NULLIF(btrim(li.notes), ''), li.source_row_number, NULLIF(btrim(li.source_label), ''),
    CASE
      WHEN at.id IS NULL THEN 'failed'
      WHEN li.amount < 0 OR li.section_code IS DISTINCT FROM at.section_code
        OR li.item_type IS DISTINCT FROM at.account_type OR NOT at.is_active
        OR at.deleted_at IS NOT NULL THEN 'warning'
      ELSE 'passed'
    END,
    array_remove(ARRAY[
      CASE WHEN at.id IS NULL THEN 'UNMAPPED_ACCOUNT' END,
      CASE WHEN li.amount < 0 THEN 'NEGATIVE_AMOUNT' END,
      CASE WHEN at.id IS NOT NULL AND li.section_code IS DISTINCT FROM at.section_code
        THEN 'SECTION_MISMATCH' END,
      CASE WHEN at.id IS NOT NULL AND li.item_type IS DISTINCT FROM at.account_type
        THEN 'ACCOUNT_TYPE_MISMATCH' END,
      CASE WHEN at.id IS NOT NULL AND (NOT at.is_active OR at.deleted_at IS NOT NULL)
        THEN 'INACTIVE_ACCOUNT' END
    ], NULL),
    li.created_at, li.updated_at, now(), p_etl_run_id
  FROM parishes.iafr_line_items li
  LEFT JOIN parishes.iafr_account_titles at ON at.id = li.account_title_id
  WHERE li.financial_record_id = p_source_record_id
    AND li.deleted_at IS NULL;

  SELECT count(*), COALESCE(sum(amount), 0),
         count(*) FILTER (WHERE sli.quality_status = 'failed'),
         count(*) FILTER (WHERE sli.quality_status = 'warning')
  INTO v_line_count, v_line_total, v_failed_line_count, v_warning_line_count
  FROM parish_silver.financial_line_items sli
  WHERE sli.source_record_id = p_source_record_id;

  v_record_flags := array_remove(ARRAY[
    CASE WHEN v_record.submission_batch_id IS NULL THEN 'MISSING_SUBMISSION_BATCH' END,
    CASE WHEN NULLIF(btrim(v_record.prepared_by), '') IS NULL THEN 'MISSING_PREPARED_BY' END,
    CASE WHEN NULLIF(btrim(v_record.certified_by), '') IS NULL THEN 'MISSING_CERTIFIED_BY' END,
    CASE WHEN NULLIF(btrim(v_record.validation_status), '') IS NULL THEN 'MISSING_VALIDATION_STATUS' END,
    CASE WHEN lower(COALESCE(v_record.validation_status, '')) = 'failed' THEN 'SOURCE_VALIDATION_FAILED' END,
    CASE WHEN v_record.status = 'draft' THEN 'DRAFT_RECORD' END,
    CASE WHEN v_line_count = 0 THEN 'NO_LINE_ITEMS' END,
    CASE WHEN v_failed_line_count > 0 THEN 'FAILED_LINE_ITEMS' END,
    CASE WHEN v_warning_line_count > 0 THEN 'WARNING_LINE_ITEMS' END
  ], NULL);

  v_record_quality := CASE
    WHEN lower(COALESCE(v_record.validation_status, '')) = 'failed' OR v_failed_line_count > 0
      THEN 'failed'
    WHEN cardinality(v_record_flags) > 0 THEN 'warning'
    ELSE 'passed'
  END;

  UPDATE parish_silver.financial_records
  SET line_item_count = v_line_count,
      line_item_amount_total = v_line_total,
      quality_status = v_record_quality,
      quality_flags = v_record_flags
  WHERE source_record_id = p_source_record_id;

  RETURN QUERY SELECT 1, v_line_count, v_record_quality;
END;
$$;
