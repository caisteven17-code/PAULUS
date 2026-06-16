-- Weather pipeline v5: 6 validators for rainfall, 5 for temperature.
--
-- Migration 190 added a 3rd validator per dimension (IMERG for rainfall,
-- Open-Meteo ERA5-Land for temperature) and set validators_agreed 0–3.
-- This migration extends both tables to the full validator set used by the
-- current weather_daily_classifier.py:
--
--   Rainfall (6 validators):
--     CHIRPS, Open-Meteo ERA5-Land, GPM IMERG (from m190),
--     GSMaP NRT (new), ERA5 Full (new), UKMO (new)
--
--   Temperature (5 validators):
--     NOAA GSOD, Open-Meteo ERA5-Land (from m190),
--     ERA5 Full (new), ECMWF IFS (new), UKMO (new)
--
-- agreement_status CHECK constraints are replaced with a POSIX regex that
-- accepts the dynamic "Majority agree (X/N)" / "Minority agree (X/N)"
-- patterns produced by _validate_dimension() at any validator count.
--
-- No TRUNCATE required: new columns are nullable, existing rows remain
-- valid — validators_agreed 0-3 is still within the new 0-6 range.
-- A full collector re-run is needed to populate the new columns.

-- ── weather_rainfall_daily: add GSMaP NRT, ERA5 Full, UKMO columns ───────────

ALTER TABLE reference.weather_rainfall_daily
  ADD COLUMN IF NOT EXISTS gsmap_nrt_rainfall_mm  numeric(14, 2),
  ADD COLUMN IF NOT EXISTS diff_nasa_gsmap_mm      numeric(14, 2),
  ADD COLUMN IF NOT EXISTS gsmap_nrt_raw           jsonb,
  ADD COLUMN IF NOT EXISTS era5_rainfall_mm        numeric(14, 2),
  ADD COLUMN IF NOT EXISTS diff_nasa_era5_mm       numeric(14, 2),
  ADD COLUMN IF NOT EXISTS era5_raw                jsonb,
  ADD COLUMN IF NOT EXISTS ukmo_rainfall_mm        numeric(14, 2),
  ADD COLUMN IF NOT EXISTS diff_nasa_ukmo_mm       numeric(14, 2),
  ADD COLUMN IF NOT EXISTS ukmo_raw                jsonb;

-- Extend validators_agreed to cover 0-6 (6 validators: CHIRPS, ERA5-Land,
-- IMERG, GSMaP NRT, ERA5 Full, UKMO)
ALTER TABLE reference.weather_rainfall_daily
  DROP CONSTRAINT IF EXISTS weather_rainfall_daily_validators_agreed_check;
ALTER TABLE reference.weather_rainfall_daily
  ADD CONSTRAINT weather_rainfall_daily_validators_agreed_check
    CHECK (validators_agreed BETWEEN 0 AND 6);

-- Replace fixed-literal CHECK with a regex that covers all dynamic patterns:
--   "All validators agree"
--   "Majority agree (X/N)"  — agreed >= n//2+1, agreed < n
--   "Minority agree (X/N)"  — 1 < agreed < n//2+1
--   "One validator agrees"
--   "No validators agree"
ALTER TABLE reference.weather_rainfall_daily
  DROP CONSTRAINT IF EXISTS weather_rainfall_daily_agreement_status_check;
ALTER TABLE reference.weather_rainfall_daily
  ADD CONSTRAINT weather_rainfall_daily_agreement_status_check
    CHECK (
      agreement_status ~ '^(All validators agree|Majority agree \(\d+/\d+\)|Minority agree \(\d+/\d+\)|One validator agrees|No validators agree)$'
    );

-- ── weather_temperature_daily: add ERA5 Full, ECMWF IFS, UKMO columns ────────

ALTER TABLE reference.weather_temperature_daily
  ADD COLUMN IF NOT EXISTS era5_temp_c             numeric(6, 2),
  ADD COLUMN IF NOT EXISTS diff_nasa_era5_c        numeric(6, 2),
  ADD COLUMN IF NOT EXISTS era5_temp_raw           jsonb,
  ADD COLUMN IF NOT EXISTS ecmwf_ifs_temp_c        numeric(6, 2),
  ADD COLUMN IF NOT EXISTS diff_nasa_ecmwf_ifs_c   numeric(6, 2),
  ADD COLUMN IF NOT EXISTS ecmwf_ifs_raw           jsonb,
  ADD COLUMN IF NOT EXISTS ukmo_temp_c             numeric(6, 2),
  ADD COLUMN IF NOT EXISTS diff_nasa_ukmo_c        numeric(6, 2),
  ADD COLUMN IF NOT EXISTS ukmo_temp_raw           jsonb;

-- Extend validators_agreed to cover 0-5 (5 validators: GSOD, ERA5-Land,
-- ERA5 Full, ECMWF IFS, UKMO)
ALTER TABLE reference.weather_temperature_daily
  DROP CONSTRAINT IF EXISTS weather_temperature_daily_validators_agreed_check;
ALTER TABLE reference.weather_temperature_daily
  ADD CONSTRAINT weather_temperature_daily_validators_agreed_check
    CHECK (validators_agreed BETWEEN 0 AND 5);

ALTER TABLE reference.weather_temperature_daily
  DROP CONSTRAINT IF EXISTS weather_temperature_daily_agreement_status_check;
ALTER TABLE reference.weather_temperature_daily
  ADD CONSTRAINT weather_temperature_daily_agreement_status_check
    CHECK (
      agreement_status ~ '^(All validators agree|Majority agree \(\d+/\d+\)|Minority agree \(\d+/\d+\)|One validator agrees|No validators agree)$'
    );

-- ── Smoke-test ────────────────────────────────────────────────────────────────

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'reference'
  AND table_name   = 'weather_rainfall_daily'
  AND column_name IN (
    'gsmap_nrt_rainfall_mm', 'diff_nasa_gsmap_mm', 'gsmap_nrt_raw',
    'era5_rainfall_mm',      'diff_nasa_era5_mm',  'era5_raw',
    'ukmo_rainfall_mm',      'diff_nasa_ukmo_mm',  'ukmo_raw'
  )
ORDER BY column_name;

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'reference'
  AND table_name   = 'weather_temperature_daily'
  AND column_name IN (
    'era5_temp_c',      'diff_nasa_era5_c',       'era5_temp_raw',
    'ecmwf_ifs_temp_c', 'diff_nasa_ecmwf_ifs_c',  'ecmwf_ifs_raw',
    'ukmo_temp_c',      'diff_nasa_ukmo_c',        'ukmo_temp_raw'
  )
ORDER BY column_name;
