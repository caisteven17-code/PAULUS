-- Migration 201: Ensure audit_logs accepts application audit events.
-- Safe to run even if migration 194 already added some of these columns.

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
