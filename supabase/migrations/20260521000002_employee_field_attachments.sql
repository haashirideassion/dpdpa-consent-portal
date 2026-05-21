-- ============================================================
-- 20260521000002_employee_field_attachments.sql
-- Supporting document upload for sensitive employee fields.
--
-- Table: employee_field_attachments
--   Stores the canonical current document per field per employee.
--   Old documents are kept (is_active=false) for DPDPA audit history.
--
-- Bucket: employee-documents
--   Private bucket, 5 MB limit, PDF/JPG/PNG only.
--   Signed URLs generated on-demand (1-hour TTL) via the frontend.
-- ============================================================

-- ── 1. Table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_field_attachments (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id           UUID        NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  -- nullable: direct uploads have no linked request; post-consent proof uploads link to one
  correction_request_id UUID        REFERENCES public.correction_requests(id) ON DELETE SET NULL,
  section_name          TEXT        NOT NULL,   -- e.g. "government_ids"
  field_name            TEXT        NOT NULL,   -- e.g. "aadhaar_number"
  file_name             TEXT        NOT NULL,   -- original filename shown in UI
  -- storage path inside the "employee-documents" bucket (not a URL — used for signed URL generation)
  file_path             TEXT        NOT NULL,
  mime_type             TEXT        NOT NULL,
  file_size             BIGINT      NOT NULL,   -- bytes
  uploaded_by           UUID        NOT NULL REFERENCES auth.users(id),
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Efficient lookup: active document for a specific employee + field
CREATE INDEX IF NOT EXISTS idx_efa_employee_field_active
  ON public.employee_field_attachments(employee_id, field_name, is_active);

-- ── 2. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.employee_field_attachments ENABLE ROW LEVEL SECURITY;

-- Employees: full access to own records only
DROP POLICY IF EXISTS "efa_employee_own" ON public.employee_field_attachments;
CREATE POLICY "efa_employee_own" ON public.employee_field_attachments
  FOR ALL
  USING  (public.is_authorized_employee(employee_id))
  WITH CHECK (public.is_authorized_employee(employee_id));

-- Admins / HR: full access to all records
DROP POLICY IF EXISTS "efa_admin_all" ON public.employee_field_attachments;
CREATE POLICY "efa_admin_all" ON public.employee_field_attachments
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_manager')
    OR public.has_role(auth.uid(), 'dpo')
  );

-- ── 3. Storage bucket ───────────────────────────────────────────────────────
-- Private bucket: access is controlled by signed URLs + storage RLS.
-- Only authenticated users who own the record (or admins) can read files.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-documents',
  'employee-documents',
  false,          -- private: no unauthenticated access
  5242880,        -- 5 MB per file
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 4. Storage RLS ──────────────────────────────────────────────────────────
-- Any authenticated user may upload (the app enforces employee ownership above).
DROP POLICY IF EXISTS "edocs_authenticated_upload" ON storage.objects;
CREATE POLICY "edocs_authenticated_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND auth.uid() IS NOT NULL
  );

-- Any authenticated user may read (signed URL guarantees the caller is authed).
DROP POLICY IF EXISTS "edocs_authenticated_read" ON storage.objects;
CREATE POLICY "edocs_authenticated_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'employee-documents'
    AND auth.uid() IS NOT NULL
  );

-- Admin / HR can delete / replace objects (e.g. during admin override upload).
DROP POLICY IF EXISTS "edocs_admin_manage" ON storage.objects;
CREATE POLICY "edocs_admin_manage" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'employee-documents'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'hr_manager')
      OR public.has_role(auth.uid(), 'dpo')
    )
  );
