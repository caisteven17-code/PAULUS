-- Migration 203: Backfill audit log actor and institution references.
-- Keeps audit rows consistent:
--   user_id        -> diocese.profiles.id when resolvable
--   institution_id -> diocese.institutions.id when resolvable
--   entity         -> institution name when resolvable

ALTER TABLE diocese.audit_logs
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS user_role TEXT,
  ADD COLUMN IF NOT EXISTS institution_id UUID,
  ADD COLUMN IF NOT EXISTS entity TEXT;

-- Resolve users from profile id, Supabase auth id, or email stored in user_name.
UPDATE diocese.audit_logs al
SET
  user_id = p.id,
  user_name = COALESCE(NULLIF(al.user_name, ''), p.full_name, p.email),
  user_role = COALESCE(NULLIF(al.user_role, ''), p.role_id, 'Unknown')
FROM diocese.profiles p
WHERE (
    al.user_id = p.id
    OR al.user_id = p.external_auth_id
    OR lower(al.user_name) = lower(p.email)
  )
  AND (
    al.user_id IS DISTINCT FROM p.id
    OR al.user_name IS NULL
    OR al.user_name = ''
    OR al.user_role IS NULL
    OR al.user_role = ''
    OR lower(al.user_role) = 'unknown'
  );

-- Fill institution_id from the resolved profile.
UPDATE diocese.audit_logs al
SET institution_id = p.institution_id
FROM diocese.profiles p
WHERE al.user_id = p.id
  AND p.institution_id IS NOT NULL
  AND al.institution_id IS NULL;

-- Fill institution_id from entity name when an event already stored the name.
UPDATE diocese.audit_logs al
SET institution_id = i.id
FROM diocese.institutions i
WHERE al.institution_id IS NULL
  AND al.entity IS NOT NULL
  AND lower(al.entity) = lower(i.name);

-- Fill entity name from institution_id.
UPDATE diocese.audit_logs al
SET entity = i.name
FROM diocese.institutions i
WHERE al.institution_id = i.id
  AND (al.entity IS NULL OR al.entity = '');

-- Give remaining unknown role rows a clear value.
UPDATE diocese.audit_logs
SET user_role = 'Unknown'
WHERE user_role IS NULL
   OR user_role = '';
