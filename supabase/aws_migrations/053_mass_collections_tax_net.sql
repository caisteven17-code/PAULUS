-- Parish monthly formula v2: report 2023-2025 Mass collections net of the
-- record-level tax rate. The validated v1 candidate view remains available as
-- an audit baseline. This migration does not load Gold facts.

ALTER TABLE parish_analytics.fact_parish_monthly_financials
  ADD COLUMN IF NOT EXISTS collections_mass_gross numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collections_mass_tax_rate numeric(14, 6),
  ADD COLUMN IF NOT EXISTS collections_mass_tax_amount numeric(14, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF to_regclass('parish_analytics.vw_parish_monthly_financial_candidates_v1') IS NULL
     AND to_regclass('parish_analytics.vw_parish_monthly_financial_candidates') IS NOT NULL THEN
    ALTER VIEW parish_analytics.vw_parish_monthly_financial_candidates
      RENAME TO vw_parish_monthly_financial_candidates_v1;
  END IF;
END $$;

DROP VIEW IF EXISTS parish_analytics.vw_parish_monthly_financial_candidates;

CREATE VIEW parish_analytics.vw_parish_monthly_financial_candidates AS
WITH mass_rates AS (
  SELECT
    b.*,
    CASE
      WHEN b.reporting_year BETWEEN 2023 AND 2025 THEN mt.metric_value
      ELSE NULL
    END::numeric(14, 6) AS collections_mass_tax_rate,
    b.collections_mass::numeric(14, 2) AS collections_mass_gross
  FROM parish_analytics.vw_parish_monthly_financial_candidates_v1 b
  LEFT JOIN parish_silver.financial_memo_metrics mt
    ON mt.source_record_id = b.source_record_id
   AND mt.metric_name = 'mass_collections_tax_rate'
), tax_amounts AS (
  SELECT
    r.*,
    CASE
      WHEN r.reporting_year BETWEEN 2023 AND 2025
           AND r.collections_mass_tax_rate IS NOT NULL
        THEN (r.collections_mass_gross * r.collections_mass_tax_rate)::numeric(14, 2)
      WHEN r.reporting_year BETWEEN 2023 AND 2025 THEN NULL
      ELSE 0
    END::numeric(14, 2) AS collections_mass_tax_amount
  FROM mass_rates r
), net_mass AS (
  SELECT
    t.*,
    CASE
      WHEN t.reporting_year BETWEEN 2023 AND 2025
        THEN (t.collections_mass_gross - t.collections_mass_tax_amount)::numeric(14, 2)
      ELSE t.collections_mass_gross
    END::numeric(14, 2) AS collections_mass_net
  FROM tax_amounts t
), recalculated AS (
  SELECT
    n.*,
    (
      n.sacraments_parish_share
      + n.sacraments_over_above_confirmation_incl
      + n.collections_mass_net
      + n.collections_other_95
      + n.collections_other_receipts
    )::numeric(14, 2) AS total_collections_v2
  FROM net_mass n
), net_receipts AS (
  SELECT
    r.*,
    (r.total_collections_v2 - r.total_expenses)::numeric(14, 2) AS net_receipts_deficit_v2
  FROM recalculated r
)
SELECT
  n.source_record_id,
  n.institution_id,
  n.reporting_month,
  n.reporting_year,
  n.reporting_month_number,
  n.parish_key,
  n.date_key,
  n.submission_key,
  'parish_monthly_v2'::text AS formula_version,
  n.parish_share_rate,
  n.rate_resolution_method,
  n.sacraments_arancel_confirmation_incl,
  n.sacraments_parish_share,
  n.sacraments_over_above_confirmation_incl,
  n.collections_mass_gross,
  n.collections_mass_tax_rate,
  n.collections_mass_tax_amount,
  n.collections_mass_net AS collections_mass,
  n.collections_other_95,
  n.collections_other_receipts,
  n.expenses_pastoral_mass_stipend,
  n.expenses_parish_salaries_wages_benefits,
  n.expenses_parish_government_contributions,
  n.expenses_parish_utilities,
  n.expenses_parish_communications,
  n.expenses_parish_other_rectory,
  n.mass_intentions_not_claimed_by_parish_priest,
  n.mass_intentions_claimed_by_parish_priest,
  n.special_collections,
  n.silver_quality_status,
  n.silver_quality_flags,
  n.expenses_parish,
  n.total_collections_v2 AS total_collections,
  n.total_expenses,
  n.net_receipts_deficit_v2 AS net_receipts_deficit,
  (
    n.net_receipts_deficit_v2
    + n.mass_intentions_not_claimed_by_parish_priest
    - n.special_collections
  )::numeric(14, 2) AS pastoral_parish_fund_total_net_receipts_deficit,
  n.remittances_total,
  CASE
    WHEN n.calculation_status = 'failed' THEN 'failed'
    WHEN n.reporting_year BETWEEN 2023 AND 2025
         AND n.collections_mass_tax_rate IS NULL THEN 'failed'
    WHEN n.calculation_status = 'warning' THEN 'warning'
    ELSE 'passed'
  END::text AS calculation_status
FROM net_receipts n;

COMMENT ON VIEW parish_analytics.vw_parish_monthly_financial_candidates_v1 IS
  'Frozen Phase 5 v1 audit baseline before the 2023-2025 Mass collections tax correction.';

COMMENT ON VIEW parish_analytics.vw_parish_monthly_financial_candidates IS
  'Read-only parish_monthly_v2 candidates with auditable gross, tax, and net Mass collections; does not populate Gold facts.';
