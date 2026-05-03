-- ============================================================
-- 20260503000005_onboarding_routing.sql
-- Strict Role-Based Onboarding Routing
-- ============================================================

-- 1. Add fast-path columns to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS video_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS education_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Backfill existing completions
-- Video: from video_events OR if they already consented (US-HR-009 fallback)
UPDATE public.employees e
SET video_completed = TRUE
WHERE EXISTS (
  SELECT 1 FROM public.video_events ve
  WHERE ve.employee_id = e.id AND ve.completed = TRUE AND (ve.reset_flag IS NULL OR ve.reset_flag = FALSE)
) OR EXISTS (
  SELECT 1 FROM public.consent_records cr
  WHERE cr.employee_id = e.id AND cr.status = 'consented'
);

-- Education: from education_completions
UPDATE public.employees e
SET education_completed = TRUE
WHERE EXISTS (
  SELECT 1 FROM public.education_completions ec
  WHERE ec.employee_id = e.id AND ec.is_completed = TRUE AND (ec.reset_flag IS NULL OR ec.reset_flag = FALSE)
);

-- 3. Routing RPC
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

GRANT EXECUTE ON FUNCTION public.get_onboarding_screen() TO authenticated;

-- 4. Sync Triggers
-- Sync video progress
CREATE OR REPLACE FUNCTION public.sync_video_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.completed = TRUE AND (NEW.reset_flag IS NULL OR NEW.reset_flag = FALSE) THEN
    UPDATE public.employees SET video_completed = TRUE WHERE id = NEW.employee_id;
  ELSIF NEW.reset_flag = TRUE THEN
    UPDATE public.employees SET video_completed = FALSE WHERE id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_video_event_completed ON public.video_events;
CREATE TRIGGER on_video_event_completed
  AFTER INSERT OR UPDATE OF completed, reset_flag ON public.video_events
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_video_completed();

-- Sync education completion
CREATE OR REPLACE FUNCTION public.sync_education_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_completed = TRUE AND (NEW.reset_flag IS NULL OR NEW.reset_flag = FALSE) THEN
    UPDATE public.employees SET education_completed = TRUE WHERE id = NEW.employee_id;
  ELSIF NEW.reset_flag = TRUE THEN
    UPDATE public.employees SET education_completed = FALSE WHERE id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_education_event_completed ON public.education_completions;
CREATE TRIGGER on_education_event_completed
  AFTER INSERT OR UPDATE OF is_completed, reset_flag ON public.education_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_education_completed();
