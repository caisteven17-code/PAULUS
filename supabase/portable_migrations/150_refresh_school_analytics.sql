DELETE FROM school_analytics.fact_school_financial_breakdowns;
DELETE FROM school_analytics.fact_school_monthly_financials;

INSERT INTO school_analytics.fact_school_monthly_financials (
  school_key,
  date_key,
  submission_key,
  tuition_revenues,
  miscellaneous_fees,
  other_income,
  subsidy_inflow,
  faculty_payroll,
  admin_staff_payroll,
  utilities,
  facilities_maintenance,
  supplies,
  other_expenses,
  total_inflow,
  total_outflow,
  net_receipts,
  typhoon_days_count,
  has_event,
  major_events_count,
  minor_events_count,
  total_rainfall_mm
)
SELECT
  ds.school_key,
  (sr.year * 100) + public.month_short_to_int(sr.month) AS date_key,
  dim_sub.submission_key,
  sr.tuition_revenues,
  sr.miscellaneous_fees,
  sr.other_income,
  sr.subsidy_inflow,
  sr.faculty_payroll,
  sr.admin_staff_payroll,
  sr.utilities,
  sr.facilities_maintenance,
  sr.supplies,
  sr.other_expenses,
  (sr.tuition_revenues + sr.miscellaneous_fees + sr.other_income + sr.subsidy_inflow)::numeric(14, 2),
  (sr.faculty_payroll + sr.admin_staff_payroll + sr.utilities + sr.facilities_maintenance + sr.supplies + sr.other_expenses)::numeric(14, 2),
  sr.net_receipts,
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
FROM schools.financial_records sr
JOIN shared_analytics.dim_institutions di ON di.institution_id = sr.institution_id
JOIN school_analytics.dim_schools ds ON ds.institution_key = di.institution_key
LEFT JOIN shared_analytics.dim_submission dim_sub ON dim_sub.submission_batch_id = sr.submission_batch_id
WHERE sr.is_current_version = true
  AND sr.deleted_at IS NULL;

INSERT INTO school_analytics.fact_school_financial_breakdowns (
  school_key,
  date_key,
  submission_key,
  school_account_key,
  amount
)
SELECT
  ds.school_key,
  (sr.year * 100) + public.month_short_to_int(sr.month) AS date_key,
  dim_sub.submission_key,
  dsa.school_account_key,
  SUM(li.amount)::numeric(14, 2) AS amount
FROM schools.financial_records sr
JOIN schools.fs_line_items li ON li.financial_record_id = sr.id AND li.deleted_at IS NULL
JOIN school_analytics.dim_school_fs_account dsa ON dsa.source_account_title_id = li.account_title_id
JOIN shared_analytics.dim_institutions di ON di.institution_id = sr.institution_id
JOIN school_analytics.dim_schools ds ON ds.institution_key = di.institution_key
LEFT JOIN shared_analytics.dim_submission dim_sub ON dim_sub.submission_batch_id = sr.submission_batch_id
WHERE sr.is_current_version = true
  AND sr.deleted_at IS NULL
GROUP BY
  ds.school_key,
  (sr.year * 100) + public.month_short_to_int(sr.month),
  dim_sub.submission_key,
  dsa.school_account_key;
