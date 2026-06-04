-- Run this only if you already created the parish tables with patron columns.

ALTER TABLE parishes.details
  DROP COLUMN IF EXISTS primary_patron,
  DROP COLUMN IF EXISTS secondary_patron;

ALTER TABLE parish_analytics.dim_parishes
  DROP COLUMN IF EXISTS primary_patron,
  DROP COLUMN IF EXISTS secondary_patron;

