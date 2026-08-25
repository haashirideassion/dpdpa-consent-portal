-- ============================================================
-- 20260825000006_field_level_modification_approval.sql
-- MoM #2: "Any modification to employee personal information must
-- follow the appropriate approval process. Only approved changes
-- should be updated in the database."
--
-- GAP THIS CLOSES:
-- Every employee detail table (employee_personal_details,
-- employee_contact_details, employee_employment_details,
-- employee_financial_details, employee_govt_ids,
-- employee_additional_details, employee_health_info) and every
-- multi-entry section table (employee_education,
-- employee_certifications_v2, employee_employment_history,
-- employee_nominees, employee_dependents) grants the owning employee
-- FOR ALL (read/write/delete) RLS access to their own row(s) — see
-- 20260430000002_normalized_employees.sql and
-- 20260506000001_prd_new_sections.sql — with no column restriction
-- and no correction-workflow requirement at the database layer. The
-- entire "post-consent -> locked -> correction request only" model
-- is enforced ONLY in the React UI (DataSection/MultiEntrySection's
-- hasConsented/isAdmin props). Any authenticated employee can
-- currently call the Supabase REST API directly (bypassing the
-- deployed frontend) and write any value into any column of these
-- tables for their own employee_id — including DOB, bank details,
-- government IDs, and health data — without ever creating a
-- correction_requests row or triggering approval.
--
-- The employees master table already has a comparable BEFORE UPDATE
-- trigger protecting role/employee_code/user_id
-- (prevent_employee_privilege_escalation,
-- 20260821000001_prevent_employee_role_self_escalation.sql), but not
-- first_name/last_name. This migration follows that exact, already-
-- reviewed pattern (a BEFORE INSERT/UPDATE trigger, not RLS, because
-- RLS WITH CHECK on a table cannot diff NEW against OLD without
-- re-triggering the recursion get_my_employee_role() was introduced
-- to avoid) and extends it to first_name/last_name plus every
-- "approval-required" column across the detail and section tables.
--
-- FIELD CLASSIFICATION (mirrors, and is a strict subset of, the
-- existing correction_allowed_field() allowlist from
-- 20260821000004_harden_approve_correction_column_allowlist.sql —
-- this migration does not change that function or the RPCs):
--
--   DIRECT-EDIT (no trigger — normal self RLS write remains allowed):
--     employee_contact_details.personal_email / phone /
--       current_address / permanent_address
--     employee_emergency_contacts — all 4 columns (contact_name,
--       relation, contact_phone, contact_email)
--
--   APPROVAL-REQUIRED (trigger blocks self-write; only an authorized
--   reviewer role, or approve_correction() acting on their behalf,
--   may write):
--     employees.first_name / last_name
--     employee_personal_details — all columns
--     employee_contact_details.work_email / alternate_phone / city /
--       state / pincode
--     employee_employment_details, employee_financial_details,
--       employee_govt_ids, employee_additional_details,
--       employee_health_info — all columns
--     employee_education, employee_certifications_v2,
--       employee_employment_history, employee_nominees,
--       employee_dependents — entire tables (every INSERT/UPDATE/
--       DELETE)
--
-- BYPASS CONDITION: public.get_my_employee_role() IN
-- ('admin', 'hr_manager') — the existing "authorized reviewer"
-- definition already required by approve_correction()/
-- reject_correction() (20260821000010_harden_has_role_enumeration.sql).
-- No new role is introduced. This single condition is sufficient to
-- let approve_correction()'s own writes through: auth.uid() (and
-- therefore get_my_employee_role()) resolves from the calling JWT
-- even inside a SECURITY DEFINER function, and approve_correction()
-- already requires the caller to hold admin/hr_manager before it
-- ever reaches its write branches. No transaction-local bypass flag
-- is needed (unlike app.correction_workflow_rpc, which exists only
-- to permit the RPCs' own status-column write on correction_requests
-- and is unrelated to this trigger).
--
-- No existing RLS policy is dropped or weakened. No destructive
-- schema change. No historical migration is edited.
-- ============================================================

-- ── 1. Flat/detail-table trigger function ────────────────────────────────────
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
    -- Defense in depth: detail rows are always pre-created blank by the
    -- employee-creation RPC (see 20260821000014_fix_server_audit_actor_email.sql
    -- and its predecessors), so EmployeeService's upsert() calls always take
    -- the ON CONFLICT DO UPDATE path above in practice. This branch only
    -- guards the theoretical case of a missing row being self-inserted with
    -- a protected value already populated.
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
  'writing an approval-required column on their own employee detail row. '
  'Approval-required changes must go through correction_requests + '
  'approve_correction(). Mirrors correction_allowed_field()''s '
  '(table, column) classification; update both together.';

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employees;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_personal_details;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE ON public.employee_personal_details
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_contact_details;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE ON public.employee_contact_details
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_employment_details;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE ON public.employee_employment_details
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_financial_details;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE ON public.employee_financial_details
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_govt_ids;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE ON public.employee_govt_ids
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_additional_details;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE ON public.employee_additional_details
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

DROP TRIGGER IF EXISTS trg_prevent_protected_field_bypass ON public.employee_health_info;
CREATE TRIGGER trg_prevent_protected_field_bypass
  BEFORE INSERT OR UPDATE ON public.employee_health_info
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_protected_field_bypass();

-- employee_emergency_contacts is intentionally NOT given this trigger — all
-- 4 of its columns are direct-edit per the MoM's field policy.

-- ── 2. Multi-entry section-table trigger function ────────────────────────────
-- Education, certifications, employment history, nominees, and dependents
-- are entirely approval-required — every INSERT/UPDATE/DELETE by a
-- non-privileged actor must be rejected; the existing UI already routes
-- employees through CorrectionService.submitSectionRecordCorrection() /
-- submitSectionDeleteRequest() -> approve_correction(), this trigger turns
-- that UI convention into a real database-enforced boundary.
CREATE OR REPLACE FUNCTION public.prevent_employee_section_bypass()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_employee_role() IN ('admin', 'hr_manager') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION
    'Direct changes to % require approval — submit a correction request',
    TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION public.prevent_employee_section_bypass() IS
  'Blocks a non-privileged (non admin/hr_manager) actor from directly '
  'inserting/updating/deleting rows in a multi-entry employee section '
  'table. Employees may only reach these tables through '
  'correction_requests + approve_correction().';

DROP TRIGGER IF EXISTS trg_prevent_section_bypass ON public.employee_education;
CREATE TRIGGER trg_prevent_section_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_education
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_section_bypass();

DROP TRIGGER IF EXISTS trg_prevent_section_bypass ON public.employee_certifications_v2;
CREATE TRIGGER trg_prevent_section_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_certifications_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_section_bypass();

DROP TRIGGER IF EXISTS trg_prevent_section_bypass ON public.employee_employment_history;
CREATE TRIGGER trg_prevent_section_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_employment_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_section_bypass();

DROP TRIGGER IF EXISTS trg_prevent_section_bypass ON public.employee_nominees;
CREATE TRIGGER trg_prevent_section_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_nominees
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_section_bypass();

DROP TRIGGER IF EXISTS trg_prevent_section_bypass ON public.employee_dependents;
CREATE TRIGGER trg_prevent_section_bypass
  BEFORE INSERT OR UPDATE OR DELETE ON public.employee_dependents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_section_bypass();
