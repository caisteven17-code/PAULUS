-- Migration 192: Fix code_counters permission denied on profile upsert
--
-- Root cause: diocese.generate_profile_code() and diocese.next_code_value()
-- are SECURITY INVOKER (PostgreSQL default). When called from PostgREST using
-- the anon/authenticated role, those roles lack INSERT/UPDATE on
-- diocese.code_counters → "permission denied for table code_counters".
--
-- Fix A: Rebuild both functions as SECURITY DEFINER so they always run as
--         the function owner (postgres), regardless of calling role.
-- Fix B: Explicit GRANTs as belt-and-suspenders.

-- ── Rebuild next_code_value with SECURITY DEFINER ────────────────────────────

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
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = diocese, public;

-- ── Rebuild generate_profile_code with SECURITY DEFINER ──────────────────────

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
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = diocese, public;

-- ── Explicit grants (belt-and-suspenders) ────────────────────────────────────

GRANT ALL  ON TABLE    diocese.code_counters                    TO authenticated;
GRANT ALL  ON TABLE    diocese.code_counters                    TO service_role;
GRANT EXECUTE ON FUNCTION diocese.next_code_value(TEXT)         TO authenticated;
GRANT EXECUTE ON FUNCTION diocese.next_code_value(TEXT)         TO service_role;
GRANT EXECUTE ON FUNCTION diocese.generate_profile_code()       TO authenticated;
GRANT EXECUTE ON FUNCTION diocese.generate_profile_code()       TO service_role;
GRANT EXECUTE ON FUNCTION diocese.profile_code_prefix(TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION diocese.profile_code_prefix(TEXT)     TO service_role;
