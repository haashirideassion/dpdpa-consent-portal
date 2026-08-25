-- ============================================================
-- 20260821000011_security_definer_search_path_hardening.sql
-- SECURITY FIX (P2 #12): adds the missing `SET search_path = public`
-- to every remaining SECURITY DEFINER function that lacked it. No
-- behavior change — bodies are unchanged, only the search_path pin is
-- added (defense-in-depth against search_path injection).
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_authorized_employee(target_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = target_employee_id AND user_id = auth.uid()
    ) OR public.has_role(auth.uid(), 'admin')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_user_onboarding(
  target_employee_id UUID,
  reset_reason TEXT DEFAULT 'bug / re-consent / compliance'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_actor_id UUID := auth.uid();
BEGIN
  IF NOT (public.has_role(current_actor_id, 'admin') OR public.has_role(current_actor_id, 'hr_manager')) THEN
    RAISE EXCEPTION 'Access denied. Admin or HR Manager role required.';
  END IF;

  UPDATE public.video_events
  SET reset_flag = true,
      updated_at = now()
  WHERE employee_id = target_employee_id;

  UPDATE public.education_completions
  SET reset_flag = true,
      is_completed = false
  WHERE employee_id = target_employee_id;

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
$$;

CREATE OR REPLACE FUNCTION public.sync_video_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.sync_education_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION notify_new_data_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_ids uuid[];
BEGIN
  SELECT array_agg(e.user_id)
    INTO staff_ids
    FROM employees e
   WHERE e.role IN ('admin', 'dpo')
     AND e.user_id IS NOT NULL;

  IF staff_ids IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message)
    SELECT unnest(staff_ids),
           'dsr_new',
           'New Data Request: ' || NEW.request_type,
           COALESCE(NEW.subject, 'A new data subject request has been submitted.');
  END IF;
  RETURN NEW;
END;
$$;
