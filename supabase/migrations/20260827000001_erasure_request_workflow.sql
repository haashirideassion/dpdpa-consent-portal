-- ============================================================
-- 20260827000001_erasure_request_workflow.sql
--
-- Implements the manager-requested "Data Removal / Erasure Request" flow
-- on top of the EXISTING data_requests (DSR) system — see the prior
-- investigation report. request_type = 'erasure' already existed; this
-- migration adds the missing pieces:
--
--   PHASE 1 — SECURITY FIRST
--   Closes the pre-existing self-delete gap: an authenticated employee
--   could call the Supabase REST API directly (bypassing the deployed
--   frontend) and DELETE their own `employees` row or any of their detail
--   rows, cascading away their entire record with no approval, no
--   retention check, and no audit event. The existing approval pattern
--   (prevent_employee_protected_field_bypass / prevent_employee_section_bypass,
--   20260825000006) already blocks non-privileged INSERT/UPDATE on the
--   flat detail tables and INSERT/UPDATE/DELETE on the multi-entry section
--   tables — it never covered DELETE on the flat tables, `employees`
--   itself, `employee_emergency_contacts`, or the consent evidence tables.
--   This migration extends the SAME function/pattern to close that gap,
--   without touching any existing RLS policy, SECURITY DEFINER function,
--   or the section-table trigger.
--
--   PHASE 2 — ERASURE ASSESSMENT + PROCESSING
--   Adds a small `erasure_assessments` side-table (one row per
--   (request, category)) so an admin/dpo can classify each ACTUAL data
--   category present in the schema as eligible for removal / retained /
--   anonymized, with a basis note — an explicit, manual decision (no
--   retention engine, no automatic date-based deletion, exactly as
--   instructed). Two SECURITY DEFINER RPCs — assess_erasure_request() and
--   process_erasure_request() — are the ONLY way any of this data is ever
--   modified; both are admin/dpo-gated, reject employees, validate the
--   request, use a hardcoded (not client-supplied) table/column mapping,
--   and are idempotent (a processed request cannot be processed twice).
--   The `employees` master row and all consent-evidence tables
--   (consent_purpose_records, consent_withdrawals, audit_logs) are never
--   deleted by this workflow — only non-essential PII on the evidence
--   tables (ip_address/user_agent/free-text reason) is ever redacted, and
--   only the flat/multi-entry detail tables are actually removed or
--   anonymized.
--
--   No new request table. Reuses data_requests, data_request_messages,
--   the existing DsrService/MyRequestsView/admin queue/status workflow,
--   the existing audit_logs table, and the existing notifications table
--   + create_notification()/CHECK-constraint allowlist pattern.
--
--   Does NOT touch: consent_withdrawals'/consent.service.ts's withdrawal
--   flow logic, correction_requests/approve_correction(), or any existing
--   RLS policy (only new BEFORE DELETE guarding is added — nothing is
--   dropped or weakened).
-- ============================================================

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 1 — close the employee self-delete gap
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1a. Extend the existing flat-table guard function with DELETE handling ──
-- Same function used since 20260825000006 for BEFORE INSERT/UPDATE on the
-- flat detail tables and `employees`. Adding a DELETE branch here — rather
-- than a new function — keeps the "one function, one classification" model
-- the comments in that migration already document.
CREATE OR REPLACE FUNCTION public.prevent_employee_protected_field_bypass()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_privileged BOOLEAN;
  v_protected  TEXT[];
  v_col        TEXT;
  v_old        JSONB;
  v_new        JSONB;
