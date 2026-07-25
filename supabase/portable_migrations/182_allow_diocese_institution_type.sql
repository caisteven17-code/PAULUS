-- Migration 182: Use institution_type = 'diocese' for the diocesan institution.

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
