-- ============================================================
-- US-HR-009: DPDPA INTRO VIDEO MANAGEMENT
-- ============================================================

-- 1. Extend video_versions to meet US-HR-009 PRD
ALTER TABLE public.video_versions
  ADD COLUMN IF NOT EXISTS caption_url TEXT,
  ADD COLUMN IF NOT EXISTS resolution TEXT, -- e.g., '1080p', '720p'
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'; -- 'draft', 'active', 'inactive'

-- Add a CHECK constraint to enforce PRD validation rules
ALTER TABLE public.video_versions
  ADD CONSTRAINT check_video_duration CHECK (duration_seconds BETWEEN 45 AND 90),
  ADD CONSTRAINT check_video_status CHECK (status IN ('draft', 'active', 'inactive'));

-- Ensure only ONE active video per language at any given time
CREATE UNIQUE INDEX unique_active_language_video 
  ON public.video_versions (language) 
  WHERE status = 'active';

-- 2. Update RLS Policies to include DPO (PRD Requirement)
DROP POLICY IF EXISTS "video_versions_admin_all" ON public.video_versions;
CREATE POLICY "video_versions_admin_all" ON public.video_versions
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_manager')
    OR public.has_role(auth.uid(), 'dpo')
  );

-- Employees can only SELECT active videos
DROP POLICY IF EXISTS "video_versions_employee_read" ON public.video_versions;
CREATE POLICY "video_versions_employee_read" ON public.video_versions
  FOR SELECT USING (
    auth.uid() IS NOT NULL 
    AND status = 'active'
  );

-- 3. RLS for video_events (Employee Tracking)
DROP POLICY IF EXISTS "video_events_own" ON public.video_events;
-- Employees only see/update their own tracking. Admins/DPOs can see all.
CREATE POLICY "video_events_own" ON public.video_events
  FOR ALL USING (
    user_id = auth.uid() 
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_manager')
    OR public.has_role(auth.uid(), 'dpo')
  );
