-- Municipality bridge for parish-to-weather joins: dim_institutions already
-- has latitude/longitude (synced from diocese.institutions), but no
-- municipality field, and no institution-to-weather-municipality mapping
-- exists anywhere. institution_dimension_sync.py resolves this column via
-- nearest-centroid match against weather_collector.MUNICIPALITIES (the same
-- 30-municipality list the weather pipeline itself uses) — see that file for
-- the resolution logic. This migration only adds the column; population
-- happens in code + a one-time backfill (080).

ALTER TABLE shared_analytics.dim_institutions
  ADD COLUMN IF NOT EXISTS municipality text;

COMMENT ON COLUMN shared_analytics.dim_institutions.municipality IS
  'Nearest-centroid match against the weather pipeline''s 30 Laguna municipalities (weather_collector.MUNICIPALITIES), resolved from latitude/longitude by institution_dimension_sync.py. Bridges parish/school/seminary institutions to reference.weather_* tables, which are keyed by municipality, not institution.';
