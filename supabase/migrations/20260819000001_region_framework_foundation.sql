-- ============================================================
-- 20260819000001_region_framework_foundation.sql
-- Region / Regulatory Framework — Phase 1 (DB foundation) & Phase 2
-- (employee jurisdiction assignment) of the Region & Regulatory
-- Framework architecture.
--
-- Purely additive: five new tables + two new nullable FK columns on
-- existing tables (consent_templates, compliance_items). No renames, no
-- destructive changes, no changes to employee creation/auth/RLS on
-- existing tables, no changes to consent submission/withdrawal, the
-- correction workflow, or the DSR workflow.
--
-- Every existing employee, consent template, and compliance item keeps
-- behaving exactly as it does today. Existing DPDPA/India rows are
-- additionally *tagged* with the new DPDPA 2023 framework row as
-- metadata — nothing is removed, renamed, or rewritten, and no
-- historical consent/audit record is touched.
--
-- Decision: existing employees are NOT given an
-- employee_jurisdiction_details row and are NOT auto-linked to India.
-- The table is intentionally left unwired from the
-- `initialize_employee_details()` employee-creation trigger (out of
-- scope for this change) — "no row" must be treated by the application
-- identically to "India / DPDPA applies", so nothing about any existing
-- or newly-created employee's consent experience changes until HR
-- explicitly assigns a jurisdiction via a later-phase Admin UI.
-- ============================================================

-- ── 1. regions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regions_read" ON public.regions;
CREATE POLICY "regions_read" ON public.regions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "regions_write" ON public.regions;
CREATE POLICY "regions_write" ON public.regions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS regions_updated_at ON public.regions;
CREATE TRIGGER regions_updated_at
  BEFORE UPDATE ON public.regions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 2. countries ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.countries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id   UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  iso_code    TEXT NOT NULL UNIQUE,     -- ISO 3166-1 alpha-3, e.g. 'IND'
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "countries_read" ON public.countries;
CREATE POLICY "countries_read" ON public.countries
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "countries_write" ON public.countries;
CREATE POLICY "countries_write" ON public.countries
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS countries_updated_at ON public.countries;
CREATE TRIGGER countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_countries_region ON public.countries(region_id);


-- ── 3. regulatory_frameworks ──────────────────────────────────────────────
-- Deliberately NOT given a single country_id column: a framework such as
-- an EU-wide regulation can apply to many countries, and in principle a
-- country can have more than one applicable framework. The relationship
-- is modeled as many-to-many via regulatory_framework_countries below,
-- rather than forcing a single FK that would misrepresent that shape.
CREATE TABLE IF NOT EXISTS public.regulatory_frameworks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  code         TEXT NOT NULL UNIQUE,     -- e.g. 'DPDPA_2023'
  version      TEXT,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.regulatory_frameworks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regulatory_frameworks_read" ON public.regulatory_frameworks;
CREATE POLICY "regulatory_frameworks_read" ON public.regulatory_frameworks
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "regulatory_frameworks_write" ON public.regulatory_frameworks;
CREATE POLICY "regulatory_frameworks_write" ON public.regulatory_frameworks
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS regulatory_frameworks_updated_at ON public.regulatory_frameworks;
CREATE TRIGGER regulatory_frameworks_updated_at
  BEFORE UPDATE ON public.regulatory_frameworks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── 4. regulatory_framework_countries (many-to-many join) ────────────────
CREATE TABLE IF NOT EXISTS public.regulatory_framework_countries (
  framework_id  UUID NOT NULL REFERENCES public.regulatory_frameworks(id) ON DELETE CASCADE,
  country_id    UUID NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (framework_id, country_id)
);
ALTER TABLE public.regulatory_framework_countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rfc_read" ON public.regulatory_framework_countries;
CREATE POLICY "rfc_read" ON public.regulatory_framework_countries
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "rfc_write" ON public.regulatory_framework_countries;
CREATE POLICY "rfc_write" ON public.regulatory_framework_countries
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- ── 5. dpo_contacts ───────────────────────────────────────────────────────
-- Configuration foundation only in this phase. NOT wired into the
-- existing GrievanceOfficerBlock component yet — it keeps rendering its
-- current placeholder defaults ("[DPO Name — configured per Legal
-- Entity]", "dpo@company.com", "+91 XXX XXX XXXX", "Data Protection
-- Board of India") exactly as before, until a later phase reads from
-- this table.
CREATE TABLE IF NOT EXISTS public.dpo_contacts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regulatory_framework_id   UUID REFERENCES public.regulatory_frameworks(id) ON DELETE CASCADE,
  name                      TEXT,
  email                     TEXT,
  phone                     TEXT,
  escalation_authority_name TEXT,
  acknowledgement_sla_days  INTEGER,
  resolution_sla_days       INTEGER,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dpo_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dpo_contacts_read" ON public.dpo_contacts;
