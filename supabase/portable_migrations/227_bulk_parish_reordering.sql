-- Incremental extension for migration 226.
-- Reorders all active parishes inside one district while preserving the
-- district's existing set of globally-sequenced numeric source-code slots.

BEGIN;

ALTER TABLE operations.parish_renumbering_batches
  ALTER COLUMN new_parish_id DROP NOT NULL;

ALTER TABLE operations.parish_renumbering_batches
  ADD COLUMN IF NOT EXISTS operation_type text NOT NULL DEFAULT 'new_parish_insert';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parish_renumbering_batches_operation_type_check'
      AND conrelid = 'operations.parish_renumbering_batches'::regclass
  ) THEN
    ALTER TABLE operations.parish_renumbering_batches
      ADD CONSTRAINT parish_renumbering_batches_operation_type_check
      CHECK (operation_type IN ('new_parish_insert', 'bulk_reorder'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION operations.preview_bulk_parish_reorder(
  p_district text,
  p_order uuid[]
)
RETURNS TABLE (
  institution_id uuid,
  parish_name text,
  old_source_code text,
  new_source_code text,
  old_position integer,
  new_position integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = operations, diocese, public, pg_catalog
AS $$
DECLARE
  v_district text;
  v_prefix text;
  v_expected_count integer;
BEGIN
  v_district := CASE lower(trim(coalesce(p_district, '')))
    WHEN 'district i' THEN 'District I' WHEN 'district 1' THEN 'District I'
    WHEN 'district ii' THEN 'District II' WHEN 'district 2' THEN 'District II'
    WHEN 'district iii' THEN 'District III' WHEN 'district 3' THEN 'District III'
    WHEN 'district iv' THEN 'District IV' WHEN 'district 4' THEN 'District IV'
    ELSE NULL
  END;
  v_prefix := CASE v_district
    WHEN 'District I' THEN 'D1' WHEN 'District II' THEN 'D2'
    WHEN 'District III' THEN 'D3' WHEN 'District IV' THEN 'D4'
  END;

  IF v_district IS NULL THEN
    RAISE EXCEPTION 'Select a valid district.';
  END IF;
  IF coalesce(cardinality(p_order), 0) = 0 THEN
    RAISE EXCEPTION 'The parish order cannot be empty.';
  END IF;
  IF cardinality(p_order) <> (SELECT count(DISTINCT item) FROM unnest(p_order) item) THEN
    RAISE EXCEPTION 'A parish appears more than once in the proposed order.';
  END IF;

  SELECT count(*) INTO v_expected_count
  FROM diocese.institutions i
  WHERE i.institution_type = 'parish'
    AND i.district = v_district
    AND i.is_active = true
    AND i.deleted_at IS NULL;

  IF cardinality(p_order) <> v_expected_count THEN
    RAISE EXCEPTION 'The proposed order must include every active parish in the selected district exactly once.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_order) proposed(institution_id)
    LEFT JOIN diocese.institutions i ON i.id = proposed.institution_id
    WHERE i.id IS NULL
       OR i.institution_type <> 'parish'
       OR i.district <> v_district
       OR i.is_active = false
       OR i.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The proposed order contains a parish outside the selected district or an inactive parish.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM diocese.institutions i
    WHERE i.institution_type = 'parish'
      AND i.district = v_district
      AND i.is_active = true
      AND i.deleted_at IS NULL
      AND upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')) !~ ('^' || v_prefix || '-[1-9][0-9]*$')
  ) THEN
    RAISE EXCEPTION 'One or more current parish codes do not match the selected district.';
  END IF;

  RETURN QUERY
  WITH district_slots AS (
    SELECT
      row_number() OVER (
        ORDER BY split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer
      )::integer AS slot,
      upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')) AS source_code
    FROM diocese.institutions i
    WHERE i.institution_type = 'parish'
      AND i.district = v_district
      AND i.is_active = true
      AND i.deleted_at IS NULL
  ),
  proposed_order AS (
    SELECT proposed.institution_id, proposed.ordinality::integer AS slot
    FROM unnest(p_order) WITH ORDINALITY proposed(institution_id, ordinality)
  )
  SELECT
    i.id,
    i.name,
    upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')),
    slots.source_code,
    split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer,
    split_part(slots.source_code, '-', 2)::integer
  FROM proposed_order proposed
  JOIN district_slots slots ON slots.slot = proposed.slot
  JOIN diocese.institutions i ON i.id = proposed.institution_id
  ORDER BY proposed.slot;
END;
$$;

CREATE OR REPLACE FUNCTION operations.execute_bulk_parish_reorder(
  p_district text,
  p_order uuid[],
  p_changed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = operations, diocese, parishes, public, pg_catalog
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_effective_at timestamptz := now();
  v_changed_count integer;
  v_district text;
BEGIN
  v_district := CASE lower(trim(coalesce(p_district, '')))
    WHEN 'district i' THEN 'District I' WHEN 'district 1' THEN 'District I'
    WHEN 'district ii' THEN 'District II' WHEN 'district 2' THEN 'District II'
    WHEN 'district iii' THEN 'District III' WHEN 'district 3' THEN 'District III'
    WHEN 'district iv' THEN 'District IV' WHEN 'district 4' THEN 'District IV'
    ELSE NULL
  END;

  PERFORM pg_advisory_xact_lock(hashtext('operations.parish-source-code-renumbering'));

  CREATE TEMP TABLE _bulk_parish_reorder ON COMMIT DROP AS
  SELECT *
  FROM operations.preview_bulk_parish_reorder(v_district, p_order)
  WHERE old_source_code IS DISTINCT FROM new_source_code;

  SELECT count(*) INTO v_changed_count FROM _bulk_parish_reorder;
  IF v_changed_count = 0 THEN
    RAISE EXCEPTION 'The proposed order does not change any parish source codes.';
  END IF;

  UPDATE diocese.institutions i
  SET institution_code = 'TMP-' || replace(i.id::text, '-', ''), updated_at = now()
  FROM _bulk_parish_reorder proposed
  WHERE i.id = proposed.institution_id;

  UPDATE parishes.details pd
  SET iafr_source_code = NULL, updated_at = now()
  FROM _bulk_parish_reorder proposed
  WHERE pd.institution_id = proposed.institution_id;

  UPDATE operations.parish_import_aliases a
  SET source_code = 'TMP-' || replace(a.id::text, '-', ''), updated_at = now()
  FROM _bulk_parish_reorder proposed
  WHERE a.institution_id = proposed.institution_id
    AND upper(regexp_replace(trim(a.source_code), '\s+', '', 'g')) = proposed.old_source_code
    AND a.deleted_at IS NULL;

  UPDATE diocese.institutions i
  SET institution_code = proposed.new_source_code, updated_at = now()
  FROM _bulk_parish_reorder proposed
  WHERE i.id = proposed.institution_id;

  UPDATE parishes.details pd
  SET iafr_source_code = proposed.new_source_code, updated_at = now()
  FROM _bulk_parish_reorder proposed
  WHERE pd.institution_id = proposed.institution_id;

  UPDATE operations.parish_import_aliases a
  SET source_code = proposed.new_source_code, updated_at = now()
  FROM _bulk_parish_reorder proposed
  WHERE a.institution_id = proposed.institution_id
    AND a.source_code LIKE 'TMP-%'
    AND a.deleted_at IS NULL;

  INSERT INTO operations.parish_renumbering_batches (
    id, new_parish_id, requested_source_code, affected_parish_count,
    effective_at, status, executed_by, executed_at, operation_type
  ) VALUES (
    v_batch_id, NULL, 'BULK-' || replace(v_district, 'District ', 'D'), v_changed_count,
    v_effective_at, 'completed', p_changed_by, v_effective_at, 'bulk_reorder'
  );

  INSERT INTO operations.parish_source_code_history (
    batch_id, institution_id, old_source_code, new_source_code,
    effective_at, changed_by
  )
  SELECT v_batch_id, proposed.institution_id, proposed.old_source_code, proposed.new_source_code,
         v_effective_at, p_changed_by
  FROM _bulk_parish_reorder proposed;

  RETURN jsonb_build_object(
    'batchId', v_batch_id,
    'district', v_district,
    'affectedParishCount', v_changed_count,
    'effectiveAt', v_effective_at
  );
END;
$$;

REVOKE ALL ON FUNCTION operations.preview_bulk_parish_reorder(text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION operations.execute_bulk_parish_reorder(text, uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations.preview_bulk_parish_reorder(text, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION operations.execute_bulk_parish_reorder(text, uuid[], uuid) TO service_role;

COMMIT;
