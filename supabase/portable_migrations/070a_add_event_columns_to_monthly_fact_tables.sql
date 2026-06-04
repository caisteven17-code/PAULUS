-- Run this only if the monthly fact tables already exist without the new event columns.

ALTER TABLE parish_analytics.fact_parish_monthly_financials
  ADD COLUMN IF NOT EXISTS minor_events_count smallint NOT NULL DEFAULT 0;

ALTER TABLE school_analytics.fact_school_monthly_financials
  ADD COLUMN IF NOT EXISTS has_event boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minor_events_count smallint NOT NULL DEFAULT 0;

ALTER TABLE seminary_analytics.fact_seminary_monthly_financials
  ADD COLUMN IF NOT EXISTS has_event boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minor_events_count smallint NOT NULL DEFAULT 0;
