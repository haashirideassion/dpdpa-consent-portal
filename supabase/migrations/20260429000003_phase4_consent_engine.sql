-- =========================================================================
-- PHASE 4: GRANULAR CONSENT ENGINE
-- =========================================================================

-- 1. Consent Templates (versioned)
CREATE TABLE IF NOT EXISTS public.consent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,        
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.consent_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consent_templates_admin" ON public.consent_templates;
CREATE POLICY "consent_templates_admin" ON public.consent_templates FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager'));
DROP POLICY IF EXISTS "consent_templates_read" ON public.consent_templates;
CREATE POLICY "consent_templates_read" ON public.consent_templates FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = true);


-- 2. Consent Purposes (per template)
CREATE TABLE IF NOT EXISTS public.consent_purposes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.consent_templates(id) ON DELETE CASCADE,
  purpose_key TEXT NOT NULL,           
  label TEXT NOT NULL,
  description TEXT NOT NULL,           
  is_mandatory BOOLEAN DEFAULT false,  
  legal_basis TEXT,                    
  display_order INT DEFAULT 0
);
ALTER TABLE public.consent_purposes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consent_purposes_admin" ON public.consent_purposes;
CREATE POLICY "consent_purposes_admin" ON public.consent_purposes FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager'));
DROP POLICY IF EXISTS "consent_purposes_read" ON public.consent_purposes;
CREATE POLICY "consent_purposes_read" ON public.consent_purposes FOR SELECT USING (auth.uid() IS NOT NULL);


-- 3. Granular Consent Records (replaces consent_logs for new flow)
CREATE TABLE IF NOT EXISTS public.consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.consent_templates(id) ON DELETE RESTRICT NOT NULL,
  template_version TEXT NOT NULL,
  purpose_key TEXT NOT NULL,
  consented BOOLEAN NOT NULL,          
  is_mandatory BOOLEAN DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  video_event_id UUID REFERENCES public.video_events(id) ON DELETE SET NULL,  
  esign_name TEXT,                     
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consent_records_own" ON public.consent_records;
CREATE POLICY "consent_records_own" ON public.consent_records FOR ALL USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dpo'));


-- 4. Consent Withdrawals
CREATE TABLE IF NOT EXISTS public.consent_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  purpose_key TEXT NOT NULL,
  reason TEXT,
  withdrawn_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.consent_withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consent_withdrawals_own" ON public.consent_withdrawals;
CREATE POLICY "consent_withdrawals_own" ON public.consent_withdrawals FOR ALL USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dpo'));


-- 5. Consent Certificates
CREATE TABLE IF NOT EXISTS public.consent_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  template_version TEXT NOT NULL,
  certificate_url TEXT,                
  generated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.consent_certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consent_certificates_own" ON public.consent_certificates;
CREATE POLICY "consent_certificates_own" ON public.consent_certificates FOR SELECT USING (
  employee_id = public.get_employee_id_for_user(auth.uid()) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dpo')
);


-- Indexes
CREATE INDEX IF NOT EXISTS idx_consent_records_emp ON public.consent_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_template ON public.consent_records(template_id);
CREATE INDEX IF NOT EXISTS idx_consent_withdrawals_emp ON public.consent_withdrawals(employee_id);


-- =========================================================================
-- SEED DATA: Insert default v1.0 Template and Purposes
-- =========================================================================

-- Insert Template
WITH new_template AS (
  INSERT INTO public.consent_templates (version, name, is_active)
  VALUES ('v1.0', 'DPDPA Standard Employee Consent', true)
  ON CONFLICT (version) DO UPDATE SET is_active = true
  RETURNING id
)
-- Insert Purposes linked to that Template
INSERT INTO public.consent_purposes (template_id, purpose_key, label, description, is_mandatory, legal_basis, display_order)
SELECT id, 'payroll', 'Payroll & Compensation', 'Processing your salary, tax deductions, PF, and other statutory financial obligations.', true, 'Required under Income Tax Act & EPF Act', 1 FROM new_template UNION ALL
SELECT id, 'benefits', 'Employee Benefits & Insurance', 'Sharing data with insurance providers and vendors to provide health, medical, and other employment benefits.', true, 'Required for employment contract fulfillment', 2 FROM new_template UNION ALL
SELECT id, 'background_check', 'Background Verification', 'Verifying education, past employment, and criminal records via authorized third-party agencies.', true, 'Legitimate business interest and security', 3 FROM new_template UNION ALL
SELECT id, 'training', 'Training & Development', 'Tracking certifications, skills, and providing access to internal and external learning platforms.', false, 'Consent required for non-essential training platforms', 4 FROM new_template UNION ALL
SELECT id, 'marketing', 'Internal Marketing & Newsletter', 'Using your name, photo, and email for internal newsletters, company announcements, and cultural event updates.', false, 'Explicit consent required', 5 FROM new_template UNION ALL
SELECT id, 'cross_border', 'Cross-Border Data Transfer', 'Transferring your data to servers located outside India (e.g. global HR systems) subject to DPDPA adequacy safeguards.', false, 'Explicit consent required for cross-border transfer', 6 FROM new_template;
