-- ============================================================
-- 20260821000006_harden_bootstrap_admin.sql
-- SECURITY FIX (P1 #6): bootstrap_admin() previously re-armed itself
-- any time `employees` had zero role='admin' rows — including after an
-- *accidental* deletion/blanking of the admin row long after initial
-- setup, letting whichever authenticated user loads the app next
-- silently become admin with no approval step and no audit trail.
--
-- This migration does NOT remove the legitimate first-deploy recovery
-- purpose (documented in 20260813000001_bootstrap_admin.sql) — it adds
-- a permanent one-time-use guard on top of it, using the existing
-- app_settings table (no new table introduced):
--
--   1. A persistent app_settings flag `bootstrap_admin_completed`.
--      Once bootstrap has succeeded once, it is permanently disabled —
--      even if every admin row is later deleted, bootstrap_admin() will
--      refuse to run again. Recovering from that state now requires an
--      explicit, auditable operator action (flipping the flag back via
--      the service-role key / SQL editor), not "whoever logs in next".
--   2. An audit_logs entry is written whenever bootstrap actually
--      creates or promotes an admin, recording the actor and the
--      resulting employee id.
--
-- The bypass flag introduced in 20260821000001 for the privilege-
-- escalation trigger is carried forward unchanged.
-- ============================================================

INSERT INTO public.app_settings (key, value)
VALUES ('bootstrap_admin_completed', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

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

  -- Permanent one-time-use guard: once bootstrap has ever succeeded, it
  -- never runs again, regardless of the current admin-row count. This
  -- is what prevents an accidental/malicious deletion of the admin row
  -- from reopening the privilege-escalation window.
  SELECT COALESCE((value #>> '{}')::boolean, false) INTO v_already_used
  FROM public.app_settings WHERE key = 'bootstrap_admin_completed';

  IF v_already_used THEN
    RETURN jsonb_build_object('created', false, 'reason', 'bootstrap_disabled');
  END IF;

  IF EXISTS (SELECT 1 FROM public.employees WHERE role = 'admin') THEN
    -- An admin already exists through the normal creation path (or a
    -- prior bootstrap that, for some reason, didn't flip the flag) —
    -- flip the flag now so this can never run again either way.
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

  INSERT INTO public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id, 'bootstrap_admin', 'employee', v_employee_id,
    jsonb_build_object('reason', 'bootstrapped', 'email', LOWER(TRIM(v_email)))
  );

  RETURN jsonb_build_object('created', true, 'employee_id', v_employee_id, 'reason', 'bootstrapped');
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_admin() TO authenticated;
