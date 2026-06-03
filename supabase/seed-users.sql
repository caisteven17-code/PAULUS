-- =============================================================================
-- Diocese of San Pablo — User Account Seeding Script (NO UUID PRIMARY KEYS!)
--
-- Run AFTER schema.sql and user-id-refactor.sql.
-- This script directly seeds your test users into Supabase Auth with fully hashed
-- passwords ("password123"). 
-- It clears existing seed users first to guarantee that the trigger function
-- executes fresh, populating the profiles table as USR-001, USR-002, etc.!
-- =============================================================================

-- 1. Ensure pgcrypto extension is installed for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Clear existing test users from auth.users to ensure trigger fires fresh
DELETE FROM auth.users WHERE email IN (
  'bishop@gmail.com',
  'parish@gmail.com',
  'seminary@gmail.com',
  'school@gmail.com'
);

-- 3. Seed Supabase Auth Users (Password for all accounts is 'password123')
-- The trigger handle_new_user() automatically intercepts these and creates profiles!

-- User 1: Bishop (bishop@gmail.com) -> Will become USR-001 (Bishop Dashboard)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, 
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a2b1c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', -- Static UUID for auth lookup
  'authenticated',
  'authenticated',
  'bishop@gmail.com',
  crypt('password123', gen_salt('bf')), -- Hashes password123 securely
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"role": "bishop", "entityId": "diocese", "entityName": "Diocese of San Pablo", "entityType": "diocese", "displayName": "Bishop Office"}'::jsonb,
  now(),
  now()
);

-- User 2: Parish Priest (parish@gmail.com) -> Will become USR-002 (Parish Dashboard Only)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, 
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'b3c2d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', -- Static UUID for auth lookup
  'authenticated',
  'authenticated',
  'parish@gmail.com',
  crypt('password123', gen_salt('bf')), -- Hashes password123 securely
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"role": "parish_priest", "entityId": "PAR-054", "entityName": "San Isidro Labrador Parish", "entityType": "parish", "displayName": "Fr. Parish Priest"}'::jsonb,
  now(),
  now()
);

-- User 3: Seminary Rector (seminary@gmail.com) -> Will become USR-003 (Seminary Dashboard)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, 
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c4d3e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', -- Static UUID for auth lookup
  'authenticated',
  'authenticated',
  'seminary@gmail.com',
  crypt('password123', gen_salt('bf')), -- Hashes password123 securely
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"role": "seminary_rector", "entityId": "SEM-001", "entityName": "St. Peter''s College Seminary", "entityType": "seminary", "displayName": "Msgr. Rector"}'::jsonb,
  now(),
  now()
);

-- User 4: School Registrar (school@gmail.com) -> Will become USR-004 (School Dashboard Only)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, 
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, 
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd5e4f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a', -- Static UUID for auth lookup
  'authenticated',
  'authenticated',
  'school@gmail.com',
  crypt('password123', gen_salt('bf')), -- Hashes password123 securely
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"role": "school_principal", "entityId": "SCH-001", "entityName": "Liceo de San Pablo", "entityType": "school", "displayName": "School Principal"}'::jsonb,
  now(),
  now()
);
