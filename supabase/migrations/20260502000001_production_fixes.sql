-- ============================================================
-- PRODUCTION FIX MIGRATION — 2026-05-02
-- Addresses all 6 deploy-blockers + supporting hardening
-- from the production readiness audit.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- FIX 1: Drop duplicate FK constraint on consent_records
-- Caused PGRST201 "more than one relationship found" error.
-- The rename migration (20260430000002) left behind _fkey1.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.consent_records
  DROP CONSTRAINT IF EXISTS consent_records_employee_id_fkey1;


-- ──────────────────────────────────────────────────────────────
-- FIX 2: Lock down orphan tables with deny-all RLS
-- employees_old and consent_records_old contain real PII with
-- no RLS — any authenticated user can SELECT them.
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'employees_old' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.employees_old ENABLE ROW LEVEL SECURITY;
    -- Drop any existing policies first to avoid conflicts
    DROP POLICY IF EXISTS "deny_all" ON public.employees_old;
    CREATE POLICY "deny_all" ON public.employees_old FOR ALL USING (false);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'consent_records_old' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.consent_records_old ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "deny_all" ON public.consent_records_old;
    CREATE POLICY "deny_all" ON public.consent_records_old FOR ALL USING (false);
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- FIX 3: Fix handle_new_user() trigger for new schema
-- Old trigger referenced employees.work_email which no longer
-- exists in the new employees table (now has email column).
-- New signups would fail to auto-link to employee records.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_employee_id UUID;
BEGIN
  -- Create profile row for new auth user
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Link profile to employee using new schema's `email` column (not work_email)
  SELECT id INTO linked_employee_id
  FROM public.employees
  WHERE email = NEW.email
  LIMIT 1;

  IF linked_employee_id IS NOT NULL THEN
    -- Update profiles.employee_id so get_employee_id_for_user() still works
    UPDATE public.profiles
      SET employee_id = linked_employee_id
    WHERE user_id = NEW.id;

    -- Also set employees.user_id for direct lookup (new auth flow)
    UPDATE public.employees
      SET user_id = NEW.id
    WHERE id = linked_employee_id AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- FIX 4 (DB side): Extend consent_records with version + esign
-- Required for hasConsentedToVersion() to actually check version
-- and for submitConsent() to record template evidence.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.consent_records
  ADD COLUMN IF NOT EXISTS template_id   UUID REFERENCES public.consent_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_version TEXT,
  ADD COLUMN IF NOT EXISTS esign_name    TEXT,
  ADD COLUMN IF NOT EXISTS device        TEXT,
  ADD COLUMN IF NOT EXISTS location      TEXT,
  ADD COLUMN IF NOT EXISTS language      TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS ip_address    TEXT,
  ADD COLUMN IF NOT EXISTS user_agent    TEXT,
  ADD COLUMN IF NOT EXISTS video_version_id UUID REFERENCES public.video_versions(id),
  ADD COLUMN IF NOT EXISTS education_version_id TEXT,
  ADD COLUMN IF NOT EXISTS consent_statement_text TEXT;

-- ──────────────────────────────────────────────────────────────
-- FIX 4B (DB side): Extend consent_purposes with DPDPA detailed fields
-- Required for PRD US-EMP-007 (data categories, retention, third parties)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.consent_purposes
  ADD COLUMN IF NOT EXISTS data_categories TEXT,
  ADD COLUMN IF NOT EXISTS third_parties TEXT,
  ADD COLUMN IF NOT EXISTS retention_period TEXT;


-- ──────────────────────────────────────────────────────────────
-- FIX 5 (DB side): Create consent_purpose_records
-- Granular, immutable, append-only per-purpose consent evidence.
-- Required for DPDPA §7 compliance (specific informed consent).
-- No UPDATE or DELETE policies — immutable by design.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consent_purpose_records (
  id               UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_id      UUID NOT NULL REFERENCES public.consent_templates(id) ON DELETE RESTRICT,
  template_version TEXT NOT NULL,
  purpose_key      TEXT NOT NULL,
  consented        BOOLEAN NOT NULL,
  is_mandatory     BOOLEAN NOT NULL DEFAULT false,
  esign_name       TEXT,
  video_event_id   UUID REFERENCES public.video_events(id) ON DELETE SET NULL,
  ip_address       TEXT,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO updated_at — this is append-only evidence
);

ALTER TABLE public.consent_purpose_records ENABLE ROW LEVEL SECURITY;

-- Employee reads their own records; admin and DPO can read all
DROP POLICY IF EXISTS "purpose_records_select" ON public.consent_purpose_records;
CREATE POLICY "purpose_records_select" ON public.consent_purpose_records
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dpo')
  );

