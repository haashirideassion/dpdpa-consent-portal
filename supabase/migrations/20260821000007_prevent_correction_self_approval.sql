-- ============================================================
-- 20260821000007_prevent_correction_self_approval.sql
-- SECURITY FIX (P1 #7): "correction_employee_own" is a FOR ALL policy
-- (USING is_authorized_employee(employee_id)), so an employee can
-- directly UPDATE their own correction_requests row — including
-- flipping status to 'approved'/'rejected' and setting reviewed_by/
-- reviewed_at/comments themselves, bypassing approve_correction()/
-- reject_correction() entirely. This falsifies the review trail even
-- though it does not, by itself, apply the underlying field change
-- (that only happens inside the RPCs' dynamic EXECUTE).
--
-- Fix: a BEFORE UPDATE trigger blocks any change to status,
-- reviewed_by, reviewed_at, or comments UNLESS it happens from inside
-- approve_correction()/reject_correction() themselves (flagged via a
-- transaction-local setting those RPCs set right before their own
-- status-setting UPDATE). This applies to every actor, including
-- admin/hr_manager acting outside the RPCs — approve_correction() and
-- reject_correction() remain the sole authoritative workflow, as
-- required.
--
-- No existing RLS policy on correction_requests is changed.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_correction_workflow_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    NEW.status      IS DISTINCT FROM OLD.status OR
    NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR
    NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR
    NEW.comments    IS DISTINCT FROM OLD.comments
  ) AND current_setting('app.correction_workflow_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION
      'status, reviewed_by, reviewed_at, and comments can only be changed via approve_correction()/reject_correction()';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_correction_workflow_tampering ON public.correction_requests;
CREATE TRIGGER trg_prevent_correction_workflow_tampering
  BEFORE UPDATE ON public.correction_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_correction_workflow_tampering();

-- ── Re-point approve_correction()/reject_correction() through the bypass ────
-- Identical to 20260821000004's version, with one addition: set the
-- transaction-local flag immediately before the final status-setting
-- UPDATE so the trigger above permits it.

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
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'hr_manager')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_req FROM public.correction_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is not pending');
  END IF;

  v_is_section_op := v_req.field_name IN (
    '__section_edit__', '__section_add__', '__section_delete__', '__section__'
  );

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

  IF NOT v_is_section_op
     AND v_req.table_name IS NOT NULL
     AND NOT public.correction_allowed_field(v_req.table_name, v_req.field_name)
  THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Field is not permitted for correction: ' || v_req.table_name || '.' || v_req.field_name);
  END IF;

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

    v_col_list := 'employee_id';
    v_val_list := quote_literal(v_req.employee_id::TEXT) || '::uuid';

    FOR v_rec IN SELECT key, value FROM jsonb_each_text(v_values) LOOP
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

  ELSIF v_req.table_name IS NOT NULL THEN
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

  ELSE
    NULL;
  END IF;

  -- Allow the workflow-tampering trigger to permit this transaction's
  -- status/reviewer write; local to this transaction only.
  PERFORM set_config('app.correction_workflow_rpc', 'on', true);

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

CREATE OR REPLACE FUNCTION public.reject_correction(
  p_request_id UUID,
  p_comments   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'hr_manager')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  PERFORM set_config('app.correction_workflow_rpc', 'on', true);

  UPDATE public.correction_requests SET
    status      = 'rejected',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    comments    = p_comments
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_correction(UUID, TEXT) TO authenticated;
