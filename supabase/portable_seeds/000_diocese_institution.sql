-- Central diocesan institution seed.
-- Safe to re-run. This gives diocese-level users a real institution_id FK target.

ALTER TABLE diocese.institutions
  DROP CONSTRAINT IF EXISTS institutions_institution_type_check;

ALTER TABLE diocese.institutions
  DROP CONSTRAINT IF EXISTS institutions_entity_type_check;

UPDATE diocese.institutions
SET institution_type = 'diocese',
    updated_at = now()
WHERE institution_type = 'chancery';

ALTER TABLE diocese.institutions
  ADD CONSTRAINT institutions_institution_type_check
  CHECK (institution_type IN ('diocese', 'parish', 'school', 'seminary'));

DO $$
DECLARE
  v_diocese_id uuid := '11111111-1111-4111-8111-111111111111';
  v_existing_id uuid;
BEGIN
  SELECT id
    INTO v_existing_id
  FROM diocese.institutions
  WHERE id = v_diocese_id
     OR lower(name) = lower('Diocese of San Pablo')
     OR lower(email) = lower('diocese@diocese-sanpablo.ph')
     OR lower(email) = lower('chancery@diocese-sanpablo.ph')
  ORDER BY CASE WHEN id = v_diocese_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO diocese.institutions (
      id,
      name,
      institution_type,
      vicariate,
      district,
      cluster,
      class,
      address,
      contact_number,
      email,
      is_active,
      deleted_at
    )
    VALUES (
      v_diocese_id,
      'Diocese of San Pablo',
      'diocese',
      NULL,
      NULL,
      NULL,
      NULL,
      'San Pablo City, Laguna',
      NULL,
      'diocese@diocese-sanpablo.ph',
      true,
      NULL
    );
  ELSE
    UPDATE diocese.institutions
    SET name = 'Diocese of San Pablo',
        institution_type = 'diocese',
        address = COALESCE(address, 'San Pablo City, Laguna'),
        email = COALESCE(email, 'diocese@diocese-sanpablo.ph'),
        is_active = true,
        deleted_at = NULL,
        updated_at = now()
    WHERE id = v_existing_id;

    v_diocese_id := v_existing_id;
  END IF;

  UPDATE diocese.profiles
  SET institution_id = v_diocese_id,
      updated_at = now()
  WHERE institution_id IS NULL
    AND role_id IN ('bishop', 'chancellor', 'diocesan_oeconomus', 'finance_staff');
END $$;