BEGIN
  v_privileged := public.get_my_employee_role() IN ('admin', 'hr_manager');

  -- ── DELETE: the employees master row is never deletable through the API
  -- (no legitimate app feature deletes it, and cascading it away would
  -- destroy every downstream compliance/audit relationship) — use the
  -- erasure workflow's anonymization RPC instead. Every other guarded
  -- table allows a privileged (admin/hr_manager) delete, same trust level
  -- already granted to their INSERT/UPDATE.
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'employees' THEN
      RAISE EXCEPTION
        'Deleting an employee record is not permitted. Use the data erasure request workflow (process_erasure_request) to remove or anonymize retained data instead.'
        USING ERRCODE = '42501';
    END IF;

    IF v_privileged THEN
      RETURN OLD;
    END IF;

    RAISE EXCEPTION
      'Deleting % rows requires admin/hr_manager authorization — submit a data erasure request instead',
      TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  IF v_privileged THEN
    RETURN NEW;
  END IF;

  v_protected := CASE TG_TABLE_NAME
    WHEN 'employees' THEN ARRAY['first_name', 'last_name']

    WHEN 'employee_personal_details' THEN ARRAY[
      'dob', 'gender', 'blood_group', 'marital_status', 'nationality',
      'father_name', 'mother_name'
    ]

    WHEN 'employee_contact_details' THEN ARRAY[
      'work_email', 'alternate_phone', 'city', 'state', 'pincode'
    ]

    WHEN 'employee_employment_details' THEN ARRAY[
      'department', 'designation', 'joining_date', 'employment_type',
      'manager', 'work_location', 'status'
    ]

    WHEN 'employee_financial_details' THEN ARRAY[
      'bank_name', 'bank_account_number', 'ifsc', 'pan', 'ctc',
      'bank_branch', 'upi_id', 'pf_account', 'esic_number'
    ]

    WHEN 'employee_govt_ids' THEN ARRAY[
      'aadhaar', 'uan', 'passport', 'passport_expiry',
      'driving_license', 'voter_id'
    ]

    WHEN 'employee_additional_details' THEN ARRAY[
      'qualifications', 'certifications', 'languages', 'notes'
    ]

    WHEN 'employee_health_info' THEN ARRAY[
      'disability_status', 'chronic_conditions', 'allergies'
    ]

    ELSE ARRAY[]::TEXT[]
  END;

  IF array_length(v_protected, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    FOREACH v_col IN ARRAY v_protected LOOP
      IF (v_new -> v_col) IS DISTINCT FROM (v_old -> v_col) THEN
        RAISE EXCEPTION
          'Changing % requires approval — submit a correction request for this field',
          v_col
          USING ERRCODE = '42501';
      END IF;
    END LOOP;

  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);

    FOREACH v_col IN ARRAY v_protected LOOP
      IF (v_new ->> v_col) IS NOT NULL AND (v_new ->> v_col) <> '' THEN
        RAISE EXCEPTION
          'Setting % requires approval — submit a correction request for this field',
          v_col
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_employee_protected_field_bypass() IS
  'Blocks a non-privileged (non admin/hr_manager) actor from directly '
  'writing an approval-required column on their own employee detail row, '
  'and (as of 20260827000001) from directly DELETing any guarded row at '
  'all — the employees master row is never deletable by anyone through '
  'this trigger, privileged or not. Approval-required changes must go '
  'through correction_requests + approve_correction(); data removal must '
  'go through data_requests (request_type = erasure) + '
  'assess_erasure_request()/process_erasure_request().';

-- Re-point `employees` at UPDATE OR DELETE (previously UPDATE only).
DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employees;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE UPDATE OR DELETE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

-- Re-point the seven flat detail tables at INSERT OR UPDATE OR DELETE
-- (previously INSERT OR UPDATE only).
DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_personal_details;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_personal_details
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_contact_details;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_contact_details
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_employment_details;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_employment_details
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_financial_details;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_financial_details
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_govt_ids;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_govt_ids
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_additional_details;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_additional_details
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_health_info;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_health_info
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

