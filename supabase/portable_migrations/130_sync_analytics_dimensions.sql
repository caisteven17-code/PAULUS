-- Sync shared and entity-specific dimensions from operational tables.

INSERT INTO shared_analytics.dim_institutions (
  institution_id,
  institution_name,
  institution_type,
  vicariate,
  district,
  cluster,
  class
)
SELECT
  id,
  name,
  institution_type,
  vicariate,
  district,
  cluster,
  class
FROM diocese.institutions
WHERE institution_type IN ('parish', 'school', 'seminary')
  AND deleted_at IS NULL
ON CONFLICT (institution_id) DO UPDATE
SET institution_name = EXCLUDED.institution_name,
    institution_type = EXCLUDED.institution_type,
    vicariate        = EXCLUDED.vicariate,
    district         = EXCLUDED.district,
    cluster          = EXCLUDED.cluster,
    class            = EXCLUDED.class;

WITH all_submissions AS (
  SELECT
    sb.id AS submission_batch_id,
    pr.id AS financial_record_id,
    sb.source_file_name,
    sb.submitted_by,
    sb.submitted_at,
    sb.verified_by,
    sb.verified_at,
    sb.validation_status AS status,
    pr.version_no,
    pr.is_current_version
  FROM operations.submission_batches sb
  JOIN parishes.financial_records pr ON pr.submission_batch_id = sb.id
  WHERE pr.deleted_at IS NULL
  UNION ALL
  SELECT
    sb.id,
    sr.id,
    sb.source_file_name,
    sb.submitted_by,
    sb.submitted_at,
    sb.verified_by,
    sb.verified_at,
    sb.validation_status,
    sr.version_no,
    sr.is_current_version
  FROM operations.submission_batches sb
  JOIN schools.financial_records sr ON sr.submission_batch_id = sb.id
  WHERE sr.deleted_at IS NULL
  UNION ALL
  SELECT
    sb.id,
    smr.id,
    sb.source_file_name,
    sb.submitted_by,
    sb.submitted_at,
    sb.verified_by,
    sb.verified_at,
    sb.validation_status,
    smr.version_no,
    smr.is_current_version
  FROM operations.submission_batches sb
  JOIN seminaries.financial_records smr ON smr.submission_batch_id = sb.id
  WHERE smr.deleted_at IS NULL
)
INSERT INTO shared_analytics.dim_submission (
  submission_batch_id,
  financial_record_id,
  source_file_name,
  submitted_by,
  submitted_at,
  verified_by,
  verified_at,
  status,
  version_no,
  is_current_version
)
SELECT DISTINCT
  submission_batch_id,
  financial_record_id,
  source_file_name,
  submitted_by,
  submitted_at,
  verified_by,
  verified_at,
  status,
  version_no,
  is_current_version
FROM all_submissions
ON CONFLICT (submission_batch_id) DO UPDATE
SET financial_record_id = EXCLUDED.financial_record_id,
    source_file_name = EXCLUDED.source_file_name,
    submitted_by = EXCLUDED.submitted_by,
    submitted_at = EXCLUDED.submitted_at,
    verified_by = EXCLUDED.verified_by,
    verified_at = EXCLUDED.verified_at,
    status = EXCLUDED.status,
    version_no = EXCLUDED.version_no,
    is_current_version = EXCLUDED.is_current_version;

INSERT INTO parish_analytics.dim_parishes (
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
)
SELECT
  di.institution_key,
  i.institution_code,
  i.name,
  i.vicariate,
  i.district,
  i.cluster,
  pr.full_name,
  i.address,
  i.latitude,
  i.longitude
FROM diocese.institutions i
JOIN shared_analytics.dim_institutions di ON di.institution_id = i.id
LEFT JOIN parishes.details pd ON pd.institution_id = i.id
LEFT JOIN diocese.profiles pr ON pr.id = pd.assigned_priest_id
WHERE i.institution_type = 'parish'
  AND i.deleted_at IS NULL
ON CONFLICT (institution_key) DO UPDATE
SET institution_code = EXCLUDED.institution_code,
    institution_name = EXCLUDED.institution_name,
    vicariate        = EXCLUDED.vicariate,
    district         = EXCLUDED.district,
    cluster          = EXCLUDED.cluster,
    assigned_priest  = EXCLUDED.assigned_priest,
    address          = EXCLUDED.address,
    latitude         = EXCLUDED.latitude,
    longitude        = EXCLUDED.longitude;


INSERT INTO school_analytics.dim_schools (
  institution_key,
  principal,
  address
)
SELECT
  di.institution_key,
  pr.full_name,
  i.address
FROM diocese.institutions i
JOIN shared_analytics.dim_institutions di ON di.institution_id = i.id
LEFT JOIN schools.details sd ON sd.institution_id = i.id
LEFT JOIN diocese.profiles pr ON pr.id = sd.principal_id
WHERE i.institution_type = 'school'
  AND i.deleted_at IS NULL
