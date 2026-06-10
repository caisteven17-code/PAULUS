-- Fix reference.rebuild_weather_monthly_summary (from migration 187).
--
-- The original body computed data_completeness_pct with
-- date_trunc('month', d.date) (no ::date cast) while GROUP BY used the cast
-- expression — Postgres treats those as different expressions and fails with:
--   42803: column "d.date" must appear in the GROUP BY clause
-- plpgsql only plans the query on first execution, so migration 187 applied
-- cleanly and the error surfaced at the first RPC call.
--
-- Fix: aggregate in a subquery, then derive completeness from the grouped
-- year_month column in the outer select.

CREATE OR REPLACE FUNCTION reference.rebuild_weather_monthly_summary(
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO reference.weather_monthly_summary (
    year_month, municipality,
    rain_none_days, rainy_days, heavy_rain_days, rain_inconclusive_days,
    normal_temp_days, hot_days, extreme_heat_days, temp_inconclusive_days,
    total_days_observed, avg_confidence_score, data_completeness_pct
  )
  SELECT
    g.year_month,
    g.municipality,
    g.rain_none_days,
    g.rainy_days,
    g.heavy_rain_days,
    g.rain_inconclusive_days,
    g.normal_temp_days,
    g.hot_days,
    g.extreme_heat_days,
    g.temp_inconclusive_days,
    g.total_days_observed,
    g.avg_confidence_score,
    round(
      g.total_days_observed::numeric * 100
        / extract(day from g.year_month + interval '1 month' - interval '1 day')::numeric,
      2
    )
  FROM (
    SELECT
      date_trunc('month', d.date)::date AS year_month,
      d.municipality,
      count(*) FILTER (WHERE d.rain_classification = 'none') AS rain_none_days,
      count(*) FILTER (WHERE d.rain_classification = 'rainy') AS rainy_days,
      count(*) FILTER (WHERE d.rain_classification = 'heavy_rain') AS heavy_rain_days,
      count(*) FILTER (WHERE d.rain_classification = 'inconclusive') AS rain_inconclusive_days,
      count(*) FILTER (WHERE d.temp_classification = 'normal') AS normal_temp_days,
      count(*) FILTER (WHERE d.temp_classification = 'hot') AS hot_days,
      count(*) FILTER (WHERE d.temp_classification = 'extreme_heat') AS extreme_heat_days,
      count(*) FILTER (WHERE d.temp_classification = 'inconclusive') AS temp_inconclusive_days,
      count(*) AS total_days_observed,
      round(avg(d.confidence_score), 3) AS avg_confidence_score
    FROM reference.weather_daily d
    WHERE (p_period_start IS NULL OR d.date >= date_trunc('month', p_period_start)::date)
      AND (p_period_end IS NULL
           OR d.date <= (date_trunc('month', p_period_end)
                         + interval '1 month' - interval '1 day')::date)
    GROUP BY date_trunc('month', d.date)::date, d.municipality
  ) g
  ON CONFLICT (year_month, municipality) DO UPDATE SET
    rain_none_days = EXCLUDED.rain_none_days,
    rainy_days = EXCLUDED.rainy_days,
    heavy_rain_days = EXCLUDED.heavy_rain_days,
    rain_inconclusive_days = EXCLUDED.rain_inconclusive_days,
    normal_temp_days = EXCLUDED.normal_temp_days,
    hot_days = EXCLUDED.hot_days,
    extreme_heat_days = EXCLUDED.extreme_heat_days,
    temp_inconclusive_days = EXCLUDED.temp_inconclusive_days,
    total_days_observed = EXCLUDED.total_days_observed,
    avg_confidence_score = EXCLUDED.avg_confidence_score,
    data_completeness_pct = EXCLUDED.data_completeness_pct,
    updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION reference.rebuild_weather_monthly_summary(date, date) TO service_role;

-- Backfill immediately from whatever is already in weather_daily.
-- No-op (returns 0) on a fresh database.
SELECT reference.rebuild_weather_monthly_summary(NULL, NULL) AS month_rows_upserted;
