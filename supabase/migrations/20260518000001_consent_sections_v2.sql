-- =========================================================================
-- CONSENT SECTIONS + PURPOSE V2 ARCHITECTURE
-- Companion to: Consent Purposes by Section — In-App Content v1.0
-- Adds:
--   1. consent_sections table (12 data sections)
--   2. New columns on consent_purposes (section_id, purpose_type,
--      data_used, shared_with, cross_border, cross_border_details,
--      consequence_of_declining, consent_action_label)
--   3. Template v2.0 with all 39 purposes across 12 sections
-- =========================================================================

-- ── 1. Consent Sections master table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consent_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.consent_templates(id) ON DELETE CASCADE,
  section_number INT NOT NULL,
  section_name TEXT NOT NULL,
  section_header_text TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.consent_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consent_sections_admin" ON public.consent_sections;
CREATE POLICY "consent_sections_admin" ON public.consent_sections
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager'));
DROP POLICY IF EXISTS "consent_sections_read" ON public.consent_sections;
CREATE POLICY "consent_sections_read" ON public.consent_sections
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_consent_sections_template ON public.consent_sections(template_id);

-- ── 2. Extend consent_purposes with new spec columns ─────────────────────────
ALTER TABLE public.consent_purposes
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.consent_sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purpose_type TEXT CHECK (purpose_type IN ('mandatory', 'conditional', 'optional')) DEFAULT 'optional',
  ADD COLUMN IF NOT EXISTS data_used TEXT,
  ADD COLUMN IF NOT EXISTS shared_with TEXT,
  ADD COLUMN IF NOT EXISTS cross_border BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cross_border_details TEXT,
  ADD COLUMN IF NOT EXISTS consequence_of_declining TEXT,
  ADD COLUMN IF NOT EXISTS consent_action_label TEXT;

-- Back-fill purpose_type for existing v1.0 purposes
UPDATE public.consent_purposes
SET purpose_type = CASE WHEN is_mandatory THEN 'mandatory' ELSE 'optional' END
WHERE purpose_type IS NULL OR purpose_type = 'optional';

CREATE INDEX IF NOT EXISTS idx_consent_purposes_section ON public.consent_purposes(section_id);

-- ── 3. Template v2.0 with 39 purposes across 12 sections ─────────────────────
DO $$
DECLARE
  v_template_id UUID;
  -- section IDs
  s1  UUID; s2  UUID; s3  UUID; s4  UUID;
  s5  UUID; s6  UUID; s7  UUID; s8  UUID;
  s9  UUID; s10 UUID; s11 UUID; s12 UUID;
