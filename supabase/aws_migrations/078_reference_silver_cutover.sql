-- Approved one-time reference Silver backfill and Gold-source cutover.
-- Existing Gold table names and grains remain unchanged.

TRUNCATE TABLE
  reference_silver.weather_rainfall_daily,
  reference_silver.weather_temperature_daily,
  reference_silver.weather_wind_daily,
  reference_silver.weather_municipality_monthly,
  reference_silver.liturgical_calendar,
  reference_silver.liturgical_calendar_runs;

INSERT INTO reference_silver.weather_rainfall_daily
SELECT * FROM reference.weather_rainfall_daily;
INSERT INTO reference_silver.weather_temperature_daily
SELECT * FROM reference.weather_temperature_daily;
INSERT INTO reference_silver.weather_wind_daily
SELECT * FROM reference.weather_wind_daily;
INSERT INTO reference_silver.weather_municipality_monthly
SELECT * FROM reference.weather_monthly_summary;
INSERT INTO reference_silver.liturgical_calendar
SELECT * FROM reference.liturgical_calendar;
INSERT INTO reference_silver.liturgical_calendar_runs
SELECT * FROM reference.liturgical_calendar_runs;

-- Clone the deployed weather rebuild implementation, changing only its schema
-- and the clearer municipality-month target table name.
DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(
    'reference.rebuild_weather_monthly_summary(date,date)'::regprocedure
  ) INTO definition;
  definition := replace(
    definition,
    'reference.rebuild_weather_monthly_summary',
    'reference_silver.rebuild_weather_monthly_summary'
  );
  definition := replace(
    definition,
    'reference.weather_monthly_summary',
    'reference_silver.weather_municipality_monthly'
  );
  definition := replace(
    definition,
    'reference.weather_rainfall_daily',
    'reference_silver.weather_rainfall_daily'
  );
  definition := replace(
    definition,
    'reference.weather_temperature_daily',
    'reference_silver.weather_temperature_daily'
  );
  definition := replace(
    definition,
    'reference.weather_wind_daily',
    'reference_silver.weather_wind_daily'
  );
  EXECUTE definition;
END;
$$;

-- Repoint Gold builders while keeping both agg_* Gold tables unchanged.
DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(
    'parish_analytics.refresh_parish_weather_analytics()'::regprocedure
  ) INTO definition;
  definition := replace(
    definition,
    'reference.weather_monthly_summary',
    'reference_silver.weather_municipality_monthly'
  );
  EXECUTE definition;

  SELECT pg_get_functiondef(
    'parish_analytics.refresh_liturgical_calendar_analytics()'::regprocedure
  ) INTO definition;
  definition := replace(
    definition,
    'reference.liturgical_calendar',
    'reference_silver.liturgical_calendar'
  );
  EXECUTE definition;
END;
$$;

ALTER TABLE parish_analytics.dim_liturgical_day
  DROP CONSTRAINT IF EXISTS dim_liturgical_day_calendar_record_id_fkey;
ALTER TABLE parish_analytics.dim_liturgical_day
  ADD CONSTRAINT dim_liturgical_day_calendar_record_id_fkey
  FOREIGN KEY (calendar_record_id)
  REFERENCES reference_silver.liturgical_calendar(id)
  ON DELETE CASCADE;

GRANT USAGE ON SCHEMA reference_silver TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA reference_silver TO service_role;
GRANT EXECUTE ON FUNCTION
  reference_silver.rebuild_weather_monthly_summary(date, date)
  TO service_role;

SELECT * FROM parish_analytics.refresh_liturgical_calendar_analytics();
SELECT * FROM parish_analytics.refresh_parish_weather_analytics();
