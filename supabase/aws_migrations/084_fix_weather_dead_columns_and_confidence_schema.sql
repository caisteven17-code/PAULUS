-- Weather table cleanup, two independent fixes:
--
-- 1. reference.weather_monthly_summary still has the *_fleiss_kappa columns
--    from before Supabase's live project was migrated to Cohen's Kappa +
--    Lin's CCC (migration applied directly there as "replace_fleiss_kappa_
--    with_cohens_lins", never tracked as a portable_migrations file). AWS
--    never got that upgrade. weather_loader.py::upsert_monthly_confidence()
--    already introspects information_schema.columns at runtime and silently
--    skips writing Cohen's/Lin's fields because they don't exist here yet —
--    no Python code change needed, only this schema fix. Confirmed all 5
--    fleiss columns are 100% NULL and not written by the live
--    rebuild_weather_monthly_summary() function.
--
-- 2. Four other confirmed-dead columns found in a full column audit:
--    ecmwf_ifs_temp_classification / ecmwf_ifs_wind_classification (100%
--    NULL — orphaned when ECMWF IFS was dropped as a temp/wind validator;
--    the raw ecmwf_ifs_temp_c/ecmwf_ifs_wind_ms value columns are still
--    populated fine, just their classification companions were never wired
--    up) and weather_observations.institution_id/institution_key (100%
--    NULL — reserved for a never-implemented institution-linkage feature;
--    institution_id is hardcoded to None everywhere it's built,
--    institution_key doesn't even appear in weather_loader.py despite
--    migration 071 adding it).
--
-- No dependent views on any of these 9 columns (verified via pg_depend).

ALTER TABLE reference.weather_monthly_summary
  DROP COLUMN IF EXISTS rain_fleiss_kappa,
  DROP COLUMN IF EXISTS severe_fleiss_kappa,
  DROP COLUMN IF EXISTS temp_fleiss_kappa,
  DROP COLUMN IF EXISTS humidity_fleiss_kappa,
  DROP COLUMN IF EXISTS wind_fleiss_kappa,
  ADD COLUMN IF NOT EXISTS rain_cohens_kappa numeric,
  ADD COLUMN IF NOT EXISTS rain_lins_ccc numeric,
  ADD COLUMN IF NOT EXISTS severe_cohens_kappa numeric,
  ADD COLUMN IF NOT EXISTS temp_cohens_kappa numeric,
  ADD COLUMN IF NOT EXISTS temp_lins_ccc numeric,
  ADD COLUMN IF NOT EXISTS humidity_cohens_kappa numeric,
  ADD COLUMN IF NOT EXISTS humidity_lins_ccc numeric,
  ADD COLUMN IF NOT EXISTS wind_cohens_kappa numeric,
  ADD COLUMN IF NOT EXISTS wind_lins_ccc numeric;

ALTER TABLE reference.weather_temperature_daily
  DROP COLUMN IF EXISTS ecmwf_ifs_temp_classification;

ALTER TABLE reference.weather_wind_daily
  DROP COLUMN IF EXISTS ecmwf_ifs_wind_classification;

ALTER TABLE reference.weather_observations
  DROP COLUMN IF EXISTS institution_id,
  DROP COLUMN IF EXISTS institution_key;
