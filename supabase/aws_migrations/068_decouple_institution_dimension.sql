-- Phase 2 of the hybrid-database migration.
-- Supabase diocese.institutions is authoritative. This AWS dimension keeps
-- only the attributes required by analytics and no longer requires a local
-- AWS operational institution row.

ALTER TABLE shared_analytics.dim_institutions
  DROP CONSTRAINT IF EXISTS dim_institutions_institution_id_fkey;

ALTER TABLE shared_analytics.dim_institutions
  ADD COLUMN IF NOT EXISTS institution_code text,
  ADD COLUMN IF NOT EXISTS subsidy_type text,
  ADD COLUMN IF NOT EXISTS latitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS warehouse_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE shared_analytics.dim_institutions
  DROP CONSTRAINT IF EXISTS dim_institutions_institution_type_check;

ALTER TABLE shared_analytics.dim_institutions
  ADD CONSTRAINT dim_institutions_institution_type_check
  CHECK (institution_type IN ('diocese', 'parish', 'school', 'seminary'));

ALTER TABLE shared_analytics.dim_institutions
  DROP CONSTRAINT IF EXISTS dim_institutions_subsidy_type_check;

ALTER TABLE shared_analytics.dim_institutions
  ADD CONSTRAINT dim_institutions_subsidy_type_check
  CHECK (subsidy_type IN ('subsidized', 'independent') OR subsidy_type IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dim_institutions_source_id
  ON shared_analytics.dim_institutions (institution_id);

CREATE INDEX IF NOT EXISTS idx_dim_institutions_source_updated
  ON shared_analytics.dim_institutions (source_updated_at, institution_id);

CREATE INDEX IF NOT EXISTS idx_dim_institutions_current_grouping
  ON shared_analytics.dim_institutions
  (institution_type, is_active, district, vicariate, cluster);

COMMENT ON COLUMN shared_analytics.dim_institutions.institution_id IS
  'Logical Supabase institution source identifier; not a cross-database foreign key.';
