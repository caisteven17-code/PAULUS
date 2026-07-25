-- Weather pipeline v3: split daily tables, PAGASA advisory classifications,
-- two validators per dimension, and ETCCDI monthly indices. FRESH START.
--
-- Replaces the single reference.weather_daily model (migrations 187/188) with
-- one table per dimension:
--   1. reference.weather_rainfall_daily    — rainfall readings + validation
--   2. reference.weather_temperature_daily — temperature readings + validation
-- reference.weather_daily is DROPPED (no backfill — clean slate). The split
-- tables start EMPTY and are populated by a full collector run:
--   python -m app.services.weather_collector --load
-- which re-fetches the whole period with BOTH validators per dimension
-- (something backfilled history could never have).
-- reference.weather_monthly_summary is reshaped in place (day-count columns
-- replaced for the new categories + 6 new ETCCDI index columns) and stays
-- empty until the collector run rebuilds it.
--
-- Sources per dimension (NASA POWER AG remains the single source of truth):
--   Rainfall    : truth NASA POWER AG, validators CHIRPS + Open-Meteo (ERA5)
--   Temperature : truth NASA POWER AG, validators Meteostat + NOAA GSOD
--
-- Classification thresholds (PAGASA advisory scales; daily-total rainfall
-- thresholds follow the PAGASA rainfall advisory tiers and are expressible as
-- ETCCDI user-defined Rnnmm day-count indices — R60mm / R180mm):
--   rain_classification (daily rainfall total, mm)
--     light         rainfall < 60
--     moderate      60 <= rainfall <= 180
--     heavy         rainfall > 180
--   temp_classification (daily MAXIMUM temperature, C — PAGASA heat advisory
--   tiers applied to daily max temperature, not computed heat index)
--     not_hazardous   max temp < 27
--     caution         27 <= max temp < 33
--     extreme_caution 33 <= max temp < 42
--     danger          42 <= max temp < 52
--     extreme_danger  max temp >= 52
--
-- Agreement (per validator): a validator AGREES with the source of truth when
-- it classifies the day into the SAME category, or when the raw values are
-- within tolerance (10 mm rain, 3 C temperature). Majority rule across the
-- two validators: validators_agreed >= 1  → sources_agree = true → classify
-- from NASA POWER AG; validators_agreed = 0 with at least one validator
-- present → 'inconclusive'. No validator data → NASA's category, unvalidated.
--
-- Monthly confidence (Option A, semantics unchanged from migration 187):
-- each day contributes 0.5 when its rainfall row has sources_agree plus 0.5
-- when its temperature row has sources_agree; averaged over the month.
--
-- ETCCDI monthly index columns (Expert Team on Climate Change Detection and
-- Indices — https://etccdi.pacificclimate.org; applied to Philippine data per
-- Tejada et al. 2023, Atmosphere 14(12):1790, doi:10.3390/atmos14121790):
--   r10mm_days  R10mm  count of days with rainfall >= 10 mm
--   r20mm_days  R20mm  count of days with rainfall >= 20 mm
--   cdd         CDD    max consecutive days with rainfall < 1 mm (within month)
--   cwd         CWD    max consecutive days with rainfall >= 1 mm (within month)
--   rx1day_mm   Rx1day highest single-day rainfall in the month
--   txx_c       TXx    highest daily max temperature in the month
-- ETCCDI columns are computed from the source of truth (NASA POWER AG).

-- ── Drop the legacy combined table (fresh start, no backfill) ─────────────────

DROP TABLE IF EXISTS reference.weather_daily;

-- ── Category helper functions (thresholds live here for SQL-side use) ────────

