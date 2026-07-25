-- Rename the active Gold measure to the requested concise name.
-- Historical migrations retain the former name as an immutable audit trail.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'parish_analytics'
      AND table_name = 'fact_parish_monthly_financials'
      AND column_name = 'collections_other_net'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'parish_analytics'
      AND table_name = 'fact_parish_monthly_financials'
      AND column_name = 'collection_other'
  ) THEN
    ALTER TABLE parish_analytics.fact_parish_monthly_financials
      RENAME COLUMN collections_other_net TO collection_other;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'parish_analytics'
      AND table_name = 'vw_parish_monthly_financial_candidates'
      AND column_name = 'collections_other_net'
  ) THEN
    ALTER VIEW parish_analytics.vw_parish_monthly_financial_candidates
      RENAME COLUMN collections_other_net TO collection_other;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'parish_analytics'
      AND table_name = 'vw_parish_monthly_financials_liturgical'
      AND column_name = 'collections_other_net'
  ) THEN
    ALTER VIEW parish_analytics.vw_parish_monthly_financials_liturgical
      RENAME COLUMN collections_other_net TO collection_other;
  END IF;
END $$;

COMMENT ON COLUMN parish_analytics.fact_parish_monthly_financials.collection_other IS
  'Other collections after the applicable collection deduction; formerly collections_other_net.';
