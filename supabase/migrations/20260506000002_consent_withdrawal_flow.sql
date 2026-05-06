-- ============================================================
-- 20260506000002_consent_withdrawal_flow.sql
-- Enables full consent withdrawal + re-consent lifecycle:
--   1. Employees can self-insert withdrawal acknowledgement notifications
--   2. SECURITY DEFINER RPC notifies HR/DPO on withdrawal
--   3. Employees can insert their own withdrawal records (policy fix)
-- ============================================================

-- ── 1. Allow employees to insert notifications for themselves ────────────────
-- Required for withdrawal acknowledgement (sent to own user_id).
-- The existing "Admins can insert notifications" policy only covers admin-side
-- notifications (e.g. data override alerts). Employees need their own INSERT.
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());


-- ── 2. Ensure employees can INSERT their own withdrawal records ──────────────
-- The existing "consent_withdrawals_own" uses FOR ALL with USING only.
-- PostgreSQL treats USING as WITH CHECK for INSERT in FOR ALL policies,
-- so this should already work — this is a belt-and-suspenders explicit policy.
DROP POLICY IF EXISTS "consent_withdrawals_insert_own" ON public.consent_withdrawals;
CREATE POLICY "consent_withdrawals_insert_own"
ON public.consent_withdrawals
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
);


-- ── 3. SECURITY DEFINER: notify HR/DPO about a consent withdrawal ────────────
-- Called from the client after successful withdrawal record creation.
-- Bypasses RLS to reach all HR manager and DPO user inboxes.
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
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (
      v_hr_user_id,
      'CONSENT_WITHDRAWAL',
      'Consent Withdrawal: ' || p_purpose_label,
      p_employee_name || ' has withdrawn consent for: ' || p_purpose_label ||
      '. Action may be required for compliance tracking.'
    );
  END LOOP;
END;
$$;

-- Grant execute to authenticated users so the frontend can call it via RPC
GRANT EXECUTE ON FUNCTION public.notify_hr_dpo_consent_withdrawal(TEXT, TEXT, TEXT) TO authenticated;


-- ── 4. Index to speed up per-purpose withdrawal lookups ─────────────────────
CREATE INDEX IF NOT EXISTS idx_consent_withdrawals_emp_purpose
  ON public.consent_withdrawals(employee_id, purpose_key);
