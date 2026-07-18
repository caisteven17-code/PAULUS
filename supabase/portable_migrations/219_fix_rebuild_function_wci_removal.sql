-- Migration 219: Fix reference.rebuild_weather_monthly_summary — it still wrote
-- to rain_wci/severe_wci/temp_wci/wind_wci/humidity_wci/overall_wci, but
-- 208_drop_wci_columns.sql dropped those columns from weather_monthly_summary
-- and nobody updated the function afterward. Calling the function currently
-- fails with "column rain_wci of relation weather_monthly_summary does not
-- exist" on any database where 208 has run (confirmed live on Supabase itself).
-- This recreates the function with the WCI columns removed from the INSERT
-- column list, the aggregation, and the ON CONFLICT UPDATE SET — no other
-- logic changes.

CREATE OR REPLACE FUNCTION reference.rebuild_weather_monthly_summary(
  p_period_start date DEFAULT NULL,
  p_period_end   date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rows  integer;
  v_start date := CASE WHEN p_period_start IS NULL THEN NULL
                       ELSE date_trunc('month', p_period_start)::date END;
  v_end   date := CASE WHEN p_period_end IS NULL THEN NULL
                       ELSE (date_trunc('month', p_period_end)
                             + interval '1 month' - interval '1 day')::date END;
BEGIN
  INSERT INTO reference.weather_monthly_summary (
    year_month, municipality,
    light_rain_days, moderate_rain_days, heavy_rain_days, rain_inconclusive_days,
    no_severe_days, light_weather_days, moderate_weather_days, severe_weather_days,
    extreme_weather_days, severe_inconclusive_days, typhoon_days, peak_typhoon_signal,
    no_severe_combined_days, light_weather_combined_days, moderate_weather_combined_days,
    severe_weather_combined_days, extreme_weather_combined_days,
    not_hazardous_days, caution_days, extreme_caution_days, danger_days,
    extreme_danger_days, temp_inconclusive_days,
    calm_wind_days, light_wind_days, moderate_wind_days, strong_wind_days,
    storm_wind_days, wind_inconclusive_days,
    low_humidity_days, moderate_humidity_days, high_humidity_days,
    very_high_humidity_days, humidity_inconclusive_days,
    total_days_observed, data_completeness_pct
  )
  WITH rain_temp AS (
    SELECT
      COALESCE(r.date, t.date)                 AS date,
      COALESCE(r.municipality, t.municipality) AS municipality,
      r.rain_classification,
      r.validators_agreed                      AS rain_validators_agreed,
      r.severe_classification,
      r.severe_validators_agreed,
      r.severe_classification_combined,
      r.typhoon_flag,
      r.typhoon_signal,
      t.temp_classification,
      t.validators_agreed                      AS temp_validators_agreed,
      t.humidity_classification,
      t.humidity_validators_agreed
    FROM reference.weather_rainfall_daily r
    FULL OUTER JOIN reference.weather_temperature_daily t
      ON  t.date         = r.date
      AND t.municipality = r.municipality
    WHERE (v_start IS NULL OR COALESCE(r.date, t.date) >= v_start)
      AND (v_end   IS NULL OR COALESCE(r.date, t.date) <= v_end)
  ),
  combined AS (
    SELECT
      rt.date,
      rt.municipality,
      rt.rain_classification,
      rt.rain_validators_agreed,
      rt.severe_classification,
      rt.severe_validators_agreed,
      rt.severe_classification_combined,
      rt.typhoon_flag,
      rt.typhoon_signal,
      rt.temp_classification,
      rt.temp_validators_agreed,
      rt.humidity_classification,
      rt.humidity_validators_agreed,
      w.wind_classification,
      w.validators_agreed AS wind_validators_agreed
    FROM rain_temp rt
    LEFT JOIN reference.weather_wind_daily w
      ON  w.date         = rt.date
      AND w.municipality = rt.municipality
  ),
  agg AS (
    SELECT
      date_trunc('month', c.date)::date AS year_month,
      c.municipality,
      count(*) FILTER (WHERE c.rain_classification = 'light')            AS light_rain_days,
      count(*) FILTER (WHERE c.rain_classification = 'moderate')         AS moderate_rain_days,
      count(*) FILTER (WHERE c.rain_classification = 'heavy')            AS heavy_rain_days,
      count(*) FILTER (WHERE c.rain_classification = 'inconclusive')     AS rain_inconclusive_days,
      count(*) FILTER (WHERE c.severe_classification = 'no_severe')        AS no_severe_days,
      count(*) FILTER (WHERE c.severe_classification = 'light_weather')    AS light_weather_days,
      count(*) FILTER (WHERE c.severe_classification = 'moderate_weather') AS moderate_weather_days,
      count(*) FILTER (WHERE c.severe_classification = 'severe_weather')   AS severe_weather_days,
      count(*) FILTER (WHERE c.severe_classification = 'extreme_weather')  AS extreme_weather_days,
      count(*) FILTER (WHERE c.severe_classification = 'inconclusive')     AS severe_inconclusive_days,
      count(*) FILTER (WHERE c.typhoon_flag = true)                        AS typhoon_days,
      max(COALESCE(c.typhoon_signal, 0))                                   AS peak_typhoon_signal,
      count(*) FILTER (WHERE c.severe_classification_combined = 'no_severe')        AS no_severe_combined_days,
      count(*) FILTER (WHERE c.severe_classification_combined = 'light_weather')    AS light_weather_combined_days,
      count(*) FILTER (WHERE c.severe_classification_combined = 'moderate_weather') AS moderate_weather_combined_days,
      count(*) FILTER (WHERE c.severe_classification_combined = 'severe_weather')   AS severe_weather_combined_days,
      count(*) FILTER (WHERE c.severe_classification_combined = 'extreme_weather')  AS extreme_weather_combined_days,
      count(*) FILTER (WHERE c.temp_classification = 'not_hazardous')   AS not_hazardous_days,
      count(*) FILTER (WHERE c.temp_classification = 'caution')         AS caution_days,
      count(*) FILTER (WHERE c.temp_classification = 'extreme_caution') AS extreme_caution_days,
      count(*) FILTER (WHERE c.temp_classification = 'danger')          AS danger_days,
      count(*) FILTER (WHERE c.temp_classification = 'extreme_danger')  AS extreme_danger_days,
      count(*) FILTER (WHERE c.temp_classification = 'inconclusive')    AS temp_inconclusive_days,
      count(*) FILTER (WHERE c.wind_classification = 'calm')            AS calm_wind_days,
      count(*) FILTER (WHERE c.wind_classification = 'light')           AS light_wind_days,
      count(*) FILTER (WHERE c.wind_classification = 'moderate')        AS moderate_wind_days,
      count(*) FILTER (WHERE c.wind_classification = 'strong')          AS strong_wind_days,
      count(*) FILTER (WHERE c.wind_classification = 'storm')           AS storm_wind_days,
      count(*) FILTER (WHERE c.wind_classification = 'inconclusive')    AS wind_inconclusive_days,
      count(*) FILTER (WHERE c.humidity_classification = 'low')         AS low_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'moderate')    AS moderate_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'high')        AS high_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'very_high')   AS very_high_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'inconclusive') AS humidity_inconclusive_days,
      count(*)                                                           AS total_days_observed
    FROM combined c
    GROUP BY date_trunc('month', c.date)::date, c.municipality
  )
  SELECT
    a.year_month, a.municipality,
    a.light_rain_days, a.moderate_rain_days, a.heavy_rain_days, a.rain_inconclusive_days,
    a.no_severe_days, a.light_weather_days, a.moderate_weather_days, a.severe_weather_days,
    a.extreme_weather_days, a.severe_inconclusive_days, a.typhoon_days, a.peak_typhoon_signal,
    a.no_severe_combined_days, a.light_weather_combined_days, a.moderate_weather_combined_days,
    a.severe_weather_combined_days, a.extreme_weather_combined_days,
    a.not_hazardous_days, a.caution_days, a.extreme_caution_days, a.danger_days,
    a.extreme_danger_days, a.temp_inconclusive_days,
    a.calm_wind_days, a.light_wind_days, a.moderate_wind_days, a.strong_wind_days,
    a.storm_wind_days, a.wind_inconclusive_days,
    a.low_humidity_days, a.moderate_humidity_days, a.high_humidity_days,
    a.very_high_humidity_days, a.humidity_inconclusive_days,
    a.total_days_observed,
    round(
      a.total_days_observed::numeric * 100
        / extract(day from a.year_month + interval '1 month' - interval '1 day')::numeric
    , 2) AS data_completeness_pct
  FROM agg a
  ON CONFLICT (year_month, municipality) DO UPDATE SET
    light_rain_days           = EXCLUDED.light_rain_days,
    moderate_rain_days        = EXCLUDED.moderate_rain_days,
    heavy_rain_days           = EXCLUDED.heavy_rain_days,
    rain_inconclusive_days    = EXCLUDED.rain_inconclusive_days,
    no_severe_days            = EXCLUDED.no_severe_days,
    light_weather_days        = EXCLUDED.light_weather_days,
    moderate_weather_days     = EXCLUDED.moderate_weather_days,
    severe_weather_days       = EXCLUDED.severe_weather_days,
    extreme_weather_days      = EXCLUDED.extreme_weather_days,
    severe_inconclusive_days  = EXCLUDED.severe_inconclusive_days,
    typhoon_days              = EXCLUDED.typhoon_days,
    peak_typhoon_signal       = EXCLUDED.peak_typhoon_signal,
    no_severe_combined_days        = EXCLUDED.no_severe_combined_days,
    light_weather_combined_days    = EXCLUDED.light_weather_combined_days,
    moderate_weather_combined_days = EXCLUDED.moderate_weather_combined_days,
    severe_weather_combined_days   = EXCLUDED.severe_weather_combined_days,
    extreme_weather_combined_days  = EXCLUDED.extreme_weather_combined_days,
    not_hazardous_days        = EXCLUDED.not_hazardous_days,
    caution_days               = EXCLUDED.caution_days,
    extreme_caution_days      = EXCLUDED.extreme_caution_days,
    danger_days                = EXCLUDED.danger_days,
    extreme_danger_days       = EXCLUDED.extreme_danger_days,
    temp_inconclusive_days    = EXCLUDED.temp_inconclusive_days,
    calm_wind_days            = EXCLUDED.calm_wind_days,
    light_wind_days           = EXCLUDED.light_wind_days,
    moderate_wind_days        = EXCLUDED.moderate_wind_days,
    strong_wind_days          = EXCLUDED.strong_wind_days,
    storm_wind_days           = EXCLUDED.storm_wind_days,
    wind_inconclusive_days    = EXCLUDED.wind_inconclusive_days,
    low_humidity_days         = EXCLUDED.low_humidity_days,
    moderate_humidity_days    = EXCLUDED.moderate_humidity_days,
    high_humidity_days        = EXCLUDED.high_humidity_days,
    very_high_humidity_days   = EXCLUDED.very_high_humidity_days,
    humidity_inconclusive_days = EXCLUDED.humidity_inconclusive_days,
    total_days_observed       = EXCLUDED.total_days_observed,
    data_completeness_pct     = EXCLUDED.data_completeness_pct,
    updated_at                 = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION reference.rebuild_weather_monthly_summary(date, date) TO service_role;
