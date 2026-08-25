-- ============================================================
-- 20260821000004_harden_approve_correction_column_allowlist.sql
-- SECURITY FIX (P1 #4 / P2 #14): approve_correction() whitelists the
-- TARGET TABLE for a correction, but never whitelisted the TARGET
-- COLUMN — it only checked that the column exists via
-- information_schema. Because an employee can insert their own
-- correction_requests row with an arbitrary field_name/table_name
-- (correction_employee_own RLS policy allows INSERT via `FOR ALL`),
-- a request such as {table_name: 'employees', field_name: 'role',
-- new_value: 'admin'} would be accepted by the RPC's existing checks
-- and applied verbatim if an admin/HR reviewer approved it without
-- scrutinizing the raw column name.
--
-- Fix: a single, explicit, documented allowlist of employee-correctable
-- columns — built directly from the existing FIELD_MAP in
-- src/services/correction.service.ts (the only source of field_name/
-- table_name values the legitimate UI ever submits) plus the section
-- tables' own non-privileged columns. Anything outside this allowlist
-- (role, user_id, employee_code, email, id, employee_id, status,
-- reviewed_by, reviewed_at, created_at, updated_at, etc.) is rejected
-- by the RPC regardless of what a client inserts into
-- correction_requests.
--
-- This is the one server-side source of truth for "which fields can be
-- corrected" — the frontend FIELD_MAP is a UI convenience, not the
-- authorization boundary.
--
-- Behavior otherwise identical to the previous version
-- (20260507000001_section_delete_approval.sql): same four branches
-- (section add / section edit / section delete / flat field), same
-- whitelisted tables, same date-parsing, same admin/hr_manager auth
-- check.
-- ============================================================

CREATE OR REPLACE FUNCTION public.correction_allowed_field(
  p_table_name TEXT,
  p_field_name TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_field_name = ANY(
    CASE p_table_name
      -- ── employees (master) — first_name/last_name only. role, user_id,
      -- employee_code, email are NEVER correctable through this workflow.
      WHEN 'employees' THEN ARRAY['first_name', 'last_name']

      WHEN 'employee_personal_details' THEN ARRAY[
        'dob', 'gender', 'blood_group', 'marital_status', 'nationality',
        'father_name', 'mother_name'
      ]

      WHEN 'employee_contact_details' THEN ARRAY[
        'personal_email', 'phone', 'alternate_phone', 'current_address',
        'permanent_address', 'city', 'state', 'pincode'
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

      WHEN 'employee_emergency_contacts' THEN ARRAY[
        'contact_name', 'relation', 'contact_phone', 'contact_email'
      ]

      WHEN 'employee_additional_details' THEN ARRAY[
        'qualifications', 'certifications', 'languages', 'notes'
      ]

      WHEN 'employee_health_info' THEN ARRAY[
        'disability_status', 'chronic_conditions', 'allergies'
      ]

      -- ── Section (multi-entry) tables — every column an employee can
      -- legitimately set on add/edit. id/employee_id/created_at/updated_at
      -- are always excluded (assigned by the RPC / the database, never by
      -- the correction payload).
      WHEN 'employee_education' THEN ARRAY[
        'qualification_type', 'specialisation', 'institution', 'university',
        'year_of_passing', 'grade_type', 'grade_value', 'mode',
        'roll_number', 'is_provisional'
      ]

      WHEN 'employee_certifications_v2' THEN ARRAY[
        'name', 'issuing_body', 'issue_date', 'expiry_date',
        'certification_id', 'verification_url'
      ]

      WHEN 'employee_employment_history' THEN ARRAY[
        'employer_name', 'designation', 'start_date', 'end_date',
        'reason_for_leaving', 'last_drawn_salary'
      ]

      WHEN 'employee_nominees' THEN ARRAY[
        'full_name', 'relationship', 'date_of_birth', 'address', 'mobile',
        'allocation_percentage', 'guardian_name', 'guardian_relationship'
      ]

      WHEN 'employee_dependents' THEN ARRAY[
        'name', 'relationship', 'date_of_birth', 'gender'
      ]

      ELSE ARRAY[]::TEXT[]
    END
  );
$$;

COMMENT ON FUNCTION public.correction_allowed_field(TEXT, TEXT) IS
  'Server-side allowlist of (table, column) pairs an employee may request '
  'a correction for. Sole authorization boundary for approve_correction(); '
  'must be updated here (not just in the frontend FIELD_MAP) to add a new '
  'correctable field.';

CREATE OR REPLACE FUNCTION public.approve_correction(
  p_request_id UUID,
  p_comments   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req          public.correction_requests%ROWTYPE;

  v_allowed_flat TEXT[] := ARRAY[
    'employees',
    'employee_personal_details',
    'employee_contact_details',
    'employee_employment_details',
    'employee_financial_details',
    'employee_govt_ids',
    'employee_emergency_contacts',
    'employee_additional_details',
    'employee_health_info'
  ];

  v_allowed_section TEXT[] := ARRAY[
    'employee_education',
    'employee_certifications_v2',
    'employee_employment_history',
    'employee_nominees',
    'employee_dependents'
  ];

  v_is_section_op BOOLEAN;
  v_col_type      TEXT;
  v_new_json      JSONB;
  v_old_json      JSONB;
  v_values        JSONB;
  v_record_id     UUID;
  v_col_list      TEXT;
  v_val_list      TEXT;
  v_set_list      TEXT;
  v_rec           RECORD;
  v_date_val      DATE;
  v_sql           TEXT;
BEGIN
  -- ── Auth check ────────────────────────────────────────────────────────────
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'hr_manager')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- ── Fetch & validate request ──────────────────────────────────────────────
  SELECT * INTO v_req FROM public.correction_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is not pending');
  END IF;

  -- ── Classify request type ─────────────────────────────────────────────────
  v_is_section_op := v_req.field_name IN (
    '__section_edit__', '__section_add__', '__section_delete__', '__section__'
  );

  -- ── Table whitelist validation ────────────────────────────────────────────
  IF v_req.table_name IS NOT NULL THEN
    IF v_is_section_op THEN
      IF NOT (v_req.table_name = ANY(v_allowed_section)) THEN
        RETURN jsonb_build_object('success', false, 'error',
          'Invalid section table: ' || v_req.table_name);
      END IF;
    ELSE
      IF NOT (v_req.table_name = ANY(v_allowed_flat)) THEN
        RETURN jsonb_build_object('success', false, 'error',
          'Invalid table name: ' || v_req.table_name);
      END IF;
    END IF;
  END IF;

  -- ── Column allowlist validation (flat-field correction only; section
  -- add/edit filter disallowed columns per-key inside their loops below) ────
  IF NOT v_is_section_op
     AND v_req.table_name IS NOT NULL
     AND NOT public.correction_allowed_field(v_req.table_name, v_req.field_name)
  THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Field is not permitted for correction: ' || v_req.table_name || '.' || v_req.field_name);
  END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- BRANCH A — Section ADD: insert a new multi-entry record
  -- ════════════════════════════════════════════════════════════════════════════
  IF v_req.field_name = '__section_add__' THEN
    IF v_req.table_name IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Missing table_name for section add');
    END IF;

    BEGIN
      v_new_json := v_req.new_value::JSONB;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Malformed JSON in new_value for section add');
    END;

    v_values := v_new_json -> 'values';
    IF v_values IS NULL OR jsonb_typeof(v_values) != 'object' THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Missing or invalid values in new_value for section add');
    END IF;

    -- Build INSERT column + value lists
    v_col_list := 'employee_id';
    v_val_list := quote_literal(v_req.employee_id::TEXT) || '::uuid';

    FOR v_rec IN SELECT key, value FROM jsonb_each_text(v_values) LOOP
      -- Column allowlist: silently drop any key outside the documented
      -- allowlist for this table (e.g. id, employee_id, created_at,
      -- updated_at, or anything else not explicitly permitted).
      IF NOT public.correction_allowed_field(v_req.table_name, v_rec.key) THEN
        CONTINUE;
      END IF;

      SELECT data_type INTO v_col_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = v_req.table_name
        AND column_name  = v_rec.key;

      IF NOT FOUND THEN CONTINUE; END IF;

      IF v_rec.value IS NULL OR trim(v_rec.value) = '' THEN CONTINUE; END IF;

      v_col_list := v_col_list || ', ' || quote_ident(v_rec.key);

      IF v_col_type = 'date' THEN
        BEGIN
          v_date_val := public.safe_parse_date(v_rec.value);
          v_val_list := v_val_list || ', ' || quote_literal(v_date_val::TEXT) || '::date';
        EXCEPTION WHEN OTHERS THEN
          RETURN jsonb_build_object('success', false, 'error',
            'Invalid date for field ' || v_rec.key || ': ' || v_rec.value);
        END;
      ELSE
        v_val_list := v_val_list || ', ' || quote_literal(v_rec.value);
      END IF;
    END LOOP;

    BEGIN
      EXECUTE format(
        'INSERT INTO public.%I (%s) VALUES (%s)',
        v_req.table_name, v_col_list, v_val_list
      );
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error',
        'DB insert failed for section add: ' || SQLERRM);
    END;

  -- ════════════════════════════════════════════════════════════════════════════
  -- BRANCH B — Section EDIT / legacy: update an existing multi-entry record
  -- ════════════════════════════════════════════════════════════════════════════
  ELSIF v_req.field_name IN ('__section_edit__', '__section__') THEN
    IF v_req.table_name IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Missing table_name for section edit');
    END IF;

    BEGIN
      v_old_json := v_req.old_value::JSONB;
      v_new_json := v_req.new_value::JSONB;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Malformed JSON in old_value/new_value for section edit');
    END;

    BEGIN
      v_record_id := (v_old_json ->> 'recordId')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_record_id := NULL;
    END;

    IF v_record_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Cannot apply section edit: recordId is missing in old_value');
    END IF;

    v_values := v_new_json -> 'values';
    IF v_values IS NULL OR jsonb_typeof(v_values) != 'object' THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Missing or invalid values in new_value for section edit');
    END IF;

    v_set_list := '';

    FOR v_rec IN SELECT key, value FROM jsonb_each_text(v_values) LOOP
      -- Column allowlist: silently drop any key outside the documented
      -- allowlist (this is what prevents e.g. `employee_id` being
      -- re-pointed to a different employee via a crafted section edit).
      IF NOT public.correction_allowed_field(v_req.table_name, v_rec.key) THEN
        CONTINUE;
      END IF;

      SELECT data_type INTO v_col_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = v_req.table_name
        AND column_name  = v_rec.key;

      IF NOT FOUND THEN CONTINUE; END IF;

      IF v_set_list <> '' THEN v_set_list := v_set_list || ', '; END IF;

      IF v_col_type = 'date' THEN
        IF v_rec.value IS NULL OR trim(v_rec.value) = '' THEN
          v_set_list := v_set_list || quote_ident(v_rec.key) || ' = NULL';
        ELSE
          BEGIN
            v_date_val := public.safe_parse_date(v_rec.value);
            v_set_list := v_set_list
              || quote_ident(v_rec.key) || ' = '
              || quote_literal(v_date_val::TEXT) || '::date';
          EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error',
              'Invalid date for field ' || v_rec.key || ': ' || v_rec.value);
          END;
        END IF;
      ELSE
        v_set_list := v_set_list
          || quote_ident(v_rec.key) || ' = '
          || quote_literal(COALESCE(v_rec.value, ''));
      END IF;
    END LOOP;

    IF v_set_list = '' THEN
      RETURN jsonb_build_object('success', false, 'error',
        'No valid fields to update in section edit');
    END IF;

    v_set_list := v_set_list || ', updated_at = now()';

    BEGIN
      EXECUTE format(
        'UPDATE public.%I SET %s WHERE id = $1 AND employee_id = $2',
        v_req.table_name, v_set_list
      ) USING v_record_id, v_req.employee_id;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error',
        'DB update failed for section edit: ' || SQLERRM);
    END;

  -- ════════════════════════════════════════════════════════════════════════════
  -- BRANCH C — Section DELETE: remove an existing multi-entry record
  -- ════════════════════════════════════════════════════════════════════════════
  ELSIF v_req.field_name = '__section_delete__' THEN
    IF v_req.table_name IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Missing table_name for section delete');
    END IF;

    BEGIN
      v_old_json := v_req.old_value::JSONB;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Malformed JSON in old_value for section delete');
    END;

    BEGIN
      v_record_id := (v_old_json ->> 'recordId')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_record_id := NULL;
    END;

    IF v_record_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Cannot apply section delete: recordId is missing in old_value');
    END IF;

    BEGIN
      EXECUTE format(
        'DELETE FROM public.%I WHERE id = $1 AND employee_id = $2',
        v_req.table_name
      ) USING v_record_id, v_req.employee_id;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error',
        'DB delete failed for section delete: ' || SQLERRM);
    END;

  -- ════════════════════════════════════════════════════════════════════════════
  -- BRANCH D — Flat field correction
  -- ════════════════════════════════════════════════════════════════════════════
  ELSIF v_req.table_name IS NOT NULL THEN
    -- Column allowlist already validated above for the flat-field case;
    -- re-detect the column's data type for casting purposes.
    SELECT data_type INTO v_col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = v_req.table_name
      AND column_name  = v_req.field_name;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Column ' || v_req.field_name || ' not found in table ' || v_req.table_name);
    END IF;

    IF v_col_type = 'date' THEN
      BEGIN
        v_date_val := public.safe_parse_date(v_req.new_value);
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error',
          'Invalid date format for ' || v_req.field_name
          || ': ' || COALESCE(v_req.new_value, 'null'));
      END;

      IF v_req.table_name = 'employees' THEN
        v_sql := format(
          'UPDATE public.employees SET %I = $1::date, updated_at = now() WHERE id = $2',
          v_req.field_name
        );
      ELSE
        v_sql := format(
          'UPDATE public.%I SET %I = $1::date, updated_at = now() WHERE employee_id = $2',
          v_req.table_name, v_req.field_name
        );
      END IF;

      BEGIN
        EXECUTE v_sql USING v_date_val::TEXT, v_req.employee_id;
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error',
          'DB update failed for ' || v_req.field_name || ': ' || SQLERRM);
      END;

    ELSE
      IF v_req.table_name = 'employees' THEN
        v_sql := format(
          'UPDATE public.employees SET %I = $1, updated_at = now() WHERE id = $2',
          v_req.field_name
        );
      ELSE
        v_sql := format(
          'UPDATE public.%I SET %I = $1, updated_at = now() WHERE employee_id = $2',
          v_req.table_name, v_req.field_name
        );
      END IF;

      BEGIN
        EXECUTE v_sql USING v_req.new_value, v_req.employee_id;
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error',
          'DB update failed for ' || v_req.field_name || ': ' || SQLERRM);
      END;
    END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- BRANCH E — table_name IS NULL: field was not mapped, skip DB update
  -- ════════════════════════════════════════════════════════════════════════════
  ELSE
    NULL;
  END IF;

  -- ── Mark approved ─────────────────────────────────────────────────────────
  UPDATE public.correction_requests SET
    status      = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    comments    = COALESCE(p_comments, comments)
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_correction(UUID, TEXT) TO authenticated;
