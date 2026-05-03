-- ============================================================
-- 20260503000000_simplify_roles.sql
-- PRODUCTION-SAFE: Remove user_roles, move role to employees
-- Idempotent — safe to run multiple times
-- ============================================================

-- ── STEP 1: Add role column to employees ──────────────────────
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'employee';

-- Add user_id column if not already present (from previous migration)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add email column if not present
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS email TEXT;

-- ── STEP 2: Migrate existing roles from user_roles → employees ─
-- Preserve any admin/hr_manager/dpo roles already in user_roles
UPDATE public.employees e
SET role = ur.role
FROM public.user_roles ur
WHERE e.user_id = ur.user_id
  AND ur.role != 'employee'; -- Only migrate non-default roles

-- ── STEP 3: ONE-TIME SYNC for existing auth.users ─────────────
-- This heals all existing users who have no employee record yet
-- (fixes the "No Employee Record Found" for users like sathish@ideassion.com)
INSERT INTO public.employees (user_id, email, first_name, last_name, role, employee_code)
SELECT
  au.id,
  au.email,
  COALESCE(
    NULLIF(au.raw_user_meta_data->>'given_name', ''),
    NULLIF(split_part(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)), ' ', 1), ''),
    split_part(au.email, '@', 1)
  ),
  COALESCE(
    NULLIF(au.raw_user_meta_data->>'family_name', ''),
    NULLIF(trim(substring(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '') FROM ' (.*)$')), ''),
    ''
  ),
  COALESCE(
    (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = au.id ORDER BY
      CASE ur.role WHEN 'admin' THEN 1 WHEN 'hr_manager' THEN 2 WHEN 'dpo' THEN 3 ELSE 4 END
    LIMIT 1),
    'employee'
  ),
  'EMP-' || upper(substr(au.id::text, 1, 8))
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.employees e WHERE e.user_id = au.id
)
ON CONFLICT DO NOTHING;

-- Link existing employees that have an email match but no user_id
UPDATE public.employees e
SET user_id = au.id
FROM auth.users au
WHERE lower(e.email) = lower(au.email)
  AND e.user_id IS NULL;

-- ── STEP 4: Update the handle_new_user trigger ────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
  v_first_name  TEXT;
  v_last_name   TEXT;
  v_display     TEXT;
  v_role        TEXT := 'employee';
