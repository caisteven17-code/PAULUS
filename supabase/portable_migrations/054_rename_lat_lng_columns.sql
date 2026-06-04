-- Run this only if you already created the tables with `lat` and `lng`.

ALTER TABLE diocese.institutions
  RENAME COLUMN lat TO latitude;

ALTER TABLE diocese.institutions
  RENAME COLUMN lng TO longitude;

ALTER TABLE parish_analytics.dim_parishes
  RENAME COLUMN lat TO latitude;

ALTER TABLE parish_analytics.dim_parishes
  RENAME COLUMN lng TO longitude;

