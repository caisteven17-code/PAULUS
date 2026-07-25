-- Rename the active analytical output to reflect its year-dependent net rule.
-- Frozen v1/v2 audit views retain their historical column names.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'parish_analytics'
      AND table_name = 'fact_parish_monthly_financials'
      AND column_name = 'collections_other_95'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'parish_analytics'
      AND table_name = 'fact_parish_monthly_financials'
      AND column_name = 'collections_other_net'
  ) THEN
    ALTER TABLE parish_analytics.fact_parish_monthly_financials
      RENAME COLUMN collections_other_95 TO collections_other_net;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'parish_analytics'
      AND table_name = 'vw_parish_monthly_financial_candidates'
      AND column_name = 'collections_other_95'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'parish_analytics'
      AND table_name = 'vw_parish_monthly_financial_candidates'
      AND column_name = 'collections_other_net'
  ) THEN
    ALTER VIEW parish_analytics.vw_parish_monthly_financial_candidates
      RENAME COLUMN collections_other_95 TO collections_other_net;
  END IF;
END $$;
