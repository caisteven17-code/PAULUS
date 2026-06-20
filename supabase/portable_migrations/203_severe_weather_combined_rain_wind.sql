-- Adds a combined rainfall+wind severe-weather signal: the more severe of
-- classify_severe_from_precip() (rainfall SoT: NASA POWER AG) and the new
-- classify_severe_from_wind() (wind SoT: ECMWF IFS), per
-- classify_severe_combined() in weather_daily_classifier.py.
--
-- Not cross-validated like severe_classification / the rain-based proxy
-- (rainfall and wind validators live in separate row sets), so there is no
-- accompanying *_validators_agreed / *_wmo_quality_flag column — this is a
-- derived label, not a consensus result.

ALTER TABLE reference.weather_rainfall_daily
  ADD COLUMN IF NOT EXISTS severe_classification_combined text
    CHECK (severe_classification_combined IN (
      'no_severe','light_weather','moderate_weather',
      'severe_weather','extreme_weather'));
