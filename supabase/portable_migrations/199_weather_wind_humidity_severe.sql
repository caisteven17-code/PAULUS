-- Migration 199: Add severe weather, wind, and humidity factors
--
-- Changes:
--   1. Add severe weather columns to reference.weather_rainfall_daily
--      Source of truth : Open-Meteo ERA5-Land weathercode (WMO 0-99)
--      Validators (n=3): ERA5, ECMWF IFS, UKMO weathercode
--      Extra            : IBTrACS typhoon_flag + typhoon_signal (0-5)
--
--   2. Add humidity columns to reference.weather_temperature_daily
--      Source of truth : NASA POWER AG RH2M (nasa_power_rh_pct already exists)
--      Validators (n=2): Open-Meteo ERA5-Land, ERA5
--
--   3. Create reference.weather_wind_daily (new table)
--      Source of truth : NASA POWER AG WS10M
--      Validators (n=4): Open-Meteo ERA5-Land, ERA5, ECMWF IFS, UKMO
--
--   4. Add new columns to reference.weather_monthly_summary
--      Day counts : severe / wind / humidity
--      WCI        : severe_wci, wind_wci, humidity_wci
--      Kappa      : severe_fleiss_kappa, wind_fleiss_kappa, humidity_fleiss_kappa
--      overall_wci: (rain×2 + severe×2 + temp×2 + wind×1 + humidity×1) / 8
--
--   5. Recreate rebuild_weather_monthly_summary() with all five factors
--
-- Classification values:
--   severe_classification → 'no_severe' | 'light_weather' | 'moderate_weather'
--                            'severe_weather' | 'extreme_weather' | 'inconclusive'
--   wind_classification   → 'calm' | 'light' | 'moderate' | 'strong' | 'storm' | 'inconclusive'
--   humidity_classification→ 'low' | 'comfortable' | 'high' | 'very_high' | 'inconclusive'
--
-- WMO weathercode → severe category mapping:
--   0–3   → no_severe      (clear, mainly clear, partly cloudy, overcast)
--   45–61 → light_weather  (fog, drizzle, light rain)
--   63–65, 80–81 → moderate_weather (moderate/heavy rain, rain showers)
--   82, 95       → severe_weather   (violent showers, thunderstorm)
--   96–99        → extreme_weather  (thunderstorm with hail)
--
-- Wind thresholds (m/s):
--   calm     < 3    light  3–7    moderate  7–14
--   strong  14–24   storm ≥ 24
--
-- Humidity thresholds (% RH):
--   low < 40    comfortable 40–60    high 60–80    very_high > 80


-- ── 1. Severe weather columns → weather_rainfall_daily ───────────────────────

