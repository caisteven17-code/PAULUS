-- Qualify the temporary movement column so it cannot conflict with the
-- preview function's priest_id output parameter.

BEGIN;

DO $migration$
DECLARE
  v_definition text;
  v_corrected_definition text;
BEGIN
  SELECT pg_get_functiondef('operations.preview_priest_reassignment(jsonb)'::regprocedure)
    INTO v_definition;

  v_corrected_definition := replace(
    v_definition,
    'WHERE priest_id IS NULL',
    'WHERE _proposed_priest_moves.priest_id IS NULL'
  );

  IF v_corrected_definition = v_definition THEN
    RAISE EXCEPTION 'Expected ambiguous priest_id predicate was not found in preview_priest_reassignment.';
  END IF;

  EXECUTE v_corrected_definition;
END;
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;