BEGIN
  -- Insert template (inactive by default — admin activates when ready)
  INSERT INTO public.consent_templates (version, name, is_active)
  VALUES ('v2.0', 'DPDPA Consent — Sections v2.0', false)
  ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_template_id;

  -- ── Sections ───────────────────────────────────────────────────────────────
  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 1,  'Personal Information',
   'Your basic identity information. We use this for everything from issuing your salary to staffing you on client projects.', 1)
  RETURNING id INTO s1;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 2,  'Contact Details',
   'Where and how we reach you — at work, at home, and during emergencies.', 2)
  RETURNING id INTO s2;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 3,  'Government IDs',
   'Required for tax, PF, ESIC, and identity verification. These are the most sensitive details on file, and access is tightly controlled.', 3)
  RETURNING id INTO s3;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 4,  'Banking Information',
   'Where your salary lands and how reimbursements work.', 4)
  RETURNING id INTO s4;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 5,  'Educational Qualifications',
   'Your academic credentials. Used to verify what you have told us and to match you to suitable projects.', 5)
  RETURNING id INTO s5;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 6,  'Certifications',
   'Your professional certifications — AWS, PMP, Scrum, and others. Used to staff you on the right projects and track your professional growth.', 6)
  RETURNING id INTO s6;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 7,  'Previous Employment',
   'Your work history before joining us — used for background verification and statutory record-keeping.', 7)
  RETURNING id INTO s7;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 8,  'Insurance Nominee Details',
   'The people who will receive your insurance benefits. Highly sensitive — please double-check before submitting.', 8)
  RETURNING id INTO s8;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 9,  'Emergency Contacts',
   'People we should call if something happens to you at work or while travelling for work.', 9)
  RETURNING id INTO s9;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 10, 'Dependents',
   'Your spouse, children, or parents — the people you would like to cover under benefits or include in company events.', 10)
  RETURNING id INTO s10;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 11, 'Passport and Visa',
   'Required only if you travel internationally for work or are being considered for onsite deployment.', 11)
  RETURNING id INTO s11;

  INSERT INTO public.consent_sections (template_id, section_number, section_name, section_header_text, display_order) VALUES
  (v_template_id, 12, 'Health Information',
   'Optional information that helps us support you better at work. You decide what to share, and you can decline this entire section if you prefer.', 12)
  RETURNING id INTO s12;

  -- ── Section 1: Personal Information (5 purposes) ──────────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 1.1 Mandatory
  (v_template_id, s1, '1.1', 'Salary processing and statutory compliance',
   'We need your name, date of birth, and other basic details to process your salary and meet our legal obligations to the Income Tax Department, Provident Fund Organisation, and ESIC.',
   true, 'mandatory', 'DPDPA Section 7 — legitimate use', 1,
   'Full Name, Date of Birth, Gender, Father''s/Mother''s Name, Nationality',
   'Internal payroll system; submitted to Income Tax, EPFO, ESIC',
   '7 years post your last working day (statutory)',
   false, null, null, null),

  -- 1.2 Conditional
  (v_template_id, s1, '1.2', 'Background verification for client engagements',
   'Many of our clients, especially in banking, healthcare, and government, require us to verify your identity before assigning you to their projects. We share your basic details with a background verification agency for this check.',
   false, 'conditional', 'DPDPA Section 6 — consent', 2,
   'Full Name, Date of Birth, Father''s Name, Nationality',
   'First Advantage (BGV vendor) — DPA signed',
   'Duration of employment + 3 years',
   false, null,
   'You may not be eligible for projects with clients that mandate background verification, which includes most BFSI, healthcare, and government engagements.',
   'I consent to my personal information being used for background verification'),

  -- 1.3 Conditional
  (v_template_id, s1, '1.3', 'Health insurance enrolment',
   'If you want to enrol in our group health insurance, we share your basic details with the insurance provider to issue your policy.',
   false, 'conditional', 'DPDPA Section 6 — consent', 3,
   'Full Name, Date of Birth, Gender, Marital Status',
   'Star Health Insurance — DPA signed',
   'Duration of employment + 1 year',
   false, null,
   'You will not be enrolled in the company health insurance plan. You can opt in later by withdrawing this decline.',
   'I consent to my personal information being used for health insurance enrolment'),

  -- 1.4 Optional
  (v_template_id, s1, '1.4', 'Alumni network and post-exit communications',
   'After you leave the company, we would like to stay in touch — for alumni meet-ups, re-hire opportunities, and references. This is entirely your choice.',
   false, 'optional', 'DPDPA Section 6 — consent', 4,
   'Full Name, Date of Birth, Gender',
   'Internal alumni platform; not shared externally',
   '5 years post your last working day (or until you opt out)',
   false, null, null,
   'I consent to staying in touch as an alumni'),

  -- 1.5 Optional
  (v_template_id, s1, '1.5', 'Internal communications and surveys',
   'Used for the company newsletter, anonymous surveys, and special events like work anniversaries.',
   false, 'optional', 'DPDPA Section 6 — consent', 5,
   'Full Name, Date of Birth',
   'Internal teams only',
   'Duration of employment',
   false, null, null,
   'I consent to my information being used for internal communications');

  -- ── Section 2: Contact Details (3 purposes) ────────────────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 2.1 Mandatory
  (v_template_id, s2, '2.1', 'Official correspondence and statutory notifications',
   'To send you payslips, Form 16, offer letters, and other official documents required by law.',
   true, 'mandatory', 'DPDPA Section 7 — legitimate use', 6,
   'Current Address, Personal Email, Personal Mobile',
   'Internal HRMS, payroll vendor',
   '7 years post your last working day',
   false, null, null, null),

  -- 2.2 Optional
  (v_template_id, s2, '2.2', 'Emergency outreach',
   'So we can reach you if there is an urgent matter outside work hours (system outage on a critical client project, office closure, safety advisory).',
   false, 'optional', 'DPDPA Section 6 — consent', 7,
   'Personal Mobile, Alternate Phone',
   'Internal HR and reporting manager only',
   'Duration of employment',
   false, null, null,
   'I consent to being contacted in emergencies'),

  -- 2.3 Optional (cross-border)
  (v_template_id, s2, '2.3', 'Engagement surveys and feedback',
   'For periodic employee engagement surveys, pulse checks, and exit interviews — all anonymous unless you choose to identify yourself.',
   false, 'optional', 'DPDPA Section 6 — consent', 8,
   'Personal Email',
   'Culture Amp (survey platform) — DPA signed',
   'Duration of employment',
   true, 'Yes — data stored in Singapore. Standard Contractual Clauses in place.', null,
   'I consent to receiving engagement surveys');

  -- ── Section 3: Government IDs (4 purposes) ─────────────────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 3.1 Mandatory
  (v_template_id, s3, '3.1', 'Income tax compliance (PAN)',
   'PAN is required by law for salary processing and TDS reporting to the Income Tax Department.',
   true, 'mandatory', 'DPDPA Section 7 — legitimate use', 9,
   'PAN Number, PAN Card scan',
   'Income Tax Department via payroll system',
   '7 years post your last working day (statutory)',
   false, null, null, null),

  -- 3.2 Mandatory
  (v_template_id, s3, '3.2', 'Provident Fund and ESIC (Aadhaar)',
   'Aadhaar (masked) is required for EPFO UAN linkage and ESIC registration.',
   true, 'mandatory', 'DPDPA Section 7 — legitimate use', 10,
   'Aadhaar Number (masked — last 4 digits only), Aadhaar Card scan (masked)',
   'EPFO, ESIC via payroll system',
   '7 years post your last working day (statutory)',
   false, null, null, null),

  -- 3.3 Conditional
  (v_template_id, s3, '3.3', 'Background verification (all IDs)',
   'Used by our BGV vendor to verify that the IDs you have declared genuinely belong to you.',
   false, 'conditional', 'DPDPA Section 6 — consent', 11,
   'PAN, masked Aadhaar, Driving Licence, Voter ID (only those you have declared)',
   'First Advantage (BGV vendor) — DPA signed',
   'Duration of employment + 3 years',
   false, null,
   'You may not be eligible for projects requiring background verification.',
   'I consent to my Government IDs being used for background verification'),

  -- 3.4 Conditional (cross-border)
  (v_template_id, s3, '3.4', 'International travel and visa (Passport)',
   'If you have a passport on file and travel for client work, your passport details are used for visa processing.',
   false, 'conditional', 'DPDPA Section 6 — consent', 12,
   'Passport Number, Issue/Expiry dates, Passport scan',
   'Visa processing agency (e.g., VFS Global) — DPA signed; receiving country authorities',
   'Duration of employment + 1 year',
   true, 'Yes — destination country (varies by trip)',
   'You won''t be eligible for international assignments or onsite client deployments.',
   'I consent to my passport details being used for visa and international travel');

  -- ── Section 4: Banking Information (4 purposes) ────────────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 4.1 Mandatory
  (v_template_id, s4, '4.1', 'Monthly salary credit',
   'To credit your salary into your bank account every month.',
   true, 'mandatory', 'DPDPA Section 7 — legitimate use', 13,
   'Account Number, IFSC, Bank Name, Account Holder Name',
   'Our banking partner for salary disbursement; cancelled cheque scan held internally',
   '7 years post your last working day (statutory)',
   false, null, null, null),

  -- 4.2 Mandatory
  (v_template_id, s4, '4.2', 'PF and ESIC contributions',
   'For monthly PF deposits and ESIC contributions linked to your bank account.',
   true, 'mandatory', 'DPDPA Section 7 — legitimate use', 14,
   'UAN, PF Account Number, ESIC Number',
   'EPFO and ESIC',
   '7 years post your last working day (statutory)',
   false, null, null, null),

  -- 4.3 Optional
  (v_template_id, s4, '4.3', 'Reimbursements and travel expenses',
   'To process reimbursement claims for travel, meals, equipment, and other approved expenses.',
   false, 'optional', 'DPDPA Section 6 — consent', 15,
   'Account Number, IFSC, UPI ID',
   'Internal finance system',
   'Duration of employment + 7 years (statutory for finance records)',
   false, null, null,
   'I consent to my banking information being used for reimbursements'),

  -- 4.4 Optional
  (v_template_id, s4, '4.4', 'Corporate credit card',
   'If you want a corporate credit card for travel and business expenses, we share your details with the issuing bank.',
   false, 'optional', 'DPDPA Section 6 — consent', 16,
   'Full Name, Account Number (for repayment auto-debit), PAN',
   'HDFC Bank — DPA signed',
   'Duration of card validity + 3 years',
   false, null, null,
   'I consent to my banking information being shared for corporate card issuance');

  -- ── Section 5: Educational Qualifications (3 purposes) ────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 5.1 Conditional
  (v_template_id, s5, '5.1', 'Background verification of educational credentials',
   'Our BGV vendor verifies the degrees and certificates you have listed with the issuing institutions.',
   false, 'conditional', 'DPDPA Section 6 — consent', 17,
   'All declared qualifications, degree certificates, mark sheets',
   'First Advantage (BGV vendor) — DPA signed; receiving educational institutions',
   'Duration of employment + 3 years',
   false, null,
   'You won''t be eligible for projects requiring verified credentials, which includes most regulated-industry clients.',
   'I consent to my educational qualifications being verified'),

  -- 5.2 Conditional (cross-border)
  (v_template_id, s5, '5.2', 'Client project staffing in regulated industries',
   'Some clients (BFSI, healthcare, government) require us to share verified academic credentials of staff on their projects.',
   false, 'conditional', 'DPDPA Section 6 — consent', 18,
   'Highest qualification details, year of passing, specialisation',
   'Specific clients as part of resource onboarding (case-by-case basis with separate disclosure)',
   'Duration of project + 1 year',
   true, 'Depends on client location — disclosed per project',
   'You will not be staffed on regulated-industry client engagements.',
   'I consent to my educational qualifications being shared with regulated-industry clients'),

  -- 5.3 Optional
  (v_template_id, s5, '5.3', 'Internal L&D recommendations and skills marketplace',
   'To suggest relevant courses, certifications, and internal opportunities based on your background.',
   false, 'optional', 'DPDPA Section 6 — consent', 19,
   'Highest qualification, specialisation, institution type',
   'Internal Learning Platform (e.g., Degreed)',
   'Duration of employment',
   false, null, null,
   'I consent to my educational details being used for L&D recommendations');

  -- ── Section 6: Certifications (3 purposes) ─────────────────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 6.1 Conditional (cross-border)
  (v_template_id, s6, '6.1', 'Client project staffing',
   'Most client projects require specific certifications (AWS Solutions Architect for cloud work, ISC2 CISSP for security roles). We share your certifications with clients as part of staffing.',
   false, 'conditional', 'DPDPA Section 6 — consent', 20,
   'Certification Name, Issuing Body, Issue/Expiry Date, Certification ID',
   'Specific clients as part of resource onboarding',
   'Duration of project + 1 year',
   true, 'Depends on client location',
   'You won''t be staffed on projects that require certifications, which is a significant share of available work.',
   'I consent to my certifications being shared with clients'),

  -- 6.2 Optional
  (v_template_id, s6, '6.2', 'Internal skills inventory and L&D tracking',
   'To maintain a company-wide view of skills, plan training programmes, and recommend renewals before certifications expire.',
   false, 'optional', 'DPDPA Section 6 — consent', 21,
   'All certifications, expiry dates',
   'Internal L&D platform',
   'Duration of employment',
   false, null, null,
   'I consent to my certifications being tracked for L&D purposes'),

  -- 6.3 Optional
  (v_template_id, s6, '6.3', 'Internal mobility and bench-management',
   'To proactively suggest you for internal openings or upskilling when you are between projects.',
   false, 'optional', 'DPDPA Section 6 — consent', 22,
   'Active certifications, skill tags',
   'Internal mobility team',
   'Duration of employment',
   false, null, null,
   'I consent to my certifications being used for internal mobility');

  -- ── Section 7: Previous Employment (2 purposes) ────────────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 7.1 Conditional
  (v_template_id, s7, '7.1', 'Background verification of employment history',
   'Our BGV vendor contacts your previous employers to confirm your role, tenure, and reason for leaving.',
   false, 'conditional', 'DPDPA Section 6 — consent', 23,
   'Employer name, designation, start/end dates, relieving letter, experience letter',
   'First Advantage (BGV vendor) — DPA signed; previous employers as part of verification',
   'Duration of employment + 3 years',
   false, null,
   'You may be ineligible for many client engagements.',
   'I consent to my previous employment being verified'),

  -- 7.2 Optional
  (v_template_id, s7, '7.2', 'Internal referral programme analytics',
   'To understand referral patterns and improve our hiring (anonymised aggregate analysis only).',
   false, 'optional', 'DPDPA Section 6 — consent', 24,
   'Previous employer names (aggregated, not linked to you)',
   'Internal recruitment analytics team',
   'Duration of employment',
   false, null, null,
   'I consent to my previous employment data being used for aggregate referral analytics');

  -- ── Section 8: Insurance Nominee Details (2 purposes) ─────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 8.1 Conditional
  (v_template_id, s8, '8.1', 'Health insurance enrolment and family coverage',
   'Your nominee details are shared with the insurance provider for policy issuance and claim processing.',
   false, 'conditional', 'DPDPA Section 6 — consent', 25,
   'Nominee Name, Relationship, DOB, Address, Mobile, Allocation %',
   'Star Health Insurance — DPA signed',
   'Duration of policy + 7 years (regulatory)',
   false, null,
   'Your health insurance policy cannot be issued with family coverage. You can still have employee-only coverage.',
   'I consent to my nominee details being shared with the insurance provider'),

  -- 8.2 Conditional
  (v_template_id, s8, '8.2', 'Group life insurance',
   'For our group life insurance scheme, where benefits are paid to your nominees in case of an unforeseen event.',
   false, 'conditional', 'DPDPA Section 6 — consent', 26,
   'Nominee Name, Relationship, Allocation %',
   'LIC of India / HDFC Life — DPA signed',
   'Duration of policy + 7 years (regulatory)',
   false, null,
   'Group life insurance benefits cannot be issued to your nominees.',
   'I consent to my nominee details being used for group life insurance');

  -- ── Section 9: Emergency Contacts (2 purposes) ─────────────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 9.1 Mandatory
  (v_template_id, s9, '9.1', 'Emergency response',
   'If you are in an accident, fall ill at work, or are unreachable during a critical situation, we contact the person you have designated.',
   true, 'mandatory', 'DPDPA Section 7 — legitimate use', 27,
   'Emergency Contact Name, Relationship, Mobile, Alternate Mobile',
   'HR and reporting manager only; hospital or emergency services if needed',
   'Duration of employment',
   false, null, null, null),

  -- 9.2 Optional
  (v_template_id, s9, '9.2', 'HR welfare outreach',
   'In case of bereavement, marriage, childbirth, or other major life events you have shared with HR, we may reach out to your emergency contact to offer support or attend on the company''s behalf.',
   false, 'optional', 'DPDPA Section 6 — consent', 28,
   'Emergency Contact Name, Mobile',
   'Internal HR team',
   'Duration of employment',
   false, null, null,
   'I consent to HR welfare outreach to my emergency contacts');

  -- ── Section 10: Dependents (2 purposes) ────────────────────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 10.1 Conditional
  (v_template_id, s10, '10.1', 'Health insurance family coverage',
   'To add your spouse, children, and dependent parents to the company group health insurance.',
   false, 'conditional', 'DPDPA Section 6 — consent', 29,
   'Dependent Name, Relationship, DOB, Gender',
   'Star Health Insurance — DPA signed',
   'Duration of policy + 7 years (regulatory)',
   false, null,
   'Your dependents will not be covered under the company health insurance.',
   'I consent to my dependents'' details being shared with the insurance provider'),

  -- 10.2 Optional
  (v_template_id, s10, '10.2', 'Family events and benefits',
   'For invitations to family events, children''s day, daycare/creche services, and school-age children''s programmes.',
   false, 'optional', 'DPDPA Section 6 — consent', 30,
   'Dependent Name, DOB (children), Relationship',
   'Internal HR; creche provider if you opt in to that service',
   'Duration of employment',
   false, null, null,
   'I consent to my dependents'' details being used for family events');

  -- ── Section 11: Passport and Visa (2 purposes) ─────────────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 11.1 Conditional (cross-border)
  (v_template_id, s11, '11.1', 'International deployment for client work',
   'If you are deployed onsite to a client outside India, your passport and visa details are used for immigration, client onboarding, and statutory reporting in that country.',
   false, 'conditional', 'DPDPA Section 6 — consent', 31,
   'Passport Number, Visa Number, Visa Type, Expiry Dates, Passport and Visa scans',
   'Destination country immigration; client; visa processing agency',
   'Duration of deployment + 1 year',
   true, 'Yes — destination country (varies). Standard Contractual Clauses or equivalent in place per destination.',
   'You will not be eligible for international onsite assignments.',
   'I consent to my passport and visa details being used for international deployment'),

  -- 11.2 Conditional (cross-border)
  (v_template_id, s11, '11.2', 'Cross-border data transfer to client locations',
   'When you work on a client project from outside India, your basic employment data (not your salary) is transferred to the client''s HR system in that country.',
   false, 'conditional', 'DPDPA Section 6 — consent', 32,
   'Name, Designation, Email, Passport Number, Visa Type',
   'Client''s HR system in destination country',
   'Duration of project',
   true, 'Yes — depends on client. Examples: USA, UK, Singapore, Germany, Australia.',
   'Onsite eligibility is restricted.',
   'I consent to my data being transferred to client locations outside India');

  -- ── Section 12: Health Information (3 purposes) ────────────────────────────
  INSERT INTO public.consent_purposes
    (template_id, section_id, purpose_key, label, description,
     is_mandatory, purpose_type, legal_basis, display_order,
     data_used, shared_with, retention_period,
     cross_border, cross_border_details,
     consequence_of_declining, consent_action_label)
  VALUES
  -- 12.1 Optional
  (v_template_id, s12, '12.1', 'Workplace accommodation',
   'If you have a disability or chronic condition that affects your work, sharing this helps us provide accommodations (ergonomic equipment, accessible seating, flexible hours).',
   false, 'optional', 'DPDPA Section 6 — consent', 33,
   'Disability Status, accommodation request notes, medical certificate (if claiming statutory disability accommodation)',
   'Internal HR, reporting manager (on a need-to-know basis), facilities team',
   'Duration of employment',
   false, null, null,
   'I consent to sharing health information for workplace accommodation'),

  -- 12.2 Optional
  (v_template_id, s12, '12.2', 'Wellness programme',
   'For voluntary wellness initiatives — yoga programmes, mental health support, ergonomics workshops, and health checkups.',
   false, 'optional', 'DPDPA Section 6 — consent', 34,
   'Chronic conditions (voluntary), allergies, fitness preferences',
   'YourDost / 1to1help (wellness platform) — DPA signed',
   'Duration of employment + 1 year',
   false, null, null,
   'I consent to sharing health information for wellness programmes'),

  -- 12.3 Optional (cross-border)
  (v_template_id, s12, '12.3', 'Business travel medical kit',
   'If you travel for work, knowing about allergies and chronic conditions helps us prepare the right medical kit or alert local first-aid.',
   false, 'optional', 'DPDPA Section 6 — consent', 35,
   'Allergies, chronic conditions, current medications',
   'Travel desk; emergency medical responders during travel only',
   'Duration of employment + 6 months',
   true, 'Yes — during international travel only, to local emergency services if needed', null,
   'I consent to sharing health information for business travel safety');

END $$;