CREATE OR REPLACE FUNCTION reference.rain_category(p_mm numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_mm IS NULL THEN NULL
    WHEN p_mm < 60 THEN 'light'
    WHEN p_mm <= 180 THEN 'moderate'
    ELSE 'heavy'
  END
$$;

CREATE OR REPLACE FUNCTION reference.heat_category(p_c numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_c IS NULL THEN NULL
    WHEN p_c < 27 THEN 'not_hazardous'
    WHEN p_c < 33 THEN 'caution'
    WHEN p_c < 42 THEN 'extreme_caution'
    WHEN p_c < 52 THEN 'danger'
    ELSE 'extreme_danger'
  END
$$;

-- ── Daily rainfall table (dropped + recreated: guaranteed clean slate) ────────

DROP TABLE IF EXISTS reference.weather_rainfall_daily;

CREATE TABLE reference.weather_rainfall_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  municipality text NOT NULL,

  -- Readings: NASA POWER AG is the source of truth; CHIRPS and Open-Meteo
  -- (ERA5) validate it.
  nasa_power_rainfall_mm numeric(14, 2),
  chirps_rainfall_mm numeric(14, 2),
  open_meteo_rainfall_mm numeric(14, 2),

  -- Absolute difference of each validator vs the source of truth.
  -- NULL when either side has no data for the day.
  diff_nasa_chirps_mm numeric(14, 2),
  diff_nasa_open_meteo_mm numeric(14, 2),

  rain_classification text NOT NULL
    CHECK (rain_classification IN ('light', 'moderate', 'heavy', 'inconclusive')),

  -- How many of the two validators agreed with NASA POWER AG (category match
  -- or raw difference within the 10 mm tolerance).
  validators_agreed smallint NOT NULL DEFAULT 0
    CHECK (validators_agreed BETWEEN 0 AND 2),
  sources_agree boolean NOT NULL DEFAULT false,
  agreement_status text NOT NULL
    CHECK (agreement_status IN ('Both validators agree', 'One validator agrees', 'No validators agree')),

  -- Human-readable explanation: which validators agreed/conflicted, the
  -- actual differences, and the tolerance they were checked against.
  reason text NOT NULL,

  -- Raw API payloads kept for audit / traceability.
  nasa_power_raw jsonb,
  chirps_raw jsonb,
  open_meteo_raw jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_weather_rainfall_daily_date_municipality UNIQUE (date, municipality)
);

CREATE INDEX idx_weather_rainfall_daily_municipality_date
  ON reference.weather_rainfall_daily (municipality, date);

-- ── Daily temperature table (dropped + recreated: guaranteed clean slate) ─────

DROP TABLE IF EXISTS reference.weather_temperature_daily;

CREATE TABLE reference.weather_temperature_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  municipality text NOT NULL,

  -- Readings hold the DAILY MAXIMUM temperature (basis of the PAGASA heat
  -- advisory tiers). NASA POWER AG is the source of truth; Meteostat and
  -- NOAA GSOD validate it.
  nasa_power_temp_c numeric(6, 2),
  meteostat_temp_c numeric(6, 2),
  noaa_gsod_temp_c numeric(6, 2),

  diff_nasa_meteostat_c numeric(6, 2),
  diff_nasa_gsod_c numeric(6, 2),

  temp_classification text NOT NULL
    CHECK (temp_classification IN
           ('not_hazardous', 'caution', 'extreme_caution', 'danger', 'extreme_danger', 'inconclusive')),

  validators_agreed smallint NOT NULL DEFAULT 0
    CHECK (validators_agreed BETWEEN 0 AND 2),
  sources_agree boolean NOT NULL DEFAULT false,
  agreement_status text NOT NULL
    CHECK (agreement_status IN ('Both validators agree', 'One validator agrees', 'No validators agree')),

  reason text NOT NULL,

  nasa_power_raw jsonb,
  meteostat_raw jsonb,
  gsod_raw jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_weather_temperature_daily_date_municipality UNIQUE (date, municipality)
);

CREATE INDEX idx_weather_temperature_daily_municipality_date
  ON reference.weather_temperature_daily (municipality, date);

CREATE TRIGGER set_updated_at_weather_rainfall_daily
BEFORE UPDATE ON reference.weather_rainfall_daily
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

CREATE TRIGGER set_updated_at_weather_temperature_daily
BEFORE UPDATE ON reference.weather_temperature_daily
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- ── Reshape the monthly summary ───────────────────────────────────────────────
-- Old category day-counts are dropped (categories and thresholds changed) and
-- replaced; heavy_rain_days is dropped and re-added because its threshold
-- changed (>= 20 mm → > 180 mm). Derived data only — emptied here, repopulated
-- by rebuild_weather_monthly_summary() after the collector run.

TRUNCATE reference.weather_monthly_summary;

ALTER TABLE reference.weather_monthly_summary
  DROP COLUMN IF EXISTS rain_none_days,
  DROP COLUMN IF EXISTS rainy_days,
  DROP COLUMN IF EXISTS heavy_rain_days,
  DROP COLUMN IF EXISTS normal_temp_days,
  DROP COLUMN IF EXISTS hot_days,
  DROP COLUMN IF EXISTS extreme_heat_days;

