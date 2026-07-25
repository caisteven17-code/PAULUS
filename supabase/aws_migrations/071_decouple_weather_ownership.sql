-- Phase 4B: weather is AWS-owned analytical reference data.
-- Institution-specific weather may use the local analytical dimension; the
-- source UUID remains optional lineage only.

ALTER TABLE reference.weather_observations
  DROP CONSTRAINT IF EXISTS weather_observations_institution_id_fkey;

ALTER TABLE reference.weather_observations
  ADD COLUMN IF NOT EXISTS institution_key integer;

ALTER TABLE reference.weather_observations
  DROP CONSTRAINT IF EXISTS weather_observations_institution_key_fkey,
  ADD CONSTRAINT weather_observations_institution_key_fkey
    FOREIGN KEY (institution_key)
    REFERENCES shared_analytics.dim_institutions(institution_key);

CREATE INDEX IF NOT EXISTS idx_weather_observations_institution_key_date
  ON reference.weather_observations (institution_key, date)
  WHERE institution_key IS NOT NULL;

COMMENT ON COLUMN reference.weather_observations.institution_id IS
  'Optional Supabase institution UUID lineage; local AWS relationships use institution_key.';

