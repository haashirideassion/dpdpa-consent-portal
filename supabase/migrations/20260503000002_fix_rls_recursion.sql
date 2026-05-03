-- ============================================================
-- FIX: Infinite recursion in employees RLS policies
-- ROOT CAUSE: policies queried employees table to check admin
--   role, which triggered the same RLS policy → infinite loop.
-- SOLUTION: SECURITY DEFINER function bypasses RLS safely.
-- RUN THIS IN SUPABASE SQL EDITOR
-- ============================================================

-- ── 1. Create helper function (SECURITY DEFINER = bypasses RLS) ──
CREATE OR REPLACE FUNCTION public.get_my_employee_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.employees WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ── 2. Drop ALL broken policies on employees ──────────────────
DROP POLICY IF EXISTS "employees_self_read"      ON public.employees;
DROP POLICY IF EXISTS "employees_self_update"    ON public.employees;
DROP POLICY IF EXISTS "employees_admin_read"     ON public.employees;
DROP POLICY IF EXISTS "employees_admin_update"   ON public.employees;
DROP POLICY IF EXISTS "employees_admin_insert"   ON public.employees;
DROP POLICY IF EXISTS "employees_access_policy"  ON public.employees;

-- ── 3. Recreate employees policies (no self-reference) ────────
-- Own row access
CREATE POLICY "employees_self_read"
  ON public.employees FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "employees_self_update"
  ON public.employees FOR UPDATE
  USING (user_id = auth.uid());

-- Admin access via SECURITY DEFINER function (no recursion)
CREATE POLICY "employees_admin_read"
  ON public.employees FOR SELECT
  USING (public.get_my_employee_role() = 'admin');

CREATE POLICY "employees_admin_update"
  ON public.employees FOR UPDATE
  USING (public.get_my_employee_role() = 'admin');

CREATE POLICY "employees_admin_insert"
  ON public.employees FOR INSERT
  WITH CHECK (public.get_my_employee_role() = 'admin');

-- ── 4. Drop and recreate all detail table policies too ────────
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_personal_details;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_contact_details;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_employment_details;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_financial_details;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_govt_ids;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_emergency_contacts;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.employee_additional_details;
DROP POLICY IF EXISTS "detail_tables_access_policy" ON public.consent_records;

-- employee_personal_details
CREATE POLICY "detail_tables_access_policy"
  ON public.employee_personal_details
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.get_my_employee_role() = 'admin'
  );

-- employee_contact_details
CREATE POLICY "detail_tables_access_policy"
  ON public.employee_contact_details
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.get_my_employee_role() = 'admin'
  );

-- employee_employment_details
CREATE POLICY "detail_tables_access_policy"
  ON public.employee_employment_details
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.get_my_employee_role() = 'admin'
  );

-- employee_financial_details
CREATE POLICY "detail_tables_access_policy"
  ON public.employee_financial_details
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.get_my_employee_role() = 'admin'
  );

-- employee_govt_ids
CREATE POLICY "detail_tables_access_policy"
  ON public.employee_govt_ids
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.get_my_employee_role() = 'admin'
  );

-- employee_emergency_contacts
CREATE POLICY "detail_tables_access_policy"
  ON public.employee_emergency_contacts
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.get_my_employee_role() = 'admin'
  );

-- employee_additional_details
CREATE POLICY "detail_tables_access_policy"
  ON public.employee_additional_details
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.get_my_employee_role() = 'admin'
  );

-- consent_records
CREATE POLICY "detail_tables_access_policy"
  ON public.consent_records
  USING (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.get_my_employee_role() = 'admin'
  );