ALTER TABLE reference.weather_monthly_summary
  ADD COLUMN IF NOT EXISTS light_rain_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS moderate_rain_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heavy_rain_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS not_hazardous_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS caution_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extreme_caution_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS danger_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extreme_danger_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS r10mm_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS r20mm_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cdd integer,
  ADD COLUMN IF NOT EXISTS cwd integer,
  ADD COLUMN IF NOT EXISTS rx1day_mm numeric(14, 2),
  ADD COLUMN IF NOT EXISTS txx_c numeric(6, 2);

-- ── Rebuild function: aggregate from the two split daily tables ──────────────

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
  v_start date := CASE WHEN p_period_start IS NULL THEN NULL
                       ELSE date_trunc('month', p_period_start)::date END;
  v_end date := CASE WHEN p_period_end IS NULL THEN NULL
                     ELSE (date_trunc('month', p_period_end)
                           + interval '1 month' - interval '1 day')::date END;
BEGIN
  INSERT INTO reference.weather_monthly_summary (
    year_month, municipality,
    light_rain_days, moderate_rain_days, heavy_rain_days, rain_inconclusive_days,
    not_hazardous_days, caution_days, extreme_caution_days, danger_days,
    extreme_danger_days, temp_inconclusive_days,
    r10mm_days, r20mm_days, cdd, cwd, rx1day_mm, txx_c,
    total_days_observed, avg_confidence_score, data_completeness_pct
  )
  WITH days AS (
    -- One row per observed (date, municipality) across both dimensions.
    SELECT
      COALESCE(r.date, t.date) AS date,
      COALESCE(r.municipality, t.municipality) AS municipality,
      r.rain_classification,
      t.temp_classification,
      COALESCE(r.sources_agree, false) AS rain_agree,
      COALESCE(t.sources_agree, false) AS temp_agree,
      r.nasa_power_rainfall_mm AS rain_mm,
      t.nasa_power_temp_c AS temp_c
    FROM reference.weather_rainfall_daily r
    FULL OUTER JOIN reference.weather_temperature_daily t
      ON t.date = r.date AND t.municipality = r.municipality
    WHERE (v_start IS NULL OR COALESCE(r.date, t.date) >= v_start)
      AND (v_end IS NULL OR COALESCE(r.date, t.date) <= v_end)
  ),
  agg AS (
    SELECT
      date_trunc('month', d.date)::date AS year_month,
      d.municipality,
      count(*) FILTER (WHERE d.rain_classification = 'light') AS light_rain_days,
      count(*) FILTER (WHERE d.rain_classification = 'moderate') AS moderate_rain_days,
      count(*) FILTER (WHERE d.rain_classification = 'heavy') AS heavy_rain_days,
      count(*) FILTER (WHERE d.rain_classification = 'inconclusive') AS rain_inconclusive_days,
      count(*) FILTER (WHERE d.temp_classification = 'not_hazardous') AS not_hazardous_days,
      count(*) FILTER (WHERE d.temp_classification = 'caution') AS caution_days,
      count(*) FILTER (WHERE d.temp_classification = 'extreme_caution') AS extreme_caution_days,
      count(*) FILTER (WHERE d.temp_classification = 'danger') AS danger_days,
      count(*) FILTER (WHERE d.temp_classification = 'extreme_danger') AS extreme_danger_days,
      count(*) FILTER (WHERE d.temp_classification = 'inconclusive') AS temp_inconclusive_days,
      -- ETCCDI day-count and extreme indices from the source of truth.
      count(*) FILTER (WHERE d.rain_mm >= 10) AS r10mm_days,
      count(*) FILTER (WHERE d.rain_mm >= 20) AS r20mm_days,
      max(d.rain_mm) AS rx1day_mm,
      max(d.temp_c) AS txx_c,
      count(*) AS total_days_observed,
      round(avg(
        (CASE WHEN d.rain_agree THEN 0.5 ELSE 0 END)
        + (CASE WHEN d.temp_agree THEN 0.5 ELSE 0 END)
      ), 3) AS avg_confidence_score
    FROM days d
    GROUP BY date_trunc('month', d.date)::date, d.municipality
  ),
  -- ETCCDI CDD: longest run of consecutive dry days (< 1 mm), clipped to the
  -- month. Days with no NASA reading break the run (gaps-and-islands on date).
  dry_runs AS (
    SELECT
      date_trunc('month', x.date)::date AS year_month,
      x.municipality,
      count(*) AS run_len
    FROM (
      SELECT
        w.date,
        w.municipality,
        w.date - (row_number() OVER (
          PARTITION BY w.municipality, date_trunc('month', w.date)
          ORDER BY w.date
        ))::int AS grp
      FROM reference.weather_rainfall_daily w
      WHERE w.nasa_power_rainfall_mm IS NOT NULL
        AND w.nasa_power_rainfall_mm < 1
        AND (v_start IS NULL OR w.date >= v_start)
        AND (v_end IS NULL OR w.date <= v_end)
    ) x
    GROUP BY date_trunc('month', x.date)::date, x.municipality, x.grp
  ),
  cdd_agg AS (
    SELECT year_month, municipality, max(run_len)::int AS cdd
    FROM dry_runs
    GROUP BY year_month, municipality
  ),
  -- ETCCDI CWD: longest run of consecutive wet days (>= 1 mm), clipped to the month.
  wet_runs AS (
    SELECT
      date_trunc('month', x.date)::date AS year_month,
      x.municipality,
      count(*) AS run_len
    FROM (
      SELECT
        w.date,
        w.municipality,
        w.date - (row_number() OVER (
          PARTITION BY w.municipality, date_trunc('month', w.date)
          ORDER BY w.date
        ))::int AS grp
      FROM reference.weather_rainfall_daily w
      WHERE w.nasa_power_rainfall_mm IS NOT NULL
        AND w.nasa_power_rainfall_mm >= 1
        AND (v_start IS NULL OR w.date >= v_start)
        AND (v_end IS NULL OR w.date <= v_end)
    ) x
    GROUP BY date_trunc('month', x.date)::date, x.municipality, x.grp
  ),
  cwd_agg AS (
    SELECT year_month, municipality, max(run_len)::int AS cwd
    FROM wet_runs
    GROUP BY year_month, municipality
  )
  SELECT
    g.year_month,
    g.municipality,
    g.light_rain_days,
    g.moderate_rain_days,
    g.heavy_rain_days,
    g.rain_inconclusive_days,
    g.not_hazardous_days,
    g.caution_days,
    g.extreme_caution_days,
    g.danger_days,
    g.extreme_danger_days,
    g.temp_inconclusive_days,
    g.r10mm_days,
    g.r20mm_days,
    cd.cdd,
    cw.cwd,
    g.rx1day_mm,
    g.txx_c,
    g.total_days_observed,
    g.avg_confidence_score,
    round(
      g.total_days_observed::numeric * 100
        / extract(day from g.year_month + interval '1 month' - interval '1 day')::numeric,
      2
    )
  FROM agg g
  LEFT JOIN cdd_agg cd ON cd.year_month = g.year_month AND cd.municipality = g.municipality
  LEFT JOIN cwd_agg cw ON cw.year_month = g.year_month AND cw.municipality = g.municipality
  ON CONFLICT (year_month, municipality) DO UPDATE SET
    light_rain_days = EXCLUDED.light_rain_days,
    moderate_rain_days = EXCLUDED.moderate_rain_days,
    heavy_rain_days = EXCLUDED.heavy_rain_days,
    rain_inconclusive_days = EXCLUDED.rain_inconclusive_days,
    not_hazardous_days = EXCLUDED.not_hazardous_days,
    caution_days = EXCLUDED.caution_days,
    extreme_caution_days = EXCLUDED.extreme_caution_days,
    danger_days = EXCLUDED.danger_days,
    extreme_danger_days = EXCLUDED.extreme_danger_days,
    temp_inconclusive_days = EXCLUDED.temp_inconclusive_days,
    r10mm_days = EXCLUDED.r10mm_days,
    r20mm_days = EXCLUDED.r20mm_days,
    cdd = EXCLUDED.cdd,
    cwd = EXCLUDED.cwd,
    rx1day_mm = EXCLUDED.rx1day_mm,
    txx_c = EXCLUDED.txx_c,
    total_days_observed = EXCLUDED.total_days_observed,
    avg_confidence_score = EXCLUDED.avg_confidence_score,
    data_completeness_pct = EXCLUDED.data_completeness_pct,
    updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA reference TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON reference.weather_rainfall_daily TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON reference.weather_temperature_daily TO service_role;
GRANT EXECUTE ON FUNCTION reference.rebuild_weather_monthly_summary(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION reference.rain_category(numeric) TO service_role;
GRANT EXECUTE ON FUNCTION reference.heat_category(numeric) TO service_role;

-- ── Smoke-test the rebuild function ───────────────────────────────────────────
-- The daily tables start empty, so this returns 0 — it exists to surface any
-- SQL error in the function NOW instead of at the first collector --load run.

SELECT reference.rebuild_weather_monthly_summary(NULL, NULL) AS month_rows_upserted;
