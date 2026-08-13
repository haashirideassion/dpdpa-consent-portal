-- ============================================================
-- 20260813000001_bootstrap_admin.sql
-- Bootstrap Admin: eliminates the manual-SQL deadlock after a fresh
-- database reset, where auth.users has a session but `employees` is
-- completely empty, so nobody can reach the Admin Portal to create the
-- first employee.
--
-- Rule: the FIRST authenticated user becomes the admin ONLY when no
-- admin exists yet (`NOT EXISTS (SELECT 1 FROM employees WHERE role =
-- 'admin')`). The instant one admin row exists, this is permanently a
-- no-op — the existing HR-creates / email-links / approval architecture
-- (link_employee_record, map_user_to_employee, create_employee_with_details,
-- correction_requests) is completely untouched and takes over exactly as
-- it does today.
-- ============================================================

-- 1. bootstrap_admin(): SECURITY DEFINER, same convention as every other
-- privileged write in this schema (link_employee_record,
-- create_employee_with_details). A plain client-side INSERT is not
-- possible here: the only INSERT policy on `employees`
-- (employees_admin_insert, see 20260503000002_fix_rls_recursion.sql)
-- requires get_my_employee_role() = 'admin' — i.e. you must already be
-- an admin to insert any employee row, including your own. So this must
-- run as a SECURITY DEFINER function to bridge that first-admin gap.
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'not_authenticated');
  END IF;

  -- Serialize concurrent callers (e.g. two browser tabs racing the very
  -- first login) so only one can ever pass the "no admin exists" check
  -- and create the bootstrap row. Lock is released automatically at the
  -- end of the calling transaction.
  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_admin'));

  -- CASE A: an admin already exists — never run again, never touch
  -- anything. This is the steady-state check that makes bootstrap
  -- permanently a no-op after the first admin is created.
  IF EXISTS (SELECT 1 FROM public.employees WHERE role = 'admin') THEN
    RETURN jsonb_build_object('created', false, 'reason', 'admin_exists');
  END IF;

  -- This auth user is already linked to some employee row (any role) —
  -- leave it to the existing linking/onboarding flow, don't create a
  -- second row for the same person.
  IF EXISTS (SELECT 1 FROM public.employees WHERE user_id = v_user_id) THEN
    RETURN jsonb_build_object('created', false, 'reason', 'already_linked');
  END IF;

  SELECT email, raw_user_meta_data INTO v_email, v_meta
  FROM auth.users
  WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('created', false, 'reason', 'no_email');
  END IF;

  -- If HR already pre-created an (unlinked) employee row for this exact
  -- email, honor the existing architecture: link + promote that row
  -- instead of creating a duplicate. Same case-insensitive match used by
  -- link_employee_record/map_user_to_employee.
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(v_email))
    AND user_id IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.employees
    SET user_id = v_user_id, role = 'admin'
    WHERE id = v_employee_id;

    RETURN jsonb_build_object('created', true, 'employee_id', v_employee_id, 'reason', 'promoted_existing');
  END IF;

  -- No pre-created row — create exactly ONE new employee record for the
  -- authenticated Azure user. Only the fields listed in the bootstrap
  -- requirement are populated; everything else keeps its table default
  -- (e.g. employee_employment_details.status DEFAULT 'Active').
  v_first_name := NULLIF(TRIM(COALESCE(v_meta->>'given_name', v_meta->>'first_name')), '');
  v_last_name  := NULLIF(TRIM(COALESCE(v_meta->>'family_name', v_meta->>'surname', v_meta->>'last_name')), '');

  -- Fall back to the email's local part when Azure didn't supply a given
  -- name, since employees.first_name is NOT NULL.
  IF v_first_name IS NULL THEN
    v_first_name := split_part(v_email, '@', 1);
  END IF;
  IF v_last_name IS NULL THEN
    v_last_name := '';
  END IF;

  -- Generate the next employee code. Collision-proof by construction
  -- (derived from a fresh UUID) rather than a sequential scan, since this
  -- runs against a table that — by definition of reaching this branch —
  -- has no admin yet but may still hold other non-admin rows.
  v_employee_code := 'ADMIN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.employees (user_id, employee_code, first_name, last_name, email, role)
  VALUES (v_user_id, v_employee_code, v_first_name, v_last_name, LOWER(TRIM(v_email)), 'admin')
  RETURNING id INTO v_employee_id;

  -- NOTE: the `on_employee_created` AFTER INSERT trigger
  -- (initialize_employee_details(), 20260430000002_normalized_employees.sql)
  -- is still live and already fired synchronously above, creating blank
  -- placeholder rows in employee_personal_details, employee_contact_details,
  -- employee_employment_details, employee_financial_details,
  -- employee_govt_ids, employee_emergency_contacts,
  -- employee_additional_details, and consent_records. Re-inserting into
  -- any of those here would be redundant work against rows that already
  -- exist — so only the two things the trigger does NOT do are handled
  -- below:
  --   1. Fill in the real work_email on the contact-details row the
  --      trigger already created (the trigger only sets employee_id).
  --   2. Insert employee_health_info explicitly — that table was added
  --      after the trigger was written and was never wired into it (see
  --      create_employee_with_details, which has this exact same gap).
  UPDATE public.employee_contact_details
  SET work_email = LOWER(TRIM(v_email))
  WHERE employee_id = v_employee_id;

  INSERT INTO public.employee_health_info (employee_id) VALUES (v_employee_id) ON CONFLICT (employee_id) DO NOTHING;

  RETURN jsonb_build_object('created', true, 'employee_id', v_employee_id, 'reason', 'bootstrapped');
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;

