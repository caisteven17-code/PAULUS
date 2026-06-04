-- Run this only if the old fiesta-date columns already exist.

ALTER TABLE parishes.details
  DROP COLUMN IF EXISTS fiesta_date;

ALTER TABLE parish_analytics.dim_parishes
  DROP COLUMN IF EXISTS fiesta_date;
