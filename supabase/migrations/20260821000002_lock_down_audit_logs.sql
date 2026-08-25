-- ============================================================
-- 20260821000002_lock_down_audit_logs.sql
-- SECURITY FIX (P0 #2): audit_logs SELECT policy was regressed to
-- `USING (true) TO authenticated` in 20260504000003_fix_audit_logs.sql,
-- exposing the entire audit trail (incl. unmasked admin-override diffs
-- of PAN/bank/Aadhaar values) to every authenticated employee.
--
-- Restores the original product role model from
-- 20260429000001_phase1_rbac_audit_invites.sql: admin + dpo only.
-- Insert/immutability behavior is untouched.
-- ============================================================

DROP POLICY IF EXISTS "Allow read audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;

CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dpo')
  );

-- Insert policy is unchanged (actor_user_id = auth.uid()); no UPDATE/DELETE
-- policy exists for audit_logs either before or after this migration, so it
-- remains immutable for every role, including admin/dpo.
