-- Generic mutation history for all key tables.
-- Captures before/after JSONB on INSERT, UPDATE, DELETE.
--
-- To attach pipeline context (e.g. run_id) to a batch operation:
--   SET LOCAL app.audit_context = '{"run_id": "..."}';
-- The trigger reads this session variable automatically.

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.change_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_schema text        NOT NULL,
  table_name   text        NOT NULL,
  record_id    text,                        -- 'id' column value; NULL for composite-PK tables
  operation    text        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values   jsonb,
  new_values   jsonb,
  changed_by   uuid,                        -- auth.uid(); NULL for service-role / pipeline ops
  changed_at   timestamptz NOT NULL DEFAULT now(),
  context      jsonb                        -- optional: {"run_id": "...", "batch_id": "..."}
);

CREATE INDEX idx_change_log_table
  ON audit.change_log (table_schema, table_name, record_id);

CREATE INDEX idx_change_log_changed_at
  ON audit.change_log (changed_at DESC);

CREATE INDEX idx_change_log_changed_by
  ON audit.change_log (changed_by)
  WHERE changed_by IS NOT NULL;

GRANT USAGE ON SCHEMA audit TO service_role;
GRANT SELECT, INSERT ON audit.change_log TO service_role;


-- Attach to any table with: CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON <table> FOR EACH ROW EXECUTE FUNCTION audit.log_change();
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger AS $$
DECLARE
  _record_id   text;
  _context_raw text;
  _context     jsonb;
BEGIN
  _record_id := CASE
    WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ->> 'id'
    ELSE row_to_json(NEW) ->> 'id'
  END;

  _context_raw := current_setting('app.audit_context', true);
  _context := CASE
    WHEN _context_raw IS NOT NULL AND _context_raw <> '' THEN _context_raw::jsonb
    ELSE NULL
  END;

  INSERT INTO audit.change_log (
    table_schema, table_name, record_id, operation,
    old_values, new_values, changed_by, context
  ) VALUES (
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    _record_id,
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW)::jsonb END,
    auth.uid(),
    _context
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Financial records (all three domains)
DROP TRIGGER IF EXISTS audit_change ON parishes.financial_records;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON parishes.financial_records
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_change ON schools.financial_records;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON schools.financial_records
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_change ON seminaries.financial_records;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON seminaries.financial_records
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

-- Submission batches (the financial staging layer — track status transitions)
DROP TRIGGER IF EXISTS audit_change ON operations.submission_batches;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON operations.submission_batches
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

-- Institution details and profiles
DROP TRIGGER IF EXISTS audit_change ON diocese.institutions;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON diocese.institutions
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_change ON diocese.profiles;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON diocese.profiles
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

-- Roles and permissions (security-sensitive)
DROP TRIGGER IF EXISTS audit_change ON diocese.roles;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON diocese.roles
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_change ON diocese.permissions;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON diocese.permissions
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_change ON diocese.role_permissions;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON diocese.role_permissions
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

-- Projects and donations
DROP TRIGGER IF EXISTS audit_change ON diocese.projects;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON diocese.projects
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

DROP TRIGGER IF EXISTS audit_change ON diocese.donations;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON diocese.donations
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

-- Liturgical calendar (reference data — captures each approval/correction)
DROP TRIGGER IF EXISTS audit_change ON reference.liturgical_calendar;
CREATE TRIGGER audit_change
  AFTER INSERT OR UPDATE OR DELETE ON reference.liturgical_calendar
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();
