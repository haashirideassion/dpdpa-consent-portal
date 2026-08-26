-- ============================================================
-- 20260828000004_pii_encryption_correction_erasure_integration.sql
--
-- PHASE 8 (correction workflow) + PHASE 9 (erasure) wiring for the 15
-- encryption-scoped PII fields. Does NOT touch section-record branches
-- (__section_add__/__section_edit__/__section_delete__) in
-- approve_correction() — none of the 15 fields live in a multi-entry
-- section table (confirmed: they're all on employee_financial_details /
-- employee_govt_ids / employee_health_info, all flat one-row-per-employee
-- tables), so only the flat-field branch needs a change. The approval
-- state machine (pending → approved/rejected), correction.submitted/
-- approved/rejected audit actions, and the workflow-tampering trigger are
-- all unchanged.
-- ============================================================

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

  -- Fixed table.column allowlist for the 15 encryption-scoped fields
  -- (DB names, matching what's stored in correction_requests.table_name/
  -- field_name — see FIELD_MAP in employee.service.ts/correction.service.ts).
  -- Used ONLY to decide which branch to take below; never used to build a
  -- dynamic table/column reference beyond the already-validated
  -- v_req.field_name (which correction_allowed_field() must already permit).
  v_encrypted_cols TEXT[] := ARRAY[
    'employee_govt_ids.aadhaar',
    'employee_govt_ids.uan',
    'employee_govt_ids.passport',
    'employee_govt_ids.driving_license',
    'employee_govt_ids.voter_id',
    'employee_financial_details.pan',
    'employee_financial_details.bank_account_number',
    'employee_financial_details.ifsc',
    'employee_financial_details.upi_id',
    'employee_financial_details.pf_account',
    'employee_financial_details.esic_number',
    'employee_financial_details.ctc',
    'employee_health_info.disability_status',
    'employee_health_info.chronic_conditions',
    'employee_health_info.allergies'
  ];

  v_is_section_op BOOLEAN;
  v_is_encrypted  BOOLEAN;
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
  v_cipher        BYTEA;
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
    v_is_encrypted := (v_req.table_name || '.' || v_req.field_name) = ANY(v_encrypted_cols);

    IF v_is_encrypted THEN
      -- new_value/old_value already hold base64 ciphertext, produced by
      -- encrypt_correction_values() at submission time — this branch
      -- never sees or handles plaintext. The target *_encrypted column
      -- name is a fixed suffix appended to a field_name that has already
      -- passed BOTH the correction_allowed_field() allowlist check above
      -- AND membership in the hardcoded v_encrypted_cols array — never an
      -- arbitrary client-supplied identifier.
      BEGIN
        v_cipher := decode(v_req.new_value, 'base64');
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error',
          'Malformed encrypted value for ' || v_req.field_name);
      END;

      v_sql := format(
        'UPDATE public.%I SET %I = $1, encryption_key_version = $2, updated_at = now() WHERE employee_id = $3',
        v_req.table_name, v_req.field_name || '_encrypted'
      );

      BEGIN
        EXECUTE v_sql USING v_cipher, v_req.encryption_key_version, v_req.employee_id;
      EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error',
          'DB update failed for ' || v_req.field_name || ': ' || SQLERRM);
      END;

    ELSE
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

-- reject_correction() is unchanged (it never touches employee data, only
-- correction_requests.status) — no re-definition needed here.

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 9 — process_erasure_request(): for the 3 categories that contain
-- encryption-scoped fields (financial_details, government_ids,
-- health_information), also null the *_encrypted / encryption_key_version
-- columns:
--   eligible   → already nulls the whole row's plaintext columns; extend
--                to null the *_encrypted columns too.
--   anonymized → the plaintext columns are (unchanged) set to the fixed
--                'Redacted (DPDPA erasure)' constant, exactly as before;
--                the *_encrypted columns are set to NULL rather than an
--                encrypted copy of that constant, per Phase 9's
--                instruction not to write plaintext into (or fabricate a
--                new ciphertext for) an encrypted column during erasure.
--   retained   → unchanged, nothing touched.
-- Every other category/branch in this function is byte-for-byte identical
-- to 20260827000001 — only these 3 CASE branches changed.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.process_erasure_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req          RECORD;
  v_a            RECORD;
  v_employee_id  UUID;
  v_recipient    UUID;
  v_removed      TEXT[] := ARRAY[]::TEXT[];
  v_anonymized   TEXT[] := ARRAY[]::TEXT[];
  v_retained     TEXT[] := ARRAY[]::TEXT[];
  v_redacted     CONSTANT TEXT := 'Redacted (DPDPA erasure)';
