-- Complete row-level audit coverage for the Supabase-as-logical-bronze design.
-- audit.log_change() stores full OLD/NEW JSONB for INSERT/UPDATE/DELETE.

DROP TRIGGER IF EXISTS audit_change ON parishes.iafr_line_items;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON parishes.iafr_line_items
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_change ON parishes.iafr_account_titles;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON parishes.iafr_account_titles
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_change ON parishes.details;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON parishes.details
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

COMMENT ON TRIGGER audit_change ON parishes.iafr_line_items IS
  'Full OLD/NEW row history used by the Supabase logical bronze layer.';
COMMENT ON TRIGGER audit_change ON parishes.iafr_account_titles IS
  'Full OLD/NEW account-catalog history used by the Supabase logical bronze layer.';
COMMENT ON TRIGGER audit_change ON parishes.details IS
  'Full OLD/NEW parish-detail history used by the Supabase logical bronze layer.';

-- Supabase PostgREST does not expose the audit schema. Give the backend
-- service-role client a read-only view through the exposed `diocese` schema.
CREATE OR REPLACE VIEW diocese.audit_change_log AS
SELECT
  id,
  table_schema,
  table_name,
  record_id,
  operation,
  old_values,
  new_values,
  changed_by,
  changed_at,
  context
FROM audit.change_log;

REVOKE ALL ON diocese.audit_change_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON diocese.audit_change_log TO service_role;
