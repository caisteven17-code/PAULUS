-- Weather pipeline v2: daily classification + monthly aggregation.
--
-- Two-stage pipeline replacing the single-table model in
-- reference.weather_observations (kept as-is; this migration is additive):
--   1. reference.weather_daily — one row per (date, municipality). Stores the
--      source-of-truth readings (NASA POWER AG), validator readings (CHIRPS
--      for rainfall, Meteostat for temperature), the per-dimension
--      classifications, and a source-agreement confidence score.
--   2. reference.weather_monthly_summary — one row per (month, municipality).
--      Pure day-counts aggregated from weather_daily, consumed by the IAFR
--      context-awareness feature store.
--
-- Classification thresholds (PAGASA-based), applied to the NASA POWER AG
-- value when the sources agree:
--   rain_classification (daily rainfall total)
--     none          rainfall < 1 mm
--     rainy         1 mm <= rainfall < 20 mm
--     heavy_rain    rainfall >= 20 mm
--   temp_classification (daily MAXIMUM temperature)
--     normal        max temp < 33 C
--     hot           33 C <= max temp < 42 C
--     extreme_heat  max temp >= 42 C
--
-- Source agreement (category rule): truth and validator AGREE when they
-- classify the day into the same category, or when their raw values are
-- within tolerance (10 mm rain, 3 C temp). Both present and neither holds
-- → the sources conflict → 'inconclusive'. No data at all → 'inconclusive'.
--
-- confidence_score: 1.0 when both dimensions agree, 0.5 when one agrees,
-- 0.0 when neither agrees.

CREATE TABLE IF NOT EXISTS reference.weather_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  municipality text NOT NULL,

  -- Readings. NASA POWER AG is the source of truth for both dimensions;
  -- CHIRPS validates rainfall, Meteostat validates temperature.
  -- Temperature columns hold the DAILY MAXIMUM (basis of hot-day counts).
  nasa_power_rainfall_mm numeric(14, 2),
  chirps_rainfall_mm numeric(14, 2),
  nasa_power_temp_c numeric(6, 2),
  meteostat_temp_c numeric(6, 2),

  -- Raw API payloads kept for audit / traceability.
  nasa_power_raw jsonb,
  chirps_raw jsonb,
  meteostat_raw jsonb,

  -- Final per-dimension classifications.
  rain_classification text NOT NULL
    CHECK (rain_classification IN ('none', 'rainy', 'heavy_rain', 'inconclusive')),
  temp_classification text NOT NULL
    CHECK (temp_classification IN ('normal', 'hot', 'extreme_heat', 'inconclusive')),

  -- Source agreement: validator within tolerance of the source truth.
  sources_agree_rain boolean NOT NULL DEFAULT false,
  sources_agree_temp boolean NOT NULL DEFAULT false,
  confidence_score numeric(4, 3) NOT NULL DEFAULT 0
    CHECK (confidence_score >= 0 AND confidence_score <= 1),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_weather_daily_date_municipality UNIQUE (date, municipality)
);

CREATE INDEX IF NOT EXISTS idx_weather_daily_municipality_date
  ON reference.weather_daily (municipality, date);

CREATE TABLE IF NOT EXISTS reference.weather_monthly_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- First day of the month, e.g. 2025-06-01.
  year_month date NOT NULL
    CHECK (year_month = date_trunc('month', year_month)::date),
  municipality text NOT NULL,

  -- Rain day counts (from weather_daily.rain_classification).
  rain_none_days integer NOT NULL DEFAULT 0,
  rainy_days integer NOT NULL DEFAULT 0,
  heavy_rain_days integer NOT NULL DEFAULT 0,
  rain_inconclusive_days integer NOT NULL DEFAULT 0,

  -- Temperature day counts (from weather_daily.temp_classification).
  normal_temp_days integer NOT NULL DEFAULT 0,
  hot_days integer NOT NULL DEFAULT 0,
  extreme_heat_days integer NOT NULL DEFAULT 0,
  temp_inconclusive_days integer NOT NULL DEFAULT 0,

  total_days_observed integer NOT NULL DEFAULT 0,
  avg_confidence_score numeric(4, 3)
    CHECK (avg_confidence_score IS NULL
           OR (avg_confidence_score >= 0 AND avg_confidence_score <= 1)),
  data_completeness_pct numeric(5, 2)
    CHECK (data_completeness_pct IS NULL
           OR (data_completeness_pct >= 0 AND data_completeness_pct <= 100)),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_weather_monthly_month_municipality UNIQUE (year_month, municipality)
);

CREATE INDEX IF NOT EXISTS idx_weather_monthly_municipality_month
  ON reference.weather_monthly_summary (municipality, year_month);

DROP TRIGGER IF EXISTS set_updated_at_weather_daily ON reference.weather_daily;
CREATE TRIGGER set_updated_at_weather_daily
BEFORE UPDATE ON reference.weather_daily
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_weather_monthly_summary ON reference.weather_monthly_summary;
CREATE TRIGGER set_updated_at_weather_monthly_summary
BEFORE UPDATE ON reference.weather_monthly_summary
FOR EACH ROW EXECUTE FUNCTION public.set_row_updated_at();

-- Canonical monthly aggregation. Upserts one summary row per
-- (month, municipality) from weather_daily for every month touched by the
-- given period (both bounds optional — NULL means unbounded). Idempotent:
-- safe to re-run after daily rows are inserted or corrected.
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

GRANT USAGE ON SCHEMA reference TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON reference.weather_daily TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON reference.weather_monthly_summary TO service_role;
GRANT EXECUTE ON FUNCTION reference.rebuild_weather_monthly_summary(date, date) TO service_role;
