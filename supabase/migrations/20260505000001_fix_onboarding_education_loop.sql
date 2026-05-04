-- ============================================================
-- 20260505000001_fix_onboarding_education_loop.sql
-- Prevent routing loop when fast-path completion flags lag.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_onboarding_screen()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role               TEXT;
  v_emp_id             UUID;
  v_video_completed    BOOLEAN;
  v_edu_completed      BOOLEAN;
  v_has_active_video   BOOLEAN;
  v_has_active_edu     BOOLEAN;
BEGIN
  -- Keep strict user-to-employee mapping self-healing.
  PERFORM public.map_user_to_employee();

  -- Get employee record for current user
  SELECT id, role, video_completed, education_completed
  INTO v_emp_id, v_role, v_video_completed, v_edu_completed
  FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('screen', 'NO_EMPLOYEE_RECORD');
  END IF;

  -- Admin/HR/DPO go directly to admin dashboard
  IF v_role IN ('admin', 'hr_manager', 'dpo') THEN
    RETURN jsonb_build_object('screen', 'ADMIN_DASHBOARD', 'role', v_role);
  END IF;

  -- Check active video presence first (enforced onboarding requirement)
  SELECT EXISTS(SELECT 1 FROM public.video_versions WHERE is_active = TRUE)
  INTO v_has_active_video;

  IF NOT v_has_active_video THEN
    RETURN jsonb_build_object('screen', 'NO_VIDEO_AVAILABLE');
  END IF;

  IF NOT v_video_completed THEN
    -- Fallback/self-heal if fast-path flag is stale
    IF EXISTS(
      SELECT 1
      FROM public.video_events ve
      WHERE ve.employee_id = v_emp_id
        AND ve.completed = TRUE
        AND (ve.reset_flag IS NULL OR ve.reset_flag = FALSE)
    ) THEN
      UPDATE public.employees
      SET video_completed = TRUE
      WHERE id = v_emp_id;
      v_video_completed := TRUE;
    ELSE
      RETURN jsonb_build_object('screen', 'SHOW_VIDEO');
    END IF;
  END IF;

  -- Education step
  SELECT EXISTS(SELECT 1 FROM public.education_modules WHERE is_active = TRUE)
  INTO v_has_active_edu;

  IF v_has_active_edu AND NOT v_edu_completed THEN
    -- Fallback/self-heal if fast-path flag is stale
    IF EXISTS(
      SELECT 1
      FROM public.education_completions ec
      WHERE ec.employee_id = v_emp_id
        AND ec.is_completed = TRUE
        AND (ec.reset_flag IS NULL OR ec.reset_flag = FALSE)
    ) THEN
      UPDATE public.employees
      SET education_completed = TRUE
      WHERE id = v_emp_id;
      v_edu_completed := TRUE;
    ELSE
      RETURN jsonb_build_object('screen', 'SHOW_EDUCATION');
    END IF;
  END IF;

  RETURN jsonb_build_object('screen', 'SHOW_EMPLOYEE_PORTAL');
END;
$$;
