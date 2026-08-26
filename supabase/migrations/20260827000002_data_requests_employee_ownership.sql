-- ============================================================
-- MoM #3 — data_requests employee_id ownership enforcement
-- Date: 2026-08-27
-- Purpose: The existing data_requests_insert policy (see
--   20260625000001_prd_v2_extension.sql) only checks that
--   raised_by = auth.uid() — it never verifies that employee_id actually
--   belongs to the caller. A non-staff, authenticated employee could insert
--   a data_requests row (access/correction/erasure/portability/nomination/
--   grievance) with raised_by = self but employee_id = ANY other employee's
--   id, which a staff reviewer would then action against the wrong record.
--
-- Fix: require, for non-staff callers, that employee_id is either null or
-- resolves to the caller's own employees.id. Staff (admin/dpo, via
-- is_staff()) are unaffected — this is exactly what the existing
-- "raise erasure request on behalf of an ex-employee" admin flow needs
-- (src/routes/_authenticated.admin.requests.index.tsx), and it already goes
-- through is_staff() today.
--
-- Does not touch process_erasure_request()/assess_erasure_request() — both
-- already derive employee_id server-side from the data_requests row, never
-- from client input, so they are unaffected by this change.
-- ============================================================

DROP POLICY IF EXISTS "data_requests_insert" ON public.data_requests;

CREATE POLICY "data_requests_insert"
  ON public.data_requests FOR INSERT
  WITH CHECK (
    (raised_by = auth.uid() OR is_staff())
    AND (
      is_staff()
      OR employee_id IS NULL
      OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  );
