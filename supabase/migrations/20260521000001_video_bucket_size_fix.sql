-- ============================================================
-- 20260521000001_video_bucket_size_fix.sql
-- Raises the dpdpa_videos storage bucket file size limit
-- from 25 MB (26214400) to 500 MB (524288000).
-- The frontend limit was already updated; this aligns Supabase
-- storage so the 413 "Payload too large" error no longer occurs.
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 524288000   -- 500 MB
WHERE id = 'dpdpa_videos';