CREATE POLICY "dpo_contacts_read" ON public.dpo_contacts
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "dpo_contacts_write" ON public.dpo_contacts;
CREATE POLICY "dpo_contacts_write" ON public.dpo_contacts
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS dpo_contacts_updated_at ON public.dpo_contacts;
CREATE TRIGGER dpo_contacts_updated_at
  BEFORE UPDATE ON public.dpo_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- No seed row here: real DPO identity/escalation details are not yet
-- known/configured, and inserting placeholder data into a real
-- configuration table would be worse than leaving it empty.


-- ── 6. employee_jurisdiction_details (Phase 2) ────────────────────────────
-- A new, optional 1:1 detail table, following the same normalized-detail
-- pattern as employee_personal_details / employee_health_info / etc.
-- Distinct on purpose from nationality (employee_personal_details.
-- nationality), work location (employee_employment_details.
-- work_location), and city/state/pincode (employee_contact_details) —
-- none of those are overloaded to carry regulatory jurisdiction.
CREATE TABLE IF NOT EXISTS public.employee_jurisdiction_details (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id              UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  country_id               UUID REFERENCES public.countries(id) ON DELETE SET NULL,
  regulatory_framework_id  UUID REFERENCES public.regulatory_frameworks(id) ON DELETE SET NULL,
  assigned_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at              TIMESTAMPTZ,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_jurisdiction_details ENABLE ROW LEVEL SECURITY;

-- Employees may view their own jurisdiction assignment; admins/dpo see all
-- (mirrors is_authorized_employee used by every other detail table).
DROP POLICY IF EXISTS "employee_jurisdiction_read" ON public.employee_jurisdiction_details;
CREATE POLICY "employee_jurisdiction_read" ON public.employee_jurisdiction_details
  FOR SELECT USING (public.is_authorized_employee(employee_id));

-- Unlike the self-service detail tables, jurisdiction is an HR decision,
-- not something an employee edits themselves — so writes are restricted
-- to admin/hr_manager only.
DROP POLICY IF EXISTS "employee_jurisdiction_write" ON public.employee_jurisdiction_details;
CREATE POLICY "employee_jurisdiction_write" ON public.employee_jurisdiction_details
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager'));

DROP TRIGGER IF EXISTS employee_jurisdiction_details_updated_at ON public.employee_jurisdiction_details;
CREATE TRIGGER employee_jurisdiction_details_updated_at
  BEFORE UPDATE ON public.employee_jurisdiction_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_employee_jurisdiction_country ON public.employee_jurisdiction_details(country_id);

-- No rows are inserted here for existing employees (see decision note at
-- top of file) — every employee remains with "no jurisdiction row" until
-- HR explicitly assigns one, and the application must treat that
-- identically to "India / DPDPA applies".


-- ── 7. Additive framework tagging on existing consent/compliance tables ──
ALTER TABLE public.consent_templates
  ADD COLUMN IF NOT EXISTS regulatory_framework_id UUID REFERENCES public.regulatory_frameworks(id) ON DELETE SET NULL;

ALTER TABLE public.compliance_items
  ADD COLUMN IF NOT EXISTS regulatory_framework_id UUID REFERENCES public.regulatory_frameworks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_consent_templates_framework ON public.consent_templates(regulatory_framework_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_framework ON public.compliance_items(regulatory_framework_id);


-- ── 8. Seed: India / DPDPA 2023 only (the current, real configuration) ───
-- No GDPR/UK/EU rows are seeded in this phase — only India + DPDPA 2023,
-- per the approved scope.
INSERT INTO public.regions (name, code)
VALUES ('India', 'IN')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.countries (region_id, name, iso_code)
SELECT r.id, 'India', 'IND'
FROM public.regions r
WHERE r.code = 'IN'
ON CONFLICT (iso_code) DO NOTHING;

INSERT INTO public.regulatory_frameworks (name, code, version, description)
VALUES (
  'Digital Personal Data Protection Act, 2023',
  'DPDPA_2023',
  '2023',
  'India''s Digital Personal Data Protection Act, 2023 — the existing default framework for this portal.'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.regulatory_framework_countries (framework_id, country_id)
SELECT f.id, c.id
FROM public.regulatory_frameworks f, public.countries c
WHERE f.code = 'DPDPA_2023' AND c.iso_code = 'IND'
ON CONFLICT DO NOTHING;

-- Tag existing consent templates / compliance items with DPDPA 2023.
-- This is metadata tagging only: no row is rewritten, renamed, or
-- removed, and no historical consent/audit evidence is touched.
UPDATE public.consent_templates
SET regulatory_framework_id = (SELECT id FROM public.regulatory_frameworks WHERE code = 'DPDPA_2023')
WHERE regulatory_framework_id IS NULL;

UPDATE public.compliance_items
SET regulatory_framework_id = (SELECT id FROM public.regulatory_frameworks WHERE code = 'DPDPA_2023')
WHERE regulatory_framework_id IS NULL;

NOTIFY pgrst, 'reload schema';