-- ── 1b. employee_emergency_contacts — DELETE-only guard ─────────────────────
-- This table is intentionally direct-edit for INSERT/UPDATE (its 4 columns
-- are not approval-required — see 20260825000006) — that is UNCHANGED. Only
-- DELETE is newly guarded, using the exact same function (its DELETE branch
-- is table-agnostic: privileged roles may delete, non-privileged may not).
DROP TRIGGER IF EXISTS trg_prevent_protected_field_delete ON public.employee_emergency_contacts;
CREATE TRIGGER trg_prevent_protected_field_delete
  BEFORE DELETE ON public.employee_emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

-- ── 1c. Consent evidence tables — DELETE-only guard ──────────────────────────
-- consent_records and consent_withdrawals both carry a "FOR ALL USING
-- (user_id = auth.uid() OR admin/dpo)" RLS policy, which — unlike the
-- detail tables — was never given ANY BEFORE trigger, so the owning
-- employee could delete their own consent status row or withdrawal
-- history row outright. consent_purpose_records already has no
-- UPDATE/DELETE RLS policy at all (immutable by design, 20260518000002)
-- and needs no change here.
DROP TRIGGER IF EXISTS trg_prevent_protected_field_delete ON public.consent_records;
CREATE TRIGGER trg_prevent_protected_field_delete
  BEFORE DELETE ON public.consent_records
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_delete ON public.consent_withdrawals;
CREATE TRIGGER trg_prevent_protected_field_delete
  BEFORE DELETE ON public.consent_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

-- Note: employee_education, employee_certifications_v2,
-- employee_employment_history, employee_nominees, employee_dependents
-- already reject every non-privileged INSERT/UPDATE/DELETE via
-- trg_prevent_section_bypass (20260825000006) — no change needed.

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 2 — erasure assessment + processing
-- ════════════════════════════════════════════════════════════════════════════

-- ── 2a. data_requests: idempotency tracking for erasure processing ──────────
ALTER TABLE public.data_requests
  ADD COLUMN IF NOT EXISTS erasure_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erasure_processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── 2b. erasure_assessments — one row per (request, data category) ─────────
-- Categories are the ACTUAL tables/field-groups present in the schema today
-- (see the investigation report's §6/§12) — nothing invented. This is a
-- manual admin decision, recorded once per category; there is no retention
-- engine and nothing here runs automatically off a date.
CREATE TABLE IF NOT EXISTS public.erasure_assessments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   UUID NOT NULL REFERENCES public.data_requests(id) ON DELETE CASCADE,
  category     TEXT NOT NULL CHECK (category IN (
                 'personal_details', 'contact_details', 'employment_details',
                 'financial_details', 'government_ids', 'health_information',
                 'additional_details', 'education', 'certifications',
                 'employment_history', 'nominees_dependents',
                 'emergency_contacts', 'consent_information'
               )),
  decision     TEXT NOT NULL DEFAULT 'retained' CHECK (decision IN (
                 'eligible', 'retained', 'anonymized'
               )),
  basis        TEXT, -- retention/legal basis explanation (e.g. copied from consent_purposes.retention_period)
  assessed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assessed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (request_id, category)
);

ALTER TABLE public.erasure_assessments ENABLE ROW LEVEL SECURITY;

-- Staff (admin/dpo — the same DSR-staff definition as is_staff()) only.
-- Employees never read or write this table directly; they only ever see
-- the high-level summary via the existing resolution_note / the
-- dsr.erasure_processed notification.
DROP POLICY IF EXISTS "erasure_assessments_staff_only" ON public.erasure_assessments;
CREATE POLICY "erasure_assessments_staff_only"
  ON public.erasure_assessments FOR ALL
  USING (public.is_staff());