BEGIN
  IF NOT public.is_staff() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_req FROM public.data_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.request_type <> 'erasure' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is not an erasure request');
  END IF;

  IF v_req.erasure_processed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request has already been processed');
  END IF;

  IF v_req.status NOT IN ('in_review', 'action_required') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request must be in review (with a recorded assessment) before it can be processed');
  END IF;

  IF v_req.employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request has no linked employee record to process');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.erasure_assessments WHERE request_id = p_request_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No retention assessment has been recorded yet');
  END IF;

  v_employee_id := v_req.employee_id;

  FOR v_a IN SELECT * FROM public.erasure_assessments WHERE request_id = p_request_id LOOP
    CASE v_a.category

      WHEN 'personal_details' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_personal_details SET
            dob = NULL, gender = NULL, blood_group = NULL, marital_status = NULL,
            nationality = NULL, father_name = NULL, mother_name = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_personal_details SET
            dob = NULL, gender = v_redacted, blood_group = v_redacted, marital_status = v_redacted,
            nationality = v_redacted, father_name = v_redacted, mother_name = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'contact_details' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_contact_details SET
            work_email = NULL, personal_email = NULL, phone = NULL, alternate_phone = NULL,
            current_address = NULL, permanent_address = NULL, city = NULL, state = NULL,
            pincode = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_contact_details SET
            work_email = v_redacted, personal_email = v_redacted, phone = v_redacted,
            alternate_phone = v_redacted, current_address = v_redacted, permanent_address = v_redacted,
            city = v_redacted, state = v_redacted, pincode = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'employment_details' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_employment_details SET
            department = NULL, designation = NULL, joining_date = NULL, employment_type = NULL,
            manager = NULL, work_location = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_employment_details SET
            department = v_redacted, designation = v_redacted, joining_date = NULL,
            employment_type = v_redacted, manager = v_redacted, work_location = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'financial_details' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_financial_details SET
            bank_name = NULL, bank_account_number = NULL, ifsc = NULL, pan = NULL, ctc = NULL,
            bank_branch = NULL, upi_id = NULL, pf_account = NULL, esic_number = NULL,
            pan_encrypted = NULL, bank_account_number_encrypted = NULL, ifsc_encrypted = NULL,
            upi_id_encrypted = NULL, pf_account_encrypted = NULL, esic_number_encrypted = NULL,
            ctc_encrypted = NULL, encryption_key_version = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_financial_details SET
            bank_name = v_redacted, bank_account_number = v_redacted, ifsc = v_redacted,
            pan = v_redacted, ctc = v_redacted, bank_branch = v_redacted, upi_id = v_redacted,
            pf_account = v_redacted, esic_number = v_redacted,
            pan_encrypted = NULL, bank_account_number_encrypted = NULL, ifsc_encrypted = NULL,
            upi_id_encrypted = NULL, pf_account_encrypted = NULL, esic_number_encrypted = NULL,
            ctc_encrypted = NULL, encryption_key_version = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'government_ids' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_govt_ids SET
            aadhaar = NULL, uan = NULL, passport = NULL, passport_expiry = NULL,
            driving_license = NULL, voter_id = NULL,
            aadhaar_encrypted = NULL, uan_encrypted = NULL, passport_encrypted = NULL,
            driving_license_encrypted = NULL, voter_id_encrypted = NULL,
            encryption_key_version = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_govt_ids SET
            aadhaar = v_redacted, uan = v_redacted, passport = v_redacted, passport_expiry = NULL,
            driving_license = v_redacted, voter_id = v_redacted,
            aadhaar_encrypted = NULL, uan_encrypted = NULL, passport_encrypted = NULL,
            driving_license_encrypted = NULL, voter_id_encrypted = NULL,
            encryption_key_version = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'health_information' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_health_info SET
            disability_status = NULL, chronic_conditions = NULL, allergies = NULL,
            disability_status_encrypted = NULL, chronic_conditions_encrypted = NULL,
            allergies_encrypted = NULL, encryption_key_version = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_health_info SET
            disability_status = v_redacted, chronic_conditions = v_redacted, allergies = v_redacted,
            disability_status_encrypted = NULL, chronic_conditions_encrypted = NULL,
            allergies_encrypted = NULL, encryption_key_version = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'additional_details' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_additional_details SET
            qualifications = NULL, certifications = NULL, languages = NULL, notes = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_additional_details SET
            qualifications = v_redacted, certifications = v_redacted, languages = v_redacted,
            notes = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'emergency_contacts' THEN
        IF v_a.decision = 'eligible' THEN
          UPDATE public.employee_emergency_contacts SET
            contact_name = NULL, relation = NULL, contact_phone = NULL, contact_email = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_emergency_contacts SET
            contact_name = v_redacted, relation = v_redacted, contact_phone = v_redacted,
            contact_email = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'education' THEN
        IF v_a.decision = 'eligible' THEN
          DELETE FROM public.employee_education WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_education SET
            specialisation = v_redacted, institution = v_redacted, university = v_redacted,
            roll_number = v_redacted, grade_value = v_redacted, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'certifications' THEN
        IF v_a.decision = 'eligible' THEN
          DELETE FROM public.employee_certifications_v2 WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_certifications_v2 SET
            name = v_redacted, issuing_body = v_redacted, certification_id = v_redacted,
            verification_url = NULL, issue_date = NULL, expiry_date = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'employment_history' THEN
        IF v_a.decision = 'eligible' THEN
          DELETE FROM public.employee_employment_history WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_employment_history SET
            employer_name = v_redacted, designation = v_redacted, reason_for_leaving = v_redacted,
            last_drawn_salary = NULL, start_date = NULL, end_date = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'nominees_dependents' THEN
        IF v_a.decision = 'eligible' THEN
          DELETE FROM public.employee_nominees WHERE employee_id = v_employee_id;
          DELETE FROM public.employee_dependents WHERE employee_id = v_employee_id;
          v_removed := array_append(v_removed, v_a.category);
        ELSIF v_a.decision = 'anonymized' THEN
          UPDATE public.employee_nominees SET
            full_name = v_redacted, address = v_redacted, mobile = NULL, guardian_name = v_redacted,
            date_of_birth = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          UPDATE public.employee_dependents SET
            name = v_redacted, date_of_birth = NULL, updated_at = now()
          WHERE employee_id = v_employee_id;
          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      WHEN 'consent_information' THEN
        IF v_a.decision <> 'retained' THEN
          UPDATE public.consent_purpose_records SET ip_address = NULL, user_agent = NULL
          WHERE employee_id = v_employee_id;

          UPDATE public.consent_withdrawals SET reason = NULL
          WHERE employee_id = v_employee_id;

          v_anonymized := array_append(v_anonymized, v_a.category);
        ELSE
          v_retained := array_append(v_retained, v_a.category);
        END IF;

      ELSE
        NULL; -- unreachable: category is CHECK-constrained on the table
    END CASE;
  END LOOP;

  UPDATE public.data_requests SET
    erasure_processed_at = now(),
    erasure_processed_by = auth.uid()
  WHERE id = p_request_id;

  UPDATE public.erasure_assessments SET processed_at = now() WHERE request_id = p_request_id;

  INSERT INTO public.audit_logs (
    actor_user_id, user_email, action, entity_type, entity_id, metadata, success, source
  ) VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'dsr.erasure_processed',
    'DSR',
    p_request_id,
    jsonb_build_object(
      'removed_categories', to_jsonb(v_removed),
      'anonymized_categories', to_jsonb(v_anonymized),
      'retained_categories', to_jsonb(v_retained),
      'method', 'server_side_rpc'
    ),
    true,
    'rpc'
  );

  SELECT user_id INTO v_recipient FROM public.employees WHERE id = v_employee_id;
  IF v_recipient IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, actor_user_id, type, category, title, message, entity_type, entity_id, action_url
    ) VALUES (
      v_recipient,
      auth.uid(),
      'dsr.erasure_processed',
      'dsr.erasure_processed',
      'Your data removal request has been processed',
      'Information you were eligible to have removed has been removed or anonymized. ' ||
      CASE WHEN array_length(v_retained, 1) > 0
        THEN 'Some information has been retained due to legal, statutory, contractual, audit, or compliance requirements.'
        ELSE ''
      END,
      'dsr',
      p_request_id,
      '/'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'removed', to_jsonb(v_removed),
    'anonymized', to_jsonb(v_anonymized),
    'retained', to_jsonb(v_retained)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_erasure_request(UUID) TO authenticated;
