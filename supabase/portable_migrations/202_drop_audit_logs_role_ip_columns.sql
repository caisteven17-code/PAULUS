-- Migration 202: Remove legacy/unused audit log columns.
-- `user_role` is the canonical role column now.
-- IP addresses are no longer stored in application audit logs.

ALTER TABLE diocese.audit_logs
  ADD COLUMN IF NOT EXISTS user_role TEXT;

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
    SET user_role = COALESCE(NULLIF(user_role, ''), NULLIF(role, ''), 'Unknown')
    WHERE user_role IS NULL
       OR user_role = '';
  END IF;
END $$;

UPDATE diocese.audit_logs
SET user_role = 'Unknown'
WHERE user_role IS NULL
   OR user_role = '';

UPDATE diocese.audit_logs al
SET user_role = p.role_id
FROM diocese.profiles p
WHERE p.role_id IS NOT NULL
  AND (
    al.user_id = p.id
    OR al.user_id = p.external_auth_id
    OR lower(al.user_name) = lower(p.email)
  )
  AND (
    al.user_role IS NULL
    OR al.user_role = ''
    OR lower(al.user_role) = 'unknown'
  );

CREATE SCHEMA IF NOT EXISTS debug;
DROP VIEW IF EXISTS debug.v_audit_logs;

ALTER TABLE diocese.audit_logs
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS ip_address;

CREATE OR REPLACE VIEW debug.v_audit_logs AS
SELECT
  p.profile_code,
  COALESCE(p.full_name, al.user_name) AS user_name,
  al.user_role,
  i.institution_code,
  al.category,
  al.severity,
  al.action,
  al.detail,
  al.is_system,
  al.occurred_at,
  al.id AS log_id
FROM diocese.audit_logs al
LEFT JOIN diocese.profiles     p ON p.id = al.user_id
LEFT JOIN diocese.institutions i ON i.id = al.institution_id
WHERE al.deleted_at IS NULL
ORDER BY al.occurred_at DESC;
