-- Add JMA (Japan Meteorological Agency) as severe weather's 4th validator.
--
-- Severe weather previously had zero genuinely independent confirmation:
-- its only validators (Open-Meteo ERA5-Land, ERA5 Full, ECMWF IFS) all
-- derive from the same organization (ECMWF). JMA's weathercode uses the
-- same WMO code table (verified empirically — same numeric ranges for
-- cloud/drizzle/rain as ERA5/ECMWF IFS), unlike UKMO's weathercode, which
-- stays excluded for using a different convention.
--
-- validators_agreed for severe weather is now out of 3 (ERA5, ECMWF IFS,
-- JMA), not 2, so the check constraint upper bound moves from 2 to 3.

ALTER TABLE reference.weather_rainfall_daily
    ADD COLUMN IF NOT EXISTS jma_weathercode smallint;

ALTER TABLE reference.weather_rainfall_daily
    DROP CONSTRAINT IF EXISTS weather_rainfall_daily_severe_validators_agreed_check;

ALTER TABLE reference.weather_rainfall_daily
    ADD CONSTRAINT weather_rainfall_daily_severe_validators_agreed_check
    CHECK (severe_validators_agreed >= 0 AND severe_validators_agreed <= 3);
