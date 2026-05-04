-- ============================================================
-- 20260504000001_video_storage_bucket.sql
-- Creates Supabase Storage bucket for DPDPA video uploads
-- ============================================================

-- 1. Create storage bucket (if not already created via dashboard)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dpdpa_videos',
  'dpdpa_videos',
  true,                          -- Public bucket so video URLs can be embedded directly
  26214400,                      -- 25 MB max file size
  ARRAY['video/mp4', 'text/vtt', 'text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage RLS: Admins/HR/DPO can upload (INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "dpdpa_videos_admin_upload" ON storage.objects;
CREATE POLICY "dpdpa_videos_admin_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'dpdpa_videos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'hr_manager')
      OR public.has_role(auth.uid(), 'dpo')
    )
  );

DROP POLICY IF EXISTS "dpdpa_videos_admin_manage" ON storage.objects;
CREATE POLICY "dpdpa_videos_admin_manage" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'dpdpa_videos'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'hr_manager')
      OR public.has_role(auth.uid(), 'dpo')
    )
  );

-- 3. Storage RLS: Anyone authenticated can read (stream video/captions)
DROP POLICY IF EXISTS "dpdpa_videos_public_read" ON storage.objects;
CREATE POLICY "dpdpa_videos_public_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'dpdpa_videos'
    AND auth.uid() IS NOT NULL
  );
