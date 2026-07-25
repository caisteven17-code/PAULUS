-- ============================================================================
-- 0004_otp_onboarding.sql
-- OTP verification + onboarding support
--
-- Run this in the Supabase SQL Editor (or via supabase db push).
-- Adds:
--   1. diocese.otp_verifications — stores OTP codes for onboarding & forgot-password
--   2. diocese.profiles columns  — birthday, contact_number, onboarding_completed
-- ============================================================================

-- ── 1. OTP verifications table ─────────────────────────────────────────────
create table if not exists diocese.otp_verifications (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  otp_code    text not null,
  purpose     text not null check (purpose in ('onboarding', 'forgot_password')),
  expires_at  timestamptz not null,
  used        boolean not null default false,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_otp_verifications_email_purpose
  on diocese.otp_verifications (email, purpose, created_at desc);

-- Only the backend (service role) may touch OTP rows. RLS on + no policies
-- means anon/authenticated clients are fully locked out.
alter table diocese.otp_verifications enable row level security;

-- Grants: tables created after the original "GRANT ... ON ALL TABLES" migration
-- get NO privileges automatically — without this the backend fails with
-- "permission denied for table otp_verifications".
grant usage on schema diocese to service_role;
grant all privileges on diocese.otp_verifications to service_role;

-- ── 2. Profile columns for onboarding data ──────────────────────────────────
alter table diocese.profiles
  add column if not exists birthday date,
  add column if not exists contact_number text,
  add column if not exists onboarding_completed boolean not null default false;

-- ── 3. Housekeeping: clean out expired OTP rows (optional, run any time) ───
-- delete from diocese.otp_verifications where expires_at < now() - interval '1 day';
