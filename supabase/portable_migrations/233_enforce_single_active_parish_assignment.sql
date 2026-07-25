-- Enforce the two permanent Parish Priest assignment invariants after the
-- assignment table moved to the clergy schema.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clergy_active_parish_priest_per_parish
  ON clergy.priest_assignments (institution_id)
  WHERE is_active = true
    AND assignment_role = 'parish_priest'
    AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clergy_active_parish_per_priest
  ON clergy.priest_assignments (priest_id)
  WHERE is_active = true
    AND assignment_role = 'parish_priest'
    AND deleted_at IS NULL;

COMMIT;
