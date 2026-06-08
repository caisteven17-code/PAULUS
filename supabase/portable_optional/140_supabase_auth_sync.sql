-- Optional Supabase-only helper.
-- Do not run on AWS RDS unless you also created an auth.users equivalent.
--
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- It fires whenever a user is created in auth.users (via the app OR the dashboard)
-- and ensures a matching row exists in diocese.profiles.
--
-- IMPORTANT: The INSERT is wrapped in an EXCEPTION block so a profile conflict
-- (e.g. duplicate email from a previous orphaned row) NEVER prevents the auth
-- user from being created. The backend's upsertDioceseProfile handles the
-- authoritative profile write after the auth user exists.

CREATE OR REPLACE FUNCTION public.sync_supabase_auth_user_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role_id  text;
  v_raw_role text;
BEGIN
  -- Resolve the role from user metadata; verify it actually exists in diocese.roles
  -- before using it, so we don't violate the FK constraint.
  v_raw_role := COALESCE(
    NEW.raw_user_meta_data->>'role_id',
    NEW.raw_user_meta_data->>'role',
    'parish_priest'
  );

  SELECT id INTO v_role_id FROM diocese.roles WHERE id = v_raw_role LIMIT 1;
  -- If the role is not found (roles not yet seeded), v_role_id stays NULL.

  BEGIN
    INSERT INTO diocese.profiles (
      external_auth_id,
      full_name,
      email,
      role_id,
      contact_number,
      -- CHECK constraint: is_active=true requires role_id IS NOT NULL
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'displayName', split_part(NEW.email, '@', 1)),
      NEW.email,
      v_role_id,
      NEW.raw_user_meta_data->>'contact_number',
      (v_role_id IS NOT NULL),
      now(),
      now()
    )
    ON CONFLICT (external_auth_id) DO UPDATE SET
      full_name      = COALESCE(EXCLUDED.full_name,      diocese.profiles.full_name),
      email          = COALESCE(EXCLUDED.email,          diocese.profiles.email),
      role_id        = COALESCE(EXCLUDED.role_id,        diocese.profiles.role_id),
      contact_number = COALESCE(EXCLUDED.contact_number, diocese.profiles.contact_number),
      is_active      = CASE
                         WHEN COALESCE(EXCLUDED.role_id, diocese.profiles.role_id) IS NOT NULL THEN true
                         ELSE diocese.profiles.is_active
                       END,
      updated_at     = now();
  EXCEPTION WHEN OTHERS THEN
    -- Never block auth user creation due to a profile sync error.
    RAISE WARNING 'sync_supabase_auth_user_to_profile: could not sync profile for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_supabase_auth_user_to_profile ON auth.users;
CREATE TRIGGER trg_sync_supabase_auth_user_to_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_supabase_auth_user_to_profile();
