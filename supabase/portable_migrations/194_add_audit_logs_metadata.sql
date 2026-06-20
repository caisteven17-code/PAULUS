-- Migration 194: Align diocese.audit_logs with the application audit service.
-- Older portable installs created audit_logs with legacy columns:
--   role, log_reference, occurred_at
-- Newer application audit inserts use:
--   user_id, user_role, entity, metadata, created_at
-- This migration makes old and new installs accept the same audit events.

ALTER TABLE diocese.audit_logs
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS user_role TEXT,
  ADD COLUMN IF NOT EXISTS entity TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'diocese'
      AND table_name = 'audit_logs'
      AND column_name = 'role'
  ) THEN
    UPDATE diocese.audit_logs
    SET user_role = COALESCE(user_role, role)
    WHERE user_role IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'diocese'
      AND table_name = 'audit_logs'
      AND column_name = 'log_reference'
  ) THEN
    ALTER TABLE diocese.audit_logs
      ALTER COLUMN log_reference SET DEFAULT (
        'LOG-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(md5(random()::text), 1, 6))
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON diocese.audit_logs (user_id)
  WHERE user_id IS NOT NULL;
