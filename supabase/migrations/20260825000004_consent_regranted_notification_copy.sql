-- ============================================================
-- 20260825000004_consent_regranted_notification_copy.sql
--
-- Product refinement: staff notifications must distinguish a genuine
-- first-time consent grant from a re-grant after withdrawal:
--   - First-time grant  -> "Consent granted"    / "An employee has granted consent."
--   - Re-grant after withdrawal -> "Consent re-granted" / "An employee has re-granted consent."
--
-- notify_hr_dpo_consent_granted() previously took only p_employee_id and
-- always used the "granted" wording for both cases (submitConsent's
-- first-time grant AND reGrantConsent's re-grant/give-consent-for-first-
-- time). This adds a p_is_regrant flag, set by the client based on
-- whether the purpose being granted was previously withdrawn (a plain
-- boolean already known client-side from the purpose's current status —
-- no new query or column needed).
--
-- The old 1-argument overload is dropped first so PostgREST/Supabase RPC
-- resolution is unambiguous (Postgres treats a changed argument list as a
-- distinct overload, not a replacement, if the old function is left in
-- place). Recipient loop, SECURITY DEFINER, and search_path are unchanged.
-- ============================================================

DROP FUNCTION IF EXISTS public.notify_hr_dpo_consent_granted(UUID);

CREATE OR REPLACE FUNCTION public.notify_hr_dpo_consent_granted(
  p_employee_id UUID DEFAULT NULL,
  p_is_regrant  BOOLEAN DEFAULT FALSE
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_title TEXT;
  v_message TEXT;
BEGIN
  IF p_is_regrant THEN
    v_title := 'Consent re-granted';
    v_message := 'An employee has re-granted consent.';
  ELSE
    v_title := 'Consent granted';
    v_message := 'An employee has granted consent.';
  END IF;

  FOR v_staff_id IN
    SELECT e.user_id
    FROM public.employees e
    WHERE e.role IN ('admin', 'hr_manager', 'dpo')
      AND e.user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (
      user_id, actor_user_id, type, category, title, message, entity_type, entity_id, action_url
    ) VALUES (
      v_staff_id,
      auth.uid(),
      'consent.granted',
      'consent.granted',
      v_title,
      v_message,
      'Employee',
      p_employee_id,
      CASE WHEN p_employee_id IS NOT NULL THEN '/admin/employees/' || p_employee_id::text ELSE NULL END
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_hr_dpo_consent_granted(UUID, BOOLEAN) TO authenticated;
