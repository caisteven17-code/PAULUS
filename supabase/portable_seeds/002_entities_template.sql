-- Replace the sample values below with your actual institutions.

INSERT INTO diocese.institutions (
  id,
  name,
  entity_type,
  vicariate,
  district,
  cluster,
  class,
  address,
  contact_number,
  email,
  is_active
)
VALUES
  (
    gen_random_uuid(),
    'Sample Parish',
    'parish',
    'North Vicariate',
    'District 1',
    'Cluster A',
    'A',
    'Sample Address',
    '09171234567',
    'sample-parish@example.org',
    true
  ),
  (
    gen_random_uuid(),
    'Sample School',
    'school',
    NULL,
    'District 2',
    'Cluster B',
    'B',
    'Sample School Address',
    '09171234568',
    'sample-school@example.org',
    true
  ),
  (
    gen_random_uuid(),
    'Sample Seminary',
    'seminary',
    NULL,
    'District 3',
    'Cluster C',
    'C',
    'Sample Seminary Address',
    '09171234569',
    'sample-seminary@example.org',
    true
  )
ON CONFLICT (email) DO NOTHING;

