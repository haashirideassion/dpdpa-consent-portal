-- ============================================================
-- PHASE 1: RBAC + Audit Logs + Consent Invites + Video Versions
-- ============================================================

-- 1. Extend app_role enum with hr_manager and dpo
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dpo';

-- 2. Immutable Audit Logs (append-only, no UPDATE/DELETE policies)
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  -- e.g. 'login', 'logout', 'consent.granted', 'consent.withdrawn',
  --      'video.completed', 'data.edited', 'dpr.created', 'invite.sent'
  entity_type TEXT,        -- 'employee', 'consent_record', 'campaign', etc.
  entity_id UUID,
  metadata JSONB,          -- flexible payload (ip, device, details)
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Append-only: anyone authenticated can insert their own actions
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (actor_user_id = auth.uid());

-- Only admin and dpo can read
CREATE POLICY "audit_logs_select" ON public.audit_logs
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dpo')
  );

-- NO UPDATE or DELETE policies — immutable by design

-- 3. Video Versions (needed by campaign system in Phase 5)
CREATE TABLE public.video_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,               -- Supabase Storage or CDN URL
  language TEXT NOT NULL DEFAULT 'en',
  version TEXT NOT NULL,           -- e.g. 'v1.0'
  is_active BOOLEAN NOT NULL DEFAULT false,
  duration_seconds INT,            -- total video duration for completion calc
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.video_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_versions_admin_all" ON public.video_versions
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "video_versions_employee_read" ON public.video_versions
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = true);

-- 4. Video Events (per-employee watch tracking — Phase 2 UI)
CREATE TABLE public.video_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  video_version_id UUID REFERENCES public.video_versions(id) ON DELETE CASCADE NOT NULL,
  watch_time_seconds INT NOT NULL DEFAULT 0,
  completion_pct NUMERIC(5,2) NOT NULL DEFAULT 0, -- 0.00 to 100.00
  captions_enabled BOOLEAN DEFAULT false,
  last_position_seconds INT DEFAULT 0,            -- for resume logic
  completed BOOLEAN NOT NULL DEFAULT false,       -- true when >= 90%
  completed_at TIMESTAMP WITH TIME ZONE,
  session_id TEXT,                                -- browser session identifier
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.video_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_events_own" ON public.video_events
  FOR ALL USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_video_events_updated_at
  BEFORE UPDATE ON public.video_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Consent Invites (tokenized invite links)
CREATE TABLE public.consent_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,                      -- secure random token (UUID v4 or CSPRNG)
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  campaign_id UUID,                                -- nullable until campaign table added in Phase 5
  language TEXT NOT NULL DEFAULT 'en',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,    -- default: now() + 7 days
  used_at TIMESTAMP WITH TIME ZONE,                -- set on first use
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.consent_invites ENABLE ROW LEVEL SECURITY;

-- HR/Admin can manage invites
CREATE POLICY "consent_invites_admin" ON public.consent_invites
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

-- Employees can read their own invite (for token validation on landing page)
CREATE POLICY "consent_invites_employee_read" ON public.consent_invites
  FOR SELECT USING (
    employee_id = public.get_employee_id_for_user(auth.uid())
  );

-- Index for fast token lookup
CREATE INDEX idx_consent_invites_token ON public.consent_invites(token);
CREATE INDEX idx_consent_invites_employee ON public.consent_invites(employee_id);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_video_events_employee ON public.video_events(employee_id);
