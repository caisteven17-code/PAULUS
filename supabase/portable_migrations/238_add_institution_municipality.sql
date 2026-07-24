-- Store municipality/city separately from the full institution address.

ALTER TABLE diocese.institutions
  ADD COLUMN IF NOT EXISTS municipality text;

CREATE OR REPLACE FUNCTION public.normalize_laguna_municipality(
  p_municipality text,
  p_address text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  candidate text := nullif(trim(p_municipality), '');
  parts text[];
  part text;
  index_value integer;
BEGIN
  IF candidate IS NULL AND nullif(trim(p_address), '') IS NOT NULL THEN
    parts := regexp_split_to_array(trim(p_address), '\s*,\s*');
    index_value := coalesce(array_length(parts, 1), 0);

    WHILE index_value > 0 LOOP
      part := nullif(trim(parts[index_value]), '');
      IF part IS NOT NULL
         AND lower(part) NOT IN ('laguna', 'province of laguna', 'philippines') THEN
        candidate := part;
        EXIT;
      END IF;
      index_value := index_value - 1;
    END LOOP;
  END IF;

  IF candidate IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN CASE lower(regexp_replace(candidate, '\s+', ' ', 'g'))
    WHEN 'city of biñan' THEN 'Biñan City'
    WHEN 'biñan' THEN 'Biñan City'
    WHEN 'biñan city' THEN 'Biñan City'
    WHEN 'city of cabuyao' THEN 'Cabuyao City'
    WHEN 'cabuyao' THEN 'Cabuyao City'
    WHEN 'cabuyao city' THEN 'Cabuyao City'
    WHEN 'city of calamba' THEN 'Calamba City'
    WHEN 'calamba' THEN 'Calamba City'
    WHEN 'calamba city' THEN 'Calamba City'
    WHEN 'city of san pablo' THEN 'San Pablo City'
    WHEN 'san pablo' THEN 'San Pablo City'
    WHEN 'san pablo city' THEN 'San Pablo City'
    WHEN 'city of san pedro' THEN 'San Pedro City'
    WHEN 'san pedro' THEN 'San Pedro City'
    WHEN 'san pedro city' THEN 'San Pedro City'
    WHEN 'city of santa rosa' THEN 'Santa Rosa City'
    WHEN 'santa rosa' THEN 'Santa Rosa City'
    WHEN 'santa rosa city' THEN 'Santa Rosa City'
    ELSE candidate
  END;
END;
$$;

CREATE OR REPLACE FUNCTION diocese.set_institution_municipality()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, diocese
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.address IS DISTINCT FROM OLD.address
     AND NEW.municipality IS NOT DISTINCT FROM OLD.municipality THEN
    NEW.municipality := public.normalize_laguna_municipality(NULL, NEW.address);
  ELSE
    NEW.municipality := public.normalize_laguna_municipality(
      NEW.municipality,
      NEW.address
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_institution_municipality
  ON diocese.institutions;

CREATE TRIGGER set_institution_municipality
BEFORE INSERT OR UPDATE OF municipality, address
ON diocese.institutions
FOR EACH ROW
EXECUTE FUNCTION diocese.set_institution_municipality();

-- Canonicalize existing explicit values and derive missing values from the
-- existing comma-separated address where possible.
UPDATE diocese.institutions
SET municipality = public.normalize_laguna_municipality(municipality, address)
WHERE municipality IS DISTINCT FROM
      public.normalize_laguna_municipality(municipality, address);

COMMENT ON COLUMN diocese.institutions.municipality IS
  'Canonical city or municipality used for geographic and weather analytics; distinct from the full address.';
