-- Migration 206: Add profile photo support.
-- Stores the public URL of the user's uploaded avatar (from the `avatar`
-- Storage bucket). NULL means "no photo" — the UI falls back to initials.

ALTER TABLE diocese.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
