-- Run this only if you already created tables with `sort_order`.

ALTER TABLE parishes.iafr_account_titles
  DROP COLUMN IF EXISTS sort_order;

ALTER TABLE schools.fs_account_titles
  DROP COLUMN IF EXISTS sort_order;

ALTER TABLE seminaries.fs_account_titles
  DROP COLUMN IF EXISTS sort_order;

ALTER TABLE parish_analytics.dim_iafr_account
  DROP COLUMN IF EXISTS sort_order;

ALTER TABLE school_analytics.dim_school_fs_account
  DROP COLUMN IF EXISTS sort_order;

ALTER TABLE seminary_analytics.dim_seminary_fs_account
  DROP COLUMN IF EXISTS sort_order;