ON CONFLICT (institution_key) DO UPDATE
SET principal = EXCLUDED.principal,
    address   = EXCLUDED.address;


INSERT INTO seminary_analytics.dim_seminaries (
  institution_key,
  rector,
  address
)
SELECT
  di.institution_key,
  pr.full_name,
  i.address
FROM diocese.institutions i
JOIN shared_analytics.dim_institutions di ON di.institution_id = i.id
LEFT JOIN seminaries.details sd ON sd.institution_id = i.id
LEFT JOIN diocese.profiles pr ON pr.id = sd.rector_id
WHERE i.institution_type = 'seminary'
  AND i.deleted_at IS NULL
ON CONFLICT (institution_key) DO UPDATE
SET rector  = EXCLUDED.rector,
    address = EXCLUDED.address;

-- Sync priest dimension from profiles + current active assignment
INSERT INTO priest_assignment_analytics.dim_priests (
  profile_id,
  full_name,
  email,
  contact_number,
  is_active,
  current_institution_key,
  parish_assigned,
  assignment_start_date,
  assignment_end_date
)
SELECT
  p.id,
  p.full_name,
  p.email,
  p.contact_number,
  p.is_active,
  di.institution_key,
  i.name,
  pa.start_date,
  pa.end_date
FROM diocese.profiles p
LEFT JOIN operations.priest_assignments pa
  ON pa.priest_id = p.id
  AND pa.is_active = true
  AND pa.deleted_at IS NULL
LEFT JOIN diocese.institutions i
  ON i.id = pa.institution_id
LEFT JOIN shared_analytics.dim_institutions di
  ON di.institution_id = pa.institution_id
WHERE p.deleted_at IS NULL
ON CONFLICT (profile_id) DO UPDATE
SET full_name               = EXCLUDED.full_name,
    email                   = EXCLUDED.email,
    contact_number          = EXCLUDED.contact_number,
    is_active               = EXCLUDED.is_active,
    current_institution_key = EXCLUDED.current_institution_key,
    parish_assigned         = EXCLUDED.parish_assigned,
    assignment_start_date   = EXCLUDED.assignment_start_date,
    assignment_end_date     = EXCLUDED.assignment_end_date;


INSERT INTO parish_analytics.dim_iafr_account (
  source_account_title_id,
  section_code,
  subsection_code,
  account_code,
  account_name,
  account_type,
  classification,
  is_arancel_related,
  is_mass_collection,
  is_remittable
)
SELECT
  t.id,
  t.section_code,
  t.subsection_code,
  t.account_code,
  t.account_name,
  t.account_type,
  t.classification,
  CASE WHEN t.section_code = 'A' THEN true ELSE false END,
  CASE WHEN t.classification ILIKE '%mass_collection%' OR t.subsection_code = 'B.1' THEN true ELSE false END,
  CASE WHEN t.account_type = 'remittance' THEN true ELSE false END
FROM parishes.iafr_account_titles t
WHERE t.deleted_at IS NULL
ON CONFLICT (source_account_title_id) DO UPDATE
SET section_code = EXCLUDED.section_code,
    subsection_code = EXCLUDED.subsection_code,
    account_code = EXCLUDED.account_code,
    account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    classification = EXCLUDED.classification,
    is_arancel_related = EXCLUDED.is_arancel_related,
    is_mass_collection = EXCLUDED.is_mass_collection,
    is_remittable = EXCLUDED.is_remittable;

INSERT INTO school_analytics.dim_school_fs_account (
  source_account_title_id,
  section_code,
  subsection_code,
  account_code,
  account_name,
  account_type,
  classification
)
SELECT
  t.id,
  t.section_code,
  t.subsection_code,
  t.account_code,
  t.account_name,
  t.account_type,
  COALESCE(t.expense_category, t.receipt_category, t.expense_group, t.receipt_group)
FROM schools.fs_account_titles t
WHERE t.deleted_at IS NULL
ON CONFLICT (source_account_title_id) DO UPDATE
SET section_code = EXCLUDED.section_code,
    subsection_code = EXCLUDED.subsection_code,
    account_code = EXCLUDED.account_code,
    account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    classification = EXCLUDED.classification;

INSERT INTO seminary_analytics.dim_seminary_fs_account (
  source_account_title_id,
  section_code,
  subsection_code,
  account_code,
  account_name,
  account_type,
  classification
)
SELECT
  t.id,
  t.section_code,
  t.subsection_code,
  t.account_code,
  t.account_name,
  t.account_type,
  t.classification
FROM seminaries.fs_account_titles t
WHERE t.deleted_at IS NULL
ON CONFLICT (source_account_title_id) DO UPDATE
SET section_code = EXCLUDED.section_code,
    subsection_code = EXCLUDED.subsection_code,
    account_code = EXCLUDED.account_code,
    account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    classification = EXCLUDED.classification;
