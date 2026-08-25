-- ============================================================
-- 20260821000013_audit_log_transactional_integrity.sql
-- Phase 4: audit log integrity + transactional auditing.
--
-- PROBLEM (Phase 3 P0 finding): audit_logs_insert only validates
-- actor_user_id = auth.uid(). Every other column — actor_role, success,
-- source, correlation_id, failure_reason, action, metadata — is fully
-- client-controlled. An authenticated employee could therefore INSERT a
-- row claiming actor_role='admin', or fabricate a successful
-- bootstrap_admin / employee.created / correction.approved /
-- correction.rejected / jurisdiction.assigned event that never happened.
--
-- FIX, in two parts:
--
--   1. A BEFORE INSERT trigger on audit_logs (enforce_audit_log_integrity):
--      a. actor_role is ALWAYS overwritten server-side from the caller's
--         own employees.role row — the client-supplied value is never
--         trusted, for every insert regardless of action.
--      b. A small, named set of PRIVILEGED actions (bootstrap_admin,
--         employee.created, correction.approved, correction.rejected,
--         jurisdiction.assigned) may only be recorded as a CLAIMED SUCCESS
--         (success = true, the column default) by code that has just set
--         the transaction-local flag app.audit_privileged_write = 'on'
--         immediately before its own INSERT. A client can still log
--         success:false for these actions (e.g. "my create-employee call
--         failed") — that does not fabricate legitimacy for a privileged
--         operation that never happened, so it is intentionally left
--         unrestricted (preserves the existing Phase 2/3 failure-path
--         audit calls in AddEmployeeModal, BulkImportEmployeesModal,
--         correction.service.ts unchanged).
--      Ordinary, legitimately client-triggered events (USER_LOGIN, logout,
--      consent.*, video.completed, education.completed, employee.updated,
--      csv.exported, video.created/published/deactivated,
--      correction.submitted, dsr.*, compliance.updated, breach.updated)
--      are NOT in the privileged list and continue to work exactly as
--      before — this migration does not touch them.
--
--   2. Three trusted, transactional audit-writers for the privileged
--      success case, each setting the bypass flag immediately before its
--      own audit_logs INSERT so it satisfies (1b):
--        - create_employee_with_details() — re-created (CREATE OR REPLACE)
--          with two new trailing, defaulted parameters (p_source,
--          p_correlation_id) and one new INSERT INTO audit_logs at the end,
--          in the SAME transaction as the employee creation. No other
--          business logic changed — verified line-for-line against the
--          version in 20260625000003_fix_employee_rpc_overload.sql (the
--          historical file itself is untouched).
--        - bootstrap_admin() — re-created (CREATE OR REPLACE), identical
--          business logic to 20260821000006_harden_bootstrap_admin.sql
--          (that file is untouched), with one new line
--          (`PERFORM set_config('app.audit_privileged_write', 'on', true)`)
--          immediately before each of its two existing audit_logs inserts.
--        - Two NEW AFTER-triggers (not modifications to
--          approve_correction()/reject_correction()/JurisdictionService's
--          upsert at all):
--            - audit_correction_review(), AFTER UPDATE ON correction_requests,
--              firing only when status transitions to approved/rejected.
--              By the time this fires, trg_prevent_correction_workflow_tampering
--              (20260821000007) has already guaranteed the status change came
--              from approve_correction()/reject_correction() itself — a direct
--              client UPDATE attempting the same transition is already
--              blocked by that existing trigger, so no additional flag check
--              is needed here.
--            - audit_jurisdiction_assignment(), AFTER INSERT OR UPDATE ON
--              employee_jurisdiction_details, which is already write-
--              restricted to admin/hr_manager by its existing RLS policy
--              (employee_jurisdiction_write, from 20260819000001) — any row
--              that reaches this trigger was already a legitimate
--              admin/hr_manager write.
--
-- Because both new triggers fire within the SAME transaction as the
-- underlying business mutation (the correction_requests UPDATE / the
-- employee_jurisdiction_details INSERT-or-UPDATE), the mutation and its
-- audit record are fully atomic: if the audit insert fails for any reason,
-- the trigger raises, the whole transaction (mutation included) rolls
-- back — there is no way for the privileged mutation to succeed while its
-- audit record silently fails to be written.
--
-- No historical migration file is edited. No existing RLS policy is
-- dropped or weakened — audit_logs_insert/select and every table's
-- existing policies are left exactly as they are. No existing audit event
-- is removed. SECURITY DEFINER functions here all use
-- SET search_path = public and validate the caller via auth.uid()/
-- has_role()/get_my_employee_role(), never a client-supplied id.
-- ============================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. Gating trigger on audit_logs
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_audit_log_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_privileged_actions CONSTANT TEXT[] := ARRAY[
    'bootstrap_admin',
    'employee.created',
    'correction.approved',
    'correction.rejected',
    'jurisdiction.assigned'
  ];
BEGIN
  -- (a) actor_role is never trusted from the client — always resolved
  -- server-side from the authenticated caller's own employees row, for
  -- every insert regardless of action. NULL (not 'employee') when the
  -- actor has no employees row at all, e.g. the very first bootstrap call.
  IF NEW.actor_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.employees WHERE user_id = NEW.actor_user_id;
    NEW.actor_role := v_role;
  ELSE
    NEW.actor_role := NULL;
  END IF;

  -- (b) Privileged/system actions may only be recorded as a successful
  -- event by trusted server-side code (see file header). success is
  -- NOT NULL DEFAULT true, so an insert that simply omits `success`
  -- is treated as a claimed success and must also satisfy this check.
  IF NEW.action = ANY (v_privileged_actions)
     AND NEW.success = true
     AND current_setting('app.audit_privileged_write', true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION
      'action "%" can only be recorded as successful by a trusted server-side operation', NEW.action
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_audit_log_integrity ON public.audit_logs;
CREATE TRIGGER trg_enforce_audit_log_integrity
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_audit_log_integrity();

-- ────────────────────────────────────────────────────────────────────────
-- 2. Employee creation — transactional audit inside create_employee_with_details()
--    Business logic below is unchanged from
--    20260625000003_fix_employee_rpc_overload.sql, plus:
--      - two new trailing, defaulted parameters (p_source, p_correlation_id)
--      - one new INSERT INTO audit_logs immediately before RETURN
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'create_employee_with_details'
      AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END;
$$;

CREATE FUNCTION public.create_employee_with_details(
  p_first_name        TEXT,
  p_last_name         TEXT,
  p_employee_code     TEXT,
  p_work_email        TEXT,
  p_personal_email    TEXT DEFAULT NULL,
  p_phone             TEXT DEFAULT NULL,
  p_alternate_phone   TEXT DEFAULT NULL,
  p_gender            TEXT DEFAULT NULL,
  p_dob               DATE DEFAULT NULL,
  p_marital_status    TEXT DEFAULT NULL,
  p_nationality       TEXT DEFAULT NULL,
  p_blood_group       TEXT DEFAULT NULL,
  p_current_address   TEXT DEFAULT NULL,
  p_permanent_address TEXT DEFAULT NULL,
  p_city              TEXT DEFAULT NULL,
  p_state             TEXT DEFAULT NULL,
  p_pincode           TEXT DEFAULT NULL,
  p_source            TEXT DEFAULT 'web_portal',
  p_correlation_id    UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  IF public.get_my_employee_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins can create employees' USING ERRCODE = '42501';
  END IF;

  -- 1. Master record. Unique violations on employee_code/email abort here —
  -- nothing else is inserted, so there is no partial employees row either.
  INSERT INTO public.employees (first_name, last_name, employee_code, email, role)
  VALUES (
    trim(p_first_name),
    trim(p_last_name),
    trim(p_employee_code),
    lower(trim(p_work_email)),
    'employee'
  )
  RETURNING id INTO v_employee_id;

  -- 2. Personal + contact details — real values from the form. This is an
  -- upsert, NOT a plain insert: the on_employee_created AFTER INSERT
  -- trigger (if present on this database) already created an empty row
  -- for this employee_id by the time this statement runs, so a plain
  -- INSERT here would always violate the employee_id UNIQUE constraint.
  INSERT INTO public.employee_personal_details
    (employee_id, gender, dob, blood_group, marital_status, nationality)
  VALUES
    (v_employee_id, p_gender, p_dob, p_blood_group, p_marital_status, p_nationality)
  ON CONFLICT (employee_id) DO UPDATE SET
    gender         = EXCLUDED.gender,
    dob            = EXCLUDED.dob,
    blood_group    = EXCLUDED.blood_group,
    marital_status = EXCLUDED.marital_status,
    nationality    = EXCLUDED.nationality;

  INSERT INTO public.employee_contact_details
    (employee_id, work_email, personal_email, phone, alternate_phone,
     current_address, permanent_address, city, state, pincode)
  VALUES
    (v_employee_id, lower(trim(p_work_email)), p_personal_email, p_phone, p_alternate_phone,
     p_current_address, p_permanent_address, p_city, p_state, p_pincode)
  ON CONFLICT (employee_id) DO UPDATE SET
    work_email        = EXCLUDED.work_email,
    personal_email     = EXCLUDED.personal_email,
    phone              = EXCLUDED.phone,
    alternate_phone    = EXCLUDED.alternate_phone,
    current_address    = EXCLUDED.current_address,
    permanent_address  = EXCLUDED.permanent_address,
    city               = EXCLUDED.city,
    state              = EXCLUDED.state,
    pincode            = EXCLUDED.pincode;

  -- 3. Remaining single-entry detail tables — not collected by the Add
  -- Employee form (filled in later via Employee Edit), but every
  -- employee must have exactly one linked placeholder row so the join
  -- in EmployeeService.getById always returns a row for them.
  INSERT INTO public.employee_employment_details (employee_id)
    VALUES (v_employee_id) ON CONFLICT (employee_id) DO NOTHING;
  INSERT INTO public.employee_financial_details (employee_id)
    VALUES (v_employee_id) ON CONFLICT (employee_id) DO NOTHING;
  INSERT INTO public.employee_govt_ids (employee_id)
    VALUES (v_employee_id) ON CONFLICT (employee_id) DO NOTHING;
  INSERT INTO public.employee_emergency_contacts (employee_id)
    VALUES (v_employee_id) ON CONFLICT (employee_id) DO NOTHING;
  INSERT INTO public.employee_additional_details (employee_id)
    VALUES (v_employee_id) ON CONFLICT (employee_id) DO NOTHING;
  INSERT INTO public.employee_health_info (employee_id)
    VALUES (v_employee_id) ON CONFLICT (employee_id) DO NOTHING;
  INSERT INTO public.consent_records (employee_id, status)
    VALUES (v_employee_id, 'pending') ON CONFLICT (employee_id) DO NOTHING;

  -- 4. Transactional audit record — same transaction as the employee
  -- creation above: if this insert fails, the whole employee creation
  -- rolls back with it, so there is no way to end up with an employee
  -- row and no audit trail for it. Only non-sensitive identifier
  -- information is logged (employee_code) — never DOB/PAN/bank/address/
  -- government-ID/health data, none of which this function even receives
  -- values for that need masking beyond what's already excluded here.
  PERFORM set_config('app.audit_privileged_write', 'on', true);
  INSERT INTO public.audit_logs (
    actor_user_id, action, entity_type, entity_id, metadata, success, source, correlation_id
  ) VALUES (
    auth.uid(),
    'employee.created',
    'Employee',
    v_employee_id,
    jsonb_build_object('employee_code', trim(p_employee_code)),
    true,
    COALESCE(p_source, 'web_portal'),
    p_correlation_id
  );

  RETURN v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_employee_with_details(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated;

-- Force PostgREST to drop its cached view of this function's signature
-- immediately, rather than waiting for its next schema-change poll.
NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────────────
-- 3. bootstrap_admin() — identical business logic to
--    20260821000006_harden_bootstrap_admin.sql, plus one new line
--    (set_config) immediately before each of its two existing
--    audit_logs inserts.
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bootstrap_admin()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       UUID;
  v_email         TEXT;
  v_meta          JSONB;
  v_first_name    TEXT;
  v_last_name     TEXT;
  v_employee_id   UUID;
  v_employee_code TEXT;
  v_already_used  BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'not_authenticated');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_admin'));

  SELECT COALESCE((value #>> '{}')::boolean, false) INTO v_already_used
  FROM public.app_settings WHERE key = 'bootstrap_admin_completed';

  IF v_already_used THEN
    RETURN jsonb_build_object('created', false, 'reason', 'bootstrap_disabled');
  END IF;

  IF EXISTS (SELECT 1 FROM public.employees WHERE role = 'admin') THEN
    UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'bootstrap_admin_completed';
    RETURN jsonb_build_object('created', false, 'reason', 'admin_exists');
  END IF;

  IF EXISTS (SELECT 1 FROM public.employees WHERE user_id = v_user_id) THEN
    RETURN jsonb_build_object('created', false, 'reason', 'already_linked');
  END IF;

  SELECT email, raw_user_meta_data INTO v_email, v_meta
  FROM auth.users
  WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'no_email');
  END IF;

  PERFORM set_config('app.employee_privileged_write', 'on', true);

  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(v_email))
    AND user_id IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.employees
    SET user_id = v_user_id, role = 'admin'
    WHERE id = v_employee_id;

    UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'bootstrap_admin_completed';

    PERFORM set_config('app.audit_privileged_write', 'on', true);
    INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_user_id, 'bootstrap_admin', 'employee', v_employee_id,
      jsonb_build_object('reason', 'promoted_existing', 'email', LOWER(TRIM(v_email)))
    );

    RETURN jsonb_build_object('created', true, 'employee_id', v_employee_id, 'reason', 'promoted_existing');
  END IF;

  v_first_name := NULLIF(TRIM(COALESCE(v_meta->>'given_name', v_meta->>'first_name')), '');
  v_last_name  := NULLIF(TRIM(COALESCE(v_meta->>'family_name', v_meta->>'surname', v_meta->>'last_name')), '');

  IF v_first_name IS NULL THEN
    v_first_name := split_part(v_email, '@', 1);
  END IF;
  IF v_last_name IS NULL THEN
    v_last_name := '';
  END IF;

  v_employee_code := 'ADMIN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.employees (user_id, employee_code, first_name, last_name, email, role)
  VALUES (v_user_id, v_employee_code, v_first_name, v_last_name, LOWER(TRIM(v_email)), 'admin')
  RETURNING id INTO v_employee_id;

  UPDATE public.employee_contact_details
  SET work_email = LOWER(TRIM(v_email))
  WHERE employee_id = v_employee_id;

  INSERT INTO public.employee_health_info (employee_id) VALUES (v_employee_id) ON CONFLICT (employee_id) DO NOTHING;

  UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'bootstrap_admin_completed';

  PERFORM set_config('app.audit_privileged_write', 'on', true);
  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id, 'bootstrap_admin', 'employee', v_employee_id,
    jsonb_build_object('reason', 'bootstrapped', 'email', LOWER(TRIM(v_email)))
  );

  RETURN jsonb_build_object('created', true, 'employee_id', v_employee_id, 'reason', 'bootstrapped');
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 4. Correction approve/reject — NEW trigger, approve_correction()/
--    reject_correction() themselves are NOT modified at all.
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_correction_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
BEGIN
  -- trg_prevent_correction_workflow_tampering (20260821000007) already
  -- guarantees that any change to status/reviewed_by/reviewed_at/comments
  -- came from approve_correction()/reject_correction() itself — a direct
  -- client UPDATE attempting this same transition is blocked before this
  -- trigger ever runs. No further trust check is needed here.
  v_action := CASE NEW.status
    WHEN 'approved' THEN 'correction.approved'
    WHEN 'rejected' THEN 'correction.rejected'
    ELSE NULL
  END;

  IF v_action IS NOT NULL THEN
    PERFORM set_config('app.audit_privileged_write', 'on', true);
    INSERT INTO public.audit_logs (
      actor_user_id, action, entity_type, entity_id, metadata, success, source
    ) VALUES (
      auth.uid(),
      v_action,
      'Correction',
      NEW.employee_id,
      -- Field/table names only — never old_value/new_value, which can be
      -- financial/govt-ID/health/address data (Phase 3 privacy rule).
      jsonb_build_object('request_id', NEW.id, 'field', NEW.field_name, 'table', NEW.table_name),
      true,
      'web_portal'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_correction_review ON public.correction_requests;
CREATE TRIGGER trg_audit_correction_review
  AFTER UPDATE ON public.correction_requests
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected'))
  EXECUTE FUNCTION public.audit_correction_review();

-- ────────────────────────────────────────────────────────────────────────
-- 5. Jurisdiction assignment — NEW trigger, JurisdictionService's upsert
--    (and its underlying table) is NOT modified at all.
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_jurisdiction_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- employee_jurisdiction_write (20260819000001) already restricts INSERT/
  -- UPDATE on this table to admin/hr_manager — any row reaching this
  -- trigger is already a legitimate, RLS-gated write.
  PERFORM set_config('app.audit_privileged_write', 'on', true);
  INSERT INTO public.audit_logs (
    actor_user_id, action, entity_type, entity_id, metadata, success, source
  ) VALUES (
    auth.uid(),
    'jurisdiction.assigned',
    'Employee',
    NEW.employee_id,
    jsonb_build_object(
      'change', CASE WHEN TG_OP = 'INSERT' THEN 'assigned' ELSE 'updated' END,
      'old_country_id', CASE WHEN TG_OP = 'UPDATE' THEN OLD.country_id ELSE NULL END,
      'old_regulatory_framework_id', CASE WHEN TG_OP = 'UPDATE' THEN OLD.regulatory_framework_id ELSE NULL END,
      'new_country_id', NEW.country_id,
      'new_regulatory_framework_id', NEW.regulatory_framework_id
    ),
    true,
    -- Source cannot be distinguished per-caller here (web vs. CSV import
    -- both reach this table the same way, and a session-local GUC set by
    -- one PostgREST request does not persist into a separate request) —
    -- defaults to web_portal, the primary path (JurisdictionSection.tsx).
    -- The CSV-import case is documented as a known limitation, not a
    -- silent gap.
    'web_portal'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_jurisdiction_assignment ON public.employee_jurisdiction_details;
CREATE TRIGGER trg_audit_jurisdiction_assignment
  AFTER INSERT OR UPDATE ON public.employee_jurisdiction_details
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_jurisdiction_assignment();

-- ────────────────────────────────────────────────────────────────────────
-- No RLS policy is created, dropped, or modified in this migration.
-- audit_logs remains: INSERT restricted to actor_user_id = auth.uid();
-- SELECT restricted to admin/dpo (20260821000002); no UPDATE/DELETE
-- policy exists for any role — the table remains append-only. This
-- migration only adds a BEFORE INSERT trigger (which can rewrite/reject a
-- row before it's written, a capability RLS policies don't have) and two
-- new AFTER triggers on other, already-appropriately-RLS'd tables.
-- ────────────────────────────────────────────────────────────────────────
