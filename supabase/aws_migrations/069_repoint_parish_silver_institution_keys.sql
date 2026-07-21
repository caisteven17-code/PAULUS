-- Phase 3 of the hybrid-database migration.
-- Keep institution_id as Supabase lineage, but enforce all parish Silver
-- institution relationships locally through shared_analytics.dim_institutions.
-- Migration 068 and the controlled first institution sync must run first.

ALTER TABLE parish_silver.financial_records
  ADD COLUMN IF NOT EXISTS institution_key integer;

ALTER TABLE parish_silver.financial_line_items
  ADD COLUMN IF NOT EXISTS institution_key integer;

ALTER TABLE parish_silver.reporting_coverage
  ADD COLUMN IF NOT EXISTS institution_key integer;

UPDATE parish_silver.financial_records target
SET institution_key = dimension.institution_key
FROM shared_analytics.dim_institutions dimension
WHERE dimension.institution_id = target.institution_id
  AND target.institution_key IS DISTINCT FROM dimension.institution_key;

UPDATE parish_silver.financial_line_items target
SET institution_key = dimension.institution_key
FROM shared_analytics.dim_institutions dimension
WHERE dimension.institution_id = target.institution_id
  AND target.institution_key IS DISTINCT FROM dimension.institution_key;

UPDATE parish_silver.reporting_coverage target
SET institution_key = dimension.institution_key
FROM shared_analytics.dim_institutions dimension
WHERE dimension.institution_id = target.institution_id
  AND target.institution_key IS DISTINCT FROM dimension.institution_key;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM parish_silver.financial_records WHERE institution_key IS NULL)
    OR EXISTS (SELECT 1 FROM parish_silver.financial_line_items WHERE institution_key IS NULL)
    OR EXISTS (SELECT 1 FROM parish_silver.reporting_coverage WHERE institution_key IS NULL) THEN
    RAISE EXCEPTION
      'Phase 3 blocked: synchronize every source institution into shared_analytics.dim_institutions first';
  END IF;
END;
$$;

ALTER TABLE parish_silver.financial_records
  ALTER COLUMN institution_key SET NOT NULL,
  DROP CONSTRAINT IF EXISTS financial_records_institution_key_fkey,
  ADD CONSTRAINT financial_records_institution_key_fkey
    FOREIGN KEY (institution_key)
    REFERENCES shared_analytics.dim_institutions(institution_key);

ALTER TABLE parish_silver.financial_line_items
  ALTER COLUMN institution_key SET NOT NULL,
  DROP CONSTRAINT IF EXISTS financial_line_items_institution_key_fkey,
  ADD CONSTRAINT financial_line_items_institution_key_fkey
    FOREIGN KEY (institution_key)
    REFERENCES shared_analytics.dim_institutions(institution_key);

ALTER TABLE parish_silver.reporting_coverage
  ALTER COLUMN institution_key SET NOT NULL,
  DROP CONSTRAINT IF EXISTS reporting_coverage_institution_key_fkey,
  ADD CONSTRAINT reporting_coverage_institution_key_fkey
    FOREIGN KEY (institution_key)
    REFERENCES shared_analytics.dim_institutions(institution_key);

ALTER TABLE parish_silver.financial_records
  DROP CONSTRAINT IF EXISTS financial_records_institution_id_reporting_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_silver_financial_records_institution_month
  ON parish_silver.financial_records (institution_key, reporting_month);

CREATE INDEX IF NOT EXISTS idx_silver_financial_records_institution_key
  ON parish_silver.financial_records (institution_key, reporting_month);

CREATE INDEX IF NOT EXISTS idx_silver_line_items_institution_key
  ON parish_silver.financial_line_items (institution_key, reporting_month);

CREATE INDEX IF NOT EXISTS idx_reporting_coverage_institution_key
  ON parish_silver.reporting_coverage (institution_key, reporting_month);

COMMENT ON COLUMN parish_silver.financial_records.institution_id IS
  'Supabase source UUID retained for lineage; local relationships use institution_key.';
COMMENT ON COLUMN parish_silver.financial_line_items.institution_id IS
  'Supabase source UUID retained for lineage; local relationships use institution_key.';
COMMENT ON COLUMN parish_silver.reporting_coverage.institution_id IS
  'Supabase source UUID retained for lineage; local relationships use institution_key.';

-- Retire the legacy AWS-bronze SQL transformer. The Python direct-Silver ETL
-- now reads Supabase and resolves the local institution dimension explicitly.
CREATE OR REPLACE FUNCTION parish_silver.refresh_financial_record(
  p_source_record_id uuid,
  p_etl_run_id uuid
)
RETURNS TABLE(record_count integer, line_item_count integer, quality_status text)
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Legacy AWS-bronze transformer retired; use app.services.silver_etl';
END;
$$;

