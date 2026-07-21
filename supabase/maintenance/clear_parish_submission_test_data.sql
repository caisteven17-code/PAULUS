-- Clear all parish submission sandbox transactions.
--
-- Preserved:
--   - parishes_submission_test schema and table definitions
--   - parishes_submission_test.iafr_account_titles canonical lookup rows
--   - parishes_submission_test.details
--   - production parishes, operations, Silver, and Gold data
--
-- This does not delete uploaded files from the financial-submissions bucket.
-- Storage objects under test/parish/ should be removed through the Storage API
-- or Supabase Storage dashboard so the underlying files are deleted correctly.

BEGIN;

-- Results reference both the test run and the test financial record.
DELETE FROM operations.parish_submission_test_results;

-- Remove production-shaped child rows before their financial records.
DELETE FROM parishes_submission_test.iafr_line_items;
DELETE FROM parishes_submission_test.financial_records;

-- Remove test workflow details before deleting their parent runs.
DELETE FROM operations.parish_submission_test_entries;
DELETE FROM operations.parish_submission_test_stage_events;
DELETE FROM operations.parish_submission_test_runs;

COMMIT;

-- Schema-only verification after execution:
-- SELECT table_schema, table_name
-- FROM information_schema.tables
-- WHERE table_schema = 'parishes_submission_test'
--    OR (table_schema = 'operations' AND table_name LIKE 'parish_submission_test_%')
-- ORDER BY table_schema, table_name;
