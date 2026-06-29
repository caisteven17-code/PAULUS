-- Drop stale WCI columns from weather_monthly_summary.
-- WCI (Weighted Confidence Index) was superseded by Cohen's Kappa + Lin's CCC;
-- the weather loader no longer writes to these columns.
ALTER TABLE reference.weather_monthly_summary
  DROP COLUMN IF EXISTS rain_wci,
  DROP COLUMN IF EXISTS temp_wci,
  DROP COLUMN IF EXISTS severe_wci,
  DROP COLUMN IF EXISTS wind_wci,
  DROP COLUMN IF EXISTS humidity_wci,
  DROP COLUMN IF EXISTS overall_wci;
