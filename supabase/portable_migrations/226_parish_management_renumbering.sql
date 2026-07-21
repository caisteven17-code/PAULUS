-- Batch 1: direct, permission-restricted parish creation with global official
-- source-code renumbering. No approval workflow is introduced.

BEGIN;

ALTER TABLE parishes.details
  ADD COLUMN IF NOT EXISTS iafr_source_code text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parish_details_iafr_source_code
  ON parishes.details (upper(regexp_replace(trim(iafr_source_code), '\s+', '', 'g')))
  WHERE iafr_source_code IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS operations.parish_renumbering_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_parish_id uuid NOT NULL REFERENCES diocese.institutions(id),
  requested_source_code text NOT NULL,
  affected_parish_count integer NOT NULL DEFAULT 0 CHECK (affected_parish_count >= 0),
  effective_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('completed', 'failed')),
  executed_by uuid REFERENCES diocese.profiles(id) ON DELETE SET NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS operations.parish_source_code_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES operations.parish_renumbering_batches(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES diocese.institutions(id) ON DELETE RESTRICT,
  old_source_code text,
  new_source_code text NOT NULL,
  effective_at timestamptz NOT NULL,
  changed_by uuid REFERENCES diocese.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parish_source_code_history_has_change
    CHECK (old_source_code IS DISTINCT FROM new_source_code)
);

