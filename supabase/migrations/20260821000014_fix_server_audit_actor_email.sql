-- ============================================================
-- 20260821000014_fix_server_audit_actor_email.sql
-- Fix: server-side audit_logs inserts were missing user_email.
--
-- ROOT CAUSE: actor_user_id (from auth.uid()) and actor_role (derived
-- server-side by the enforce_audit_log_integrity trigger from
-- actor_user_id, see 20260821000013) were always correct. But the
-- separate `user_email` column — which the Audit UI reads directly for
-- its "User / Performed By" display (it does not resolve an email from
-- actor_user_id) — was never populated by any of the server-side
-- SECURITY DEFINER inserts, only by the client-side AuditService.log()
-- path and upsert_user_login_audit(). Those rows therefore always
-- rendered as "System / Unknown" even though the actor was correctly
-- identified and correctly role-classified.
--
-- FIX: re-create the five affected functions (CREATE OR REPLACE — this
-- file is new; none of the historical migrations that originally defined
-- these functions are edited) with their business logic, SECURITY
-- DEFINER, SET search_path, authorization checks, and existing audit
-- metadata all UNCHANGED. The only addition in each is one extra column
-- in the audit_logs INSERT: `user_email`, populated from
-- `(SELECT email FROM auth.users WHERE id = auth.uid())` — the
-- AUTHENTICATED ACTOR's own login email, never an employee/subject's
-- email. bootstrap_admin() and reset_user_onboarding() already resolve
-- this same value into a local variable for their own metadata, so they
-- reuse it instead of querying auth.users a second time.
--
-- actor_user_id, actor_role, existing metadata, success/source values,
-- SECURITY DEFINER, and search_path are all identical to before this
-- migration. No RLS policy, table, or column is created, dropped, or
-- modified. No UPDATE/DELETE is introduced anywhere against audit_logs.
-- ============================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. create_employee_with_details() — unchanged signature/body, plus
--    user_email in its existing audit_logs insert.
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_employee_with_details(
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
  -- government-ID/health data. user_email is the AUTHENTICATED ACTOR's
  -- own login email (the admin creating the employee), never the new
  -- employee's email.
  PERFORM set_config('app.audit_privileged_write', 'on', true);
  INSERT INTO public.audit_logs (
    actor_user_id, user_email, action, entity_type, entity_id, metadata, success, source, correlation_id
  ) VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
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
-- 2. bootstrap_admin() — unchanged body, plus user_email in both existing
--    audit_logs inserts. Reuses the already-resolved v_email variable
--    (this function already does `SELECT email ... FROM auth.users WHERE
--    id = v_user_id` for its own purposes) instead of querying again.
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
    INSERT INTO public.audit_logs (actor_user_id, user_email, action, entity_type, entity_id, metadata)
    VALUES (
      v_user_id, v_email, 'bootstrap_admin', 'employee', v_employee_id,
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
  INSERT INTO public.audit_logs (actor_user_id, user_email, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id, v_email, 'bootstrap_admin', 'employee', v_employee_id,
    jsonb_build_object('reason', 'bootstrapped', 'email', LOWER(TRIM(v_email)))
  );

  RETURN jsonb_build_object('created', true, 'employee_id', v_employee_id, 'reason', 'bootstrapped');
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 3. audit_correction_review() — unchanged trigger logic, plus user_email
--    in its existing audit_logs insert. The trigger itself
--    (trg_audit_correction_review) is unchanged — it already points at
--    this function name, so redefining the function body is sufficient.
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
      actor_user_id, user_email, action, entity_type, entity_id, metadata, success, source
    ) VALUES (
      auth.uid(),
      -- The AUTHENTICATED REVIEWER's own login email (the admin/hr_manager
      -- who called approve_correction()/reject_correction()) — never the
      -- correction's subject employee's email.
      (SELECT email FROM auth.users WHERE id = auth.uid()),
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

-- ────────────────────────────────────────────────────────────────────────
-- 4. audit_jurisdiction_assignment() — unchanged trigger logic, plus
--    user_email in its existing audit_logs insert. The trigger itself
--    (trg_audit_jurisdiction_assignment) is unchanged.
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
    actor_user_id, user_email, action, entity_type, entity_id, metadata, success, source
  ) VALUES (
    auth.uid(),
    -- The AUTHENTICATED ACTOR's own login email (the admin/hr_manager who
    -- performed the assignment) — never the affected employee's email.
    (SELECT email FROM auth.users WHERE id = auth.uid()),
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
    -- both reach this table the same way) — defaults to web_portal, the
    -- primary path (JurisdictionSection.tsx). Unchanged from before.
    'web_portal'
  );

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 5. reset_user_onboarding() — unchanged signature/body/authorization
--    check, plus user_email in its existing audit_logs insert. Adds one
--    local variable (v_actor_email) resolved from the already-computed
--    current_actor_id, rather than a second auth.uid() lookup.
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_user_onboarding(
  target_employee_id UUID,
  reset_reason TEXT DEFAULT 'bug / re-consent / compliance'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_actor_id UUID := auth.uid();
  v_actor_email TEXT := (SELECT email FROM auth.users WHERE id = auth.uid());
BEGIN
  IF NOT (public.has_role(current_actor_id, 'admin') OR public.has_role(current_actor_id, 'hr_manager')) THEN
    RAISE EXCEPTION 'Access denied. Admin or HR Manager role required.';
  END IF;

  UPDATE public.video_events
  SET reset_flag = true,
      updated_at = now()
  WHERE employee_id = target_employee_id;

  UPDATE public.education_completions
  SET reset_flag = true,
      is_completed = false
  WHERE employee_id = target_employee_id;

  INSERT INTO public.audit_logs (
    actor_user_id,
    user_email,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    current_actor_id,
    -- The AUTHENTICATED ACTOR's own login email (the admin/hr_manager who
    -- performed the reset) — never the target employee's email.
    v_actor_email,
    'reset_onboarding',
    'employee',
    target_employee_id,
    jsonb_build_object(
      'reason', reset_reason,
      'timestamp', now()
    )
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────
-- No RLS policy, table, or column is created, dropped, or modified by
-- this migration. audit_logs remains: INSERT restricted to
-- actor_user_id = auth.uid() (20260429000001); SELECT restricted to
-- admin/dpo (20260821000002); no UPDATE/DELETE policy exists for any
-- role (append-only, unchanged). The BEFORE INSERT integrity trigger
-- (enforce_audit_log_integrity, 20260821000013) and its actor_role
-- derivation are untouched — this migration only adds one column value
-- to five existing INSERT statements.
-- ────────────────────────────────────────────────────────────────────────
