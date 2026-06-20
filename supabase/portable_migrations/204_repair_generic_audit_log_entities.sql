-- Migration 204: Repair audit rows that used generic entity labels.
-- Older direct audit writers stored entity='event'/'announcement' and did not
-- set user_id or institution_id. Match by profile email/full name, then use the
-- profile institution as the audit entity.

ALTER TABLE diocese.audit_logs
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS user_role TEXT,
  ADD COLUMN IF NOT EXISTS institution_id UUID,
  ADD COLUMN IF NOT EXISTS entity TEXT;

UPDATE diocese.audit_logs al
SET
  user_id = p.id,
  user_name = COALESCE(NULLIF(al.user_name, ''), p.full_name, p.email),
  user_role = COALESCE(NULLIF(al.user_role, ''), p.role_id, 'Unknown'),
  institution_id = COALESCE(al.institution_id, p.institution_id)
FROM diocese.profiles p
WHERE (
    al.user_id = p.id
    OR al.user_id = p.external_auth_id
    OR lower(al.user_name) = lower(p.email)
    OR lower(al.user_name) = lower(p.full_name)
  )
  AND (
    al.user_id IS NULL
    OR al.user_id IS DISTINCT FROM p.id
    OR al.institution_id IS NULL
    OR al.user_role IS NULL
    OR al.user_role = ''
    OR lower(al.user_role) = 'unknown'
  );

UPDATE diocese.audit_logs al
SET institution_id = i.id
FROM diocese.institutions i
WHERE al.institution_id IS NULL
  AND al.entity IS NOT NULL
  AND lower(al.entity) = lower(i.name);

UPDATE diocese.audit_logs al
SET entity = i.name
FROM diocese.institutions i
WHERE al.institution_id = i.id
  AND (
    al.entity IS NULL
    OR al.entity = ''
    OR lower(al.entity) IN ('event', 'events', 'announcement', 'announcements')
  );

UPDATE diocese.audit_logs
SET user_role = 'Unknown'
WHERE user_role IS NULL
   OR user_role = '';
