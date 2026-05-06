-- ============================================================
-- PRD v5.1 — New Employee Data Sections
-- Adds:
--   • Missing flat fields on existing detail tables
--   • Structured multi-entry tables for Education, Certifications,
--     Employment History, Insurance Nominees, Dependents, Health Info
-- ============================================================

-- ── 1. Missing flat fields on existing tables ────────────────────────────────

ALTER TABLE public.employee_personal_details
  ADD COLUMN IF NOT EXISTS father_name TEXT,
  ADD COLUMN IF NOT EXISTS mother_name TEXT;

ALTER TABLE public.employee_financial_details
  ADD COLUMN IF NOT EXISTS bank_branch   TEXT,
  ADD COLUMN IF NOT EXISTS upi_id        TEXT,
  ADD COLUMN IF NOT EXISTS pf_account    TEXT,
  ADD COLUMN IF NOT EXISTS esic_number   TEXT;

-- ── 2. Educational Qualifications (multi-entry) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.employee_education (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id       UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  qualification_type TEXT,                    -- 10th, 12th, Graduation, Post-Graduation, Doctorate, Diploma, Other
  specialisation    TEXT,
  institution       TEXT,
  university        TEXT,
  year_of_passing   TEXT,
  grade_type        TEXT,                     -- Percentage, CGPA, Pass-Class
  grade_value       TEXT,
  mode              TEXT,                     -- Regular, Distance, Online
  roll_number       TEXT,
  is_provisional    BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Certifications (multi-entry, structured) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.employee_certifications_v2 (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id       UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  issuing_body      TEXT,
  issue_date        DATE,
  expiry_date       DATE,
  certification_id  TEXT,
  verification_url  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. Previous Employment History (multi-entry) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.employee_employment_history (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id       UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employer_name     TEXT,
  designation       TEXT,
  start_date        DATE,
  end_date          DATE,
  reason_for_leaving TEXT,
  last_drawn_salary TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. Insurance Nominees (multi-entry) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.employee_nominees (
  id                    UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id           UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  full_name             TEXT,
  relationship          TEXT,
  date_of_birth         DATE,
  address               TEXT,
  mobile                TEXT,
  allocation_percentage INTEGER NOT NULL DEFAULT 0
    CONSTRAINT allocation_non_negative CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100),
  guardian_name         TEXT,
  guardian_relationship TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 6. Dependents (multi-entry) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.employee_dependents (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  name          TEXT,
  relationship  TEXT,
  date_of_birth DATE,
  gender        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 7. Health Information (single record per employee) ───────────────────────

CREATE TABLE IF NOT EXISTS public.employee_health_info (
  id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  disability_status   TEXT,            -- None, Physical, Visual, Hearing, Other
  chronic_conditions  TEXT,
  allergies           TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 8. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.employee_education            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_certifications_v2    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_employment_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_nominees             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_dependents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_health_info          ENABLE ROW LEVEL SECURITY;

-- Employee owns their own data
CREATE POLICY "emp_own_education" ON public.employee_education
  FOR ALL USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "emp_own_cert_v2" ON public.employee_certifications_v2
  FOR ALL USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "emp_own_emp_history" ON public.employee_employment_history
  FOR ALL USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "emp_own_nominees" ON public.employee_nominees
  FOR ALL USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "emp_own_dependents" ON public.employee_dependents
  FOR ALL USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

CREATE POLICY "emp_own_health" ON public.employee_health_info
  FOR ALL USING (employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid()));

-- Admin / HR manager can access all records
CREATE POLICY "admin_all_education" ON public.employee_education
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "admin_all_cert_v2" ON public.employee_certifications_v2
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "admin_all_emp_history" ON public.employee_employment_history
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "admin_all_nominees" ON public.employee_nominees
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "admin_all_dependents" ON public.employee_dependents
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "admin_all_health" ON public.employee_health_info
  FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'hr_manager'));
