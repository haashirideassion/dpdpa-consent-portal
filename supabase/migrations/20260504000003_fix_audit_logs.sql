-- ============================================================
-- 20260504000003_fix_audit_logs.sql
-- Fix audit logs to store user_email and fix read RLS
-- ============================================================

-- 1. Add user_email column
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- 2. Fix RLS policy for reading
DROP POLICY IF EXISTS "Allow read audit logs" ON public.audit_logs;
CREATE POLICY "Allow read audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (true);
