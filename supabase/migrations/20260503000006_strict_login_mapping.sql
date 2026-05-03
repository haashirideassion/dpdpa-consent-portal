-- ============================================================
-- 20260503000006_strict_login_mapping.sql
-- Fixes login mapping: strictly matches by email, never creates fake records.
-- ============================================================

-- 1. Create a safe mapping RPC that can be called on every login
CREATE OR REPLACE FUNCTION public.map_user_to_employee()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT := auth.jwt()->>'email';
  v_emp_id UUID;
BEGIN
  -- Safety check
  IF v_uid IS NULL OR v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Find employee by email (case-insensitive) where user_id is null
  -- This prevents duplicate mapping if the record is already linked
  SELECT id INTO v_emp_id
  FROM public.employees
  WHERE lower(email) = lower(v_email)
    AND user_id IS NULL
  LIMIT 1;

  IF v_emp_id IS NOT NULL THEN
    -- Update user_id mapping
    UPDATE public.employees
    SET user_id = v_uid
    WHERE id = v_emp_id AND user_id IS NULL;
    
    RETURN TRUE;
  END IF;

  -- Employee not found or already linked
  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.map_user_to_employee() TO authenticated;

-- 2. Embed the mapping into the get_onboarding_screen RPC to make it completely automatic
CREATE OR REPLACE FUNCTION public.get_onboarding_screen()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role               TEXT;
  v_video_completed    BOOLEAN;
  v_edu_completed      BOOLEAN;
  v_has_active_video   BOOLEAN;
  v_has_active_edu     BOOLEAN;
BEGIN
  -- 🚀 AUTO-MAP BEFORE ROUTING 🚀
  -- This ensures mapping happens dynamically on every login
  PERFORM public.map_user_to_employee();

  -- Get employee record for current user
  SELECT role, video_completed, education_completed
  INTO v_role, v_video_completed, v_edu_completed
  FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    -- If STILL not found, it means no CSV row exists.
    -- DO NOT create a new row. Just return the missing status.
    RETURN jsonb_build_object('screen', 'NO_EMPLOYEE_RECORD');
  END IF;

  -- Admin/HR/DPO go directly to admin dashboard
  IF v_role IN ('admin', 'hr_manager', 'dpo') THEN
    RETURN jsonb_build_object('screen', 'ADMIN_DASHBOARD', 'role', v_role);
  END IF;

  -- Employee flow
  SELECT EXISTS(SELECT 1 FROM public.video_versions WHERE is_active = TRUE)
  INTO v_has_active_video;

  IF v_has_active_video AND NOT v_video_completed THEN
    RETURN jsonb_build_object('screen', 'SHOW_VIDEO');
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.education_modules WHERE is_active = TRUE)
  INTO v_has_active_edu;

  IF v_has_active_edu AND NOT v_edu_completed THEN
    RETURN jsonb_build_object('screen', 'SHOW_EDUCATION');
  END IF;

  RETURN jsonb_build_object('screen', 'SHOW_EMPLOYEE_PORTAL');
END;
$$;

-- 3. Replace the handle_new_user trigger to NEVER create placeholder employees
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  BEGIN
    -- Only try to map to an existing HR record by email (case-insensitive)
    SELECT id INTO v_employee_id 
    FROM public.employees 
    WHERE lower(email) = lower(NEW.email) 
    LIMIT 1;

    IF v_employee_id IS NOT NULL THEN
      -- Map user_id to the existing employee record
      UPDATE public.employees 
      SET user_id = NEW.id 
      WHERE id = v_employee_id AND user_id IS NULL;

      -- Create their profile avatar
      INSERT INTO public.profiles (user_id, display_name, employee_id)
      VALUES (
        NEW.id, 
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), 
        v_employee_id
      )
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
    -- If NOT found, DO NOTHING. We do NOT insert blank employees anymore.

  EXCEPTION WHEN OTHERS THEN
    -- Ignore errors to let auth succeed
  END;

  RETURN NEW;
END;
$$;
