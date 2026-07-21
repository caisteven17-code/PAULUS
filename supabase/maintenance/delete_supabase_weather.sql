-- PERMANENTLY remove the retired weather copy from Supabase.
--
-- Preconditions:
--   1. AWS reference weather tables have already been reconciled and backed up.
--   2. Weather collectors/loaders write to AWS through ANALYTICS_DB_URL.
--
-- This intentionally DOES NOT drop the `reference` schema because that schema
-- also contains operational/reference objects such as the liturgical calendar.
-- The statements cover both possible locations: the normal `reference` schema
-- and the reversible-quarantine `retired_analytics` schema.

BEGIN;

-- Remove the Supabase-only weather rollup function before its source tables.
DROP FUNCTION IF EXISTS reference.rebuild_weather_monthly_summary(date, date);
DROP FUNCTION IF EXISTS retired_analytics.rebuild_weather_monthly_summary(date, date);

-- Current and legacy quarantined weather tables.
DROP TABLE IF EXISTS retired_analytics.weather_monthly_summary CASCADE;
DROP TABLE IF EXISTS retired_analytics.weather_wind_daily CASCADE;
DROP TABLE IF EXISTS retired_analytics.weather_temperature_daily CASCADE;
DROP TABLE IF EXISTS retired_analytics.weather_rainfall_daily CASCADE;
DROP TABLE IF EXISTS retired_analytics.weather_daily CASCADE;
DROP TABLE IF EXISTS retired_analytics.weather_observations CASCADE;
DROP TABLE IF EXISTS retired_analytics.weather_runs CASCADE;

-- Safety coverage in case quarantine was rolled back before this script runs.
DROP TABLE IF EXISTS reference.weather_monthly_summary CASCADE;
DROP TABLE IF EXISTS reference.weather_wind_daily CASCADE;
DROP TABLE IF EXISTS reference.weather_temperature_daily CASCADE;
DROP TABLE IF EXISTS reference.weather_rainfall_daily CASCADE;
DROP TABLE IF EXISTS reference.weather_daily CASCADE;
DROP TABLE IF EXISTS reference.weather_observations CASCADE;
DROP TABLE IF EXISTS reference.weather_runs CASCADE;

-- Delete the quarantine schema only when it is now empty. If it contains any
-- unrelated object, keep the schema and complete the weather deletion safely.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'retired_analytics') THEN
    BEGIN
      EXECUTE 'DROP SCHEMA retired_analytics';
    EXCEPTION
      WHEN dependent_objects_still_exist THEN
        RAISE NOTICE 'retired_analytics was preserved because it still contains non-weather objects.';
    END;
  END IF;
END $$;

COMMIT;

-- Schema-only verification (returns zero rows when removal is complete):
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN ('reference', 'retired_analytics')
  AND table_name IN (
    'weather_observations',
    'weather_daily',
    'weather_rainfall_daily',
    'weather_temperature_daily',
    'weather_wind_daily',
    'weather_monthly_summary',
    'weather_runs'
  )
ORDER BY table_schema, table_name;
