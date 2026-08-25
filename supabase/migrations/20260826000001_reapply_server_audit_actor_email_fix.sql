-- ============================================================
-- 20260826000001_reapply_server_audit_actor_email_fix.sql
--
-- REGRESSION: Correction Approved / Correction Rejected audit rows are
-- again showing "Performed By: System / Unknown" (user_email NULL)
-- while Actor Role correctly shows "Admin" (actor_user_id correct).
--
-- ROOT CAUSE (confirmed by reading the LIVE function bodies from the
-- Supabase project this app's .env actually points at — project ref
-- uwqelgqrgbluuueiasoi / "DPDPA" — via `supabase db query --linked`,
-- not by assuming the migrations folder was applied):
--
--   20260821000014_fix_server_audit_actor_email.sql exists in this repo
--   and is the newest definition of these functions in migration
--   history — no later migration file redefines any of them. But the
--   LIVE database's `supabase_migrations.schema_migrations` history
--   table does not exist at all on this project, and `pg_get_functiondef`
--   against the live database showed that audit_correction_review(),
--   audit_jurisdiction_assignment(), bootstrap_admin(), and
--   create_employee_with_details() all still had their PRE-000014
--   bodies (no user_email column in the audit_logs INSERT at all).
--   Only reset_user_onboarding() (the 5th function 000014 touched)
--   already had user_email live.
--
--   In other words: 20260821000014 was never actually applied to the
--   live database this app connects to for 4 of its 5 functions. This
--   is not a case of a later migration overwriting the fix — no such
--   migration exists — the fix simply never reached the live function
--   for these four. (supabase/config.toml's project_id also does not
--   match this app's .env project ref, evidence this project's schema
--   history has not been consistently pushed via the CLI's tracked
--   migration flow.)
--
-- FIX: byte-for-byte re-apply of the exact 4 function bodies from
-- 20260821000014 (CREATE OR REPLACE FUNCTION — historical migration
-- files are NOT edited). reset_user_onboarding() is intentionally left
-- untouched here since it is already correct live. actor_user_id,
-- actor_role derivation, authorization checks, SECURITY DEFINER,
-- SET search_path, business logic, metadata, and every other column
-- are unchanged from 20260821000014 — the only content below is those
-- four CREATE OR REPLACE FUNCTION statements, copied verbatim.
-- ============================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. create_employee_with_details()
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
-- 2. bootstrap_admin()
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
-- 3. audit_correction_review() — THE function this regression is about.
--    The trigger itself (trg_audit_correction_review, from 20260821000013)
--    is unchanged — it already points at this function name.
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
-- 4. audit_jurisdiction_assignment()
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
-- reset_user_onboarding() is intentionally NOT re-created here: the live
-- database already has its 20260821000014 body (user_email present),
-- confirmed via pg_get_functiondef before writing this migration.
--
-- No RLS policy, table, or column is created, dropped, or modified by
-- this migration. audit_logs remains append-only: INSERT restricted to
-- actor_user_id = auth.uid() (20260429000001); SELECT restricted to
-- admin/dpo (20260821000002); no UPDATE/DELETE policy exists for any
-- role. The BEFORE INSERT integrity trigger (enforce_audit_log_integrity,
-- 20260821000013) and its actor_role derivation are untouched — this
-- migration only re-applies one column value to four existing INSERT
-- statements, exactly as 20260821000014 already specified.
-- ────────────────────────────────────────────────────────────────────────
