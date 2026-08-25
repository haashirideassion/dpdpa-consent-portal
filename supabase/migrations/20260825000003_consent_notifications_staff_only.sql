-- ============================================================
-- 20260825000003_consent_notifications_staff_only.sql
--
-- Product clarification: employees must NOT receive an in-app
-- notification-center item for their own consent actions (grant/re-grant/
-- withdraw) — they already see a success/error toast in the UI. Only the
-- admin/hr_manager/dpo audience should be notified. The employee-facing
-- self-notification inserts have been removed from consent.service.ts
-- (submitConsent/withdrawConsent/reGrantConsent) in this same change —
-- this migration only updates the STAFF-facing message text on the
-- existing withdrawal function to the generic wording specified, and adds
-- no new recipient-resolution logic (still admin/hr_manager/dpo, unchanged).
--
-- notify_hr_dpo_consent_granted() (added in 20260825000002) already used
-- the generic "Consent granted" / "An employee has granted consent."
-- wording and needs no change.
--
-- notify_hr_dpo_consent_withdrawal()'s signature/recipient loop/security
-- model (SECURITY DEFINER, SET search_path = public) are UNCHANGED — only
-- the title/message text is simplified to drop the employee name and
-- purpose label, matching the same privacy-generic style as the grant
-- notification.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_hr_dpo_consent_withdrawal(
  p_employee_name TEXT,
  p_purpose_label TEXT,
  p_purpose_key   TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hr_user_id UUID;
BEGIN
  FOR v_hr_user_id IN
    SELECT e.user_id
    FROM public.employees e
    WHERE e.role IN ('admin', 'hr_manager', 'dpo')
      AND e.user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, actor_user_id, type, category, title, message, entity_type)
    VALUES (
      v_hr_user_id,
      auth.uid(),
      'CONSENT_WITHDRAWAL',
      'consent.withdrawn',
      'Consent withdrawn',
      'An employee has withdrawn consent.',
      'consent_purpose'
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_hr_dpo_consent_withdrawal(TEXT, TEXT, TEXT) TO authenticated;
