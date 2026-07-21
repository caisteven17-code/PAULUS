-- Remove the final analytical foreign keys into AWS operational mirror
-- schemas. Source UUIDs remain lineage values; warehouse relationships stay
-- inside analytical schemas.

ALTER TABLE shared_analytics.dim_submission
  DROP CONSTRAINT IF EXISTS dim_submission_submission_batch_id_fkey;

ALTER TABLE school_analytics.dim_school_fs_account
  DROP CONSTRAINT IF EXISTS dim_school_fs_account_source_account_title_id_fkey;

ALTER TABLE seminary_analytics.dim_seminary_fs_account
  DROP CONSTRAINT IF EXISTS dim_seminary_fs_account_source_account_title_id_fkey;

COMMENT ON COLUMN shared_analytics.dim_submission.submission_batch_id IS
  'Logical Supabase submission-batch UUID retained for analytical lineage.';
COMMENT ON COLUMN school_analytics.dim_school_fs_account.source_account_title_id IS
  'Logical Supabase school account-title UUID retained for analytical lineage.';
COMMENT ON COLUMN seminary_analytics.dim_seminary_fs_account.source_account_title_id IS
  'Logical Supabase seminary account-title UUID retained for analytical lineage.';

-- No application code consumes these transitional Bronze compatibility views.
-- Keeping them would preserve reads from AWS parishes/schools/seminaries.
DROP VIEW IF EXISTS public.financial_records_compat;
DROP VIEW IF EXISTS shared_analytics.diocesan_consolidated_financials;

