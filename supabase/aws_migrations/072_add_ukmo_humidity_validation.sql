-- Align the AWS analytical weather schema with the current classifier output.
-- UKMO is the third independent humidity validator.

ALTER TABLE reference.weather_temperature_daily
  ADD COLUMN IF NOT EXISTS ukmo_rh_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS ukmo_humidity_classification text;

ALTER TABLE reference.weather_temperature_daily
  DROP CONSTRAINT IF EXISTS weather_temperature_daily_ukmo_humidity_classification_check,
  ADD CONSTRAINT weather_temperature_daily_ukmo_humidity_classification_check
    CHECK (
      ukmo_humidity_classification IS NULL
      OR ukmo_humidity_classification IN (
        'low', 'moderate', 'high', 'very_high', 'inconclusive'
      )
    );

ALTER TABLE reference.weather_temperature_daily
  DROP CONSTRAINT IF EXISTS weather_temperature_daily_humidity_validators_agreed_check,
  ADD CONSTRAINT weather_temperature_daily_humidity_validators_agreed_check
    CHECK (humidity_validators_agreed BETWEEN 0 AND 3);

COMMENT ON COLUMN reference.weather_temperature_daily.ukmo_rh_pct IS
  'UKMO relative-humidity validator percentage.';
