DELETE FROM seminary_analytics.fact_seminary_financial_breakdowns;
DELETE FROM seminary_analytics.fact_seminary_monthly_financials;

INSERT INTO seminary_analytics.fact_seminary_monthly_financials (
  seminary_key,
  date_key,
  submission_key,
  donations,
  seminary_fees,
  mass_collections,
  other_sources,
  subsidy_from_rbscp,
  total_expenses,
  net_surplus,
  dependency_ratio,
  typhoon_days_count,
  has_event,
  major_events_count,
  minor_events_count,
  total_rainfall_mm
)
SELECT
  ds.seminary_key,
  (sr.year * 100) + public.month_short_to_int(sr.month) AS date_key,
  dim_sub.submission_key,
  sr.donations,
  sr.seminary_fees,
  sr.mass_collections,
  sr.other_sources,
  sr.subsidy_from_rbscp,
  sr.total_expenses,
  sr.net_surplus,
  CASE
    WHEN (sr.donations + sr.seminary_fees + sr.mass_collections + sr.other_sources + sr.subsidy_from_rbscp) = 0 THEN 0
    ELSE ROUND(
      (sr.donations + sr.subsidy_from_rbscp) /
      NULLIF(sr.donations + sr.seminary_fees + sr.mass_collections + sr.other_sources + sr.subsidy_from_rbscp, 0),
      4
    )
  END::numeric(14, 4),
  0::smallint,
  EXISTS (
    SELECT 1
    FROM diocese.events e
    WHERE e.institution_id = sr.institution_id
      AND e.deleted_at IS NULL
      AND EXTRACT(MONTH FROM e.start_date) = public.month_short_to_int(sr.month)
      AND EXTRACT(YEAR FROM e.start_date) = sr.year
  ) AS has_event,
  COALESCE((
    SELECT COUNT(*)::smallint
    FROM diocese.events e
    WHERE e.institution_id = sr.institution_id
      AND e.deleted_at IS NULL
      AND e.event_level = 'Major event'
      AND EXTRACT(MONTH FROM e.start_date) = public.month_short_to_int(sr.month)
      AND EXTRACT(YEAR FROM e.start_date) = sr.year
  ), 0::smallint),
  COALESCE((
    SELECT COUNT(*)::smallint
    FROM diocese.events e
    WHERE e.institution_id = sr.institution_id
      AND e.deleted_at IS NULL
      AND e.event_level = 'Minor event'
      AND EXTRACT(MONTH FROM e.start_date) = public.month_short_to_int(sr.month)
      AND EXTRACT(YEAR FROM e.start_date) = sr.year
  ), 0::smallint),
  0::numeric(14, 2)
FROM seminaries.financial_records sr
JOIN shared_analytics.dim_institutions di ON di.institution_id = sr.institution_id
JOIN seminary_analytics.dim_seminaries ds ON ds.institution_key = di.institution_key
LEFT JOIN shared_analytics.dim_submission dim_sub ON dim_sub.submission_batch_id = sr.submission_batch_id
WHERE sr.is_current_version = true
  AND sr.deleted_at IS NULL;

INSERT INTO seminary_analytics.fact_seminary_financial_breakdowns (
  seminary_key,
  date_key,
  submission_key,
  seminary_account_key,
  amount
)
SELECT
  ds.seminary_key,
  (sr.year * 100) + public.month_short_to_int(sr.month) AS date_key,
  dim_sub.submission_key,
  dsa.seminary_account_key,
  SUM(li.amount)::numeric(14, 2) AS amount
FROM seminaries.financial_records sr
JOIN seminaries.fs_line_items li ON li.financial_record_id = sr.id AND li.deleted_at IS NULL
JOIN seminary_analytics.dim_seminary_fs_account dsa ON dsa.source_account_title_id = li.account_title_id
JOIN shared_analytics.dim_institutions di ON di.institution_id = sr.institution_id
JOIN seminary_analytics.dim_seminaries ds ON ds.institution_key = di.institution_key
LEFT JOIN shared_analytics.dim_submission dim_sub ON dim_sub.submission_batch_id = sr.submission_batch_id
WHERE sr.is_current_version = true
  AND sr.deleted_at IS NULL
GROUP BY
  ds.seminary_key,
  (sr.year * 100) + public.month_short_to_int(sr.month),
  dim_sub.submission_key,
  dsa.seminary_account_key;
