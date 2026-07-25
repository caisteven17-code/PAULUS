-- Add remittances_total to fact_parish_monthly_financials.
-- Remittances (Section F) are a distinct outflow from operating expenses (Section E)
-- and should not be bundled inside expenses_parish.
ALTER TABLE parish_analytics.fact_parish_monthly_financials
  ADD COLUMN IF NOT EXISTS remittances_total numeric(14, 2) NOT NULL DEFAULT 0;
