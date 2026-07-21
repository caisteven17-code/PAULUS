-- Roll back the reversible Supabase analytics/weather quarantine.

DO $$
DECLARE
  table_name text;
  schema_name text;
BEGIN
  FOREACH schema_name IN ARRAY ARRAY[
    'shared_analytics', 'parish_analytics', 'school_analytics',
    'seminary_analytics', 'priest_assignment_analytics',
    'parish_silver', 'warehouse_control'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='retired_' || schema_name)
       AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname=schema_name) THEN
      EXECUTE format('ALTER SCHEMA %I RENAME TO %I', 'retired_' || schema_name, schema_name);
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'weather_observations', 'weather_rainfall_daily',
    'weather_temperature_daily', 'weather_wind_daily',
    'weather_monthly_summary', 'weather_runs'
  ] LOOP
    IF to_regclass(format('retired_analytics.%I', table_name)) IS NOT NULL
       AND to_regclass(format('reference.%I', table_name)) IS NULL THEN
      EXECUTE format('ALTER TABLE retired_analytics.%I SET SCHEMA reference', table_name);
    END IF;
  END LOOP;
END $$;

