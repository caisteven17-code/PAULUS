-- Migration 220: Add diocese.profiles columns that exist on live production
-- Supabase (added directly by supabase/migrations/0004_otp_onboarding.sql, which
-- was never folded into the portable_migrations set — contact_number already
-- existed here, birthday and onboarding_completed did not).
-- diocese.otp_verifications itself is intentionally NOT mirrored: it holds
-- ephemeral auth codes with no analytical use, and nothing in the analytics
-- star schema references it.

ALTER TABLE diocese.profiles
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
