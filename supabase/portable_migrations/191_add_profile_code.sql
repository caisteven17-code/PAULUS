-- Migration 191: Add human-readable profile codes to diocese.profiles
-- Format: PR-0001 (parish priest), BSH-0001 (bishop), REC-0001 (seminary rector),
--         ADM-0001 (admin), SCH-ADM-0001 (school principal), FIN-0001 (finance staff),
--         USR-0001 (any other role, incl. custom roles added later)
-- Digits expand automatically past 4: PR-9999 → PR-10000

-- ── Counter table ─────────────────────────────────────────────────────────────
-- One row per prefix. Unlike sequences, this works for arbitrary prefixes so
-- custom roles added at runtime get codes without schema changes.

CREATE TABLE IF NOT EXISTS diocese.code_counters (
  prefix     TEXT PRIMARY KEY,
  last_value BIGINT NOT NULL DEFAULT 0
);

-- Atomic increment-and-return. Safe under concurrent inserts because the
-- UPDATE row-locks the counter row.
CREATE OR REPLACE FUNCTION diocese.next_code_value(p_prefix TEXT)
RETURNS BIGINT AS $$
DECLARE
  v_next BIGINT;
BEGIN
  INSERT INTO diocese.code_counters (prefix, last_value)
  VALUES (p_prefix, 1)
  ON CONFLICT (prefix)
  DO UPDATE SET last_value = diocese.code_counters.last_value + 1
  RETURNING last_value INTO v_next;
  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- ── Role → prefix mapping ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION diocese.profile_code_prefix(p_role_id TEXT)
RETURNS TEXT AS $$
  SELECT CASE p_role_id
    WHEN 'parish_priest'    THEN 'PR'
    WHEN 'bishop'           THEN 'BSH'
    WHEN 'seminary_rector'  THEN 'REC'
    WHEN 'admin'            THEN 'ADM'
    WHEN 'school_principal' THEN 'SCH-ADM'
    WHEN 'finance_staff'    THEN 'FIN'
    ELSE 'USR'
  END;
$$ LANGUAGE sql IMMUTABLE;

-- ── Column ────────────────────────────────────────────────────────────────────

ALTER TABLE diocese.profiles
  ADD COLUMN IF NOT EXISTS profile_code TEXT;

-- ── Trigger function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION diocese.generate_profile_code()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix TEXT;
  v_seq    BIGINT;
BEGIN
  v_prefix := diocese.profile_code_prefix(NEW.role_id);
  v_seq    := diocese.next_code_value(v_prefix);
  NEW.profile_code := v_prefix || '-' || LPAD(v_seq::TEXT, GREATEST(4, LENGTH(v_seq::TEXT)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Trigger (only fills when a code was not supplied explicitly) ──────────────

DROP TRIGGER IF EXISTS trg_profile_code ON diocese.profiles;
CREATE TRIGGER trg_profile_code
  BEFORE INSERT ON diocese.profiles
  FOR EACH ROW
  WHEN (NEW.profile_code IS NULL)
  EXECUTE FUNCTION diocese.generate_profile_code();

-- ── Backfill existing profiles (alphabetical within each prefix group) ────────

WITH ranked AS (
  SELECT
    id,
    diocese.profile_code_prefix(role_id) AS prefix,
    ROW_NUMBER() OVER (
      PARTITION BY diocese.profile_code_prefix(role_id)
      ORDER BY full_name ASC, created_at ASC
    ) AS rn
  FROM diocese.profiles
  WHERE deleted_at IS NULL
    AND profile_code IS NULL
)
UPDATE diocese.profiles p
SET profile_code = r.prefix || '-' || LPAD(r.rn::TEXT, GREATEST(4, LENGTH(r.rn::TEXT)), '0')
FROM ranked r
WHERE p.id = r.id;

-- ── Seed counters past the backfilled counts ──────────────────────────────────

INSERT INTO diocese.code_counters (prefix, last_value)
SELECT
  diocese.profile_code_prefix(role_id) AS prefix,
  COUNT(*) AS last_value
FROM diocese.profiles
WHERE deleted_at IS NULL
GROUP BY diocese.profile_code_prefix(role_id)
ON CONFLICT (prefix)
DO UPDATE SET last_value = GREATEST(diocese.code_counters.last_value, EXCLUDED.last_value);

-- ── Uniqueness ────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_profile_code
  ON diocese.profiles (profile_code);
