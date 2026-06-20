-- Wind and temperature both switched their source of truth to ECMWF IFS
-- this session, demoting NASA POWER AG from truth to a regular validator.
-- Every other validator already gets its own "<source>_classification"
-- column; NASA needs one too now that it's a validator, not the truth.
--
-- nasa_power_wind_classification was already added to the wind_row dict
-- during the wind SoT switch but the migration for it was missed at the
-- time — adding it now alongside temperature's.

ALTER TABLE reference.weather_wind_daily
    ADD COLUMN IF NOT EXISTS nasa_power_wind_classification text
    CHECK (nasa_power_wind_classification = ANY (ARRAY['calm'::text, 'light'::text, 'moderate'::text, 'strong'::text, 'storm'::text, 'inconclusive'::text]));

ALTER TABLE reference.weather_temperature_daily
    ADD COLUMN IF NOT EXISTS nasa_power_temp_classification text
    CHECK (nasa_power_temp_classification = ANY (ARRAY['not_hazardous'::text, 'caution'::text, 'extreme_caution'::text, 'danger'::text, 'extreme_danger'::text, 'inconclusive'::text]));
