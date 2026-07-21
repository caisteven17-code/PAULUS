-- Batch 2: simplified immediate Parish Priest reassignment.
-- Uses operations.priest_assignments for both current and historical records;
-- no reassignment-items table is required.

BEGIN;

CREATE TABLE IF NOT EXISTS operations.priest_reassignment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_count integer NOT NULL CHECK (assignment_count > 0),
  vacancy_count integer NOT NULL DEFAULT 0 CHECK (vacancy_count >= 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  executed_by uuid REFERENCES diocese.profiles(id) ON DELETE SET NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE operations.priest_assignments
  ADD COLUMN IF NOT EXISTS reassignment_batch_id uuid
    REFERENCES operations.priest_reassignment_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_assignment_id uuid
    REFERENCES operations.priest_assignments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parish_active_parish_priest
  ON operations.priest_assignments (institution_id)
  WHERE is_active = true
    AND assignment_role = 'parish_priest'
    AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_priest_assignments_reassignment_batch
  ON operations.priest_assignments (reassignment_batch_id)
  WHERE reassignment_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_priest_reassignment_batches_executed_at
  ON operations.priest_reassignment_batches (executed_at DESC);

UPDATE diocese.permissions
SET name = 'Manage Parish Priest Reassignments',
    category = 'Priest Management',
    description = 'Allows authorized diocesan users to execute Parish Priest transfers, swaps, and rotations.',
    updated_at = now()
WHERE id = 'manage_assignments';

DELETE FROM diocese.role_permissions
WHERE permission_id = 'manage_assignments'
  AND role_id IN ('parish_priest', 'seminary_rector', 'seminary_oeconomus');

INSERT INTO diocese.role_permissions (role_id, permission_id, granted)
SELECT allowed.role_id, 'manage_assignments', true
FROM unnest(ARRAY['bishop', 'chancellor', 'diocesan_oeconomus']) AS allowed(role_id)
WHERE EXISTS (SELECT 1 FROM diocese.roles role WHERE role.id = allowed.role_id)
ON CONFLICT (role_id, permission_id) DO UPDATE
SET granted = true, deleted_at = NULL, updated_at = now();

CREATE OR REPLACE FUNCTION operations.preview_priest_reassignment(p_moves jsonb)
RETURNS TABLE (
  priest_id uuid,
  priest_name text,
  old_assignment_id uuid,
  from_parish_id uuid,
  from_parish_name text,
  to_parish_id uuid,
  to_parish_name text,
  creates_vacancy boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = operations, diocese, public, pg_catalog
AS $$
DECLARE
  v_move_count integer;
BEGIN
  IF jsonb_typeof(p_moves) IS DISTINCT FROM 'array' OR jsonb_array_length(p_moves) = 0 THEN
    RAISE EXCEPTION 'Add at least one priest reassignment.';
  END IF;

  CREATE TEMP TABLE _proposed_priest_moves ON COMMIT DROP AS
  SELECT
    (move->>'priestId')::uuid AS priest_id,
    (move->>'toParishId')::uuid AS to_parish_id
  FROM jsonb_array_elements(p_moves) move;

  SELECT count(*) INTO v_move_count FROM _proposed_priest_moves;

  IF (SELECT count(DISTINCT proposed.priest_id) FROM _proposed_priest_moves proposed) <> v_move_count THEN
    RAISE EXCEPTION 'A priest appears more than once in the reassignment.';
  END IF;
  IF (SELECT count(DISTINCT proposed.to_parish_id) FROM _proposed_priest_moves proposed) <> v_move_count THEN
    RAISE EXCEPTION 'Two priests cannot be assigned to the same destination parish.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _proposed_priest_moves proposed
    LEFT JOIN diocese.profiles priest ON priest.id = proposed.priest_id
    WHERE priest.id IS NULL OR priest.is_active = false OR priest.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The reassignment contains an inactive or unknown priest.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _proposed_priest_moves proposed
    LEFT JOIN diocese.institutions parish ON parish.id = proposed.to_parish_id
    WHERE parish.id IS NULL
       OR parish.institution_type <> 'parish'
       OR parish.is_active = false
       OR parish.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The reassignment contains an inactive or unknown destination parish.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _proposed_priest_moves proposed
    LEFT JOIN operations.priest_assignments current_assignment
      ON current_assignment.priest_id = proposed.priest_id
     AND current_assignment.assignment_role = 'parish_priest'
     AND current_assignment.is_active = true
     AND current_assignment.deleted_at IS NULL
    WHERE current_assignment.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Every selected priest must have an active Parish Priest assignment.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM _proposed_priest_moves proposed
    JOIN operations.priest_assignments current_assignment
      ON current_assignment.priest_id = proposed.priest_id
     AND current_assignment.assignment_role = 'parish_priest'
     AND current_assignment.is_active = true
     AND current_assignment.deleted_at IS NULL
    WHERE current_assignment.institution_id = proposed.to_parish_id
  ) THEN
    RAISE EXCEPTION 'A priest cannot be reassigned to the same parish.';
  END IF;

  -- An occupied destination is valid only when its current priest is included
  -- in this same swap/rotation and is leaving that destination.
  IF EXISTS (
    SELECT 1
    FROM _proposed_priest_moves proposed
    JOIN operations.priest_assignments occupant
      ON occupant.institution_id = proposed.to_parish_id
     AND occupant.assignment_role = 'parish_priest'
     AND occupant.is_active = true
     AND occupant.deleted_at IS NULL
    LEFT JOIN _proposed_priest_moves occupant_move
      ON occupant_move.priest_id = occupant.priest_id
    WHERE occupant.priest_id <> proposed.priest_id
      AND (occupant_move.priest_id IS NULL OR occupant_move.to_parish_id = proposed.to_parish_id)
  ) THEN
    RAISE EXCEPTION 'A destination parish is occupied by a priest who is not leaving in this reassignment.';
  END IF;

  RETURN QUERY
  SELECT
    priest.id,
    coalesce(priest.full_name, priest.email, 'Unnamed priest'),
    current_assignment.id,
    current_assignment.institution_id,
    source_parish.name,
    proposed.to_parish_id,
    destination_parish.name,
    NOT EXISTS (
      SELECT 1 FROM _proposed_priest_moves incoming
      WHERE incoming.to_parish_id = current_assignment.institution_id
    )
  FROM _proposed_priest_moves proposed
  JOIN diocese.profiles priest ON priest.id = proposed.priest_id
  JOIN operations.priest_assignments current_assignment
    ON current_assignment.priest_id = proposed.priest_id
   AND current_assignment.assignment_role = 'parish_priest'
   AND current_assignment.is_active = true
   AND current_assignment.deleted_at IS NULL
  JOIN diocese.institutions source_parish ON source_parish.id = current_assignment.institution_id
  JOIN diocese.institutions destination_parish ON destination_parish.id = proposed.to_parish_id
  ORDER BY priest.full_name, priest.email;
END;
$$;

CREATE OR REPLACE FUNCTION operations.execute_priest_reassignment(
  p_moves jsonb,
  p_executed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = operations, diocese, parishes, public, pg_catalog
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_execution_date date := current_date;
  v_execution_time timestamptz := now();
  v_assignment_count integer;
  v_vacancy_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('operations.priest-reassignment'));

  CREATE TEMP TABLE _validated_priest_moves ON COMMIT DROP AS
  SELECT * FROM operations.preview_priest_reassignment(p_moves);

  SELECT count(*), count(*) FILTER (WHERE creates_vacancy)
    INTO v_assignment_count, v_vacancy_count
  FROM _validated_priest_moves;

  INSERT INTO operations.priest_reassignment_batches (
    id, assignment_count, vacancy_count, status, executed_by, executed_at
  ) VALUES (
    v_batch_id, v_assignment_count, v_vacancy_count, 'completed', p_executed_by, v_execution_time
  );

  -- End every outgoing assignment before creating any incoming assignment.
  UPDATE operations.priest_assignments assignment
  SET end_date = v_execution_date - 1,
      status = 'transferred',
      is_active = false,
      updated_at = v_execution_time
  FROM _validated_priest_moves proposed
  WHERE assignment.id = proposed.old_assignment_id;

  UPDATE parishes.details details
  SET assigned_priest_id = NULL, updated_at = v_execution_time
  FROM _validated_priest_moves proposed
  WHERE details.institution_id = proposed.from_parish_id
    AND details.assigned_priest_id = proposed.priest_id;

  INSERT INTO operations.priest_assignments (
    priest_id, institution_id, assignment_role, start_date, status, is_active,
    assigned_by, reassignment_batch_id, previous_assignment_id
  )
  SELECT
    proposed.priest_id, proposed.to_parish_id, 'parish_priest', v_execution_date,
    'active', true, p_executed_by, v_batch_id, proposed.old_assignment_id
  FROM _validated_priest_moves proposed;

  INSERT INTO parishes.details (institution_id, assigned_priest_id, updated_at)
  SELECT proposed.to_parish_id, proposed.priest_id, v_execution_time
  FROM _validated_priest_moves proposed
  ON CONFLICT (institution_id) DO UPDATE
  SET assigned_priest_id = EXCLUDED.assigned_priest_id,
      updated_at = EXCLUDED.updated_at;

  UPDATE diocese.profiles priest
  SET institution_id = proposed.to_parish_id,
      updated_at = v_execution_time
  FROM _validated_priest_moves proposed
  WHERE priest.id = proposed.priest_id;

  RETURN jsonb_build_object(
    'batchId', v_batch_id,
    'assignmentCount', v_assignment_count,
    'vacancyCount', v_vacancy_count,
    'executedAt', v_execution_time
  );
END;
$$;

REVOKE ALL ON FUNCTION operations.preview_priest_reassignment(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION operations.execute_priest_reassignment(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations.preview_priest_reassignment(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION operations.execute_priest_reassignment(jsonb, uuid) TO service_role;
GRANT SELECT ON operations.priest_reassignment_batches TO authenticated, service_role;

COMMIT;
