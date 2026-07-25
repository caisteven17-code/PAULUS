-- Phase 4A: make the parish dimension self-contained within the warehouse.
-- Institution identity comes from shared_analytics.dim_institutions. Personnel
-- remains a logical Supabase identifier and is not constrained to an AWS
-- operational profile copy.

ALTER TABLE parish_analytics.dim_parishes
  ADD COLUMN IF NOT EXISTS assigned_priest_source_id uuid;

UPDATE parish_analytics.dim_parishes parish
SET institution_code = institution.institution_code,
    institution_name = institution.institution_name,
    vicariate = institution.vicariate,
    district = institution.district,
    cluster = institution.cluster,
    latitude = institution.latitude,
    longitude = institution.longitude
FROM shared_analytics.dim_institutions institution
WHERE institution.institution_key = parish.institution_key
  AND institution.institution_type = 'parish'
  AND (
    parish.institution_code IS DISTINCT FROM institution.institution_code
    OR parish.institution_name IS DISTINCT FROM institution.institution_name
    OR parish.vicariate IS DISTINCT FROM institution.vicariate
    OR parish.district IS DISTINCT FROM institution.district
    OR parish.cluster IS DISTINCT FROM institution.cluster
    OR parish.latitude IS DISTINCT FROM institution.latitude
    OR parish.longitude IS DISTINCT FROM institution.longitude
  );

CREATE INDEX IF NOT EXISTS idx_dim_parishes_assigned_priest_source
  ON parish_analytics.dim_parishes (assigned_priest_source_id)
  WHERE assigned_priest_source_id IS NOT NULL;

COMMENT ON COLUMN parish_analytics.dim_parishes.assigned_priest_source_id IS
  'Logical Supabase profile identifier for lineage; not an AWS operational-profile foreign key.';

