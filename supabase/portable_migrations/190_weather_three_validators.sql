-- Weather pipeline v4: three validators per dimension.
--
-- Migration 189 had two validators per dimension (2-validator majority rule).
-- This migration extends both split daily tables to support THREE validators:
--
--   Rainfall    : truth NASA POWER AG, validators CHIRPS + Open-Meteo ERA5-Land
--                 + GPM IMERG (new — Huffman et al. 2023, doi:10.5067/GPM/IMERG/3B-DAY/07)
--   Temperature : truth NASA POWER AG, validators Meteostat + NOAA GSOD
--                 + Open-Meteo ERA5-Land (new — also provides independent ERA5 reanalysis)
--
-- Temperature classification now uses the COMPUTED HEAT INDEX (Rothfusz, 1990)
-- rather than raw air temperature, matching PAGASA's operational advisory practice
-- (PAGASA Heat Index, https://www.pagasa.dost.gov.ph/weather/heat-index).
-- NASA POWER AG's RH2M parameter supplies the relative humidity for the formula.
-- Validator agreement still uses raw temp_max_c for numerical comparison.
--
-- Agreement status updated from 2-level to 4-level (majority rule: >= 2 of 3):
--   All validators agree      (3/3) → sources_agree = true
--   Majority agree (2/3)      (2/3) → sources_agree = true
--   One validator agrees      (1/3) → sources_agree = false
--   No validators agree       (0/3) → sources_agree = false
--
-- A new wmo_quality_flag column maps to WMO No. 1269 (2020) quality flags:
--   'Correct', 'Probably Correct', 'Probably Suspect', 'Suspect'
--
-- Changes required for the collector re-run:
--   1. python -m app.services.weather_collector --load
--      (fetches full 3-year period with all three validators per dimension)
--      GPM IMERG requires EARTHDATA_BEARER_TOKEN env var — see weather_daily_classifier.py.
--
-- IMPORTANT: The daily tables are TRUNCATED here because 2-validator rows are
-- incompatible with the new 3-validator CHECK constraints (validators_agreed
-- allowed 0-2 is now 0-3, and the agreement_status values changed). A full
-- re-run is required after applying this migration.

-- ── weather_rainfall_daily: add GPM IMERG 3rd validator columns ──────────────

ALTER TABLE reference.weather_rainfall_daily
  ADD COLUMN IF NOT EXISTS imerg_rainfall_mm    numeric(14, 2),
  ADD COLUMN IF NOT EXISTS diff_nasa_imerg_mm   numeric(14, 2),
  ADD COLUMN IF NOT EXISTS imerg_raw            jsonb,
  ADD COLUMN IF NOT EXISTS wmo_quality_flag     text;

-- ── weather_temperature_daily: add Open-Meteo 3rd validator + heat index ─────

ALTER TABLE reference.weather_temperature_daily
  ADD COLUMN IF NOT EXISTS open_meteo_temp_c      numeric(6, 2),
  ADD COLUMN IF NOT EXISTS diff_nasa_open_meteo_c numeric(6, 2),
  ADD COLUMN IF NOT EXISTS open_meteo_temp_raw    jsonb,
  ADD COLUMN IF NOT EXISTS nasa_power_heat_index_c numeric(6, 2),
  ADD COLUMN IF NOT EXISTS nasa_power_rh_pct       numeric(6, 2),
  ADD COLUMN IF NOT EXISTS wmo_quality_flag        text;

-- ── Truncate: 2-validator rows are incompatible with new constraints ──────────
-- (agreement_status labels changed; validators_agreed upper bound changed to 3)

TRUNCATE reference.weather_rainfall_daily;
TRUNCATE reference.weather_temperature_daily;
TRUNCATE reference.weather_monthly_summary;

-- ── Update CHECK constraints: validators_agreed 0-3, new status labels ────────

ALTER TABLE reference.weather_rainfall_daily
  DROP CONSTRAINT IF EXISTS weather_rainfall_daily_validators_agreed_check;
ALTER TABLE reference.weather_rainfall_daily
  ADD CONSTRAINT weather_rainfall_daily_validators_agreed_check
    CHECK (validators_agreed BETWEEN 0 AND 3);

ALTER TABLE reference.weather_rainfall_daily
  DROP CONSTRAINT IF EXISTS weather_rainfall_daily_agreement_status_check;
ALTER TABLE reference.weather_rainfall_daily
  ADD CONSTRAINT weather_rainfall_daily_agreement_status_check
    CHECK (agreement_status IN (
      'All validators agree',
      'Majority agree (2/3)',
      'One validator agrees',
      'No validators agree'
    ));

ALTER TABLE reference.weather_temperature_daily
  DROP CONSTRAINT IF EXISTS weather_temperature_daily_validators_agreed_check;
ALTER TABLE reference.weather_temperature_daily
  ADD CONSTRAINT weather_temperature_daily_validators_agreed_check
    CHECK (validators_agreed BETWEEN 0 AND 3);

ALTER TABLE reference.weather_temperature_daily
  DROP CONSTRAINT IF EXISTS weather_temperature_daily_agreement_status_check;
ALTER TABLE reference.weather_temperature_daily
  ADD CONSTRAINT weather_temperature_daily_agreement_status_check
    CHECK (agreement_status IN (
      'All validators agree',
      'Majority agree (2/3)',
      'One validator agrees',
      'No validators agree'
    ));

-- ── Update heat_category() comment: now applied to computed heat index ────────
-- The function signature and thresholds are unchanged; only the calling context
-- changes — the Python classifier now passes computed heat index (Rothfusz 1990)
-- rather than raw temp_max_c. The SQL function is kept for view/report use.

CREATE OR REPLACE FUNCTION reference.heat_category(p_c numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- Applied to COMPUTED HEAT INDEX (Rothfusz 1990), not raw air temperature.
  -- Thresholds are PAGASA Heat Index advisory tiers
  -- (https://www.pagasa.dost.gov.ph/weather/heat-index).
  SELECT CASE
    WHEN p_c IS NULL THEN NULL
    WHEN p_c < 27 THEN 'not_hazardous'
    WHEN p_c < 33 THEN 'caution'
    WHEN p_c < 42 THEN 'extreme_caution'
    WHEN p_c < 52 THEN 'danger'
    ELSE 'extreme_danger'
  END
$$;

-- ── Smoke-test ────────────────────────────────────────────────────────────────

SELECT reference.rebuild_weather_monthly_summary(NULL, NULL) AS month_rows_upserted;
