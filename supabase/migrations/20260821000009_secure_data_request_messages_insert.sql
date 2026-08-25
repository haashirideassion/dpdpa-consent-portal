-- ============================================================
-- 20260821000009_secure_data_request_messages_insert.sql
-- SECURITY FIX (P2 #9): "drm_insert" only checked
-- `WITH CHECK (author_id = auth.uid())` — it never verified the caller
-- has any relationship to the target `request_id`, so any authenticated
-- user could insert a message onto ANY data_requests thread, including
-- one raised by a different employee.
--
-- Fix: the caller must additionally be staff (is_staff()) OR the
-- request's own raiser. Internal staff-authored messages (including
-- is_internal = true notes) are unaffected — staff can still message
-- any request. Employees can still message their own requests exactly
-- as before.
-- ============================================================

DROP POLICY IF EXISTS "drm_insert" ON public.data_request_messages;

CREATE POLICY "drm_insert"
  ON public.data_request_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      is_staff()
      OR request_id IN (
        SELECT id FROM public.data_requests WHERE raised_by = auth.uid()
      )
    )
  );
