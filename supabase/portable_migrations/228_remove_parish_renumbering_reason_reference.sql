-- Removes the optional descriptive fields from the already-deployed parish
-- renumbering schema. Existing batch and source-code mapping rows are retained.
--
-- Deployment order for an existing installation:
--   1. Run this migration.
--   2. Re-run 226_parish_management_renumbering.sql.
--   3. Re-run 227_bulk_parish_reordering.sql.

BEGIN;

DROP FUNCTION IF EXISTS operations.create_parish_with_source_code_renumbering(
  jsonb, text, uuid, text, text
);

DROP FUNCTION IF EXISTS operations.execute_bulk_parish_reorder(
  text, uuid[], uuid, text, text
);

ALTER TABLE operations.parish_renumbering_batches
  DROP COLUMN IF EXISTS change_reason,
  DROP COLUMN IF EXISTS canonical_reference;

ALTER TABLE operations.parish_source_code_history
  DROP COLUMN IF EXISTS change_reason,
  DROP COLUMN IF EXISTS canonical_reference;

COMMIT;
