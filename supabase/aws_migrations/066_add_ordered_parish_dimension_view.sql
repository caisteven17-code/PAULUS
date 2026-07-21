-- Present the parish dimension in a readable reporting order without rebuilding
-- the underlying table or disturbing its foreign-key relationships.

CREATE OR REPLACE VIEW parish_analytics.vw_dim_parishes AS
SELECT
  parish_key,
  institution_key,
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

COMMENT ON VIEW parish_analytics.vw_dim_parishes IS
  'Readable parish dimension with institution identity attributes beside the warehouse keys.';
