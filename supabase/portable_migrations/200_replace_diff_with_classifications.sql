-- Migration 200: Replace diff columns with per-validator classification columns
--               + rename humidity 'comfortable' → 'moderate'
--               + update wind/humidity thresholds to referenced standards
--
-- Rationale:
--   Diff columns (e.g. diff_nasa_chirps_mm) are redundant — the raw values are
--   already stored and the diff can be computed at query time. Per-validator
--   classification columns (e.g. chirps_rain_classification) directly show what
--   category each validator assigned, making agreement/disagreement transparent.
--
--   Humidity 'comfortable' renamed to 'moderate' — thresholds now derived from
--   PAGASA climatological normals (monthly avg range 71% March – 85% September).
--
--   Wind thresholds updated to WMO Beaufort Scale groupings (Forces 0-1/2-3/4-5/6-7/8+).
--
-- Changes:
--   1. weather_rainfall_daily      — DROP 5 diff cols, ADD 5 rain classification cols
--   2. weather_temperature_daily   — DROP 6 diff cols, ADD 4 temp + 2 humidity classification cols
--                                    UPDATE humidity CHECK: 'comfortable' → 'moderate'
--   3. weather_wind_daily          — DROP 4 diff cols, ADD 4 wind classification cols
--   4. weather_monthly_summary     — RENAME comfortable_humidity_days → moderate_humidity_days
--                                    UPDATE rebuild function humidity CHECK constraints


-- ── 1. weather_rainfall_daily ─────────────────────────────────────────────────

ALTER TABLE reference.weather_rainfall_daily
  DROP COLUMN IF EXISTS diff_nasa_chirps_mm,
  DROP COLUMN IF EXISTS diff_nasa_open_meteo_mm,
  DROP COLUMN IF EXISTS diff_nasa_gsmap_mm,
  DROP COLUMN IF EXISTS diff_nasa_era5_mm,
  DROP COLUMN IF EXISTS diff_nasa_ukmo_mm,
  ADD COLUMN IF NOT EXISTS chirps_rain_classification      text
    CHECK (chirps_rain_classification      IN ('light','moderate','heavy','inconclusive')),
  ADD COLUMN IF NOT EXISTS open_meteo_rain_classification  text
    CHECK (open_meteo_rain_classification  IN ('light','moderate','heavy','inconclusive')),
  ADD COLUMN IF NOT EXISTS gsmap_rain_classification       text
    CHECK (gsmap_rain_classification       IN ('light','moderate','heavy','inconclusive')),
  ADD COLUMN IF NOT EXISTS era5_rain_classification        text
    CHECK (era5_rain_classification        IN ('light','moderate','heavy','inconclusive')),
  ADD COLUMN IF NOT EXISTS ukmo_rain_classification        text
    CHECK (ukmo_rain_classification        IN ('light','moderate','heavy','inconclusive'));


-- ── 2. weather_temperature_daily ─────────────────────────────────────────────

ALTER TABLE reference.weather_temperature_daily
  -- Temperature diff columns
  DROP COLUMN IF EXISTS diff_nasa_open_meteo_c,
  DROP COLUMN IF EXISTS diff_nasa_era5_c,
  DROP COLUMN IF EXISTS diff_nasa_ecmwf_ifs_c,
  DROP COLUMN IF EXISTS diff_nasa_ukmo_c,
  -- Humidity diff columns (added in migration 199)
  DROP COLUMN IF EXISTS diff_nasa_open_meteo_rh_pct,
  DROP COLUMN IF EXISTS diff_nasa_era5_rh_pct,
  -- Per-validator temperature classifications
  ADD COLUMN IF NOT EXISTS open_meteo_temp_classification   text
    CHECK (open_meteo_temp_classification  IN ('not_hazardous','caution','extreme_caution','danger','extreme_danger','inconclusive')),
  ADD COLUMN IF NOT EXISTS era5_temp_classification         text
    CHECK (era5_temp_classification        IN ('not_hazardous','caution','extreme_caution','danger','extreme_danger','inconclusive')),
  ADD COLUMN IF NOT EXISTS ecmwf_ifs_temp_classification    text
    CHECK (ecmwf_ifs_temp_classification   IN ('not_hazardous','caution','extreme_caution','danger','extreme_danger','inconclusive')),
  ADD COLUMN IF NOT EXISTS ukmo_temp_classification         text
    CHECK (ukmo_temp_classification        IN ('not_hazardous','caution','extreme_caution','danger','extreme_danger','inconclusive')),
  -- Per-validator humidity classifications
  ADD COLUMN IF NOT EXISTS open_meteo_humidity_classification text
    CHECK (open_meteo_humidity_classification IN ('low','moderate','high','very_high','inconclusive')),
  ADD COLUMN IF NOT EXISTS era5_humidity_classification     text
    CHECK (era5_humidity_classification    IN ('low','moderate','high','very_high','inconclusive'));