-- ── 2c. assess_erasure_request() — record the admin's per-category decision ─
CREATE OR REPLACE FUNCTION public.assess_erasure_request(
  p_request_id  UUID,
  p_assessments JSONB -- [{"category": "...", "decision": "eligible|retained|anonymized", "basis": "..."}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req        RECORD;
  v_categories TEXT[] := ARRAY[
    'personal_details', 'contact_details', 'employment_details',
    'financial_details', 'government_ids', 'health_information',
    'additional_details', 'education', 'certifications',
    'employment_history', 'nominees_dependents',
    'emergency_contacts', 'consent_information'
  ];
  v_decisions  TEXT[] := ARRAY['eligible', 'retained', 'anonymized'];
  v_item       JSONB;
  v_category   TEXT;
  v_decision   TEXT;
  v_basis      TEXT;
  v_eligible   TEXT[] := ARRAY[]::TEXT[];
  v_retained   TEXT[] := ARRAY[]::TEXT[];
  v_anonymized TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- ── Auth: DSR-staff only (mirrors is_staff() = admin OR dpo). An
  -- employee calling this — even for their own request — is rejected;
  -- this is an admin-side review action, not a self-service action.
  IF NOT public.is_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_req FROM public.data_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.request_type <> 'erasure' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is not an erasure request');
  END IF;

  IF v_req.erasure_processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request has already been processed');
  END IF;

  IF v_req.status IN ('resolved', 'closed', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is already finalized');
  END IF;

  IF p_assessments IS NULL OR jsonb_typeof(p_assessments) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'assessments must be a JSON array');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_assessments) LOOP
    v_category := v_item ->> 'category';
    v_decision := v_item ->> 'decision';
    v_basis    := v_item ->> 'basis';

    IF v_category IS NULL OR NOT (v_category = ANY (v_categories)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid category: ' || COALESCE(v_category, 'null'));
    END IF;

    IF v_decision IS NULL OR NOT (v_decision = ANY (v_decisions)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid decision: ' || COALESCE(v_decision, 'null'));
    END IF;

    INSERT INTO public.erasure_assessments (request_id, category, decision, basis, assessed_by, assessed_at)
    VALUES (p_request_id, v_category, v_decision, v_basis, auth.uid(), now())
    ON CONFLICT (request_id, category) DO UPDATE SET
      decision    = EXCLUDED.decision,
      basis       = EXCLUDED.basis,
      assessed_by = EXCLUDED.assessed_by,
      assessed_at = now();

    IF v_decision = 'eligible' THEN
      v_eligible := array_append(v_eligible, v_category);
    ELSIF v_decision = 'retained' THEN
      v_retained := array_append(v_retained, v_category);
    ELSE
      v_anonymized := array_append(v_anonymized, v_category);
    END IF;
  END LOOP;

  -- Structured, non-PII metadata only — no free-text employee data.
  INSERT INTO public.audit_logs (
    actor_user_id, user_email, action, entity_type, entity_id, metadata, success, source
  ) VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'dsr.erasure_assessed',
    'DSR',
    p_request_id,
    jsonb_build_object(
      'eligible_categories', to_jsonb(v_eligible),
      'retained_categories', to_jsonb(v_retained),
      'anonymized_categories', to_jsonb(v_anonymized)
    ),
    true,
    'rpc'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.assess_erasure_request(UUID, JSONB) TO authenticated;

-- ── 2d. process_erasure_request() — the ONLY path that ever modifies data ──
-- Hardcoded (table, column) mapping per category — never built from client
-- input. Prefers anonymization/nulling over deleting rows; NEVER deletes
-- the employees master row or any consent-evidence row (consent evidence
-- is, at most, stripped of its free-text/device-metadata PII fields).
CREATE OR REPLACE FUNCTION public.process_erasure_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req          RECORD;
  v_a            RECORD;
  v_employee_id  UUID;
  v_recipient    UUID;
  v_removed      TEXT[] := ARRAY[]::TEXT[];
  v_anonymized   TEXT[] := ARRAY[]::TEXT[];
  v_retained     TEXT[] := ARRAY[]::TEXT[];
  v_redacted     CONSTANT TEXT := 'Redacted (DPDPA erasure)';
BEGIN
  IF NOT public.is_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_req FROM public.data_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.request_type <> 'erasure' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is not an erasure request');
  END IF;

  IF v_req.erasure_processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request has already been processed');
  END IF;

  IF v_req.status NOT IN ('in_review', 'action_required') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request must be in review (with a recorded assessment) before it can be processed');
  END IF;

  IF v_req.employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request has no linked employee record to process');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.erasure_assessments WHERE request_id = p_request_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No retention assessment has been recorded yet');
  END IF;

  v_employee_id := v_req.employee_id;

  FOR v_a IN SELECT * FROM public.erasure_assessments WHERE request_id = p_request_id LOOP
    CASE v_a.category

      WHEN 'personal_details' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_personal_details SET
            dob = NULL, gender = NULL, blood_group = NULL, marital_status = NULL,
            nationality = NULL, father_name = NULL, mother_name = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_personal_details SET
            dob = NULL, gender = v_redacted, blood_group = v_redacted, marital_status = v_redacted,
            nationality = v_redacted, father_name = v_redacted, mother_name = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'contact_details' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_contact_details SET
            work_email = NULL, personal_email = NULL, phone = NULL, alternate_phone = NULL,
            current_address = NULL, permanent_address = NULL, city = NULL, state = NULL,
            pincode = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_contact_details SET
            work_email = v_redacted, personal_email = v_redacted, phone = v_redacted,
            alternate_phone = v_redacted, current_address = v_redacted, permanent_address = v_redacted,
            city = v_redacted, state = v_redacted, pincode = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'employment_details' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_employment_details SET
            department = NULL, designation = NULL, joining_date = NULL, employment_type = NULL,
            manager = NULL, work_location = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_employment_details SET
            department = v_redacted, designation = v_redacted, joining_date = NULL,
            employment_type = v_redacted, manager = v_redacted, work_location = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'financial_details' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_financial_details SET
            bank_name = NULL, bank_account_number = NULL, ifsc = NULL, pan = NULL, ctc = NULL,
            bank_branch = NULL, upi_id = NULL, pf_account = NULL, esic_number = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_financial_details SET
            bank_name = v_redacted, bank_account_number = v_redacted, ifsc = v_redacted,
            pan = v_redacted, ctc = v_redacted, bank_branch = v_redacted, upi_id = v_redacted,
            pf_account = v_redacted, esic_number = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'government_ids' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_govt_ids SET
            aadhaar = NULL, uan = NULL, passport = NULL, passport_expiry = NULL,
            driving_license = NULL, voter_id = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_govt_ids SET
            aadhaar = v_redacted, uan = v_redacted, passport = v_redacted, passport_expiry = NULL,
            driving_license = v_redacted, voter_id = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'health_information' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_health_info SET
            disability_status = NULL, chronic_conditions = NULL, allergies = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_health_info SET
            disability_status = v_redacted, chronic_conditions = v_redacted, allergies = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'additional_details' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_additional_details SET
            qualifications = NULL, certifications = NULL, languages = NULL, notes = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_additional_details SET
            qualifications = v_redacted, certifications = v_redacted, languages = v_redacted,
            notes = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'emergency_contacts' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_emergency_contacts SET
            contact_name = NULL, relation = NULL, contact_phone = NULL, contact_email = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_emergency_contacts SET
            contact_name = v_redacted, relation = v_redacted, contact_phone = v_redacted,
            contact_email = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'education' THEN
        IF v_a.decision = 'eligible' THEN
          DELETE FROM public.employee_education WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_education SET
            specialisation = v_redacted, institution = v_redacted, university = v_redacted,
            roll_number = v_redacted, grade_value = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'certifications' THEN
        IF v_a.decision = 'eligible' THEN
          DELETE FROM public.employee_certifications_v2 WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_certifications_v2 SET
            name = v_redacted, issuing_body = v_redacted, certification_id = v_redacted,
            verification_url = NULL, issue_date = NULL, expiry_date = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'employment_history' THEN
        IF v_a.decision = 'eligible' THEN
          DELETE FROM public.employee_employment_history WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_employment_history SET
            employer_name = v_redacted, designation = v_redacted, reason_for_leaving = v_redacted,
            last_drawn_salary = NULL, start_date = NULL, end_date = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'nominees_dependents' THEN
        IF v_a.decision = 'eligible' THEN
          DELETE FROM public.employee_nominees WHERE employee_id = v_employee_id;
          DELETE FROM public.employee_dependents WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_nominees SET
            full_name = v_redacted, address = v_redacted, mobile = NULL, guardian_name = v_redacted,
            date_of_birth = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          UPDATE public.employee_dependents SET
            name = v_redacted, date_of_birth = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'consent_information' THEN
        -- HARD SAFETY RAIL: consent evidence (consent_purpose_records,
        -- consent_withdrawals) is compliance evidence and is NEVER deleted
        -- regardless of the admin's decision here — only non-essential
        -- device/network metadata and free-text withdrawal reasons (which
        -- can themselves contain PII) are stripped. status, purpose_key,
        -- consented, and every timestamp are left untouched.
        IF v_a.decision <> 'retained' THEN
          UPDATE public.consent_purpose_records SET ip_address = NULL, user_agent = NULL
          WHERE employee_id = v_employee_id;

          UPDATE public.consent_withdrawals SET reason = NULL
          WHERE employee_id = v_employee_id;

          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      ELSE
        NULL; -- unreachable: category is CHECK-constrained on the table
    END CASE;
  END LOOP;

  UPDATE public.data_requests SET
    erasure_processed_at = now(),
    erasure_processed_by = auth.uid()
  WHERE id = p_request_id;

  UPDATE public.erasure_assessments SET processed_at = now() WHERE request_id = p_request_id;

  -- Structured, non-PII metadata only — category names and method, never
  -- any of the actual field values that were changed.
  INSERT INTO public.audit_logs (
    actor_user_id, user_email, action, entity_type, entity_id, metadata, success, source
  ) VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'dsr.erasure_processed',
    'DSR',
    p_request_id,
    jsonb_build_object(
      'removed_categories', to_jsonb(v_removed),
      'anonymized_categories', to_jsonb(v_anonymized),
      'retained_categories', to_jsonb(v_retained),
      'method', 'server_side_rpc'
    ),
    true,
    'rpc'
  );

  -- Employee-facing notification — high-level summary only, no field
  -- values, no raw PII. Uses the same notifications table + category
  -- allowlist as every other DSR/correction notification.
  SELECT user_id INTO v_recipient FROM public.employees WHERE id = v_employee_id;
  IF v_recipient IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, actor_user_id, type, category, title, message, entity_type, entity_id, action_url
    ) VALUES (
      v_recipient,
      auth.uid(),
      'dsr.erasure_processed',
      'dsr.erasure_processed',
      'Your data removal request has been processed',
      'Information you were eligible to have removed has been removed or anonymized. ' ||
      CASE WHEN array_length(v_retained, 1) > 0
        THEN 'Some information has been retained due to legal, statutory, contractual, audit, or compliance requirements.'
        ELSE ''
      END,
      'dsr',
      p_request_id,
      '/'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'removed', to_jsonb(v_removed),
    'anonymized', to_jsonb(v_anonymized),
    'retained', to_jsonb(v_retained)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_erasure_request(UUID) TO authenticated;

-- ── 2e. Allow the new notification category ─────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check
  CHECK (
    category IS NULL OR category IN (
      'employee.created',
      'employee.updated',
      'correction.submitted',
      'correction.approved',
      'correction.rejected',
      'dsr.created',
      'dsr.status_updated',
      'dsr.erasure_processed',
      'education.completed',
      'video.completed',
      'onboarding.reset',
      'consent.withdrawn',
      'consent.granted'
    )
  );
