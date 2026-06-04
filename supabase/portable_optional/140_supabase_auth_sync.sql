-- Optional Supabase-only helper.
-- Do not run on AWS RDS unless you also created an auth.users equivalent.

CREATE OR REPLACE FUNCTION public.sync_supabase_auth_user_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO diocese.profiles (
    id,
    external_auth_id,
    full_name,
    email,
    role_id,
    contact_number,
    is_active,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'displayName', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role_id', NEW.raw_user_meta_data->>'role', 'parish_priest'),
    NEW.raw_user_meta_data->>'contact_number',
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    external_auth_id = EXCLUDED.external_auth_id,
    full_name = COALESCE(EXCLUDED.full_name, diocese.profiles.full_name),
    email = COALESCE(EXCLUDED.email, diocese.profiles.email),
    role_id = COALESCE(EXCLUDED.role_id, diocese.profiles.role_id),
    contact_number = COALESCE(EXCLUDED.contact_number, diocese.profiles.contact_number),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_supabase_auth_user_to_profile ON auth.users;
CREATE TRIGGER trg_sync_supabase_auth_user_to_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_supabase_auth_user_to_profile();