-- 2. Wire the bootstrap attempt into get_onboarding_screen() — the single
-- server-side source of truth already responsible for deciding
-- NO_EMPLOYEE_RECORD vs ADMIN_DASHBOARD vs the employee flow on every
-- authenticated page load. This is the smallest safe insertion point:
-- no new client-side RPC call/effect is needed, no new route, and the
-- extra work (bootstrap_admin) only ever runs for a user who is about to
-- see "No Employee Record Found" anyway — it can only ever upgrade that
-- outcome, never change behavior for a user who already resolves to an
-- employee row.
CREATE OR REPLACE FUNCTION public.get_onboarding_screen()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role               TEXT;
  v_emp_id             UUID;
  v_video_completed    BOOLEAN;
  v_edu_completed      BOOLEAN;
  v_has_active_video   BOOLEAN;
  v_has_active_edu     BOOLEAN;
BEGIN
  -- Keep strict user-to-employee mapping self-healing.
  PERFORM public.map_user_to_employee();

  -- Get employee record for current user
  SELECT id, role, video_completed, education_completed
  INTO v_emp_id, v_role, v_video_completed, v_edu_completed
  FROM public.employees
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    -- Bootstrap gate: only ever does something when no admin exists yet
    -- (fresh/reset database). Once any admin exists, bootstrap_admin()
    -- returns immediately without touching anything, and this behaves
    -- exactly as it did before this migration.
    PERFORM public.bootstrap_admin();

    -- Re-check once: bootstrap_admin() may have just linked/created a
    -- row for this exact user.
    SELECT id, role, video_completed, education_completed
    INTO v_emp_id, v_role, v_video_completed, v_edu_completed
    FROM public.employees
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('screen', 'NO_EMPLOYEE_RECORD');
    END IF;
  END IF;

  -- Admin/HR/DPO go directly to admin dashboard
  IF v_role IN ('admin', 'hr_manager', 'dpo') THEN
    RETURN jsonb_build_object('screen', 'ADMIN_DASHBOARD', 'role', v_role);
  END IF;

  -- Check active video presence first (enforced onboarding requirement)
  SELECT EXISTS(SELECT 1 FROM public.video_versions WHERE is_active = TRUE)
  INTO v_has_active_video;

  IF NOT v_has_active_video THEN
    RETURN jsonb_build_object('screen', 'NO_VIDEO_AVAILABLE');
  END IF;

  IF NOT v_video_completed THEN
    -- Fallback/self-heal if fast-path flag is stale
    IF EXISTS(
      SELECT 1
      FROM public.video_events ve
      WHERE ve.employee_id = v_emp_id
        AND ve.completed = TRUE
        AND (ve.reset_flag IS NULL OR ve.reset_flag = FALSE)
    ) THEN
      UPDATE public.employees
      SET video_completed = TRUE
      WHERE id = v_emp_id;
      v_video_completed := TRUE;
    ELSE
      RETURN jsonb_build_object('screen', 'SHOW_VIDEO');
    END IF;
  END IF;

  -- Education step
  SELECT EXISTS(SELECT 1 FROM public.education_modules WHERE is_active = TRUE)
  INTO v_has_active_edu;

  IF v_has_active_edu AND NOT v_edu_completed THEN
    -- Fallback/self-heal if fast-path flag is stale
    IF EXISTS(
      SELECT 1
      FROM public.education_completions ec
      WHERE ec.employee_id = v_emp_id
        AND ec.is_completed = TRUE
        AND (ec.reset_flag IS NULL OR ec.reset_flag = FALSE)
    ) THEN
      UPDATE public.employees
      SET education_completed = TRUE
      WHERE id = v_emp_id;
      v_edu_completed := TRUE;
    ELSE
      RETURN jsonb_build_object('screen', 'SHOW_EDUCATION');
    END IF;
  END IF;

  RETURN jsonb_build_object('screen', 'SHOW_EMPLOYEE_PORTAL');
END;
$$;

-- Force PostgREST to drop its cached view of these functions immediately.
NOTIFY pgrst, 'reload schema';
