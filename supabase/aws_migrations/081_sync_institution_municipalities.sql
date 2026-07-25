-- Add canonical municipality/city to AWS institution dimensions.

ALTER TABLE shared_analytics.dim_institutions
  ADD COLUMN IF NOT EXISTS municipality text;

ALTER TABLE parish_analytics.dim_parishes
  ADD COLUMN IF NOT EXISTS municipality text;

ALTER TABLE school_analytics.dim_schools
  ADD COLUMN IF NOT EXISTS municipality text;

ALTER TABLE seminary_analytics.dim_seminaries
  ADD COLUMN IF NOT EXISTS municipality text;

CREATE OR REPLACE FUNCTION shared_analytics.propagate_institution_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, shared_analytics, parish_analytics, school_analytics, seminary_analytics
AS $$
BEGIN
  IF NEW.institution_type = 'parish' THEN
    UPDATE parish_analytics.dim_parishes
    SET address = NEW.address,
        municipality = NEW.municipality
    WHERE institution_key = NEW.institution_key
      AND (
        address IS DISTINCT FROM NEW.address
        OR municipality IS DISTINCT FROM NEW.municipality
      );
  ELSIF NEW.institution_type = 'school' THEN
    UPDATE school_analytics.dim_schools
    SET address = NEW.address,
        municipality = NEW.municipality
    WHERE institution_key = NEW.institution_key
      AND (
        address IS DISTINCT FROM NEW.address
        OR municipality IS DISTINCT FROM NEW.municipality
      );
  ELSIF NEW.institution_type = 'seminary' THEN
    UPDATE seminary_analytics.dim_seminaries
    SET address = NEW.address,
        municipality = NEW.municipality
    WHERE institution_key = NEW.institution_key
      AND (
        address IS DISTINCT FROM NEW.address
        OR municipality IS DISTINCT FROM NEW.municipality
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS propagate_institution_address
  ON shared_analytics.dim_institutions;
DROP FUNCTION IF EXISTS shared_analytics.propagate_institution_address();

DROP TRIGGER IF EXISTS propagate_institution_location
  ON shared_analytics.dim_institutions;

CREATE TRIGGER propagate_institution_location
AFTER INSERT OR UPDATE OF address, municipality
ON shared_analytics.dim_institutions
FOR EACH ROW
EXECUTE FUNCTION shared_analytics.propagate_institution_location();

UPDATE parish_analytics.dim_parishes parish
SET address = institution.address,
    municipality = institution.municipality
FROM shared_analytics.dim_institutions institution
WHERE institution.institution_key = parish.institution_key
  AND institution.institution_type = 'parish'
  AND (
    parish.address IS DISTINCT FROM institution.address
    OR parish.municipality IS DISTINCT FROM institution.municipality
  );

UPDATE school_analytics.dim_schools school
SET address = institution.address,
    municipality = institution.municipality
FROM shared_analytics.dim_institutions institution
WHERE institution.institution_key = school.institution_key
  AND institution.institution_type = 'school'
  AND (
    school.address IS DISTINCT FROM institution.address
    OR school.municipality IS DISTINCT FROM institution.municipality
  );

UPDATE seminary_analytics.dim_seminaries seminary
SET address = institution.address,
    municipality = institution.municipality
FROM shared_analytics.dim_institutions institution
WHERE institution.institution_key = seminary.institution_key
  AND institution.institution_type = 'seminary'
  AND (
    seminary.address IS DISTINCT FROM institution.address
    OR seminary.municipality IS DISTINCT FROM institution.municipality
  );

COMMENT ON COLUMN shared_analytics.dim_institutions.municipality IS
  'Canonical Supabase municipality/city used for geographic and weather analytics.';
