-- Add weather validation fields to reference.weather_observations
-- Stores source truth, validator sources, and comparison results as metadata

ALTER TABLE reference.weather_observations
ADD COLUMN source_truth text,
ADD COLUMN validator_sources jsonb,
ADD COLUMN comparison_result text CHECK (comparison_result IN ('matched', 'mismatched') OR comparison_result IS NULL),
ADD COLUMN mismatch_reason text,
ADD COLUMN validation_payload jsonb;

CREATE INDEX IF NOT EXISTS idx_weather_validation_result
  ON reference.weather_observations (comparison_result);

CREATE INDEX IF NOT EXISTS idx_weather_source_truth
  ON reference.weather_observations (source_truth);
