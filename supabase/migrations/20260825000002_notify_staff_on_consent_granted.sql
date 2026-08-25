-- ============================================================
-- 20260825000002_notify_staff_on_consent_granted.sql
--
-- Fixes an asymmetry found in the consent-notification gap audit: consent
-- WITHDRAWAL already notifies both the employee and the admin/hr_manager/
-- dpo audience (via notify_hr_dpo_consent_withdrawal, added in
-- 20260506000002), but consent GRANT/RE-GRANT only ever notified the
-- employee themself (submitConsent had no notification at all; reGrantConsent
-- had an employee-only self-notification). This migration adds the missing
-- staff-facing counterpart.
--
-- notify_hr_dpo_consent_granted() mirrors notify_hr_dpo_consent_withdrawal()
-- exactly (same SECURITY DEFINER / search_path / recipient role loop:
-- admin, hr_manager, dpo) — the existing, already-trusted staff recipient
-- logic is reused verbatim rather than reinvented. No column/RLS change is
-- needed: the category/entity_type/entity_id/action_url columns and the
-- INSERT-policy-free write model already exist from
-- 20260825000001_notification_center_hardening.sql.
--
-- notify_hr_dpo_consent_withdrawal() itself is NOT modified — withdrawal
-- behavior is preserved exactly, per the gap report.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_hr_dpo_consent_granted(
  p_employee_id UUID DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
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
      'Consent granted',
      'An employee has granted consent.',
      'Employee',
      p_employee_id,
      CASE WHEN p_employee_id IS NOT NULL THEN '/admin/employees/' || p_employee_id::text ELSE NULL END
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_hr_dpo_consent_granted(UUID) TO authenticated;
