-- =============================================================================
-- Diocese of San Pablo — User ID Refactoring Script (No UUID Primary Keys!)
--
-- Run AFTER schema.sql.
-- This refactors your user accounts to completely remove UUIDs as the primary key.
-- Instead, users get beautiful, sequential IDs like USR-001, USR-002, matching
-- the sequential string primary key format used throughout your capstone system!
-- =============================================================================

-- 1. Drop existing triggers & functions on profiles to prevent lock conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. Drop the old UUID-based profiles table
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 3. Create the sequence generator for custom User IDs
CREATE SEQUENCE IF NOT EXISTS public.profiles_id_seq START 1;

-- 4. Recreate the profiles table using sequential string primary keys (USR-001...)
CREATE TABLE public.profiles (
  id              TEXT        PRIMARY KEY DEFAULT format_seq_id('USR-', 'profiles_id_seq', 3),
  auth_user_id    UUID        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Private link for logins
  email           TEXT,
  role            TEXT        NOT NULL DEFAULT 'parish_priest'
    CHECK (role IN (
      'bishop', 'chancellor', 'diocesan_oeconomus', 'finance_staff',
      'parish_priest', 'parish_secretary',
      'seminary_rector', 'seminary_oeconomus',
      'school_superintendent', 'finance_supervisor', 'finance_officer', 'school_principal'
    )),
  entity_id       TEXT,
  entity_name     TEXT,
  entity_type     TEXT
    CHECK (entity_type IN ('parish', 'school', 'seminary', 'diocese') OR entity_type IS NULL),
  display_name    TEXT,
  first_name      TEXT,
  last_name       TEXT,
  contact_number  TEXT,
  status          TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Recreate the trigger function to automatically populate sequential IDs
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (auth_user_id, email, role, entity_id, entity_name, entity_type, display_name)
  VALUES (
    NEW.id, -- Supabase Auth login UUID
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'parish_priest'),
    NEW.raw_user_meta_data->>'entityId',
    NEW.raw_user_meta_data->>'entityName',
    NEW.raw_user_meta_data->>'entityType',
    COALESCE(NEW.raw_user_meta_data->>'displayName', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    email        = EXCLUDED.email,
    role         = COALESCE(EXCLUDED.role, profiles.role),
    entity_id    = COALESCE(EXCLUDED.entity_id, profiles.entity_id),
    entity_name  = COALESCE(EXCLUDED.entity_name, profiles.entity_name),
    entity_type  = COALESCE(EXCLUDED.entity_type, profiles.entity_type),
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    updated_at   = NOW();
  RETURN NEW;
END;
$$;

-- 6. Re-attach the trigger on auth.users inserts
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Enable Row-Level Security on profiles and configure policies using auth_user_id
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = auth_user_id);

CREATE POLICY "users_update_own_profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = auth_user_id);
