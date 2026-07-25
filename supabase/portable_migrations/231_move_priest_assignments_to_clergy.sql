-- Domain-boundary correction:
--   clergy    = permanent clergy assignment history
--   operations = workflow execution/batch records only
--
-- ALTER TABLE ... SET SCHEMA moves the existing table; it does not copy rows
-- or generate new IDs. PostgreSQL preserves its data, indexes, constraints,
-- triggers, and foreign-key relationships.

BEGIN;

CREATE SCHEMA IF NOT EXISTS clergy;
COMMENT ON SCHEMA clergy IS
  'Permanent clergy-domain records, including current and historical pastoral assignments.';

ALTER TABLE IF EXISTS operations.priest_assignments SET SCHEMA clergy;

COMMENT ON TABLE clergy.priest_assignments IS
  'Official permanent timeline of clergy assignments. Reassignment workflow batches remain in operations.';

-- The reassignment RPCs remain workflow operations, but their permanent
-- assignment reads/writes must now target the clergy domain.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('operations.preview_priest_reassignment(jsonb)'::regprocedure)
    INTO v_definition;
  v_definition := replace(
    v_definition,
    'operations.priest_assignments',
    'clergy.priest_assignments'
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef('operations.execute_priest_reassignment(jsonb,uuid)'::regprocedure)
    INTO v_definition;
  v_definition := replace(
    v_definition,
    'operations.priest_assignments',
    'clergy.priest_assignments'
  );
  EXECUTE v_definition;
END;
$migration$;

GRANT USAGE ON SCHEMA clergy TO authenticated, service_role;
GRANT SELECT ON clergy.priest_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON clergy.priest_assignments TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
