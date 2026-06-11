-- Migration 190: Add human-readable institution codes to diocese.institutions
-- Format: P-0001 (parish), SCH-0001 (school), SEM-0001 (seminary), D-0001 (diocese)
-- Digits expand automatically past 4: P-9999 → P-10000 → P-10001

-- ── Sequences (one per institution type, atomic — no race conditions) ─────────

CREATE SEQUENCE IF NOT EXISTS diocese.inst_code_parish_seq   START 1;
CREATE SEQUENCE IF NOT EXISTS diocese.inst_code_school_seq   START 1;
CREATE SEQUENCE IF NOT EXISTS diocese.inst_code_seminary_seq START 1;
CREATE SEQUENCE IF NOT EXISTS diocese.inst_code_diocese_seq  START 1;

-- ── Column ────────────────────────────────────────────────────────────────────

ALTER TABLE diocese.institutions
  ADD COLUMN IF NOT EXISTS institution_code TEXT;

-- ── Trigger function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION diocese.generate_institution_code()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix TEXT;
  v_seq    BIGINT;
BEGIN
  CASE NEW.institution_type
    WHEN 'parish' THEN
      v_prefix := 'P';
      v_seq    := NEXTVAL('diocese.inst_code_parish_seq');
    WHEN 'school' THEN
      v_prefix := 'SCH';
      v_seq    := NEXTVAL('diocese.inst_code_school_seq');
    WHEN 'seminary' THEN
      v_prefix := 'SEM';
      v_seq    := NEXTVAL('diocese.inst_code_seminary_seq');
    WHEN 'diocese' THEN
      v_prefix := 'D';
      v_seq    := NEXTVAL('diocese.inst_code_diocese_seq');
    ELSE
      v_prefix := 'INST';
      v_seq    := NEXTVAL('diocese.inst_code_parish_seq');
  END CASE;

  NEW.institution_code := v_prefix || '-' || LPAD(v_seq::TEXT, GREATEST(4, LENGTH(v_seq::TEXT)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Trigger (only fills when a code was not supplied explicitly) ──────────────

DROP TRIGGER IF EXISTS trg_institution_code ON diocese.institutions;
CREATE TRIGGER trg_institution_code
  BEFORE INSERT ON diocese.institutions
  FOR EACH ROW
  WHEN (NEW.institution_code IS NULL)
  EXECUTE FUNCTION diocese.generate_institution_code();

-- ── Backfill existing records (alphabetical within each type) ─────────────────

WITH ranked AS (
  SELECT
    id,
    institution_type,
    ROW_NUMBER() OVER (PARTITION BY institution_type ORDER BY name ASC) AS rn
  FROM diocese.institutions
  WHERE deleted_at IS NULL
    AND institution_code IS NULL
),
coded AS (
  SELECT
    id,
    CASE institution_type
      WHEN 'parish'   THEN 'P-'    || LPAD(rn::TEXT, GREATEST(4, LENGTH(rn::TEXT)), '0')
      WHEN 'school'   THEN 'SCH-'  || LPAD(rn::TEXT, GREATEST(4, LENGTH(rn::TEXT)), '0')
      WHEN 'seminary' THEN 'SEM-'  || LPAD(rn::TEXT, GREATEST(4, LENGTH(rn::TEXT)), '0')
      WHEN 'diocese'  THEN 'D-'    || LPAD(rn::TEXT, GREATEST(4, LENGTH(rn::TEXT)), '0')
      ELSE                 'INST-' || LPAD(rn::TEXT, GREATEST(4, LENGTH(rn::TEXT)), '0')
    END AS institution_code
  FROM ranked
)
UPDATE diocese.institutions i
SET institution_code = c.institution_code
FROM coded c
WHERE i.id = c.id;

-- ── Advance sequences past the backfilled counts ──────────────────────────────
-- SETVAL(seq, n, true) makes the next NEXTVAL return n+1.
-- When a type has no rows yet, leave the sequence untouched (next value = 1).

DO $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM diocese.institutions
   WHERE institution_type = 'parish' AND deleted_at IS NULL;
  IF v_count > 0 THEN PERFORM SETVAL('diocese.inst_code_parish_seq', v_count, true); END IF;

  SELECT COUNT(*) INTO v_count FROM diocese.institutions
   WHERE institution_type = 'school' AND deleted_at IS NULL;
  IF v_count > 0 THEN PERFORM SETVAL('diocese.inst_code_school_seq', v_count, true); END IF;

  SELECT COUNT(*) INTO v_count FROM diocese.institutions
   WHERE institution_type = 'seminary' AND deleted_at IS NULL;
  IF v_count > 0 THEN PERFORM SETVAL('diocese.inst_code_seminary_seq', v_count, true); END IF;

  SELECT COUNT(*) INTO v_count FROM diocese.institutions
   WHERE institution_type = 'diocese' AND deleted_at IS NULL;
  IF v_count > 0 THEN PERFORM SETVAL('diocese.inst_code_diocese_seq', v_count, true); END IF;
END $$;

-- ── Uniqueness ────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_institutions_institution_code
  ON diocese.institutions (institution_code);