CREATE INDEX IF NOT EXISTS idx_parish_renumbering_batches_executed_at
  ON operations.parish_renumbering_batches (executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_parish_source_code_history_institution
  ON operations.parish_source_code_history (institution_id, effective_at DESC);

CREATE INDEX IF NOT EXISTS idx_parish_source_code_history_old_code
  ON operations.parish_source_code_history (old_source_code, effective_at DESC)
  WHERE old_source_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parish_source_code_history_new_code
  ON operations.parish_source_code_history (new_source_code, effective_at DESC);

CREATE OR REPLACE FUNCTION operations.preview_parish_source_code_insert(p_requested_source_code text)
RETURNS TABLE (
  institution_id uuid,
  parish_name text,
  old_source_code text,
  new_source_code text,
  sequence_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = operations, diocese, public, pg_catalog
AS $$
DECLARE
  v_code text := upper(regexp_replace(trim(coalesce(p_requested_source_code, '')), '\s+', '', 'g'));
  v_position integer;
BEGIN
  IF v_code !~ '^D[1-4]-[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'Source code must use the official D#-# format.';
  END IF;

  v_position := split_part(v_code, '-', 2)::integer;

  IF EXISTS (
    SELECT 1
    FROM diocese.institutions i
    WHERE i.institution_type = 'parish'
      AND i.is_active = true
      AND i.deleted_at IS NULL
      AND upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')) ~ '^D[1-4]-[1-9][0-9]*$'
    GROUP BY split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'The current parish sequence contains duplicate numeric positions and must be corrected first.';
  END IF;

  IF v_position > coalesce((
    SELECT max(split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer) + 1
    FROM diocese.institutions i
    WHERE i.institution_type = 'parish'
      AND i.is_active = true
      AND i.deleted_at IS NULL
      AND upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')) ~ '^D[1-4]-[1-9][0-9]*$'
  ), 1) THEN
    RAISE EXCEPTION 'The requested code would create a gap in the official parish sequence.';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.name,
    upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')),
    split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 1)
      || '-' || (split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer + 1)::text,
    split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer
  FROM diocese.institutions i
  WHERE i.institution_type = 'parish'
    AND i.is_active = true
    AND i.deleted_at IS NULL
    AND upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')) ~ '^D[1-4]-[1-9][0-9]*$'
    AND split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer >= v_position
  ORDER BY sequence_number;
END;
$$;

CREATE OR REPLACE FUNCTION operations.create_parish_with_source_code_renumbering(
  p_parish jsonb,
  p_requested_source_code text,
  p_changed_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = operations, diocese, parishes, public, pg_catalog
AS $$
DECLARE
  v_code text := upper(regexp_replace(trim(coalesce(p_requested_source_code, '')), '\s+', '', 'g'));
  v_prefix text;
  v_position integer;
  v_expected_prefix text;
  v_new_parish_id uuid;
  v_batch_id uuid := gen_random_uuid();
  v_effective_at timestamptz := now();
  v_affected_count integer := 0;
  v_class text;
BEGIN
  IF v_code !~ '^D[1-4]-[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'Source code must use the official D#-# format.';
  END IF;
  IF nullif(trim(p_parish->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Parish name is required.';
  END IF;
  v_prefix := split_part(v_code, '-', 1);
  v_position := split_part(v_code, '-', 2)::integer;
  v_expected_prefix := CASE lower(trim(coalesce(p_parish->>'district', '')))
    WHEN 'district i' THEN 'D1' WHEN 'district 1' THEN 'D1'
    WHEN 'district ii' THEN 'D2' WHEN 'district 2' THEN 'D2'
    WHEN 'district iii' THEN 'D3' WHEN 'district 3' THEN 'D3'
    WHEN 'district iv' THEN 'D4' WHEN 'district 4' THEN 'D4'
    ELSE NULL
  END;
  IF v_expected_prefix IS NULL THEN
    RAISE EXCEPTION 'A valid parish district is required.';
  END IF;
  IF v_expected_prefix <> v_prefix THEN
    RAISE EXCEPTION 'The source-code prefix does not match the selected district.';
  END IF;

  v_class := upper(regexp_replace(coalesce(p_parish->>'class', ''), '^Class\s+', '', 'i'));
  IF v_class NOT IN ('A', 'B', 'C', 'D', 'E') THEN v_class := NULL; END IF;

  -- Only one official renumbering may calculate and write at a time.
  PERFORM pg_advisory_xact_lock(hashtext('operations.parish-source-code-renumbering'));

  IF EXISTS (
    SELECT 1
    FROM diocese.institutions i
    WHERE i.institution_type = 'parish'
      AND i.is_active = true
      AND i.deleted_at IS NULL
      AND upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')) ~ '^D[1-4]-[1-9][0-9]*$'
    GROUP BY split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'The current parish sequence contains duplicate numeric positions and must be corrected first.';
  END IF;

  IF v_position > coalesce((
    SELECT max(split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer) + 1
    FROM diocese.institutions i
    WHERE i.institution_type = 'parish'
      AND i.is_active = true
      AND i.deleted_at IS NULL
      AND upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')) ~ '^D[1-4]-[1-9][0-9]*$'
  ), 1) THEN
    RAISE EXCEPTION 'The requested code would create a gap in the official parish sequence.';
  END IF;

  CREATE TEMP TABLE _parish_code_shift ON COMMIT DROP AS
  SELECT
    i.id AS institution_id,
    upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')) AS old_source_code,
    split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 1)
      || '-' || (split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer + 1)::text
      AS new_source_code
  FROM diocese.institutions i
  WHERE i.institution_type = 'parish'
    AND i.is_active = true
    AND i.deleted_at IS NULL
    AND upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')) ~ '^D[1-4]-[1-9][0-9]*$'
    AND split_part(upper(regexp_replace(trim(i.institution_code), '\s+', '', 'g')), '-', 2)::integer >= v_position;

  SELECT count(*) INTO v_affected_count FROM _parish_code_shift;

  INSERT INTO diocese.institutions (
    name, institution_type, vicariate, district, class, address,
    contact_number, email, latitude, longitude, institution_code, is_active
  ) VALUES (
    trim(p_parish->>'name'), 'parish', nullif(trim(p_parish->>'vicariate'), ''),
    trim(p_parish->>'district'), v_class, nullif(trim(p_parish->>'address'), ''),
    nullif(trim(p_parish->>'contact_number'), ''), nullif(trim(p_parish->>'email'), ''),
    nullif(p_parish->>'latitude', '')::numeric, nullif(p_parish->>'longitude', '')::numeric,
    'TMP-NEW-' || replace(v_batch_id::text, '-', ''), false
  ) RETURNING id INTO v_new_parish_id;

  INSERT INTO parishes.details (institution_id)
  VALUES (v_new_parish_id)
  ON CONFLICT (institution_id) DO NOTHING;

  -- Clear both canonical current-code locations before final assignment so
  -- immediate unique indexes cannot observe a transient duplicate.
  UPDATE diocese.institutions i
  SET institution_code = 'TMP-' || replace(i.id::text, '-', ''), updated_at = now()
  FROM _parish_code_shift s
  WHERE i.id = s.institution_id;

  UPDATE parishes.details pd
  SET iafr_source_code = NULL, updated_at = now()
  FROM _parish_code_shift s
  WHERE pd.institution_id = s.institution_id;

  UPDATE operations.parish_import_aliases a
  SET source_code = 'TMP-' || replace(a.id::text, '-', ''), updated_at = now()
  FROM _parish_code_shift s
  WHERE a.institution_id = s.institution_id
    AND a.source_code IS NOT NULL
    AND upper(regexp_replace(trim(a.source_code), '\s+', '', 'g')) = s.old_source_code
    AND a.deleted_at IS NULL;

  UPDATE diocese.institutions i
  SET institution_code = s.new_source_code, updated_at = now()
  FROM _parish_code_shift s
  WHERE i.id = s.institution_id;

  UPDATE parishes.details pd
  SET iafr_source_code = s.new_source_code, updated_at = now()
  FROM _parish_code_shift s
  WHERE pd.institution_id = s.institution_id;

  UPDATE operations.parish_import_aliases a
  SET source_code = s.new_source_code, updated_at = now()
  FROM _parish_code_shift s
  WHERE a.institution_id = s.institution_id
    AND a.source_code LIKE 'TMP-%'
    AND a.deleted_at IS NULL;

  UPDATE diocese.institutions
  SET institution_code = v_code, is_active = true, updated_at = now()
  WHERE id = v_new_parish_id;

  UPDATE parishes.details
  SET iafr_source_code = v_code, updated_at = now()
  WHERE institution_id = v_new_parish_id;

  INSERT INTO operations.parish_renumbering_batches (
    id, new_parish_id, requested_source_code, affected_parish_count,
    effective_at, status, executed_by, executed_at
  ) VALUES (
    v_batch_id, v_new_parish_id, v_code, v_affected_count,
    v_effective_at, 'completed', p_changed_by, v_effective_at
  );

  INSERT INTO operations.parish_source_code_history (
    batch_id, institution_id, old_source_code, new_source_code,
    effective_at, changed_by
  )
  SELECT v_batch_id, s.institution_id, s.old_source_code, s.new_source_code,
         v_effective_at, p_changed_by
  FROM _parish_code_shift s;

  INSERT INTO operations.parish_source_code_history (
    batch_id, institution_id, old_source_code, new_source_code,
    effective_at, changed_by
  ) VALUES (
    v_batch_id, v_new_parish_id, NULL, v_code,
    v_effective_at, p_changed_by
  );

  RETURN jsonb_build_object(
    'batchId', v_batch_id,
    'institutionId', v_new_parish_id,
    'institutionCode', v_code,
    'affectedParishCount', v_affected_count,
    'effectiveAt', v_effective_at
  );
END;
$$;

REVOKE ALL ON FUNCTION operations.preview_parish_source_code_insert(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION operations.create_parish_with_source_code_renumbering(jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations.preview_parish_source_code_insert(text) TO service_role;
GRANT EXECUTE ON FUNCTION operations.create_parish_with_source_code_renumbering(jsonb, text, uuid) TO service_role;
GRANT SELECT ON operations.parish_renumbering_batches TO authenticated, service_role;
GRANT SELECT ON operations.parish_source_code_history TO authenticated, service_role;

COMMIT;
