-- Fix reference.weather_observations unique index so per-municipality records
-- (institution_id IS NULL) can coexist — one per (date, location) per day.
--
-- The original uq_weather_date_institution used NULLS NOT DISTINCT on only two
-- columns, meaning only ONE null-institution record was allowed per date.
-- Replacing it with two partial indexes separates the two access patterns.

DROP INDEX IF EXISTS reference.uq_weather_date_institution;

-- Unique index for institution-linked records (institution_id present)
CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_inst_date
  ON reference.weather_observations (date, institution_id)
  WHERE institution_id IS NOT NULL;

-- Unique index for location/municipality records (institution_id absent)
CREATE UNIQUE INDEX IF NOT EXISTS uq_weather_location_date
  ON reference.weather_observations (date, location)
  WHERE institution_id IS NULL;
