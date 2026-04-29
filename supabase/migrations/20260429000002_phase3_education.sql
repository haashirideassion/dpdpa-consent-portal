-- =========================================================================
-- PHASE 3: EDUCATION MODULE TABLES
-- =========================================================================

-- 1. Education Modules (Stores the content versions)
CREATE TABLE IF NOT EXISTS public.education_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  content_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.education_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "education_modules_admin" ON public.education_modules;
CREATE POLICY "education_modules_admin" ON public.education_modules FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager'));

DROP POLICY IF EXISTS "education_modules_read" ON public.education_modules;
CREATE POLICY "education_modules_read" ON public.education_modules FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = true);


-- 2. Education Completions (Tracks employee progress)
CREATE TABLE IF NOT EXISTS public.education_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  module_version TEXT NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, module_version)
);

ALTER TABLE public.education_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "education_completions_own" ON public.education_completions;
CREATE POLICY "education_completions_own" ON public.education_completions FOR ALL USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_education_completions_emp ON public.education_completions(employee_id);

-- 3. Insert the default active DPDPA v1.0 Education Module
INSERT INTO public.education_modules (version, is_active, content_json)
VALUES (
  'v1.0',
  true,
  '[
    {
      "id": "1",
      "title": "What is Personal Data?",
      "content": "Personal data is any information about an individual who is identifiable by or in relation to such data. Under the Digital Personal Data Protection Act (DPDPA) 2023, your personal data belongs to you.",
      "icon": "shield"
    },
    {
      "id": "2",
      "title": "Your Rights as a Data Principal",
      "content": "You have the right to access information about your personal data, the right to correction and erasure, the right of grievance redressal, and the right to nominate a person to exercise rights upon death or incapacity.",
      "icon": "user"
    },
    {
      "id": "3",
      "title": "How We Collect Your Data",
      "content": "We collect data directly from you during onboarding, throughout your employment via our HR systems, and occasionally from verified third-party background check providers.",
      "icon": "document"
    },
    {
      "id": "4",
      "title": "Why We Process It",
      "content": "Your data is processed strictly for employment purposes: payroll, benefits administration, performance evaluation, legal compliance, and physical/digital security.",
      "icon": "briefcase"
    },
    {
      "id": "5",
      "title": "Who We Share It With",
      "content": "We only share your data with authorized third parties necessary for your employment (e.g., banks for payroll, insurance providers for benefits, and government authorities for tax/compliance).",
      "icon": "network"
    },
    {
      "id": "6",
      "title": "How Long We Keep It",
      "content": "We retain your data for the duration of your employment and for a specified period thereafter as required by Indian labor and tax laws, after which it is securely erased.",
      "icon": "clock"
    },
    {
      "id": "7",
      "title": "How to Withdraw Consent",
      "content": "You may withdraw consent for optional data processing at any time via this portal. Note that withdrawing consent for mandatory processing may impact your employment benefits or status.",
      "icon": "close"
    }
  ]'::jsonb
) ON CONFLICT (version) DO NOTHING;
