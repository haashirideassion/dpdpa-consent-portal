-- ============================================================
-- 20260503000007_self_healing_routing.sql
-- Fixes the infinite loop by dynamically checking video_events 
-- and education_completions as a fallback, ensuring no deadlocks.
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
  -- 🚀 AUTO-MAP BEFORE ROUTING 🚀
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

  -- ─── VIDEO CHECK ───
  SELECT EXISTS(SELECT 1 FROM public.video_versions WHERE is_active = TRUE)
  INTO v_has_active_video;

  IF v_has_active_video AND NOT v_video_completed THEN
    -- Fallback/Self-Heal: Check if they actually finished it but the trigger failed
    IF EXISTS(
      SELECT 1 FROM public.video_events 
      WHERE employee_id = v_emp_id AND completed = TRUE AND (reset_flag IS NULL OR reset_flag = FALSE)
    ) THEN
      -- Heal the fast-path column silently
      UPDATE public.employees SET video_completed = TRUE WHERE id = v_emp_id;
      v_video_completed := TRUE;
    ELSE
      RETURN jsonb_build_object('screen', 'SHOW_VIDEO');
    END IF;
  END IF;

  -- ─── EDUCATION CHECK ───
  SELECT EXISTS(SELECT 1 FROM public.education_modules WHERE is_active = TRUE)
  INTO v_has_active_edu;

  IF v_has_active_edu AND NOT v_edu_completed THEN
    -- Fallback/Self-Heal: Check if they actually finished it
    IF EXISTS(
      SELECT 1 FROM public.education_completions 
      WHERE employee_id = v_emp_id AND is_completed = TRUE AND (reset_flag IS NULL OR reset_flag = FALSE)
    ) THEN
      -- Heal the fast-path column silently
      UPDATE public.employees SET education_completed = TRUE WHERE id = v_emp_id;
      v_edu_completed := TRUE;
    ELSE
      RETURN jsonb_build_object('screen', 'SHOW_EDUCATION');
    END IF;
  END IF;

  -- All done or no active modules
  RETURN jsonb_build_object('screen', 'SHOW_EMPLOYEE_PORTAL');
END;
$$;
