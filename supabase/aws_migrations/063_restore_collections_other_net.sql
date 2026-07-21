-- Restore Other Collections Net as a first-class Gold measure.
-- Formula: 2021-2022 retain 100%; 2023 onward deduct 5%.

ALTER TABLE parish_analytics.fact_parish_monthly_financials
  ADD COLUMN IF NOT EXISTS collections_other_net numeric(14, 2) NOT NULL DEFAULT 0;

CREATE OR REPLACE VIEW parish_analytics.vw_parish_monthly_financial_candidates AS
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
         * CASE WHEN b.reporting_year >= 2023 THEN 0.05 ELSE 0 END)::numeric(14, 2)
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
  n.calculation_status,
  n.collections_other_net
FROM net_receipts n;

COMMENT ON VIEW parish_analytics.vw_parish_monthly_financial_candidates IS
  'Parish monthly v4 candidates with restored Other Collections Net; 2021-2022 at 100% and 2023 onward net of 5%.';

-- The existing view expanded financials.* when it was created. Recreate it so
-- the newly appended Gold column is included without shifting old view fields.
DROP VIEW IF EXISTS parish_analytics.vw_parish_monthly_financials_liturgical;

CREATE VIEW parish_analytics.vw_parish_monthly_financials_liturgical AS
SELECT
  financials.*,
  calendar.calendar_days_count AS liturgical_calendar_days_count,
  calendar.coverage_status AS liturgical_calendar_coverage_status,
  calendar.sundays_count AS liturgical_sundays_count,
  calendar.solemnities_count AS liturgical_solemnities_count,
  calendar.feasts_count AS liturgical_feasts_count,
  calendar.memorials_count AS liturgical_memorials_count,
  calendar.major_celebration_days_count AS liturgical_major_celebration_days_count,
  calendar.advent_days_count AS liturgical_advent_days_count,
  calendar.christmas_days_count AS liturgical_christmas_days_count,
  calendar.lent_days_count AS liturgical_lent_days_count,
  calendar.triduum_days_count AS liturgical_triduum_days_count,
  calendar.easter_days_count AS liturgical_easter_days_count,
  calendar.holy_week_days_count AS liturgical_holy_week_days_count,
  calendar.simbang_gabi_days_count AS liturgical_simbang_gabi_days_count,
  calendar.has_easter_sunday,
  calendar.has_christmas_day,
  calendar.has_ash_wednesday,
  calendar.has_palm_sunday,
  calendar.weekdays_count AS liturgical_weekdays_count,
  calendar.ordinary_time_days_count AS liturgical_ordinary_time_days_count
FROM parish_analytics.fact_parish_monthly_financials financials
LEFT JOIN parish_analytics.agg_liturgical_month calendar
  ON calendar.date_key = financials.date_key;
