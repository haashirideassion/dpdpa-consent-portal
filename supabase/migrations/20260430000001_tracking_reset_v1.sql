-- ============================================================
-- ENHANCED TRACKING & RESET SYSTEM
-- ============================================================

-- 1. Enhance video_events with device/browser info and reset flag
ALTER TABLE public.video_events 
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS device TEXT,
ADD COLUMN IF NOT EXISTS browser TEXT,
ADD COLUMN IF NOT EXISTS reset_flag BOOLEAN DEFAULT false;

-- 2. Enhance education_completions with completion flag and reset flag
ALTER TABLE public.education_completions
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT true, -- default true because existing records are completions
ADD COLUMN IF NOT EXISTS reset_flag BOOLEAN DEFAULT false;

-- 3. Reset Function (Admin Triggered)
CREATE OR REPLACE FUNCTION public.reset_user_onboarding(
  target_employee_id UUID,
  reset_reason TEXT DEFAULT 'bug / re-consent / compliance'
) RETURNS VOID AS $$
DECLARE
  current_actor_id UUID := auth.uid();
BEGIN
  -- Check if actor is admin or hr_manager
  IF NOT (public.has_role(current_actor_id, 'admin') OR public.has_role(current_actor_id, 'hr_manager')) THEN
    RAISE EXCEPTION 'Access denied. Admin or HR Manager role required.';
  END IF;

  -- Update video_events: set reset_flag = true
  UPDATE public.video_events
  SET reset_flag = true,
      updated_at = now()
  WHERE employee_id = target_employee_id;

  -- Update education_completions: set reset_flag = true
  UPDATE public.education_completions
  SET reset_flag = true,
      is_completed = false
  WHERE employee_id = target_employee_id;

  -- Insert into audit_logs (immutable)
  INSERT INTO public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    current_actor_id,
    'reset_onboarding',
    'employee',
    target_employee_id,
    jsonb_build_object(
      'reason', reset_reason,
      'timestamp', now()
    )
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Admin Debug View (Function to fetch consolidated tracking)
CREATE OR REPLACE FUNCTION public.get_employee_tracking_debug(target_employee_id UUID)
RETURNS TABLE (
  employee_id UUID,
  video_version TEXT,
  video_completion_pct NUMERIC,
  video_watch_time INT,
  video_completed_at TIMESTAMP WITH TIME ZONE,
  video_reset_flag BOOLEAN,
  edu_version TEXT,
  edu_completed_at TIMESTAMP WITH TIME ZONE,
  edu_is_completed BOOLEAN,
  edu_reset_flag BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as employee_id,
    vv.version as video_version,
    ve.completion_pct as video_completion_pct,
    ve.watch_time_seconds as video_watch_time,
    ve.completed_at as video_completed_at,
    ve.reset_flag as video_reset_flag,
    ec.module_version as edu_version,
    ec.completed_at as edu_completed_at,
    ec.is_completed as edu_is_completed,
    ec.reset_flag as edu_reset_flag
  FROM public.employees e
  LEFT JOIN public.video_events ve ON e.id = ve.employee_id
  LEFT JOIN public.video_versions vv ON ve.video_version_id = vv.id
  LEFT JOIN public.education_completions ec ON e.id = ec.employee_id
  WHERE e.id = target_employee_id
  ORDER BY ve.created_at DESC, ec.completed_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
