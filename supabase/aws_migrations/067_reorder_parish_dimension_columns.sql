-- Physically reorder the descriptive parish dimension columns while preserving
-- the table identity, surrogate key, sequence, constraints, and referencing FKs.

BEGIN;

LOCK TABLE parish_analytics.dim_parishes IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE _dim_parishes_before_reorder ON COMMIT DROP AS
SELECT
  parish_key,
  institution_code,
  institution_name,
  vicariate,
  district,
  cluster,
  assigned_priest,
  address,
  latitude,
  longitude
FROM parish_analytics.dim_parishes;

-- This view was introduced only as a display-order workaround. The table will
-- now have the requested physical order, so the view is no longer necessary.
DROP VIEW IF EXISTS parish_analytics.vw_dim_parishes;

ALTER TABLE parish_analytics.dim_parishes
  DROP COLUMN institution_code,
  DROP COLUMN institution_name,
  DROP COLUMN vicariate,
  DROP COLUMN district,
  DROP COLUMN cluster,
  DROP COLUMN assigned_priest,
  DROP COLUMN address,
  DROP COLUMN latitude,
  DROP COLUMN longitude;

ALTER TABLE parish_analytics.dim_parishes
  ADD COLUMN institution_code text,
  ADD COLUMN institution_name text,
  ADD COLUMN vicariate text,
  ADD COLUMN district text,
  ADD COLUMN cluster text,
  ADD COLUMN assigned_priest text,
  ADD COLUMN address text,
  ADD COLUMN latitude numeric(10, 7),
  ADD COLUMN longitude numeric(10, 7);

UPDATE parish_analytics.dim_parishes parish
SET institution_code = preserved.institution_code,
    institution_name = preserved.institution_name,
    vicariate = preserved.vicariate,
    district = preserved.district,
    cluster = preserved.cluster,
    assigned_priest = preserved.assigned_priest,
    address = preserved.address,
    latitude = preserved.latitude,
    longitude = preserved.longitude
FROM _dim_parishes_before_reorder preserved
WHERE preserved.parish_key = parish.parish_key;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _dim_parishes_before_reorder preserved
    FULL JOIN parish_analytics.dim_parishes parish USING (parish_key)
    WHERE preserved.parish_key IS NULL
       OR parish.parish_key IS NULL
       OR preserved.institution_code IS DISTINCT FROM parish.institution_code
       OR preserved.institution_name IS DISTINCT FROM parish.institution_name
       OR preserved.vicariate IS DISTINCT FROM parish.vicariate
       OR preserved.district IS DISTINCT FROM parish.district
       OR preserved.cluster IS DISTINCT FROM parish.cluster
       OR preserved.assigned_priest IS DISTINCT FROM parish.assigned_priest
       OR preserved.address IS DISTINCT FROM parish.address
       OR preserved.latitude IS DISTINCT FROM parish.latitude
       OR preserved.longitude IS DISTINCT FROM parish.longitude
  ) THEN
    RAISE EXCEPTION 'Parish dimension values changed during column reorder';
  END IF;
END;
$$;

COMMENT ON COLUMN parish_analytics.dim_parishes.institution_code IS
  'Current official parish institution code, such as D1-23. Descriptive only; not a warehouse key.';

COMMENT ON COLUMN parish_analytics.dim_parishes.institution_name IS
  'Current institution name copied into the parish dimension for analytics and reporting.';

COMMIT;
