-- Add missing parish used by historical PUSHER workbooks.
-- Safe to re-run. The institution_code is intentionally not fixed here;
-- the existing institution-code trigger can assign the next proper P-#### code.

DO $$
DECLARE
  v_institution_id uuid;
  v_source_name text := 'SAN RAFAEL ARKANGHEL, Gulod, Cabuyao';
  v_normalized_source_name text;
BEGIN
  v_normalized_source_name := lower(regexp_replace(v_source_name, '[^a-zA-Z0-9]+', ' ', 'g'));
  v_normalized_source_name := trim(regexp_replace(v_normalized_source_name, '\s+', ' ', 'g'));

  SELECT id
    INTO v_institution_id
  FROM diocese.institutions
  WHERE institution_type = 'parish'
    AND deleted_at IS NULL
    AND (
      lower(name) = lower('San Rafael Arkanghel Parish')
      OR lower(name) = lower('San Rafael Arkanghel')
      OR lower(name) = lower('Parish of San Rafael Arkanghel')
    )
  LIMIT 1;

  IF v_institution_id IS NULL THEN
    INSERT INTO diocese.institutions (
      name,
      institution_type,
      vicariate,
      district,
      cluster,
      class,
      address,
      contact_number,
      email,
      is_active
    )
    VALUES (
      'San Rafael Arkanghel Parish',
      'parish',
      'St. Polycarp',
      NULL,
      NULL,
      NULL,
      'Gulod, Cabuyao, Laguna',
      NULL,
      NULL,
      true
    )
    RETURNING id INTO v_institution_id;
  ELSE
    UPDATE diocese.institutions
    SET name = 'San Rafael Arkanghel Parish',
        institution_type = 'parish',
        vicariate = COALESCE(vicariate, 'St. Polycarp'),
        address = COALESCE(address, 'Gulod, Cabuyao, Laguna'),
        is_active = true,
        deleted_at = NULL,
        updated_at = now()
    WHERE id = v_institution_id;
  END IF;

  INSERT INTO parishes.details (institution_id)
  VALUES (v_institution_id)
  ON CONFLICT (institution_id) DO UPDATE
  SET deleted_at = NULL,
      updated_at = now();

  IF to_regclass('operations.parish_import_aliases') IS NOT NULL THEN
    INSERT INTO operations.parish_import_aliases (
      source_code,
      source_name,
      normalized_source_name,
      institution_id,
      confidence,
      status,
      notes
    )
    VALUES (
      'D2-39',
      v_source_name,
      v_normalized_source_name,
      v_institution_id,
      1,
      'approved',
      'Added for historical PUSHER workbook parish matching.'
    )
    ON CONFLICT (source_code, normalized_source_name) DO UPDATE
    SET source_name = EXCLUDED.source_name,
        institution_id = EXCLUDED.institution_id,
        confidence = EXCLUDED.confidence,
        status = 'approved',
        notes = EXCLUDED.notes,
        deleted_at = NULL,
        updated_at = now();
  END IF;
END $$;