BEGIN
  BEGIN
    -- 1. Extract name from metadata
    v_display    := COALESCE(
                      NEW.raw_user_meta_data->>'full_name',
                      NEW.raw_user_meta_data->>'name',
                      NEW.raw_user_meta_data->>'display_name',
                      split_part(NEW.email, '@', 1)
                    );
    v_first_name := COALESCE(
                      NULLIF(NEW.raw_user_meta_data->>'given_name', ''),
                      NULLIF(split_part(v_display, ' ', 1), ''),
                      split_part(NEW.email, '@', 1)
                    );
    v_last_name  := COALESCE(
                      NULLIF(NEW.raw_user_meta_data->>'family_name', ''),
                      NULLIF(trim(substring(v_display FROM ' (.*)$')), ''),
                      ''
                    );

    -- 2. Upsert profile
    INSERT INTO public.profiles (user_id, display_name, avatar_url)
    VALUES (NEW.id, v_display, NEW.raw_user_meta_data->>'avatar_url')
    ON CONFLICT (user_id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          avatar_url   = EXCLUDED.avatar_url;

    -- 3. Find existing HR-uploaded employee by email (case-insensitive)
    SELECT id INTO v_employee_id
    FROM public.employees
    WHERE lower(email) = lower(NEW.email)
    LIMIT 1;

    IF v_employee_id IS NOT NULL THEN
      -- EXISTING HR record: link user_id only, NEVER overwrite HR data
      UPDATE public.employees
        SET user_id = NEW.id
      WHERE id = v_employee_id;
    ELSE
      -- NEW user: create employee record with role 'employee'
      INSERT INTO public.employees (
        employee_code, email, user_id, first_name, last_name, role
      )
      VALUES (
        'EMP-' || upper(substr(NEW.id::text, 1, 8)),
        lower(NEW.email),
        NEW.id,
        v_first_name,
        v_last_name,
        v_role
      )
      ON CONFLICT (email) DO NOTHING;

      -- Fetch the id (handles race condition where CONFLICT fired)
      SELECT id INTO v_employee_id
      FROM public.employees
      WHERE lower(email) = lower(NEW.email)
      LIMIT 1;

      IF v_employee_id IS NOT NULL THEN
        UPDATE public.employees
          SET user_id = NEW.id
        WHERE id = v_employee_id AND user_id IS NULL;
      END IF;
    END IF;

    -- 4. Link profile → employee
    IF v_employee_id IS NULL THEN
      SELECT id INTO v_employee_id
      FROM public.employees
      WHERE lower(email) = lower(NEW.email)
      LIMIT 1;
    END IF;

    IF v_employee_id IS NOT NULL THEN
      UPDATE public.profiles
        SET employee_id = v_employee_id
      WHERE user_id = NEW.id;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- NEVER fail auth — log and continue
    RAISE WARNING '[handle_new_user] Skipped for %: % (%)', NEW.email, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- Re-attach trigger safely
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── STEP 5: Drop ALL policies that depend on user_roles ────────
-- employees
DROP POLICY IF EXISTS "employees_access_policy"          ON public.employees;
DROP POLICY IF EXISTS "employees_admin_all"              ON public.employees;
DROP POLICY IF EXISTS "employees_self_select"            ON public.employees;
DROP POLICY IF EXISTS "employees_self_update"            ON public.employees;
DROP POLICY IF EXISTS "employees_self_read"              ON public.employees;
DROP POLICY IF EXISTS "employees_admin_read"             ON public.employees;
DROP POLICY IF EXISTS "employees_admin_update"           ON public.employees;
DROP POLICY IF EXISTS "employees_admin_insert"           ON public.employees;
DROP POLICY IF EXISTS "Employees can view their own data" ON public.employees;
DROP POLICY IF EXISTS "Admins can view all employees"    ON public.employees;
DROP POLICY IF EXISTS "Admins can update employees"      ON public.employees;

-- detail tables (all share same policy name)
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_personal_details;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_contact_details;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_employment_details;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_financial_details;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_govt_ids;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_emergency_contacts;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_additional_details;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.consent_records;

-- ── STEP 6: Now safely drop user_roles ───────────────────────
DROP TABLE IF EXISTS public.user_roles;

-- ── STEP 7: Recreate all RLS policies using employees.role ────
-- Helper: check if acting user is admin (reusable inline subquery)
-- employees table
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_self_read"
  ON public.employees FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "employees_self_update"
  ON public.employees FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "employees_admin_read"
  ON public.employees FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.employees e2
            WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

CREATE POLICY "employees_admin_update"
  ON public.employees FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.employees e2
            WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

CREATE POLICY "employees_admin_insert"
  ON public.employees FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e2
            WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

-- Detail tables: employee can access their own, admin can access all
CREATE POLICY "detail_tables_access_policy"
  ON public.employee_personal_details
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

CREATE POLICY "detail_tables_access_policy"
  ON public.employee_contact_details
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

CREATE POLICY "detail_tables_access_policy"
  ON public.employee_employment_details
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

CREATE POLICY "detail_tables_access_policy"
  ON public.employee_financial_details
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

CREATE POLICY "detail_tables_access_policy"
  ON public.employee_govt_ids
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

CREATE POLICY "detail_tables_access_policy"
  ON public.employee_emergency_contacts
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

CREATE POLICY "detail_tables_access_policy"
  ON public.employee_additional_details
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

CREATE POLICY "detail_tables_access_policy"
  ON public.consent_records
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.user_id = auth.uid() AND e2.role = 'admin')
  );

-- ── STEP 8: Update has_role() RPC to use employees table ──────
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.employees
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;
