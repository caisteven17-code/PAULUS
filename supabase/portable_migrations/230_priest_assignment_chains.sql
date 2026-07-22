-- Complete Parish Priest movement chains.
-- 1. Imports current legacy parish links into the permanent assignment ledger.
-- 2. Allows an unassigned priest to enter a parish.
-- 3. Allows an assigned priest to finish as relieved / without a parish.

BEGIN;

-- parishes.details is the authoritative legacy current-priest field.
INSERT INTO operations.priest_assignments (
  priest_id, institution_id, assignment_role, start_date, status, is_active
)
SELECT
  details.assigned_priest_id,
  details.institution_id,
  'parish_priest',
  current_date,
  'active',
  true
FROM parishes.details details
JOIN diocese.profiles priest
  ON priest.id = details.assigned_priest_id
 AND priest.is_active = true
 AND priest.deleted_at IS NULL
JOIN diocese.institutions parish
  ON parish.id = details.institution_id
 AND parish.institution_type = 'parish'
 AND parish.is_active = true
 AND parish.deleted_at IS NULL
WHERE details.assigned_priest_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM operations.priest_assignments assignment
    WHERE assignment.priest_id = details.assigned_priest_id
      AND assignment.is_active = true
      AND assignment.deleted_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM operations.priest_assignments assignment
    WHERE assignment.institution_id = details.institution_id
      AND assignment.assignment_role = 'parish_priest'
      AND assignment.is_active = true
      AND assignment.deleted_at IS NULL
  )
ON CONFLICT DO NOTHING;

-- Fall back to the priest profile link when the parish details row has not
-- yet been populated. Existing active ledger records always take precedence.
INSERT INTO operations.priest_assignments (
  priest_id, institution_id, assignment_role, start_date, status, is_active
)
SELECT
  priest.id,
  priest.institution_id,
  'parish_priest',
  current_date,
  'active',
  true
FROM diocese.profiles priest
JOIN diocese.institutions parish
  ON parish.id = priest.institution_id
 AND parish.institution_type = 'parish'
 AND parish.is_active = true
 AND parish.deleted_at IS NULL
WHERE priest.role_id = 'parish_priest'
  AND priest.is_active = true
  AND priest.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM operations.priest_assignments assignment
    WHERE assignment.priest_id = priest.id
      AND assignment.is_active = true
      AND assignment.deleted_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM operations.priest_assignments assignment
    WHERE assignment.institution_id = priest.institution_id
      AND assignment.assignment_role = 'parish_priest'
      AND assignment.is_active = true
      AND assignment.deleted_at IS NULL
  )
