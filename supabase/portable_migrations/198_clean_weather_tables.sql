-- Migration 198: Clean weather tables — fresh start
--
-- Changes:
--   1. Drop and recreate reference.weather_rainfall_daily
--      Validators (n=5): CHIRPS, Open-Meteo, GSMaP NRT, ERA5, UKMO
--      Removed: GPM IMERG (61% missing data)
--      Removed columns: sources_agree, wmo_quality_flag was kept, agreement_status,
--                       all raw JSON columns
--
--   2. Drop and recreate reference.weather_temperature_daily
--      Validators (n=4): Open-Meteo, ERA5, ECMWF IFS, UKMO
--      Removed: NOAA GSOD (9,000 missing days, highest avg diff)
--      Removed columns: sources_agree, agreement_status, all raw JSON columns
--
--   3. Drop and recreate reference.weather_monthly_summary
--      Removed: avg_confidence_score, r10mm_days, r20mm_days, cdd, cwd, rx1day_mm, txx_c
--      Added: rain_wci, temp_wci, overall_wci, rain_fleiss_kappa, temp_fleiss_kappa
--
--   4. Recreate rebuild_weather_monthly_summary() with WCI-based aggregation
--      rain_wci  = avg(validators_agreed / 5) * 100  (5 rainfall validators)
--      temp_wci  = avg(validators_agreed / 4) * 100  (4 temperature validators)
--      overall_wci = (rain_wci + temp_wci) / 2
--      rain_fleiss_kappa / temp_fleiss_kappa = populated by Python collector


-- ── 1. Rainfall daily ─────────────────────────────────────────────────────────

DROP TABLE IF EXISTS reference.weather_rainfall_daily;

CREATE TABLE reference.weather_rainfall_daily (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date                    date        NOT NULL,
  municipality            text        NOT NULL,

  -- Source of truth
  nasa_power_rainfall_mm  numeric(14,2),

  -- Validators (n=5)
  chirps_rainfall_mm      numeric(14,2),
  open_meteo_rainfall_mm  numeric(14,2),
  gsmap_nrt_rainfall_mm   numeric(14,2),
  era5_rainfall_mm        numeric(14,2),
  ukmo_rainfall_mm        numeric(14,2),

  -- Absolute diff of each validator vs NASA POWER AG
  diff_nasa_chirps_mm     numeric(14,2),
  diff_nasa_open_meteo_mm numeric(14,2),
  diff_nasa_gsmap_mm      numeric(14,2),
  diff_nasa_era5_mm       numeric(14,2),
  diff_nasa_ukmo_mm       numeric(14,2),

  -- Classification & validation
  rain_classification     text        NOT NULL
    CHECK (rain_classification IN ('light', 'moderate', 'heavy', 'inconclusive')),
  validators_agreed       smallint    NOT NULL DEFAULT 0
    CHECK (validators_agreed BETWEEN 0 AND 5),
  wmo_quality_flag        text        NOT NULL
    CHECK (wmo_quality_flag IN ('Correct', 'Probably Correct', 'Probably Suspect', 'Suspect')),
  reason                  text        NOT NULL,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_weather_rainfall_daily_date_municipality
    UNIQUE (date, municipality)
);

CREATE INDEX idx_weather_rainfall_daily_municipality_date
  ON reference.weather_rainfall_daily (municipality, date);

CREATE TRIGGER set_updated_at_weather_rainfall_daily
  BEFORE UPDATE ON reference.weather_rainfall_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();


-- ── 2. Temperature daily ──────────────────────────────────────────────────────

DROP TABLE IF EXISTS reference.weather_temperature_daily;

