-- =============================================================================
-- PAULUS Shared Core
-- Diocese and operations schemas.
-- =============================================================================

create table if not exists diocese.institutions (
  id uuid primary key default gen_random_uuid(),
  legacy_entity_id text unique,
  name text not null,
  entity_type text not null check (entity_type in ('parish', 'school', 'seminary', 'chancery')),
  vicariate text,
  district text,
  cluster text,
  class text check (class in ('A', 'B', 'C', 'D', 'E') or class is null),
  address text,
  contact_number text,
  email text unique,
  lat numeric(10, 7),
  lng numeric(10, 7),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists diocese.roles (
  id text primary key,
  name text not null,
  color text not null default '#D4AF37',
  is_predefined boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists diocese.permissions (
  id text primary key,
  name text not null,
  category text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists diocese.role_permissions (
  role_id text not null references diocese.roles(id) on delete cascade,
  permission_id text not null references diocese.permissions(id) on delete cascade,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists diocese.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  role_id text not null references diocese.roles(id) on update cascade,
  institution_id uuid references diocese.institutions(id) on update cascade,
  contact_number text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists diocese.projects (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references diocese.institutions(id) on delete cascade,
  name text not null,
  description text,
  fund_usage text,
  category text,
  status text not null default 'active' check (status in ('active', 'completed', 'on-hold')),
  target_amount numeric(14, 2) not null default 0,
  current_amount numeric(14, 2) not null default 0,
  total_expenses numeric(14, 2) not null default 0,
  start_date date,
  end_date date,
  beneficiaries text,
  contact_person text,
  cover_image text,
  health_score numeric(5, 2),
  success_probability numeric(5, 2),
  recommendation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists diocese.donations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references diocese.projects(id) on delete cascade,
  donor_name text,
  amount numeric(14, 2) not null default 0,
  date date,
  payment_method text check (payment_method in ('Cash', 'Check', 'Online', 'Bank Transfer') or payment_method is null),
  receipt_issued boolean not null default false,
  receipt_proof_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists diocese.project_expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references diocese.projects(id) on delete cascade,
  description text not null,
  amount numeric(14, 2) not null default 0,
  date date,
  payment_method text check (payment_method in ('Cash', 'Check', 'Online', 'Bank Transfer') or payment_method is null),
  receipt_reference text,
  proof_file_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists diocese.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  author text not null,
  author_role text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  category text not null default 'general' check (category in ('general', 'financial', 'administrative', 'event')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists diocese.audit_logs (
  id uuid primary key default gen_random_uuid(),
  log_reference text not null unique,
  user_name text,
  role text,
  is_system boolean not null default false,
  category text not null check (category in ('auth', 'finance', 'analytics', 'reports', 'system', 'access')),
  severity text not null check (severity in ('info', 'warning', 'error', 'success')),
  action text not null,
  detail text,
  institution_id uuid references diocese.institutions(id),
  ip_address text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists operations.submission_batches (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references diocese.institutions(id) on delete cascade,
  institution_type text not null check (institution_type in ('parish', 'school', 'seminary')),
  report_type text not null check (report_type in ('IAFR', 'School FS', 'Seminary FS')),
  reporting_month smallint not null check (reporting_month between 1 and 12),
  reporting_year smallint not null,
  source_file_name text,
  source_file_url text,
  source_file_hash text,
  submitted_by uuid references diocese.profiles(id),
  submitted_at timestamptz,
  validation_status text not null default 'pending' check (validation_status in ('pending', 'passed', 'failed', 'warning')),
  verified_by uuid references diocese.profiles(id),
  verified_at timestamptz,
  is_late boolean not null default false,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists operations.validation_errors (
  id uuid primary key default gen_random_uuid(),
  submission_batch_id uuid not null references operations.submission_batches(id) on delete cascade,
  institution_id uuid not null references diocese.institutions(id) on delete cascade,
  source_sheet_name text,
  source_row_number integer,
  source_column_name text,
  field_name text,
  error_type text not null check (
    error_type in ('missing_required', 'invalid_type', 'invalid_total', 'unknown_account', 'duplicate_record', 'out_of_range')
  ),
  severity text not null check (severity in ('info', 'warning', 'error', 'blocker')),
  error_message text not null,
  created_at timestamptz not null default now()
);

create table if not exists operations.reconciliation_checks (
  id uuid primary key default gen_random_uuid(),
  submission_batch_id uuid not null references operations.submission_batches(id) on delete cascade,
  institution_id uuid not null references diocese.institutions(id) on delete cascade,
  financial_record_id uuid,
  check_name text not null,
  check_scope text not null check (check_scope in ('operational', 'analytics', 'export')),
  expected_amount numeric(14, 2) not null default 0,
  actual_amount numeric(14, 2) not null default 0,
  difference_amount numeric(14, 2) not null default 0,
  status text not null check (status in ('passed', 'failed', 'warning')),
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_submission_batches_institution_period
  on operations.submission_batches (institution_id, reporting_year, reporting_month);

create index if not exists idx_validation_errors_submission
  on operations.validation_errors (submission_batch_id);

create index if not exists idx_reconciliation_checks_submission
  on operations.reconciliation_checks (submission_batch_id);

select public.attach_updated_at_trigger('diocese.institutions');
select public.attach_updated_at_trigger('diocese.roles');
select public.attach_updated_at_trigger('diocese.permissions');
select public.attach_updated_at_trigger('diocese.role_permissions');
select public.attach_updated_at_trigger('diocese.profiles');
select public.attach_updated_at_trigger('diocese.projects');
select public.attach_updated_at_trigger('diocese.donations');
select public.attach_updated_at_trigger('diocese.project_expenses');
select public.attach_updated_at_trigger('diocese.announcements');
select public.attach_updated_at_trigger('diocese.audit_logs');
select public.attach_updated_at_trigger('operations.submission_batches');
