-- Materialize parish-scoped weather into parish_analytics, mirroring the
-- liturgical-calendar pattern (062_parish_liturgical_calendar_analytics.sql):
-- reference.weather_monthly_summary stays the source of truth (every weather
-- pipeline script hardcodes that schema across dozens of call sites — not
-- worth relocating), but parish_analytics gets a real, refreshed table
-- instead of the live cross-schema view this replaces.
--
-- Named agg_ (not fact_) to match agg_liturgical_month: this is a derived,
-- pre-computed monthly rollup joined in for convenience, not a primary
-- measured fact like fact_parish_monthly_financials. Unlike
-- agg_liturgical_month (keyed by date_key alone, since the calendar is
-- global), weather varies by municipality, so this table is keyed by
-- (parish_key, date_key) — the same grain vw_parish_weather_monthly used.
--
-- Cohen's Kappa / Lin's CCC are deliberately NOT carried into this table:
-- they're pipeline confidence/QA metadata about how much the underlying
-- sources agreed for a given municipality-month, not a weather signal
-- itself, and nothing outside the weather pipeline (weather_collector.py /
-- weather_daily_classifier.py / weather_loader.py) reads them anywhere in
-- the codebase — the same dead-weight pattern already cleaned up from
-- fact_parish_monthly_financials in migration 077. They remain fully
-- populated and queryable at the layer that actually owns them:
-- reference.weather_monthly_summary.

DROP VIEW IF EXISTS parish_analytics.vw_parish_weather_monthly;

-- Cleans up the wrongly-named table from this migration's first version
-- (fact_parish_weather_monthly), applied and then corrected within the same
-- session before any code depended on it.
DROP TABLE IF EXISTS parish_analytics.fact_parish_weather_monthly;

CREATE TABLE IF NOT EXISTS parish_analytics.agg_parish_weather_monthly (
  parish_key integer NOT NULL REFERENCES parish_analytics.dim_parishes(parish_key) ON DELETE CASCADE,
  date_key integer NOT NULL REFERENCES shared_analytics.dim_date(date_key),
  municipality text NOT NULL,
  year_month date NOT NULL,
  light_rain_days integer,
  moderate_rain_days integer,
  heavy_rain_days integer,
  rain_inconclusive_days integer,
  no_severe_days integer,
  light_weather_days integer,
  moderate_weather_days integer,
  severe_weather_days integer,
  extreme_weather_days integer,
  severe_inconclusive_days integer,
  typhoon_days integer,
  peak_typhoon_signal smallint,
  not_hazardous_days integer,
  caution_days integer,
  extreme_caution_days integer,
  danger_days integer,
  extreme_danger_days integer,
  temp_inconclusive_days integer,
  calm_wind_days integer,
  light_wind_days integer,
  moderate_wind_days integer,
  strong_wind_days integer,
  storm_wind_days integer,
  wind_inconclusive_days integer,
  low_humidity_days integer,
  moderate_humidity_days integer,
  high_humidity_days integer,
  very_high_humidity_days integer,
  humidity_inconclusive_days integer,
  total_days_observed integer,
  data_completeness_pct numeric(5, 2),
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parish_key, date_key)
);

CREATE OR REPLACE FUNCTION parish_analytics.refresh_parish_weather_analytics()
RETURNS TABLE (rows_written integer)
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM parish_analytics.agg_parish_weather_monthly;

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
    dp.parish_key,
    (EXTRACT(YEAR FROM w.year_month)::int * 100 + EXTRACT(MONTH FROM w.year_month)::int),
    w.municipality,
    w.year_month,
    w.light_rain_days, w.moderate_rain_days, w.heavy_rain_days, w.rain_inconclusive_days,
    w.no_severe_days, w.light_weather_days, w.moderate_weather_days, w.severe_weather_days,
    w.extreme_weather_days, w.severe_inconclusive_days, w.typhoon_days, w.peak_typhoon_signal,
    w.not_hazardous_days, w.caution_days, w.extreme_caution_days, w.danger_days, w.extreme_danger_days,
    w.temp_inconclusive_days, w.calm_wind_days, w.light_wind_days, w.moderate_wind_days,
    w.strong_wind_days, w.storm_wind_days, w.wind_inconclusive_days,
    w.low_humidity_days, w.moderate_humidity_days, w.high_humidity_days, w.very_high_humidity_days,
    w.humidity_inconclusive_days, w.total_days_observed, w.data_completeness_pct,
    now()
  FROM parish_analytics.dim_parishes dp
  JOIN shared_analytics.dim_institutions di ON di.institution_key = dp.institution_key
  JOIN reference.weather_monthly_summary w ON w.municipality = di.municipality
  WHERE di.municipality IS NOT NULL;

  RETURN QUERY SELECT count(*)::integer FROM parish_analytics.agg_parish_weather_monthly;
END;
$$;

COMMENT ON TABLE parish_analytics.agg_parish_weather_monthly IS
  'Materialized parish-scoped weather, refreshed by refresh_parish_weather_analytics() (called from weather_loader.py after every confidence-score write, same trigger point liturgical_calendar_loader.py uses for refresh_liturgical_calendar_analytics()). Source of truth remains reference.weather_monthly_summary -- this is a full-refresh downstream copy, not a live join. Cohen''s Kappa / Lin''s CCC confidence columns are intentionally omitted here (no downstream consumer) -- query reference.weather_monthly_summary directly for source-agreement confidence.';

SELECT * FROM parish_analytics.refresh_parish_weather_analytics();
