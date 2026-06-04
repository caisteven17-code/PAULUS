-- Run this only if the school tables already exist with `level`.

ALTER TABLE schools.details
  DROP COLUMN IF EXISTS level;

ALTER TABLE school_analytics.dim_schools
  DROP COLUMN IF EXISTS level;