ON CONFLICT DO NOTHING;

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
    RAISE EXCEPTION 'Add at least one Parish Priest movement.';
  END IF;

  CREATE TEMP TABLE _proposed_priest_moves ON COMMIT DROP AS
  SELECT
    nullif(move->>'priestId', '')::uuid AS priest_id,
    nullif(move->>'toParishId', '')::uuid AS to_parish_id
  FROM jsonb_array_elements(p_moves) move;

  SELECT count(*) INTO v_move_count FROM _proposed_priest_moves;

  IF EXISTS (
    SELECT 1
    FROM _proposed_priest_moves proposed
    WHERE proposed.priest_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Select a priest for every movement.';
  END IF;
  IF (SELECT count(DISTINCT proposed.priest_id) FROM _proposed_priest_moves proposed) <> v_move_count THEN
    RAISE EXCEPTION 'A priest appears more than once in the movement plan.';
  END IF;
  IF (SELECT count(proposed.to_parish_id) FROM _proposed_priest_moves proposed)
     <> (SELECT count(DISTINCT proposed.to_parish_id) FROM _proposed_priest_moves proposed) THEN
    RAISE EXCEPTION 'Two priests cannot be assigned to the same destination parish.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _proposed_priest_moves proposed
    LEFT JOIN diocese.profiles priest ON priest.id = proposed.priest_id
    WHERE priest.id IS NULL OR priest.is_active = false OR priest.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The plan contains an inactive or unknown priest.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM _proposed_priest_moves proposed
    LEFT JOIN diocese.institutions parish ON parish.id = proposed.to_parish_id
    WHERE proposed.to_parish_id IS NOT NULL
      AND (parish.id IS NULL OR parish.institution_type <> 'parish'
        OR parish.is_active = false OR parish.deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'The plan contains an inactive or unknown destination parish.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM _proposed_priest_moves proposed
    LEFT JOIN operations.priest_assignments current_assignment
      ON current_assignment.priest_id = proposed.priest_id
     AND current_assignment.assignment_role = 'parish_priest'
     AND current_assignment.is_active = true
     AND current_assignment.deleted_at IS NULL
    WHERE current_assignment.id IS NULL AND proposed.to_parish_id IS NULL
  ) THEN
    RAISE EXCEPTION 'An already unassigned priest cannot be relieved from a parish.';
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
    RAISE EXCEPTION 'A priest cannot be moved to the same parish.';
  END IF;

  -- An occupied destination is valid only when its incumbent is included in
  -- this same plan and is moving elsewhere or ending without a parish.
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
    RAISE EXCEPTION 'A destination is occupied. Add its current priest to the same plan and select where that priest will go.';
  END IF;

  RETURN QUERY
  SELECT
    priest.id,
    coalesce(priest.full_name, priest.email, 'Unnamed priest'),
    current_assignment.id,
    current_assignment.institution_id,
    coalesce(source_parish.name, 'Unassigned'),
    proposed.to_parish_id,
    coalesce(destination_parish.name, 'Relieved / No Parish'),
    current_assignment.id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM _proposed_priest_moves incoming
      WHERE incoming.to_parish_id = current_assignment.institution_id
    )
  FROM _proposed_priest_moves proposed
  JOIN diocese.profiles priest ON priest.id = proposed.priest_id
  LEFT JOIN operations.priest_assignments current_assignment
    ON current_assignment.priest_id = proposed.priest_id
   AND current_assignment.assignment_role = 'parish_priest'
   AND current_assignment.is_active = true
   AND current_assignment.deleted_at IS NULL
  LEFT JOIN diocese.institutions source_parish ON source_parish.id = current_assignment.institution_id
  LEFT JOIN diocese.institutions destination_parish ON destination_parish.id = proposed.to_parish_id
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

  UPDATE operations.priest_assignments assignment
  SET end_date = v_execution_date,
      status = CASE WHEN proposed.to_parish_id IS NULL THEN 'completed' ELSE 'transferred' END,
      is_active = false,
      updated_at = v_execution_time
  FROM _validated_priest_moves proposed
  WHERE proposed.old_assignment_id IS NOT NULL
    AND assignment.id = proposed.old_assignment_id;

  UPDATE parishes.details details
  SET assigned_priest_id = NULL, updated_at = v_execution_time
  FROM _validated_priest_moves proposed
  WHERE proposed.from_parish_id IS NOT NULL
    AND details.institution_id = proposed.from_parish_id
    AND details.assigned_priest_id = proposed.priest_id;

  UPDATE diocese.profiles priest
  SET institution_id = NULL, updated_at = v_execution_time
  FROM _validated_priest_moves proposed
  WHERE priest.id = proposed.priest_id;

  INSERT INTO operations.priest_assignments (
    priest_id, institution_id, assignment_role, start_date, status, is_active,
    assigned_by, reassignment_batch_id, previous_assignment_id
  )
  SELECT
    proposed.priest_id, proposed.to_parish_id, 'parish_priest', v_execution_date,
    'active', true, p_executed_by, v_batch_id, proposed.old_assignment_id
  FROM _validated_priest_moves proposed
  WHERE proposed.to_parish_id IS NOT NULL;

  INSERT INTO parishes.details (institution_id, assigned_priest_id, updated_at)
  SELECT proposed.to_parish_id, proposed.priest_id, v_execution_time
  FROM _validated_priest_moves proposed
  WHERE proposed.to_parish_id IS NOT NULL
  ON CONFLICT (institution_id) DO UPDATE
  SET assigned_priest_id = EXCLUDED.assigned_priest_id,
      updated_at = EXCLUDED.updated_at;

  UPDATE diocese.profiles priest
  SET institution_id = proposed.to_parish_id, updated_at = v_execution_time
  FROM _validated_priest_moves proposed
  WHERE proposed.to_parish_id IS NOT NULL
    AND priest.id = proposed.priest_id;

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

COMMIT;
