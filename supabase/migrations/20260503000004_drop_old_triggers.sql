-- ============================================================
-- FIX: Remove old triggers that reference deleted user_roles
-- These are crashing auth login with "Database error saving new user"
-- RUN IN SUPABASE SQL EDITOR
-- ============================================================

-- Drop the two broken old triggers first
DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_mapping     ON auth.users;

-- Drop the broken functions that reference user_roles
DROP FUNCTION IF EXISTS public.assign_default_role()   CASCADE;
DROP FUNCTION IF EXISTS public.map_employee_on_login() CASCADE;

-- Verify: should now show ONLY our handle_new_user trigger
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users'
  AND trigger_schema = 'auth';
