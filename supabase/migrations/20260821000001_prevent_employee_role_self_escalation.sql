-- ============================================================
-- 20260821000001_prevent_employee_role_self_escalation.sql
-- SECURITY FIX (P0 #1): employees.role / user_id / employee_code
-- can currently be changed by an employee updating their own row,
-- because "employees_self_update" has no WITH CHECK restricting
-- which columns may change (see 20260503000002_fix_rls_recursion.sql).
--
-- RLS alone cannot enforce column-level restrictions on UPDATE (a
-- WITH CHECK clause only sees the proposed new row, and comparing it
-- against the pre-update row from inside a policy on `employees`
-- itself re-triggers RLS recursion — the exact bug that migration
-- already had to work around with get_my_employee_role()). We use a
-- BEFORE UPDATE trigger instead: OLD/NEW are supplied directly by the
-- trigger mechanism, so no extra query (and no recursion) is needed.
--
-- Several existing SECURITY DEFINER flows legitimately set user_id
-- and/or role on an employees row outside of any admin action:
--   • handle_new_user()       — AFTER INSERT ON auth.users trigger;
--                                auth.uid() is NOT reliably set in this
--                                context, so it cannot be used to
--                                distinguish "self" here.
--   • map_user_to_employee()  — self-link RPC called on every login.
--   • link_employee_record()  — self-link RPC (alternate path).
--   • bootstrap_admin()       — first-admin recovery (see fix #6,
--                                20260821000006_harden_bootstrap_admin.sql).
-- Each of these already independently validates *which* row it is
-- allowed to touch (verified email match, or "no admin exists yet")
-- before ever reaching its UPDATE — this migration's trigger only
-- needs a way to recognize "this write is coming from one of those
-- already-vetted code paths" vs. an arbitrary client UPDATE. A
-- transaction-local setting (`app.employee_privileged_write`), set by
-- each of those functions immediately before their own UPDATE, is used
-- for that purpose. It cannot be set by ordinary client SQL and never
-- outlives the transaction.
--
-- No existing RLS policy is weakened or dropped by this migration.
-- ============================================================

-- ── 1. Trigger function ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_employee_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_bypass   BOOLEAN;
BEGIN
  v_is_admin := public.get_my_employee_role() = 'admin';
  v_bypass   := current_setting('app.employee_privileged_write', true) = 'on';

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT (v_is_admin OR v_bypass) THEN
    RAISE EXCEPTION 'Changing role requires admin privileges';
  END IF;

  IF NEW.employee_code IS DISTINCT FROM OLD.employee_code AND NOT (v_is_admin OR v_bypass) THEN
    RAISE EXCEPTION 'Changing employee_code requires admin privileges';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT (v_is_admin OR v_bypass) THEN
    RAISE EXCEPTION 'Changing user_id requires admin privileges';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Attach trigger to employees ───────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_prevent_employee_privilege_escalation ON public.employees;
CREATE TRIGGER trg_prevent_employee_privilege_escalation
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_employee_privilege_escalation();

-- ── 3. Compatibility updates: flag the trigger-bypass before each existing
-- legitimate user_id/role write. Bodies are otherwise byte-for-byte
-- identical to their current (latest) definitions — only the
-- `PERFORM set_config(...)` line is added, immediately before the UPDATE.
-- ── 3a. handle_new_user() — auth.users AFTER INSERT trigger ─────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
BEGIN
  BEGIN
    SELECT id INTO v_employee_id
    FROM public.employees
    WHERE lower(email) = lower(NEW.email)
    LIMIT 1;

    IF v_employee_id IS NOT NULL THEN
      PERFORM set_config('app.employee_privileged_write', 'on', true);

      UPDATE public.employees
      SET user_id = NEW.id
      WHERE id = v_employee_id AND user_id IS NULL;

      INSERT INTO public.profiles (user_id, display_name, employee_id)
      VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        v_employee_id
      )
      ON CONFLICT (user_id) DO NOTHING;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Ignore errors to let auth succeed
  END;

  RETURN NEW;
END;
$$;

-- ── 3b. map_user_to_employee() — self-link RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION public.map_user_to_employee()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT := auth.jwt()->>'email';
  v_emp_id UUID;
BEGIN
  IF v_uid IS NULL OR v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_emp_id
  FROM public.employees
  WHERE lower(email) = lower(v_email)
    AND user_id IS NULL
  LIMIT 1;

  IF v_emp_id IS NOT NULL THEN
    PERFORM set_config('app.employee_privileged_write', 'on', true);

    UPDATE public.employees
    SET user_id = v_uid
    WHERE id = v_emp_id AND user_id IS NULL;

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ── 3c. link_employee_record() — self-link RPC (alternate path) ─────────────
CREATE OR REPLACE FUNCTION public.link_employee_record()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_employee_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_user_id IS NULL OR v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(v_email))
    AND user_id IS NULL
  LIMIT 1;

  IF FOUND THEN
    PERFORM set_config('app.employee_privileged_write', 'on', true);

    UPDATE public.employees
    SET user_id = v_user_id
    WHERE id = v_employee_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ── 3d. bootstrap_admin() — minimal compatibility update ────────────────────
-- Full one-time-use hardening (setup flag + audit entry) is added in
-- 20260821000006_harden_bootstrap_admin.sql; this redefinition only adds
-- the bypass flag so the trigger above doesn't block the one legitimate
-- first-admin bootstrap path in the meantime.
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

  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_admin'));

  IF EXISTS (SELECT 1 FROM public.employees WHERE role = 'admin') THEN
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

  RETURN jsonb_build_object('created', true, 'employee_id', v_employee_id, 'reason', 'bootstrapped');
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;