ALTER TABLE reference.weather_rainfall_daily
  ADD COLUMN IF NOT EXISTS open_meteo_weathercode   smallint,
  ADD COLUMN IF NOT EXISTS era5_weathercode         smallint,
  ADD COLUMN IF NOT EXISTS ecmwf_ifs_weathercode    smallint,
  ADD COLUMN IF NOT EXISTS ukmo_weathercode         smallint,
  ADD COLUMN IF NOT EXISTS severe_classification    text
    CHECK (severe_classification IN (
      'no_severe','light_weather','moderate_weather',
      'severe_weather','extreme_weather','inconclusive')),
  ADD COLUMN IF NOT EXISTS severe_validators_agreed smallint NOT NULL DEFAULT 0
    CHECK (severe_validators_agreed BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS severe_wmo_quality_flag  text
    CHECK (severe_wmo_quality_flag IN (
      'Correct','Probably Correct','Probably Suspect','Suspect')),
  ADD COLUMN IF NOT EXISTS severe_reason            text,
  ADD COLUMN IF NOT EXISTS typhoon_flag             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS typhoon_signal           smallint NOT NULL DEFAULT 0
    CHECK (typhoon_signal BETWEEN 0 AND 5);


-- ── 2. Humidity columns → weather_temperature_daily ──────────────────────────

ALTER TABLE reference.weather_temperature_daily
  ADD COLUMN IF NOT EXISTS open_meteo_rh_pct            numeric(5,2),
  ADD COLUMN IF NOT EXISTS era5_rh_pct                  numeric(5,2),
  ADD COLUMN IF NOT EXISTS diff_nasa_open_meteo_rh_pct  numeric(5,2),
  ADD COLUMN IF NOT EXISTS diff_nasa_era5_rh_pct        numeric(5,2),
  ADD COLUMN IF NOT EXISTS humidity_classification      text
    CHECK (humidity_classification IN (
      'low','comfortable','high','very_high','inconclusive')),
  ADD COLUMN IF NOT EXISTS humidity_validators_agreed   smallint NOT NULL DEFAULT 0
    CHECK (humidity_validators_agreed BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS humidity_wmo_quality_flag    text
    CHECK (humidity_wmo_quality_flag IN (
      'Correct','Probably Correct','Probably Suspect','Suspect')),
  ADD COLUMN IF NOT EXISTS humidity_reason              text;


-- ── 3. New weather_wind_daily table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reference.weather_wind_daily (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date                          date        NOT NULL,
  municipality                  text        NOT NULL,

  -- Source of truth (NASA POWER AG WS10M — already collected)
  nasa_power_wind_ms            numeric(6,2),

  -- Validators (n=4) — already collected via Open-Meteo windspeed_10m_max
  open_meteo_wind_ms            numeric(6,2),
  era5_wind_ms                  numeric(6,2),
  ecmwf_ifs_wind_ms             numeric(6,2),
  ukmo_wind_ms                  numeric(6,2),

  -- Absolute diff of each validator vs NASA POWER AG
  diff_nasa_open_meteo_wind_ms  numeric(6,2),
  diff_nasa_era5_wind_ms        numeric(6,2),
  diff_nasa_ecmwf_ifs_wind_ms   numeric(6,2),
  diff_nasa_ukmo_wind_ms        numeric(6,2),

  -- Classification & validation
  wind_classification           text        NOT NULL
    CHECK (wind_classification IN (
      'calm','light','moderate','strong','storm','inconclusive')),
  validators_agreed             smallint    NOT NULL DEFAULT 0
    CHECK (validators_agreed BETWEEN 0 AND 4),
  wmo_quality_flag              text        NOT NULL
    CHECK (wmo_quality_flag IN (
      'Correct','Probably Correct','Probably Suspect','Suspect')),
  reason                        text        NOT NULL,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_weather_wind_daily_date_municipality
    UNIQUE (date, municipality)
);

CREATE INDEX IF NOT EXISTS idx_weather_wind_daily_municipality_date
  ON reference.weather_wind_daily (municipality, date);

CREATE TRIGGER set_updated_at_weather_wind_daily
  BEFORE UPDATE ON reference.weather_wind_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON reference.weather_wind_daily TO service_role;


-- ── 4. New columns → weather_monthly_summary ─────────────────────────────────

ALTER TABLE reference.weather_monthly_summary
  -- Severe weather day counts
  ADD COLUMN IF NOT EXISTS no_severe_days             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS light_weather_days         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderate_weather_days      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS severe_weather_days        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extreme_weather_days       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS severe_inconclusive_days   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS typhoon_days               integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_typhoon_signal        smallint NOT NULL DEFAULT 0,
  -- Wind day counts
  ADD COLUMN IF NOT EXISTS calm_wind_days             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS light_wind_days            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderate_wind_days         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strong_wind_days           integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storm_wind_days            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wind_inconclusive_days     integer NOT NULL DEFAULT 0,
  -- Humidity day counts
  ADD COLUMN IF NOT EXISTS low_humidity_days          integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comfortable_humidity_days  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS high_humidity_days         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS very_high_humidity_days    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS humidity_inconclusive_days integer NOT NULL DEFAULT 0,
  -- WCI (computed by SQL rebuild function)
  ADD COLUMN IF NOT EXISTS severe_wci                numeric(5,2),
  ADD COLUMN IF NOT EXISTS wind_wci                  numeric(5,2),
  ADD COLUMN IF NOT EXISTS humidity_wci              numeric(5,2),
  -- Fleiss Kappa (computed by Python after SQL rebuild)
  ADD COLUMN IF NOT EXISTS severe_fleiss_kappa       numeric(6,4),
  ADD COLUMN IF NOT EXISTS wind_fleiss_kappa         numeric(6,4),
  ADD COLUMN IF NOT EXISTS humidity_fleiss_kappa     numeric(6,4);


-- ── 5. Updated rebuild function (all five factors) ───────────────────────────

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
    low_humidity_days, comfortable_humidity_days, high_humidity_days,
    very_high_humidity_days, humidity_inconclusive_days,
    -- Coverage
    total_days_observed, data_completeness_pct,
    -- WCI (rain_fleiss_kappa … humidity_fleiss_kappa populated by Python)
    rain_wci, severe_wci, temp_wci, wind_wci, humidity_wci, overall_wci
  )
  WITH rain_temp AS (
    -- Base join: rainfall + temperature (carry severe + humidity columns)
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
    -- Left-join wind so wind NULLs don't drop rain/temp rows
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
      count(*) FILTER (WHERE c.humidity_classification = 'comfortable') AS comfortable_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'high')        AS high_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'very_high')   AS very_high_humidity_days,
      count(*) FILTER (WHERE c.humidity_classification = 'inconclusive') AS humidity_inconclusive_days,
      count(*)                                                           AS total_days_observed,
      -- Individual WCIs
      round(avg(COALESCE(c.rain_validators_agreed,     0)::numeric / 5) * 100, 2) AS rain_wci,
      round(avg(COALESCE(c.severe_validators_agreed,   0)::numeric / 3) * 100, 2) AS severe_wci,
      round(avg(COALESCE(c.temp_validators_agreed,     0)::numeric / 4) * 100, 2) AS temp_wci,
      round(avg(COALESCE(c.wind_validators_agreed,     0)::numeric / 4) * 100, 2) AS wind_wci,
      round(avg(COALESCE(c.humidity_validators_agreed, 0)::numeric / 2) * 100, 2) AS humidity_wci,
      -- Overall WCI (Option 2: primary×2, secondary×1) / 8
      round(
        (  avg(COALESCE(c.rain_validators_agreed,     0)::numeric / 5) * 2
         + avg(COALESCE(c.severe_validators_agreed,   0)::numeric / 3) * 2
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
    a.low_humidity_days, a.comfortable_humidity_days, a.high_humidity_days,
    a.very_high_humidity_days, a.humidity_inconclusive_days,
    a.total_days_observed,
    round(
      a.total_days_observed::numeric * 100
        / extract(day from a.year_month + interval '1 month' - interval '1 day')::numeric
    , 2) AS data_completeness_pct,
    a.rain_wci, a.severe_wci, a.temp_wci, a.wind_wci, a.humidity_wci, a.overall_wci
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
    not_hazardous_days        = EXCLUDED.not_hazardous_days,
    caution_days              = EXCLUDED.caution_days,
    extreme_caution_days      = EXCLUDED.extreme_caution_days,
    danger_days               = EXCLUDED.danger_days,
    extreme_danger_days       = EXCLUDED.extreme_danger_days,
    temp_inconclusive_days    = EXCLUDED.temp_inconclusive_days,
    calm_wind_days            = EXCLUDED.calm_wind_days,
    light_wind_days           = EXCLUDED.light_wind_days,
    moderate_wind_days        = EXCLUDED.moderate_wind_days,
    strong_wind_days          = EXCLUDED.strong_wind_days,
    storm_wind_days           = EXCLUDED.storm_wind_days,
    wind_inconclusive_days    = EXCLUDED.wind_inconclusive_days,
    low_humidity_days         = EXCLUDED.low_humidity_days,
    comfortable_humidity_days = EXCLUDED.comfortable_humidity_days,
    high_humidity_days        = EXCLUDED.high_humidity_days,
    very_high_humidity_days   = EXCLUDED.very_high_humidity_days,
    humidity_inconclusive_days = EXCLUDED.humidity_inconclusive_days,
    total_days_observed       = EXCLUDED.total_days_observed,
    data_completeness_pct     = EXCLUDED.data_completeness_pct,
    rain_wci                  = EXCLUDED.rain_wci,
    severe_wci                = EXCLUDED.severe_wci,
    temp_wci                  = EXCLUDED.temp_wci,
    wind_wci                  = EXCLUDED.wind_wci,
    humidity_wci              = EXCLUDED.humidity_wci,
    overall_wci               = EXCLUDED.overall_wci,
    updated_at                = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
