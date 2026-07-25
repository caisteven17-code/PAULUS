-- Allow the analytics PUSHER service to persist validation batches and commit
-- approved rows through Supabase/PostgREST.

GRANT USAGE ON SCHEMA operations TO service_role;
GRANT USAGE ON SCHEMA parishes TO service_role;
GRANT USAGE ON SCHEMA diocese TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON operations.financial_push_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON operations.financial_push_rows TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON operations.financial_import_column_map TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON operations.parish_import_aliases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON operations.canonical_account_requests TO service_role;

GRANT SELECT ON diocese.institutions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON parishes.financial_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON parishes.iafr_line_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON parishes.iafr_account_titles TO service_role;
