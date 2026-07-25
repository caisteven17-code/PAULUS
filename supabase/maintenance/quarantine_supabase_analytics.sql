-- Reversible Supabase weather quarantine. Run only after AWS reconciliation
-- and backup. The canonical reference.liturgical_calendar table stays put.
--
-- Do not rename the analytical schemas here. They are currently listed in the
-- Supabase API exposed-schema configuration. Renaming any configured schema can
-- prevent PostgREST from rebuilding its schema cache and return PGRST002/503
-- for every REST endpoint, including operational schemas.

CREATE SCHEMA IF NOT EXISTS retired_analytics;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'weather_observations', 'weather_rainfall_daily',
    'weather_temperature_daily', 'weather_wind_daily',
    'weather_monthly_summary', 'weather_runs'
  ] LOOP
    IF to_regclass(format('reference.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE reference.%I SET SCHEMA retired_analytics', table_name);
    END IF;
  END LOOP;
END $$;
