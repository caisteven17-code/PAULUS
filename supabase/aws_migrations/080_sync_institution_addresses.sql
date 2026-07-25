-- Synchronize the operational institution address into AWS analytical
-- dimensions. Supabase remains authoritative; AWS stores only the address
-- needed for institutional reporting and location-based analytics.

ALTER TABLE shared_analytics.dim_institutions
  ADD COLUMN IF NOT EXISTS address text;

CREATE OR REPLACE FUNCTION shared_analytics.propagate_institution_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, shared_analytics, parish_analytics, school_analytics, seminary_analytics
AS $$
BEGIN
  IF NEW.institution_type = 'parish' THEN
    UPDATE parish_analytics.dim_parishes
    SET address = NEW.address
    WHERE institution_key = NEW.institution_key
      AND address IS DISTINCT FROM NEW.address;
  ELSIF NEW.institution_type = 'school' THEN
    UPDATE school_analytics.dim_schools
    SET address = NEW.address
    WHERE institution_key = NEW.institution_key
      AND address IS DISTINCT FROM NEW.address;
  ELSIF NEW.institution_type = 'seminary' THEN
    UPDATE seminary_analytics.dim_seminaries
    SET address = NEW.address
    WHERE institution_key = NEW.institution_key
      AND address IS DISTINCT FROM NEW.address;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS propagate_institution_address
  ON shared_analytics.dim_institutions;

CREATE TRIGGER propagate_institution_address
AFTER INSERT OR UPDATE OF address
ON shared_analytics.dim_institutions
FOR EACH ROW
EXECUTE FUNCTION shared_analytics.propagate_institution_address();

-- Backfill type-specific dimensions from any addresses already present in the
-- shared dimension. The v2 incremental worker performs the source backfill
-- from Supabase for deployments where this column starts empty.
UPDATE parish_analytics.dim_parishes parish
SET address = institution.address
FROM shared_analytics.dim_institutions institution
WHERE institution.institution_key = parish.institution_key
  AND institution.institution_type = 'parish'
  AND parish.address IS DISTINCT FROM institution.address;

UPDATE school_analytics.dim_schools school
SET address = institution.address
FROM shared_analytics.dim_institutions institution
WHERE institution.institution_key = school.institution_key
  AND institution.institution_type = 'school'
  AND school.address IS DISTINCT FROM institution.address;

UPDATE seminary_analytics.dim_seminaries seminary
SET address = institution.address
FROM shared_analytics.dim_institutions institution
WHERE institution.institution_key = seminary.institution_key
  AND institution.institution_type = 'seminary'
  AND seminary.address IS DISTINCT FROM institution.address;

COMMENT ON COLUMN shared_analytics.dim_institutions.address IS
  'Reporting address synchronized from the authoritative Supabase institution record.';
