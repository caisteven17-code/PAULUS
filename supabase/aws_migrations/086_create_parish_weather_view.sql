-- Parish-scoped weather view: parish-facing code can query this directly,
-- keyed by (parish_key, date_key) exactly like fact_parish_monthly_financials
-- and vw_parish_monthly_financials_liturgical, without needing to know that
-- the underlying weather data physically lives in reference (municipality-
-- grain, not institution-grain) or resolve the municipality bridge itself.
-- date_key here is derived from weather_monthly_summary.year_month (date) to
-- match the YYYYMM integer convention the Gold fact tables already use.
--
-- Only 91/92 parishes resolve a municipality today (1 parish has no lat/lon
-- in the source system — a pre-existing geocoding gap, out of scope here);
-- that parish simply won't appear in this view until its location is fixed
-- at the source.

CREATE VIEW parish_analytics.vw_parish_weather_monthly AS
SELECT
    dp.parish_key,
    (EXTRACT(YEAR FROM w.year_month)::int * 100 + EXTRACT(MONTH FROM w.year_month)::int) AS date_key,
    w.municipality,
    w.year_month,
    w.light_rain_days,
    w.moderate_rain_days,
    w.heavy_rain_days,
    w.rain_inconclusive_days,
    w.no_severe_days,
    w.light_weather_days,
    w.moderate_weather_days,
    w.severe_weather_days,
    w.extreme_weather_days,
    w.severe_inconclusive_days,
    w.typhoon_days,
    w.peak_typhoon_signal,
    w.not_hazardous_days,
    w.caution_days,
    w.extreme_caution_days,
    w.danger_days,
    w.extreme_danger_days,
    w.temp_inconclusive_days,
    w.calm_wind_days,
    w.light_wind_days,
    w.moderate_wind_days,
    w.strong_wind_days,
    w.storm_wind_days,
    w.wind_inconclusive_days,
    w.low_humidity_days,
    w.moderate_humidity_days,
    w.high_humidity_days,
    w.very_high_humidity_days,
    w.humidity_inconclusive_days,
    w.total_days_observed,
    w.data_completeness_pct,
    w.rain_cohens_kappa,
    w.rain_lins_ccc,
    w.severe_cohens_kappa,
    w.temp_cohens_kappa,
    w.temp_lins_ccc,
    w.humidity_cohens_kappa,
    w.humidity_lins_ccc,
    w.wind_cohens_kappa,
    w.wind_lins_ccc
FROM parish_analytics.dim_parishes dp
JOIN shared_analytics.dim_institutions di ON di.institution_key = dp.institution_key
JOIN reference.weather_monthly_summary w ON w.municipality = di.municipality
WHERE di.municipality IS NOT NULL;

COMMENT ON VIEW parish_analytics.vw_parish_weather_monthly IS
  'Parish-scoped weather, keyed by (parish_key, date_key) to match fact_parish_monthly_financials. Bridges through dim_parishes -> dim_institutions.municipality -> reference.weather_monthly_summary. No data movement — weather stays in reference, this is a convenience join only.';
