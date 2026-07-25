-- Add readable institution identity attributes to the parish dimension.
-- The numeric keys remain the stable warehouse relationships; the official
-- institution code is a mutable business identifier.

BEGIN;

ALTER TABLE parish_analytics.dim_parishes
  ADD COLUMN IF NOT EXISTS institution_code text,
  ADD COLUMN IF NOT EXISTS institution_name text;

UPDATE parish_analytics.dim_parishes parish
SET institution_code = institution.institution_code,
    institution_name = institution.name
FROM shared_analytics.dim_institutions shared
JOIN diocese.institutions institution
  ON institution.id = shared.institution_id
WHERE shared.institution_key = parish.institution_key
  AND institution.institution_type = 'parish'
  AND institution.deleted_at IS NULL
  AND (
    parish.institution_code IS DISTINCT FROM institution.institution_code
    OR parish.institution_name IS DISTINCT FROM institution.name
  );

COMMENT ON COLUMN parish_analytics.dim_parishes.institution_code IS
  'Current official parish institution code, such as D1-23. Descriptive only; not a warehouse key.';

COMMENT ON COLUMN parish_analytics.dim_parishes.institution_name IS
  'Current institution name copied into the parish dimension for analytics and reporting.';

COMMIT;
