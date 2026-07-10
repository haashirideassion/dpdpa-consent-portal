-- ============================================================
-- Fix: duplicate-key errors from create_employee_with_details
-- ============================================================
-- ROOT CAUSE: browser Network tab confirmed the RPC call sends the
-- correct payload, but Postgres still raises 23505 duplicate key on
-- employee_personal_details_employee_id_key / employee_contact_details_
-- employee_id_key — i.e. the function actually executing in this
-- database is issuing a plain INSERT into those two tables, not the
-- ON CONFLICT (employee_id) DO UPDATE upsert defined in
-- 20260625000002_atomic_employee_creation.sql.
--
-- CREATE OR REPLACE FUNCTION only replaces a function whose argument
-- list matches EXACTLY (name, order, types). If any earlier attempt at
-- this function was deployed with a different signature (a parameter
-- added/removed/reordered), Postgres keeps both as separate overloads
-- instead of replacing the old one, and calls can resolve to whichever
-- overload matches by argument count/names — which may be the stale
-- version without the ON CONFLICT clause.
--
-- FIX: unconditionally drop every existing overload of
-- create_employee_with_details before recreating it, so there can only
-- ever be the one, current, upsert-safe definition.
-- ============================================================

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
  p_pincode           TEXT DEFAULT NULL
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

  RETURN v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_employee_with_details(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- Force PostgREST to drop its cached view of this function's signature
-- immediately, rather than waiting for its next schema-change poll.
NOTIFY pgrst, 'reload schema';
