-- ============================================================
-- 20260506000003_correction_workflow_v2.sql
-- Correction Workflow v2
--
-- Fixes:
--   1. father_name / mother_name not updating DB (table_name was NULL)
--   2. DOB approval fails with "column is of type date but expression is of type text"
--   3. Education/section corrections throw "Invalid table name"
--   4. Section corrections (add/edit) are now auto-applied instead of manual
--
-- Changes:
--   • Adds public.safe_parse_date() helper (multi-format date parser)
--   • Rewrites public.approve_correction() RPC to:
--       – support all PRD flat-field tables (incl. employee_health_info)
--       – detect column data type and cast dates properly
--       – handle __section_add__ → INSERT into relational table
--       – handle __section_edit__ / __section__ → UPDATE by record ID
--       – never mark approved when the DB update fails
-- ============================================================


-- ── 1. safe_parse_date helper ────────────────────────────────────────────────
-- Tries ISO first, then DD/MM/YYYY, DD-MM-YYYY. Raises if all fail.

CREATE OR REPLACE FUNCTION public.safe_parse_date(p_val TEXT)
RETURNS DATE
LANGUAGE plpgsql
AS $$
DECLARE
  v TEXT := trim(p_val);
BEGIN
  IF v IS NULL OR v = '' THEN
    RETURN NULL;
  END IF;

  -- ISO 8601: YYYY-MM-DD (most reliable, try first)
  BEGIN
    RETURN to_date(v, 'YYYY-MM-DD');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Indian/European: DD/MM/YYYY
  BEGIN
    RETURN to_date(v, 'DD/MM/YYYY');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- DD-MM-YYYY
  BEGIN
    RETURN to_date(v, 'DD-MM-YYYY');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- US: MM/DD/YYYY (last resort)
  BEGIN
    RETURN to_date(v, 'MM/DD/YYYY');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RAISE EXCEPTION 'Cannot parse date value: %', p_val;
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_parse_date(TEXT) TO authenticated;


-- ── 2. Rewrite approve_correction RPC ────────────────────────────────────────

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

  -- Whitelisted tables for simple flat-field corrections (UPDATE WHERE employee_id)
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

  -- Whitelisted tables for multi-entry section corrections (INSERT / UPDATE WHERE id)
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
  v_is_section_op := v_req.field_name IN ('__section_edit__', '__section_add__', '__section__');

  -- ── Whitelist validation ──────────────────────────────────────────────────
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
      -- Only include columns that actually exist in the target table
      SELECT data_type INTO v_col_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = v_req.table_name
        AND column_name  = v_rec.key;

      IF NOT FOUND THEN CONTINUE; END IF;

      -- Skip blank values
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

    -- Extract record ID from old_value JSON
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

    -- Build SET clause
    v_set_list := '';

    FOR v_rec IN SELECT key, value FROM jsonb_each_text(v_values) LOOP
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
  -- BRANCH C — Flat field correction
  -- ════════════════════════════════════════════════════════════════════════════
  ELSIF v_req.table_name IS NOT NULL THEN
    -- Detect column data type
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
      -- Parse with multi-format support
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
      -- All other types: pass as text (PostgreSQL will coerce as needed)
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
  -- BRANCH D — table_name IS NULL: field was not mapped, skip DB update
  -- (legacy requests submitted before FIELD_MAP was complete)
  -- ════════════════════════════════════════════════════════════════════════════
  ELSE
    -- No DB update possible; mark approved anyway so admins can still
    -- acknowledge and handle via manual profile edit if needed.
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
