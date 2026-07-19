-- Parish monthly formula v3: eligible Other Collections remain at 100% for
-- 2021-2022 and are reported net of a fixed 5% deduction for 2023-2025.
-- Prior candidate versions remain available for audit. Gold is not loaded.

ALTER TABLE parish_analytics.fact_parish_monthly_financials
  ADD COLUMN IF NOT EXISTS collections_other_gross numeric(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collections_other_tax_rate numeric(14, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS collections_other_tax_amount numeric(14, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF to_regclass('parish_analytics.vw_parish_monthly_financial_candidates_v2') IS NULL
     AND to_regclass('parish_analytics.vw_parish_monthly_financial_candidates') IS NOT NULL THEN
    ALTER VIEW parish_analytics.vw_parish_monthly_financial_candidates
      RENAME TO vw_parish_monthly_financial_candidates_v2;
  END IF;
END $$;

DROP VIEW IF EXISTS parish_analytics.vw_parish_monthly_financial_candidates;

CREATE VIEW parish_analytics.vw_parish_monthly_financial_candidates AS
WITH other_collection_gross AS (
  SELECT
    l.source_record_id,
    SUM(l.amount)::numeric(14, 2) AS collections_other_gross
  FROM parish_silver.financial_line_items l
  JOIN parish_silver.financial_records fr
    ON fr.source_record_id = l.source_record_id
  JOIN warehouse_control.parish_metric_account_rules rules
    ON rules.formula_version = 'parish_monthly_v1'
   AND rules.metric_name = 'collections_other_95'
   AND fr.reporting_year BETWEEN rules.effective_start_year AND rules.effective_end_year
   AND (
     rules.account_code = l.account_code
     OR (rules.account_code_regex IS NOT NULL AND l.account_code ~ rules.account_code_regex)
   )
  GROUP BY l.source_record_id
), other_components AS (
  SELECT
    b.*,
    COALESCE(g.collections_other_gross, 0)::numeric(14, 2) AS collections_other_gross,
    CASE WHEN b.reporting_year BETWEEN 2023 AND 2025 THEN 0.05 ELSE 0 END::numeric(14, 6)
      AS collections_other_tax_rate
  FROM parish_analytics.vw_parish_monthly_financial_candidates_v2 b
  LEFT JOIN other_collection_gross g ON g.source_record_id = b.source_record_id
), other_tax AS (
  SELECT
    c.*,
    (c.collections_other_gross * c.collections_other_tax_rate)::numeric(14, 2)
      AS collections_other_tax_amount
  FROM other_components c
), other_net AS (
  SELECT
    t.*,
    (t.collections_other_gross - t.collections_other_tax_amount)::numeric(14, 2)
      AS collections_other_net
  FROM other_tax t
), recalculated AS (
  SELECT
    n.*,
    (
      n.sacraments_parish_share
      + n.sacraments_over_above_confirmation_incl
      + n.collections_mass
      + n.collections_other_net
      + n.collections_other_receipts
    )::numeric(14, 2) AS total_collections_v3
  FROM other_net n
), net_receipts AS (
  SELECT
    r.*,
    (r.total_collections_v3 - r.total_expenses)::numeric(14, 2) AS net_receipts_deficit_v3
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
  'parish_monthly_v3'::text AS formula_version,
  n.parish_share_rate,
  n.rate_resolution_method,
  n.sacraments_arancel_confirmation_incl,
  n.sacraments_parish_share,
  n.sacraments_over_above_confirmation_incl,
  n.collections_mass_gross,
  n.collections_mass_tax_rate,
  n.collections_mass_tax_amount,
  n.collections_mass,
  n.collections_other_gross,
  n.collections_other_tax_rate,
  n.collections_other_tax_amount,
  n.collections_other_net AS collections_other_95,
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
  n.total_collections_v3 AS total_collections,
  n.total_expenses,
  n.net_receipts_deficit_v3 AS net_receipts_deficit,
  (
    n.net_receipts_deficit_v3
    + n.mass_intentions_not_claimed_by_parish_priest
    - n.special_collections
  )::numeric(14, 2) AS pastoral_parish_fund_total_net_receipts_deficit,
  n.remittances_total,
  n.calculation_status
FROM net_receipts n;

COMMENT ON VIEW parish_analytics.vw_parish_monthly_financial_candidates_v2 IS
  'Frozen parish_monthly_v2 audit baseline before the year-specific Other Collections correction.';

COMMENT ON VIEW parish_analytics.vw_parish_monthly_financial_candidates IS
  'Read-only parish_monthly_v3 candidates: 2021-2022 Other Collections at 100%, 2023-2025 net of 5%; does not populate Gold facts.';