-- Employee can only INSERT for their own employee record
DROP POLICY IF EXISTS "purpose_records_insert" ON public.consent_purpose_records;
CREATE POLICY "purpose_records_insert" ON public.consent_purpose_records
  FOR INSERT WITH CHECK (
    employee_id = (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );
-- NO UPDATE or DELETE policies — immutable audit evidence


-- ──────────────────────────────────────────────────────────────
-- FIX 6: Drop conflicting RLS policy on consent_records
-- phase4_consent_engine.sql created "consent_records_own" using
-- user_id = auth.uid(). The normalized migration created "Consent
-- Access" using is_authorized_employee(). Two FOR ALL policies
-- combine with OR — leaking cross-employee data.
-- Keep only the stricter is_authorized_employee() one.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "consent_records_own" ON public.consent_records;


-- ──────────────────────────────────────────────────────────────
-- HARDENING 1: Add missing indexes for production query patterns
-- ──────────────────────────────────────────────────────────────
-- Auth lookup (used on every page load in use-auth.tsx)
CREATE INDEX IF NOT EXISTS idx_employees_user_id
  ON public.employees(user_id);

-- handle_new_user trigger and admin search
CREATE INDEX IF NOT EXISTS idx_employees_email
  ON public.employees(email);

-- Admin list ORDER BY employee_code
CREATE INDEX IF NOT EXISTS idx_employees_employee_code
  ON public.employees(employee_code);

-- Video gate check (employee_id + video_version_id composite)
CREATE INDEX IF NOT EXISTS idx_video_events_composite
  ON public.video_events(employee_id, video_version_id);

-- Education gate check (employee_id + module_version composite)
CREATE INDEX IF NOT EXISTS idx_edu_completions_composite
  ON public.education_completions(employee_id, module_version);

-- Consent purpose records lookups
CREATE INDEX IF NOT EXISTS idx_consent_purpose_records_emp
  ON public.consent_purpose_records(employee_id);

CREATE INDEX IF NOT EXISTS idx_consent_purpose_records_template
  ON public.consent_purpose_records(template_id, template_version);

-- consent_records version check (new column)
CREATE INDEX IF NOT EXISTS idx_consent_records_version
  ON public.consent_records(employee_id, template_version);


-- ──────────────────────────────────────────────────────────────
-- HARDENING 2: CHECK constraints on free-text status columns
-- Prevents rogue values like 'PENDING' (wrong case) or typos.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.correction_requests
  DROP CONSTRAINT IF EXISTS chk_correction_status;
ALTER TABLE public.correction_requests
  ADD CONSTRAINT chk_correction_status
  CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.employee_employment_details
  DROP CONSTRAINT IF EXISTS chk_emp_status;
ALTER TABLE public.employee_employment_details
  ADD CONSTRAINT chk_emp_status
  CHECK (status IN ('Active', 'Inactive', 'On Leave', 'Terminated'));


-- ──────────────────────────────────────────────────────────────
-- HARDENING 3: Add updated_at triggers on all 7 detail tables
-- (currently only set client-side, unreliable if other processes
-- modify the DB directly)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER update_employee_personal_details_updated_at
  BEFORE UPDATE ON public.employee_personal_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_employee_contact_details_updated_at
  BEFORE UPDATE ON public.employee_contact_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_employee_employment_details_updated_at
  BEFORE UPDATE ON public.employee_employment_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_employee_financial_details_updated_at
  BEFORE UPDATE ON public.employee_financial_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_employee_govt_ids_updated_at
  BEFORE UPDATE ON public.employee_govt_ids
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_employee_emergency_contacts_updated_at
  BEFORE UPDATE ON public.employee_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_employee_additional_details_updated_at
  BEFORE UPDATE ON public.employee_additional_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ──────────────────────────────────────────────────────────────
-- HARDENING 4: Fix correction_requests INSERT policy
-- FOR ALL USING only guards SELECT/UPDATE/DELETE.
-- Without an explicit WITH CHECK, employees can insert correction
-- requests for other employees.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Correction Access" ON public.correction_requests;

-- Read/Update/Delete: own records or admin
DROP POLICY IF EXISTS "correction_requests_access" ON public.correction_requests;
CREATE POLICY "correction_requests_access" ON public.correction_requests
  FOR ALL USING (public.is_authorized_employee(employee_id));

-- Insert: employee can only create for their OWN employee_id
DROP POLICY IF EXISTS "correction_requests_insert" ON public.correction_requests;
CREATE POLICY "correction_requests_insert" ON public.correction_requests
  FOR INSERT WITH CHECK (
    employee_id = (SELECT id FROM public.employees WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );
