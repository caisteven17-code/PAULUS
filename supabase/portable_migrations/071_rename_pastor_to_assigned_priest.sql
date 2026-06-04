-- Run this only if the old `pastor` columns already exist.

ALTER TABLE parishes.details
  RENAME COLUMN pastor TO assigned_priest;

ALTER TABLE parish_analytics.dim_parishes
  RENAME COLUMN pastor TO assigned_priest;