CREATE TABLE reference.weather_temperature_daily (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date                    date        NOT NULL,
  municipality            text        NOT NULL,

  -- Source of truth (raw temp + derived heat index + humidity)
  nasa_power_temp_c       numeric(6,2),
  nasa_power_heat_index_c numeric(6,2),
  nasa_power_rh_pct       numeric(5,2),

  -- Validators (n=4)
  open_meteo_temp_c       numeric(6,2),
  era5_temp_c             numeric(6,2),
  ecmwf_ifs_temp_c        numeric(6,2),
  ukmo_temp_c             numeric(6,2),

  -- Absolute diff of each validator vs NASA POWER AG
  diff_nasa_open_meteo_c  numeric(6,2),
  diff_nasa_era5_c        numeric(6,2),
  diff_nasa_ecmwf_ifs_c   numeric(6,2),
  diff_nasa_ukmo_c        numeric(6,2),

  -- Classification & validation
  temp_classification     text        NOT NULL
    CHECK (temp_classification IN
           ('not_hazardous', 'caution', 'extreme_caution', 'danger', 'extreme_danger', 'inconclusive')),
  validators_agreed       smallint    NOT NULL DEFAULT 0
    CHECK (validators_agreed BETWEEN 0 AND 4),
  wmo_quality_flag        text        NOT NULL
    CHECK (wmo_quality_flag IN ('Correct', 'Probably Correct', 'Probably Suspect', 'Suspect')),
  reason                  text        NOT NULL,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_weather_temperature_daily_date_municipality
    UNIQUE (date, municipality)
);

CREATE INDEX idx_weather_temperature_daily_municipality_date
  ON reference.weather_temperature_daily (municipality, date);

CREATE TRIGGER set_updated_at_weather_temperature_daily
  BEFORE UPDATE ON reference.weather_temperature_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();


-- ── 3. Monthly summary ────────────────────────────────────────────────────────

DROP TABLE IF EXISTS reference.weather_monthly_summary;

CREATE TABLE reference.weather_monthly_summary (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month            date        NOT NULL,
  municipality          text        NOT NULL,

  -- Rainfall day counts
  light_rain_days       integer     NOT NULL DEFAULT 0,
  moderate_rain_days    integer     NOT NULL DEFAULT 0,
  heavy_rain_days       integer     NOT NULL DEFAULT 0,
  rain_inconclusive_days integer    NOT NULL DEFAULT 0,

  -- Temperature day counts
  not_hazardous_days    integer     NOT NULL DEFAULT 0,
  caution_days          integer     NOT NULL DEFAULT 0,
  extreme_caution_days  integer     NOT NULL DEFAULT 0,
  danger_days           integer     NOT NULL DEFAULT 0,
  extreme_danger_days   integer     NOT NULL DEFAULT 0,
  temp_inconclusive_days integer    NOT NULL DEFAULT 0,

  -- Coverage
  total_days_observed   integer     NOT NULL DEFAULT 0,
  data_completeness_pct numeric(5,2),

  -- Confidence metrics (WCI computed by SQL rebuild; Fleiss Kappa by Python)
  rain_wci              numeric(5,2),
  temp_wci              numeric(5,2),
  overall_wci           numeric(5,2),
  rain_fleiss_kappa     numeric(6,4),
  temp_fleiss_kappa     numeric(6,4),

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_weather_monthly_summary_year_month_municipality
    UNIQUE (year_month, municipality)
);

CREATE INDEX idx_weather_monthly_summary_municipality_year_month
  ON reference.weather_monthly_summary (municipality, year_month);

CREATE TRIGGER set_updated_at_weather_monthly_summary
  BEFORE UPDATE ON reference.weather_monthly_summary
  FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();


