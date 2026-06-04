-- Populate a monthly date dimension. Adjust the range if needed.

INSERT INTO shared_analytics.dim_date (
  date_key,
  month_name,
  month_number,
  month_short,
  year,
  quarter,
  academic_year_period,
  is_fiesta_season
)
SELECT
  (EXTRACT(YEAR FROM d)::int * 100) + EXTRACT(MONTH FROM d)::int AS date_key,
  to_char(d, 'FMMonth') AS month_name,
  EXTRACT(MONTH FROM d)::smallint AS month_number,
  to_char(d, 'Mon') AS month_short,
  EXTRACT(YEAR FROM d)::smallint AS year,
  'Q' || EXTRACT(QUARTER FROM d)::text AS quarter,
  CASE WHEN EXTRACT(MONTH FROM d) BETWEEN 6 AND 10 THEN true ELSE false END AS academic_year_period,
  CASE WHEN EXTRACT(MONTH FROM d) IN (5, 6, 7) THEN true ELSE false END AS is_fiesta_season
FROM generate_series(date '2018-01-01', date '2035-12-01', interval '1 month') AS d
ON CONFLICT (date_key) DO NOTHING;

