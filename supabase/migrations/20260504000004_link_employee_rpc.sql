-- ============================================================
-- 20260504000004_link_employee_rpc.sql
-- Safely link auth.users to pre-created employee records
-- ============================================================

-- 1. Ensure email is unique across the employees table (PRD recommended constraint)
ALTER TABLE public.employees 
DROP CONSTRAINT IF EXISTS employees_email_key;

ALTER TABLE public.employees 
ADD CONSTRAINT employees_email_key UNIQUE (email);

-- 2. Create Security Definer RPC to bypass RLS for this specific safe operation
CREATE OR REPLACE FUNCTION public.link_employee_record()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS so the user can link their unlinked record
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_employee_id UUID;
BEGIN
  -- Get current authenticated user
  v_user_id := auth.uid();
  
  -- Safest way to get email: direct from auth.users, instead of relying on jwt claims
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_user_id IS NULL OR v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Look for an existing employee record with the same email but NO user_id (case insensitive + trimmed)
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(v_email)) 
    AND user_id IS NULL
  LIMIT 1;

  -- If found, link it to the newly authenticated user
  IF FOUND THEN
    UPDATE public.employees
    SET user_id = v_user_id
    WHERE id = v_employee_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