-- ── 3. weather_wind_daily ─────────────────────────────────────────────────────

ALTER TABLE reference.weather_wind_daily
  DROP COLUMN IF EXISTS diff_nasa_open_meteo_wind_ms,
  DROP COLUMN IF EXISTS diff_nasa_era5_wind_ms,
  DROP COLUMN IF EXISTS diff_nasa_ecmwf_ifs_wind_ms,
  DROP COLUMN IF EXISTS diff_nasa_ukmo_wind_ms,
  ADD COLUMN IF NOT EXISTS open_meteo_wind_classification   text
    CHECK (open_meteo_wind_classification  IN ('calm','light','moderate','strong','storm','inconclusive')),
  ADD COLUMN IF NOT EXISTS era5_wind_classification         text
    CHECK (era5_wind_classification        IN ('calm','light','moderate','strong','storm','inconclusive')),
  ADD COLUMN IF NOT EXISTS ecmwf_ifs_wind_classification    text
    CHECK (ecmwf_ifs_wind_classification   IN ('calm','light','moderate','strong','storm','inconclusive')),
  ADD COLUMN IF NOT EXISTS ukmo_wind_classification         text
    CHECK (ukmo_wind_classification        IN ('calm','light','moderate','strong','storm','inconclusive'));


-- ── 4. Fix humidity_classification CHECK on weather_temperature_daily ─────────
-- Migration 199 used 'comfortable'; rename to 'moderate' per PAGASA normals.
-- The auto-generated constraint name is <table>_<column>_check.

ALTER TABLE reference.weather_temperature_daily
  DROP CONSTRAINT IF EXISTS weather_temperature_daily_humidity_classification_check;

-- Update existing rows BEFORE adding new constraint (constraint validates on ADD).
UPDATE reference.weather_temperature_daily
SET humidity_classification = 'moderate'
WHERE humidity_classification = 'comfortable';

ALTER TABLE reference.weather_temperature_daily
  ADD CONSTRAINT weather_temperature_daily_humidity_classification_check
    CHECK (humidity_classification IN ('low','moderate','high','very_high','inconclusive'));


-- ── 5. Rename comfortable_humidity_days → moderate_humidity_days ──────────────

ALTER TABLE reference.weather_monthly_summary
  RENAME COLUMN comfortable_humidity_days TO moderate_humidity_days;


