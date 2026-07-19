-- Keep detailed Other Collections calculation fields in the candidate/audit
-- view, but expose only the net analytical measure in the final Gold fact.

ALTER TABLE parish_analytics.fact_parish_monthly_financials
  DROP COLUMN IF EXISTS collections_other_gross,
  DROP COLUMN IF EXISTS collections_other_tax_rate,
  DROP COLUMN IF EXISTS collections_other_tax_amount;
