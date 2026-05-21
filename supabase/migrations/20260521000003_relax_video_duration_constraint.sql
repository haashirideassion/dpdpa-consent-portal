-- ============================================================
-- 20260521000003_relax_video_duration_constraint.sql
-- Drops the check_video_duration constraint that enforced
-- duration_seconds BETWEEN 45 AND 90.
-- This was too restrictive — short test/preview videos and
-- future content updates should not be blocked at the DB level.
-- Duration validation is handled in the admin UI instead.
-- ============================================================

ALTER TABLE public.video_versions
  DROP CONSTRAINT IF EXISTS check_video_duration;
