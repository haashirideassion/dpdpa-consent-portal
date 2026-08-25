-- ============================================================
-- 20260821000003_secure_get_employee_tracking_debug.sql
-- SECURITY FIX (P1 #3): get_employee_tracking_debug(target_employee_id)
-- was a SECURITY DEFINER function with NO authorization check at all —
-- any authenticated user could pass an arbitrary employee id and read
-- that employee's onboarding/video/education tracking status (IDOR).
--
-- Fix: caller must be admin/hr_manager, OR requesting their own
-- employee record. Not currently called from the frontend (this is an
-- admin/support debug RPC), so this only removes an unused attack
-- surface — no product behavior changes.
-- Also adds the missing SET search_path = public.
-- ============================================================

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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_manager')
    OR EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = target_employee_id AND user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin or HR Manager role required to view another employee''s tracking data.';
  END IF;

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
$$;
