-- Migration 205: Final audit_logs repair + referential integrity.
--
-- Fixes the three problems visible in diocese.audit_logs:
--   1. user_id NULL / not a foreign key  -> resolve actor, then add FK to profiles(id)
--   2. institution_id not recorded        -> resolve from the referenced record (metadata)
--   3. entity stored as 'event'/'announcement' -> replace with the institution name
--
-- The audit entity reflects the ACTOR's own institution. Earlier backfills
-- (203/204) stopped there, which leaves rows blank when the actor has no
-- institution assigned (e.g. the 'drive justyn' priest). This migration adds a
-- fallback: when the actor has no institution, recover it from the record the
-- row acted on (metadata.event_id -> diocese.events.institution_id) so the
-- column is still meaningful instead of NULL.

-- ── 0. Ensure expected columns exist ─────────────────────────────────────────
ALTER TABLE diocese.audit_logs
  ADD COLUMN IF NOT EXISTS user_id        UUID,
  ADD COLUMN IF NOT EXISTS user_role      TEXT,
  ADD COLUMN IF NOT EXISTS institution_id UUID,
  ADD COLUMN IF NOT EXISTS entity         TEXT;

-- ── 1. Normalise actor: external_auth_id -> profile id ───────────────────────
UPDATE diocese.audit_logs al
SET user_id = p.id
FROM diocese.profiles p
WHERE al.user_id = p.external_auth_id
  AND al.user_id IS DISTINCT FROM p.id;

-- ── 2. Resolve NULL user_id from the name/email stored on the row ────────────
UPDATE diocese.audit_logs al
SET user_id = p.id
FROM diocese.profiles p
WHERE al.user_id IS NULL
  AND (
        lower(al.user_name) = lower(p.email)
     OR lower(al.user_name) = lower(p.full_name)
  );

-- ── 3. Resolve NULL user_id from the actor recorded in metadata ──────────────
--     (Event/announcement writers stored archived_by / restored_by / created_by.)
UPDATE diocese.audit_logs al
SET user_id = p.id
FROM diocese.profiles p
WHERE al.user_id IS NULL
  AND al.metadata IS NOT NULL
  AND lower(COALESCE(
        al.metadata->>'archived_by',
        al.metadata->>'restored_by',
        al.metadata->>'created_by',
        al.metadata->>'updated_by',
        al.metadata->>'reviewed_by',
        ''
      )) = lower(p.full_name)
  AND p.full_name IS NOT NULL;

-- ── 4. Institution = the actor's own institution (primary source of truth) ────
--     The audit entity reflects who performed the action.
UPDATE diocese.audit_logs al
SET institution_id = p.institution_id
FROM diocese.profiles p
WHERE al.institution_id IS NULL
  AND al.user_id = p.id
  AND p.institution_id IS NOT NULL;

-- ── 5. Fallback: recover institution from the EVENT the row acted on ──────────
--     Only used when the actor has no institution assigned (keeps it meaningful).
UPDATE diocese.audit_logs al
SET institution_id = e.institution_id
FROM diocese.events e
WHERE al.institution_id IS NULL
  AND al.metadata IS NOT NULL
  AND al.metadata->>'event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND e.id = (al.metadata->>'event_id')::uuid
  AND e.institution_id IS NOT NULL;

-- ── 6. Fallback: recover institution from metadata.institution_id / entity_id ─
UPDATE diocese.audit_logs al
SET institution_id = (COALESCE(al.metadata->>'institution_id', al.metadata->>'entity_id'))::uuid
WHERE al.institution_id IS NULL
  AND al.metadata IS NOT NULL
  AND COALESCE(al.metadata->>'institution_id', al.metadata->>'entity_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1 FROM diocese.institutions i
    WHERE i.id = (COALESCE(al.metadata->>'institution_id', al.metadata->>'entity_id'))::uuid
  );

-- ── 7. Fallback: match the stored entity text to an institution name ──────────
UPDATE diocese.audit_logs al
SET institution_id = i.id
FROM diocese.institutions i
WHERE al.institution_id IS NULL
  AND al.entity IS NOT NULL
  AND lower(al.entity) = lower(i.name);

-- ── 8. Replace generic / empty entity labels with the institution name ───────
UPDATE diocese.audit_logs al
SET entity = i.name
FROM diocese.institutions i
WHERE al.institution_id = i.id
  AND (
        al.entity IS NULL
     OR al.entity = ''
     OR lower(al.entity) IN ('event', 'events', 'announcement', 'announcements')
  );

-- ── 9. Prefer the profile's full name over a stored email, backfill role ─────
UPDATE diocese.audit_logs al
SET
  user_name = COALESCE(p.full_name, al.user_name),
  user_role = COALESCE(NULLIF(al.user_role, ''), p.role_id, 'Unknown')
FROM diocese.profiles p
WHERE al.user_id = p.id
  AND (
        al.user_name IS NULL
     OR al.user_name = ''
     OR al.user_name = p.email
     OR al.user_role IS NULL
     OR al.user_role = ''
     OR lower(al.user_role) = 'unknown'
  );

-- ── 10. Drop references that cannot satisfy a FK, so the constraint can apply ─
UPDATE diocese.audit_logs al
SET user_id = NULL
WHERE al.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM diocese.profiles p WHERE p.id = al.user_id);

UPDATE diocese.audit_logs al
SET institution_id = NULL
WHERE al.institution_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM diocese.institutions i WHERE i.id = al.institution_id);

-- ── 11. Add the missing foreign keys (institution_id FK kept idempotent) ──────
ALTER TABLE diocese.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey,
  ADD  CONSTRAINT audit_logs_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES diocese.profiles(id) ON DELETE SET NULL;

ALTER TABLE diocese.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_institution_id_fkey,
  ADD  CONSTRAINT audit_logs_institution_id_fkey
       FOREIGN KEY (institution_id) REFERENCES diocese.institutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_institution_id
  ON diocese.audit_logs (institution_id)
  WHERE institution_id IS NOT NULL;

-- ── 12. Final unknown-role cleanup ───────────────────────────────────────────
UPDATE diocese.audit_logs
SET user_role = 'Unknown'
WHERE user_role IS NULL
   OR user_role = '';
