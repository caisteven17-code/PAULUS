-- Phase 5A: remove every cross-schema FK into the AWS operational diocese
-- mirror. Source UUIDs remain as lineage values; analytical relationships use
-- local warehouse keys. Internal diocese FKs stay intact for rollback.

DO $$
DECLARE
  dependency record;
BEGIN
  FOR dependency IN
    SELECT source_ns.nspname AS source_schema,
           source_table.relname AS source_table,
           constraint_row.conname AS constraint_name
    FROM pg_catalog.pg_constraint constraint_row
    JOIN pg_catalog.pg_class source_table
      ON source_table.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace source_ns
      ON source_ns.oid = source_table.relnamespace
    JOIN pg_catalog.pg_class target_table
      ON target_table.oid = constraint_row.confrelid
    JOIN pg_catalog.pg_namespace target_ns
      ON target_ns.oid = target_table.relnamespace
    WHERE constraint_row.contype = 'f'
      AND target_ns.nspname = 'diocese'
      AND source_ns.nspname <> 'diocese'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      dependency.source_schema,
      dependency.source_table,
      dependency.constraint_name
    );
  END LOOP;
END $$;

COMMENT ON COLUMN priest_assignment_analytics.dim_priests.profile_id IS
  'Logical Supabase profile UUID; not an AWS operational-profile foreign key.';
COMMENT ON COLUMN shared_analytics.dim_submission.submitted_by IS
  'Logical Supabase profile UUID retained for analytical lineage.';
COMMENT ON COLUMN shared_analytics.dim_submission.verified_by IS
  'Logical Supabase profile UUID retained for analytical lineage.';
COMMENT ON COLUMN shared_analytics.model_runs.created_by IS
  'Logical Supabase profile UUID retained for analytical lineage.';

-- Preserve the compatibility view while sourcing institution identity from the
-- warehouse dimension instead of the operational mirror.
CREATE OR REPLACE VIEW shared_analytics.diocesan_consolidated_financials AS
SELECT
  'parish'::text AS entity_type,
  institution.institution_id,
  record.month,
  record.year,
  (record.sacraments_total + record.confirmation_total + record.mass_intentions_total
    + record.mass_collection_weekday + record.mass_collection_sunday
    + record.mass_collection_saturday + record.consumable_collections
    + record.other_collections_total + record.donations + record.interest_income
    + record.subsidy_inflow + record.special_collections + record.second_collections
    + record.charge_over_above + record.other_receipts
    + record.construction_receipts)::numeric(14,2) AS total_inflow,
  (record.priest_share + record.mass_stipend + record.other_pastoral_expenses
    + record.salaries_wages_benefits + record.govt_contributions + record.utilities
    + record.communications + record.other_rectory_expenses
    + record.construction_expenses + record.remittance_to_diocese
    + record.bishops_fund_share
    + record.special_collections_remittance)::numeric(14,2) AS total_outflow,
  record.net_receipts,
  (record.remittance_to_diocese + record.bishops_fund_share
    + record.special_collections_remittance)::numeric(14,2) AS diocesan_share_inflow
FROM parishes.financial_records record
JOIN shared_analytics.dim_institutions institution
  ON institution.institution_id = record.institution_id
WHERE record.is_current_version = true AND record.deleted_at IS NULL
UNION ALL
SELECT
  'school'::text,
  institution.institution_id,
  record.month,
  record.year,
  (record.tuition_revenues + record.miscellaneous_fees + record.other_income
    + record.subsidy_inflow)::numeric(14,2),
  (record.faculty_payroll + record.admin_staff_payroll + record.utilities
    + record.facilities_maintenance + record.supplies
    + record.other_expenses)::numeric(14,2),
  record.net_receipts,
  0::numeric(14,2)
FROM schools.financial_records record
JOIN shared_analytics.dim_institutions institution
  ON institution.institution_id = record.institution_id
WHERE record.is_current_version = true AND record.deleted_at IS NULL
UNION ALL
SELECT
  'seminary'::text,
  institution.institution_id,
  record.month,
  record.year,
  (record.donations + record.seminary_fees + record.mass_collections
    + record.other_sources + record.subsidy_from_rbscp)::numeric(14,2),
  record.total_expenses,
  record.net_surplus,
  0::numeric(14,2)
FROM seminaries.financial_records record
JOIN shared_analytics.dim_institutions institution
  ON institution.institution_id = record.institution_id
WHERE record.is_current_version = true AND record.deleted_at IS NULL;

-- These views exist only to inspect the retired operational mirror.
DROP VIEW IF EXISTS debug.v_audit_logs;
DROP VIEW IF EXISTS debug.v_institution_scenarios;
DROP VIEW IF EXISTS debug.v_parish_financials;
DROP VIEW IF EXISTS debug.v_priest_health;
DROP VIEW IF EXISTS debug.v_priest_scenarios;

