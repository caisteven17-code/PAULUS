-- Keep parish weather Gold aligned with the canonical institution municipality.
-- Migration 081 propagates municipality into dim_parishes, but the existing
-- aggregate is materialized and otherwise changes only during a weather load.

CREATE OR REPLACE FUNCTION parish_analytics.refresh_parish_weather_analytics(
  p_parish_key integer
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, parish_analytics, shared_analytics, reference_silver
AS $$
DECLARE
  rows_written integer := 0;
BEGIN
  DELETE FROM parish_analytics.agg_parish_weather_monthly
  WHERE parish_key = p_parish_key;

  INSERT INTO parish_analytics.agg_parish_weather_monthly (
    parish_key, date_key, municipality, year_month,
    light_rain_days, moderate_rain_days, heavy_rain_days, rain_inconclusive_days,
    no_severe_days, light_weather_days, moderate_weather_days, severe_weather_days,
    extreme_weather_days, severe_inconclusive_days, typhoon_days, peak_typhoon_signal,
    not_hazardous_days, caution_days, extreme_caution_days, danger_days, extreme_danger_days,
    temp_inconclusive_days, calm_wind_days, light_wind_days, moderate_wind_days,
    strong_wind_days, storm_wind_days, wind_inconclusive_days,
    low_humidity_days, moderate_humidity_days, high_humidity_days, very_high_humidity_days,
    humidity_inconclusive_days, total_days_observed, data_completeness_pct, refreshed_at
  )
  SELECT
    parish.parish_key,
    (EXTRACT(YEAR FROM weather.year_month)::integer * 100
      + EXTRACT(MONTH FROM weather.year_month)::integer),
    weather.municipality,
    weather.year_month,
    weather.light_rain_days,
    weather.moderate_rain_days,
    weather.heavy_rain_days,
    weather.rain_inconclusive_days,
    weather.no_severe_days,
    weather.light_weather_days,
    weather.moderate_weather_days,
    weather.severe_weather_days,
    weather.extreme_weather_days,
    weather.severe_inconclusive_days,
    weather.typhoon_days,
    weather.peak_typhoon_signal,
    weather.not_hazardous_days,
    weather.caution_days,
    weather.extreme_caution_days,
    weather.danger_days,
    weather.extreme_danger_days,
    weather.temp_inconclusive_days,
    weather.calm_wind_days,
    weather.light_wind_days,
    weather.moderate_wind_days,
    weather.strong_wind_days,
    weather.storm_wind_days,
    weather.wind_inconclusive_days,
    weather.low_humidity_days,
    weather.moderate_humidity_days,
    weather.high_humidity_days,
    weather.very_high_humidity_days,
    weather.humidity_inconclusive_days,
    weather.total_days_observed,
    weather.data_completeness_pct,
    now()
  FROM parish_analytics.dim_parishes parish
  JOIN shared_analytics.dim_institutions institution
    ON institution.institution_key = parish.institution_key
  JOIN reference_silver.weather_municipality_monthly weather
    ON weather.municipality = institution.municipality
  WHERE parish.parish_key = p_parish_key
    AND institution.municipality IS NOT NULL;

  GET DIAGNOSTICS rows_written = ROW_COUNT;
  RETURN rows_written;
END;
$$;

CREATE OR REPLACE FUNCTION parish_analytics.refresh_parish_weather_after_location_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, parish_analytics, shared_analytics, reference_silver
AS $$
BEGIN
  PERFORM parish_analytics.refresh_parish_weather_analytics(NEW.parish_key);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_parish_weather_after_insert
  ON parish_analytics.dim_parishes;
CREATE TRIGGER refresh_parish_weather_after_insert
AFTER INSERT ON parish_analytics.dim_parishes
FOR EACH ROW
EXECUTE FUNCTION parish_analytics.refresh_parish_weather_after_location_change();

DROP TRIGGER IF EXISTS refresh_parish_weather_after_municipality_change
  ON parish_analytics.dim_parishes;
CREATE TRIGGER refresh_parish_weather_after_municipality_change
AFTER UPDATE OF municipality ON parish_analytics.dim_parishes
FOR EACH ROW
WHEN (OLD.municipality IS DISTINCT FROM NEW.municipality)
EXECUTE FUNCTION parish_analytics.refresh_parish_weather_after_location_change();

-- Repair all stale parish-to-municipality assignments that predate this trigger.
SELECT parish_analytics.refresh_parish_weather_analytics();

COMMENT ON FUNCTION parish_analytics.refresh_parish_weather_analytics(integer) IS
  'Rebuilds weather Gold rows for one parish from its canonical institution municipality.';
COMMENT ON FUNCTION parish_analytics.refresh_parish_weather_after_location_change() IS
  'Keeps parish weather Gold synchronized after parish creation or municipality changes.';
