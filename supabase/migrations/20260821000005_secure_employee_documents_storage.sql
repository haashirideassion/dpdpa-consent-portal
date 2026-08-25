-- ============================================================
-- 20260821000005_secure_employee_documents_storage.sql
-- SECURITY FIX (P1 #5): storage.objects policies for the
-- 'employee-documents' bucket only checked `auth.uid() IS NOT NULL`,
-- with no ownership scoping — any authenticated user could read (and
-- upload into) any object in the bucket, including another employee's
-- PAN/Aadhaar/bank/passport scans, as long as they knew or guessed the
-- object path.
--
-- Storage path convention (see src/services/attachment.service.ts):
--   employee-documents/{employeeId}/{fieldName}/{timestamp}.{ext}
-- The first path segment is always the owning employee's `employees.id`.
-- storage.foldername(name) returns that path split into an array, so
-- (storage.foldername(name))[1] is the owning employee id.
--
-- Fix: SELECT and INSERT now require the caller to either own the
-- employee_id folder being accessed, or hold admin/hr_manager/dpo.
-- The bucket remains private; signed URLs continue to be used exactly
-- as before (createSignedUrl is itself subject to this SELECT policy).
-- The admin/hr/dpo "manage" (ALL) policy is untouched.
-- ============================================================

DROP POLICY IF EXISTS "edocs_authenticated_read" ON storage.objects;
CREATE POLICY "edocs_own_or_staff_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'employee-documents'
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid()
          AND e.id::text = (storage.foldername(name))[1]
      )
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'hr_manager')
      OR public.has_role(auth.uid(), 'dpo')
    )
  );

DROP POLICY IF EXISTS "edocs_authenticated_upload" ON storage.objects;
CREATE POLICY "edocs_own_or_staff_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (
      EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.user_id = auth.uid()
          AND e.id::text = (storage.foldername(name))[1]
      )
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'hr_manager')
      OR public.has_role(auth.uid(), 'dpo')
    )
  );

-- "edocs_admin_manage" (ALL, admin/hr_manager/dpo) is unchanged — still
-- grants staff full read/write/delete regardless of path.
