-- Run this only if `parish_analytics.fact_parish_monthly_financials` already exists
-- with the old `has_fiesta` column.

ALTER TABLE parish_analytics.fact_parish_monthly_financials
  RENAME COLUMN has_fiesta TO has_event;
