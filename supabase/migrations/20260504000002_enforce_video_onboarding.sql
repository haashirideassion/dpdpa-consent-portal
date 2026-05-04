-- ============================================================
-- 20260504000002_enforce_video_onboarding.sql
-- Enforce that an active video MUST exist for employee onboarding
-- ============================================================

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
  -- Get employee record for current user
  SELECT role, video_completed, education_completed
  INTO v_role, v_video_completed, v_edu_completed
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

  -- Employee flow
  -- Check if active video exists
  SELECT EXISTS(SELECT 1 FROM public.video_versions WHERE is_active = TRUE)
  INTO v_has_active_video;

  -- ENFORCEMENT: If no active video exists, stop onboarding
  IF NOT v_has_active_video THEN
    RETURN jsonb_build_object('screen', 'NO_VIDEO_AVAILABLE');
  END IF;

  IF v_has_active_video AND NOT v_video_completed THEN
    RETURN jsonb_build_object('screen', 'SHOW_VIDEO');
  END IF;

  -- Check if active education exists
  SELECT EXISTS(SELECT 1 FROM public.education_modules WHERE is_active = TRUE)
  INTO v_has_active_edu;

  IF v_has_active_edu AND NOT v_edu_completed THEN
    RETURN jsonb_build_object('screen', 'SHOW_EDUCATION');
  END IF;

  -- All done or no active modules
  RETURN jsonb_build_object('screen', 'SHOW_EMPLOYEE_PORTAL');
END;
$$;
