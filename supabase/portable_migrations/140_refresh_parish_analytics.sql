-- Rebuild parish analytics facts from current operational records.

DELETE FROM parish_analytics.fact_parish_financial_breakdowns;
DELETE FROM parish_analytics.fact_parish_monthly_financials;

INSERT INTO parish_analytics.fact_parish_monthly_financials (
  parish_key,
  date_key,
  submission_key,
  sacraments_arancel_confirmation_incl,
  sacraments_parish_share,
  sacraments_over_above_confirmation_incl,
  collections_mass,
  collections_other_95,
  collections_other_receipts,
  total_collections,
  expenses_pastoral_mass_stipend,
  expenses_parish,
  total_expenses,
  net_receipts_deficit,
  mass_intentions_not_claimed_by_parish_priest,
  mass_intentions_claimed_by_parish_priest,
  special_collections,
  pastoral_parish_fund_total_net_receipts_deficit,
  typhoon_days_count,
  major_events_count,
  minor_events_count,
  has_event,
  total_rainfall_mm
)
SELECT
  dp.parish_key,
  (pr.year * 100) + public.month_short_to_int(pr.month) AS date_key,
  ds.submission_key,
  (pr.sacraments_total + pr.confirmation_total)::numeric(14, 2),
  0::numeric(14, 2),
  pr.charge_over_above,
  (pr.mass_collection_weekday + pr.mass_collection_sunday + pr.mass_collection_saturday)::numeric(14, 2),
  pr.other_collections_total,
  (pr.donations + pr.interest_income + pr.subsidy_inflow + pr.other_receipts)::numeric(14, 2),
  (
    pr.sacraments_total + pr.confirmation_total + pr.charge_over_above +
    pr.mass_collection_weekday + pr.mass_collection_sunday + pr.mass_collection_saturday +
    pr.other_collections_total + pr.donations + pr.interest_income + pr.subsidy_inflow +
    pr.other_receipts
  )::numeric(14, 2),
  (pr.priest_share + pr.mass_stipend + pr.other_pastoral_expenses)::numeric(14, 2),
  (
    pr.salaries_wages_benefits + pr.govt_contributions + pr.utilities + pr.communications +
    pr.other_rectory_expenses + pr.construction_expenses + pr.remittance_to_diocese +
    pr.bishops_fund_share + pr.special_collections_remittance
  )::numeric(14, 2),
  (
    pr.priest_share + pr.mass_stipend + pr.other_pastoral_expenses +
    pr.salaries_wages_benefits + pr.govt_contributions + pr.utilities + pr.communications +
    pr.other_rectory_expenses + pr.construction_expenses + pr.remittance_to_diocese +
    pr.bishops_fund_share + pr.special_collections_remittance
  )::numeric(14, 2),
  pr.net_receipts,
  pr.mass_intentions_unclaimed,
  pr.mass_intentions_claimed,
  pr.special_collections,
  pr.pastoral_parish_fund_total_net_receipts,
  0::smallint,
  COALESCE((
    SELECT COUNT(*)::smallint
    FROM diocese.events e
    WHERE e.institution_id = pr.institution_id
      AND e.deleted_at IS NULL
      AND e.event_level = 'Major event'
      AND EXTRACT(MONTH FROM e.start_date) = public.month_short_to_int(pr.month)
      AND EXTRACT(YEAR FROM e.start_date) = pr.year
  ), 0::smallint),
  COALESCE((
    SELECT COUNT(*)::smallint
    FROM diocese.events e
    WHERE e.institution_id = pr.institution_id
      AND e.deleted_at IS NULL
      AND e.event_level = 'Minor event'
      AND EXTRACT(MONTH FROM e.start_date) = public.month_short_to_int(pr.month)
      AND EXTRACT(YEAR FROM e.start_date) = pr.year
  ), 0::smallint),
  EXISTS (
    SELECT 1
    FROM diocese.events e
    WHERE e.institution_id = pr.institution_id
      AND e.deleted_at IS NULL
      AND EXTRACT(MONTH FROM e.start_date) = public.month_short_to_int(pr.month)
      AND EXTRACT(YEAR FROM e.start_date) = pr.year
  ) AS has_event,
  0::numeric(14, 2)
FROM parishes.financial_records pr
JOIN shared_analytics.dim_institutions di ON di.institution_id = pr.institution_id
JOIN parish_analytics.dim_parishes dp ON dp.institution_key = di.institution_key
LEFT JOIN shared_analytics.dim_submission ds ON ds.submission_batch_id = pr.submission_batch_id
WHERE pr.is_current_version = true
  AND pr.deleted_at IS NULL;

INSERT INTO parish_analytics.fact_parish_financial_breakdowns (
  parish_key,
  date_key,
  submission_key,
  iafr_account_key,
  amount
)
SELECT
  dp.parish_key,
  (pr.year * 100) + public.month_short_to_int(pr.month) AS date_key,
  ds.submission_key,
  dia.iafr_account_key,
  SUM(li.amount)::numeric(14, 2) AS amount
FROM parishes.financial_records pr
JOIN parishes.iafr_line_items li ON li.financial_record_id = pr.id AND li.deleted_at IS NULL
JOIN parish_analytics.dim_iafr_account dia ON dia.source_account_title_id = li.account_title_id
JOIN shared_analytics.dim_institutions di ON di.institution_id = pr.institution_id
JOIN parish_analytics.dim_parishes dp ON dp.institution_key = di.institution_key
LEFT JOIN shared_analytics.dim_submission ds ON ds.submission_batch_id = pr.submission_batch_id
WHERE pr.is_current_version = true
  AND pr.deleted_at IS NULL
GROUP BY
  dp.parish_key,
  (pr.year * 100) + public.month_short_to_int(pr.month),
  ds.submission_key,
  dia.iafr_account_key;