-- ── 4. Rebuild function ───────────────────────────────────────────────────────

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
    not_hazardous_days, caution_days, extreme_caution_days, danger_days,
    extreme_danger_days, temp_inconclusive_days,
    total_days_observed, data_completeness_pct,
    rain_wci, temp_wci, overall_wci
    -- rain_fleiss_kappa, temp_fleiss_kappa populated separately by Python
  )
  WITH days AS (
    SELECT
      COALESCE(r.date, t.date)                             AS date,
      COALESCE(r.municipality, t.municipality)             AS municipality,
      r.rain_classification,
      t.temp_classification,
      r.validators_agreed                                  AS rain_validators_agreed,
      t.validators_agreed                                  AS temp_validators_agreed
    FROM reference.weather_rainfall_daily r
    FULL OUTER JOIN reference.weather_temperature_daily t
      ON t.date = r.date AND t.municipality = r.municipality
    WHERE (v_start IS NULL OR COALESCE(r.date, t.date) >= v_start)
      AND (v_end   IS NULL OR COALESCE(r.date, t.date) <= v_end)
  ),
  agg AS (
    SELECT
      date_trunc('month', d.date)::date                   AS year_month,
      d.municipality,
      count(*) FILTER (WHERE d.rain_classification = 'light')            AS light_rain_days,
      count(*) FILTER (WHERE d.rain_classification = 'moderate')         AS moderate_rain_days,
      count(*) FILTER (WHERE d.rain_classification = 'heavy')            AS heavy_rain_days,
      count(*) FILTER (WHERE d.rain_classification = 'inconclusive')     AS rain_inconclusive_days,
      count(*) FILTER (WHERE d.temp_classification = 'not_hazardous')    AS not_hazardous_days,
      count(*) FILTER (WHERE d.temp_classification = 'caution')          AS caution_days,
      count(*) FILTER (WHERE d.temp_classification = 'extreme_caution')  AS extreme_caution_days,
      count(*) FILTER (WHERE d.temp_classification = 'danger')           AS danger_days,
      count(*) FILTER (WHERE d.temp_classification = 'extreme_danger')   AS extreme_danger_days,
      count(*) FILTER (WHERE d.temp_classification = 'inconclusive')     AS temp_inconclusive_days,
      count(*)                                                            AS total_days_observed,
      -- WCI: validators_agreed / n_validators * 100
      -- Rainfall n=5, Temperature n=4
      round(avg(COALESCE(d.rain_validators_agreed, 0)::numeric / 5) * 100, 2) AS rain_wci,
      round(avg(COALESCE(d.temp_validators_agreed, 0)::numeric / 4) * 100, 2) AS temp_wci,
      round(
        (avg(COALESCE(d.rain_validators_agreed, 0)::numeric / 5)
         + avg(COALESCE(d.temp_validators_agreed, 0)::numeric / 4)) / 2 * 100
      , 2)                                                                AS overall_wci
    FROM days d
    GROUP BY date_trunc('month', d.date)::date, d.municipality
  )
  SELECT
    a.year_month, a.municipality,
    a.light_rain_days, a.moderate_rain_days, a.heavy_rain_days, a.rain_inconclusive_days,
    a.not_hazardous_days, a.caution_days, a.extreme_caution_days, a.danger_days,
    a.extreme_danger_days, a.temp_inconclusive_days,
    a.total_days_observed,
    round(
      a.total_days_observed::numeric * 100
        / extract(day from a.year_month + interval '1 month' - interval '1 day')::numeric
    , 2)                                                                  AS data_completeness_pct,
    a.rain_wci,
    a.temp_wci,
    a.overall_wci
  FROM agg a
  ON CONFLICT (year_month, municipality) DO UPDATE SET
    light_rain_days        = EXCLUDED.light_rain_days,
    moderate_rain_days     = EXCLUDED.moderate_rain_days,
    heavy_rain_days        = EXCLUDED.heavy_rain_days,
    rain_inconclusive_days = EXCLUDED.rain_inconclusive_days,
    not_hazardous_days     = EXCLUDED.not_hazardous_days,
    caution_days           = EXCLUDED.caution_days,
    extreme_caution_days   = EXCLUDED.extreme_caution_days,
    danger_days            = EXCLUDED.danger_days,
    extreme_danger_days    = EXCLUDED.extreme_danger_days,
    temp_inconclusive_days = EXCLUDED.temp_inconclusive_days,
    total_days_observed    = EXCLUDED.total_days_observed,
    data_completeness_pct  = EXCLUDED.data_completeness_pct,
    rain_wci               = EXCLUDED.rain_wci,
    temp_wci               = EXCLUDED.temp_wci,
    overall_wci            = EXCLUDED.overall_wci,
    updated_at             = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
