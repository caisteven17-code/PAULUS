-- Parish monthly formula v4: Total Remittance is the sum of category
-- remittances (F.1.*), Special Collections (F.3.01), and Other Special
-- Collections (F.3.02). Bishop's Fund Share (F.2.*) is intentionally excluded.

DELETE FROM warehouse_control.parish_metric_account_rules
WHERE formula_version = 'parish_monthly_v4'
  AND metric_name = 'total_remittance';

INSERT INTO warehouse_control.parish_metric_account_rules (
  formula_version, metric_name, effective_start_year, effective_end_year,
  account_code, account_code_regex, rule_role, multiplier, allocation_priority, notes
)
VALUES
  ('parish_monthly_v4', 'total_remittance', 2021, 2025, NULL, '^F\.1\.', 'include', 1, 10, 'Category remittance'),
  ('parish_monthly_v4', 'total_remittance', 2021, 2025, 'F.3.01', NULL, 'include', 1, 20, 'Special Collections'),
  ('parish_monthly_v4', 'total_remittance', 2021, 2025, 'F.3.02', NULL, 'include', 1, 30, 'Other Special Collections');

DROP VIEW IF EXISTS parish_analytics.vw_parish_monthly_financial_candidates;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'parish_analytics'
      AND table_name = 'fact_parish_monthly_financials'
      AND column_name = 'remittances_total'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'parish_analytics'
      AND table_name = 'fact_parish_monthly_financials'
      AND column_name = 'total_remittance'
  ) THEN
    ALTER TABLE parish_analytics.fact_parish_monthly_financials
      RENAME COLUMN remittances_total TO total_remittance;
  END IF;
END $$;

CREATE VIEW parish_analytics.vw_parish_monthly_financial_candidates AS
WITH other_collection_gross AS (
  SELECT l.source_record_id, SUM(l.amount)::numeric(14, 2) AS amount
  FROM parish_silver.financial_line_items l
  JOIN parish_silver.financial_records fr ON fr.source_record_id = l.source_record_id
  JOIN warehouse_control.parish_metric_account_rules rules
    ON rules.formula_version = 'parish_monthly_v1'
   AND rules.metric_name = 'collections_other_95'
   AND fr.reporting_year BETWEEN rules.effective_start_year AND rules.effective_end_year
   AND (rules.account_code = l.account_code
        OR (rules.account_code_regex IS NOT NULL AND l.account_code ~ rules.account_code_regex))
  GROUP BY l.source_record_id
), remittance_totals AS (
  SELECT l.source_record_id,
         SUM(l.amount * rules.multiplier)::numeric(14, 2) AS total_remittance
  FROM parish_silver.financial_line_items l
  JOIN parish_silver.financial_records fr ON fr.source_record_id = l.source_record_id
  JOIN warehouse_control.parish_metric_account_rules rules
    ON rules.formula_version = 'parish_monthly_v4'
   AND rules.metric_name = 'total_remittance'
   AND fr.reporting_year BETWEEN rules.effective_start_year AND rules.effective_end_year
   AND (rules.account_code = l.account_code
        OR (rules.account_code_regex IS NOT NULL AND l.account_code ~ rules.account_code_regex))
  GROUP BY l.source_record_id
), calculated AS (
  SELECT
    b.*,
    (
      COALESCE(g.amount, 0)
      - (COALESCE(g.amount, 0)
         * CASE WHEN b.reporting_year BETWEEN 2023 AND 2025 THEN 0.05 ELSE 0 END)::numeric(14, 2)
    )::numeric(14, 2) AS collections_other_net,
    COALESCE(rt.total_remittance, 0)::numeric(14, 2) AS total_remittance_v4
  FROM parish_analytics.vw_parish_monthly_financial_candidates_v2 b
  LEFT JOIN other_collection_gross g ON g.source_record_id = b.source_record_id
  LEFT JOIN remittance_totals rt ON rt.source_record_id = b.source_record_id
), totals AS (
  SELECT
    c.*,
    (c.sacraments_parish_share
      + c.sacraments_over_above_confirmation_incl
      + c.collections_mass
      + c.collections_other_net
      + c.collections_other_receipts)::numeric(14, 2) AS total_collections_v4
  FROM calculated c
), net_receipts AS (
  SELECT t.*,
         (t.total_collections_v4 - t.total_expenses)::numeric(14, 2) AS net_receipts_deficit_v4
  FROM totals t
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
  'parish_monthly_v4'::text AS formula_version,
  n.parish_share_rate,
  n.rate_resolution_method,
  n.sacraments_arancel_confirmation_incl,
  n.sacraments_parish_share,
  n.sacraments_over_above_confirmation_incl,
  n.collections_mass,
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
  n.total_collections_v4 AS total_collections,
  n.total_expenses,
  n.net_receipts_deficit_v4 AS net_receipts_deficit,
  (n.net_receipts_deficit_v4
    + n.mass_intentions_not_claimed_by_parish_priest
    - n.special_collections)::numeric(14, 2)
      AS pastoral_parish_fund_total_net_receipts_deficit,
  n.total_remittance_v4 AS total_remittance,
  n.calculation_status
FROM net_receipts n;

COMMENT ON VIEW parish_analytics.vw_parish_monthly_financial_candidates IS
  'Read-only parish_monthly_v4 candidates with approved Total Remittance formula; F.2.* is excluded.';
