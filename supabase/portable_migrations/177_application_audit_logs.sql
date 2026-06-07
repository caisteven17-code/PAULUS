-- Application-level audit log for events that don't generate DB mutations:
-- auth (login, logout), user management, role changes, CSV exports, etc.
-- Complements audit.change_log (DB-trigger-based mutation history).

CREATE TABLE IF NOT EXISTS diocese.audit_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid,                        -- auth.uid(); NULL for system events
  user_name    text        NOT NULL DEFAULT 'System',
  user_role    text        NOT NULL DEFAULT 'Automated',
  is_system    boolean     NOT NULL DEFAULT false,
  category     text        NOT NULL CHECK (category IN ('auth', 'finance', 'analytics', 'reports', 'system', 'access')),
  severity     text        NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'success')),
  action       text        NOT NULL,
  detail       text        NOT NULL,
  entity       text,
  ip_address   text,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at  ON diocese.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id     ON diocese.audit_logs (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_category    ON diocese.audit_logs (category);

GRANT USAGE  ON SCHEMA diocese        TO service_role;
GRANT SELECT, INSERT ON diocese.audit_logs TO service_role;