-- ── 6. Recreate rebuild function with 'moderate' ──────────────────────────────
-- Full replacement of the function defined in migration 199 — only change is
-- 'comfortable' → 'moderate' in the humidity count filter and column references.

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
    -- Rainfall
    light_rain_days, moderate_rain_days, heavy_rain_days, rain_inconclusive_days,
    -- Severe weather
    no_severe_days, light_weather_days, moderate_weather_days, severe_weather_days,
    extreme_weather_days, severe_inconclusive_days, typhoon_days, peak_typhoon_signal,
    -- Temperature
    not_hazardous_days, caution_days, extreme_caution_days, danger_days,
    extreme_danger_days, temp_inconclusive_days,
    -- Wind
    calm_wind_days, light_wind_days, moderate_wind_days, strong_wind_days,
    storm_wind_days, wind_inconclusive_days,
    -- Humidity
    low_humidity_days, moderate_humidity_days, high_humidity_days,
    very_high_humidity_days, humidity_inconclusive_days,
    -- Coverage
    total_days_observed, data_completeness_pct,
    -- WCI (fleiss kappas populated by Python)
    rain_wci, severe_wci, temp_wci, wind_wci, humidity_wci, overall_wci
  )
  WITH rain_temp AS (
    SELECT
      COALESCE(r.date, t.date)                 AS date,
      COALESCE(r.municipality, t.municipality) AS municipality,
      r.rain_classification,
      r.validators_agreed                      AS rain_validators_agreed,
      r.severe_classification,
      r.severe_validators_agreed,
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
      -- Rainfall day counts
      count(*) FILTER (WHERE c.rain_classification = 'light')            AS light_rain_days,
      count(*) FILTER (WHERE c.rain_classification = 'moderate')         AS moderate_rain_days,
      count(*) FILTER (WHERE c.rain_classification = 'heavy')            AS heavy_rain_days,
      count(*) FILTER (WHERE c.rain_classification = 'inconclusive')     AS rain_inconclusive_days,
      -- Severe weather day counts
      count(*) FILTER (WHERE c.severe_classification = 'no_severe')        AS no_severe_days,
      count(*) FILTER (WHERE c.severe_classification = 'light_weather')    AS light_weather_days,
      count(*) FILTER (WHERE c.severe_classification = 'moderate_weather') AS moderate_weather_days,
      count(*) FILTER (WHERE c.severe_classification = 'severe_weather')   AS severe_weather_days,
      count(*) FILTER (WHERE c.severe_classification = 'extreme_weather')  AS extreme_weather_days,
      count(*) FILTER (WHERE c.severe_classification = 'inconclusive')     AS severe_inconclusive_days,
      count(*) FILTER (WHERE c.typhoon_flag = true)                        AS typhoon_days,
      max(COALESCE(c.typhoon_signal, 0))                                   AS peak_typhoon_signal,
      -- Temperature day counts
      count(*) FILTER (WHERE c.temp_classification = 'not_hazardous')   AS not_hazardous_days,
      count(*) FILTER (WHERE c.temp_classification = 'caution')         AS caution_days,
      count(*) FILTER (WHERE c.temp_classification = 'extreme_caution') AS extreme_caution_days,
      count(*) FILTER (WHERE c.temp_classification = 'danger')          AS danger_days,
      count(*) FILTER (WHERE c.temp_classification = 'extreme_danger')  AS extreme_danger_days,
      count(*) FILTER (WHERE c.temp_classification = 'inconclusive')    AS temp_inconclusive_days,
      -- Wind day counts
      count(*) FILTER (WHERE c.wind_classification = 'calm')            AS calm_wind_days,
      count(*) FILTER (WHERE c.wind_classification = 'light')           AS light_wind_days,
      count(*) FILTER (WHERE c.wind_classification = 'moderate')        AS moderate_wind_days,
      count(*) FILTER (WHERE c.wind_classification = 'strong')          AS strong_wind_days,
      count(*) FILTER (WHERE c.wind_classification = 'storm')           AS storm_wind_days,
      count(*) FILTER (WHERE c.wind_classification = 'inconclusive')    AS wind_inconclusive_days,
      -- Humidity day counts
      count(*) FILTER (WHERE c.humidity_classification = 'low')         AS low_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'moderate')    AS moderate_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'high')        AS high_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'very_high')   AS very_high_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'inconclusive') AS humidity_inconclusive_days,
      count(*)                                                           AS total_days_observed,
      -- Individual WCIs
      round(avg(COALESCE(c.rain_validators_agreed,     0)::numeric / 5) * 100, 2) AS rain_wci,
      round(avg(COALESCE(c.severe_validators_agreed,   0)::numeric / 2) * 100, 2) AS severe_wci,
      round(avg(COALESCE(c.temp_validators_agreed,     0)::numeric / 4) * 100, 2) AS temp_wci,
      round(avg(COALESCE(c.wind_validators_agreed,     0)::numeric / 4) * 100, 2) AS wind_wci,
      round(avg(COALESCE(c.humidity_validators_agreed, 0)::numeric / 2) * 100, 2) AS humidity_wci,
      -- Overall WCI (Option 2: primary×2, secondary×1) / 8
      round(
        (  avg(COALESCE(c.rain_validators_agreed,     0)::numeric / 5) * 2
         + avg(COALESCE(c.severe_validators_agreed,   0)::numeric / 2) * 2
         + avg(COALESCE(c.temp_validators_agreed,     0)::numeric / 4) * 2
         + avg(COALESCE(c.wind_validators_agreed,     0)::numeric / 4)
         + avg(COALESCE(c.humidity_validators_agreed, 0)::numeric / 2)
        ) / 8 * 100
      , 2) AS overall_wci
    FROM combined c
    GROUP BY date_trunc('month', c.date)::date, c.municipality
  )
  SELECT
    a.year_month, a.municipality,
    a.light_rain_days, a.moderate_rain_days, a.heavy_rain_days, a.rain_inconclusive_days,
    a.no_severe_days, a.light_weather_days, a.moderate_weather_days, a.severe_weather_days,
    a.extreme_weather_days, a.severe_inconclusive_days, a.typhoon_days, a.peak_typhoon_signal,
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
    , 2) AS data_completeness_pct,
    a.rain_wci, a.severe_wci, a.temp_wci, a.wind_wci, a.humidity_wci, a.overall_wci
  FROM agg a
  ON CONFLICT (year_month, municipality) DO UPDATE SET
    light_rain_days            = EXCLUDED.light_rain_days,
    moderate_rain_days         = EXCLUDED.moderate_rain_days,
    heavy_rain_days            = EXCLUDED.heavy_rain_days,
    rain_inconclusive_days     = EXCLUDED.rain_inconclusive_days,
    no_severe_days             = EXCLUDED.no_severe_days,
    light_weather_days         = EXCLUDED.light_weather_days,
    moderate_weather_days      = EXCLUDED.moderate_weather_days,
    severe_weather_days        = EXCLUDED.severe_weather_days,
    extreme_weather_days       = EXCLUDED.extreme_weather_days,
    severe_inconclusive_days   = EXCLUDED.severe_inconclusive_days,
    typhoon_days               = EXCLUDED.typhoon_days,
    peak_typhoon_signal        = EXCLUDED.peak_typhoon_signal,
    not_hazardous_days         = EXCLUDED.not_hazardous_days,
    caution_days               = EXCLUDED.caution_days,
    extreme_caution_days       = EXCLUDED.extreme_caution_days,
    danger_days                = EXCLUDED.danger_days,
    extreme_danger_days        = EXCLUDED.extreme_danger_days,
    temp_inconclusive_days     = EXCLUDED.temp_inconclusive_days,
    calm_wind_days             = EXCLUDED.calm_wind_days,
    light_wind_days            = EXCLUDED.light_wind_days,
    moderate_wind_days         = EXCLUDED.moderate_wind_days,
    strong_wind_days           = EXCLUDED.strong_wind_days,
    storm_wind_days            = EXCLUDED.storm_wind_days,
    wind_inconclusive_days     = EXCLUDED.wind_inconclusive_days,
    low_humidity_days          = EXCLUDED.low_humidity_days,
    moderate_humidity_days     = EXCLUDED.moderate_humidity_days,
    high_humidity_days         = EXCLUDED.high_humidity_days,
    very_high_humidity_days    = EXCLUDED.very_high_humidity_days,
    humidity_inconclusive_days = EXCLUDED.humidity_inconclusive_days,
    total_days_observed        = EXCLUDED.total_days_observed,
    data_completeness_pct      = EXCLUDED.data_completeness_pct,
    rain_wci                   = EXCLUDED.rain_wci,
    severe_wci                 = EXCLUDED.severe_wci,
    temp_wci                   = EXCLUDED.temp_wci,
    wind_wci                   = EXCLUDED.wind_wci,
    humidity_wci               = EXCLUDED.humidity_wci,
    overall_wci                = EXCLUDED.overall_wci,
    updated_at                 = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION reference.rebuild_weather_monthly_summary(date, date) TO service_role;


-- ── 7. Fix severe_validators_agreed CHECK (UKMO removed → max is now 2) ───────
-- Migration 199 set CHECK (severe_validators_agreed BETWEEN 0 AND 3) for 3
-- validators. UKMO is now excluded from severe weather validation, so max is 2.

ALTER TABLE reference.weather_rainfall_daily
  DROP CONSTRAINT IF EXISTS weather_rainfall_daily_severe_validators_agreed_check;

ALTER TABLE reference.weather_rainfall_daily
  ADD CONSTRAINT weather_rainfall_daily_severe_validators_agreed_check
    CHECK (severe_validators_agreed BETWEEN 0 AND 2);

-- Reset any existing rows that stored 3 (full agreement under old 3-validator
-- system) — they will be recomputed when the collector re-runs.
UPDATE reference.weather_rainfall_daily
SET severe_validators_agreed = LEAST(severe_validators_agreed, 2)
WHERE severe_validators_agreed > 2;
