-- ============================================================
-- 20260828000003_pii_encryption_functions.sql
--
-- PHASE 3 — Encryption/decryption functions, and PHASE 4 support (presence
-- views so the browser can learn "does this field have a value" without
-- ever receiving plaintext OR ciphertext).
--
-- Design constraints (per the approved security requirements):
--   - Key comes only from Vault, via _get_encryption_key() below.
--   - Callers never supply table/column identifiers — every function uses
--     a fixed CASE over the 15 approved field keys; there is no dynamic
--     SQL built from a client-supplied identifier anywhere in this file.
--   - Authorization (ownership OR admin/hr_manager) is checked INSIDE
--     each function, mirroring the same has_role()/employees.user_id
--     rules already enforced elsewhere (prevent_employee_protected_field_
--     bypass, approve_correction).
--   - Narrow, field-specific/allowlisted operations — no generic "encrypt
--     any column of any table" RPC is exposed to authenticated/anon.
-- ============================================================

-- ── Internal: fetch the raw key material for a version ──────────────────────
-- REVOKEd from PUBLIC/authenticated/anon below. Only reachable from other
-- SECURITY DEFINER functions in this file, which — being owned by the
-- migration-running role — execute with that role's privileges and so can
-- call this regardless of grants (the same trust boundary already used by
-- every other SECURITY DEFINER function in this schema).
CREATE OR REPLACE FUNCTION public._pii_get_key(p_version SMALLINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_name TEXT;
  v_key         TEXT;
BEGIN
  SELECT vault_secret_name INTO v_secret_name
  FROM public.encryption_key_versions
  WHERE version = p_version;

  IF v_secret_name IS NULL THEN
    RAISE EXCEPTION 'Unknown encryption key version';
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = v_secret_name;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key material not found in Vault';
  END IF;

  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public._pii_get_key(SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._pii_get_key(SMALLINT) FROM authenticated, anon;

-- ── Internal: active key version ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._pii_active_key_version()
RETURNS SMALLINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT version FROM public.encryption_key_versions WHERE is_active = true ORDER BY version DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._pii_active_key_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._pii_active_key_version() FROM authenticated, anon;

-- ── Internal: NULL-safe encrypt/decrypt primitives ───────────────────────────
CREATE OR REPLACE FUNCTION public._pii_encrypt(p_plaintext TEXT, p_version SMALLINT)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_plaintext IS NULL OR p_plaintext = '' THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_encrypt(p_plaintext, public._pii_get_key(p_version));
END;
$$;

REVOKE ALL ON FUNCTION public._pii_encrypt(TEXT, SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._pii_encrypt(TEXT, SMALLINT) FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public._pii_decrypt(p_ciphertext BYTEA, p_version SMALLINT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ciphertext IS NULL OR p_version IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(p_ciphertext, public._pii_get_key(p_version));
END;
$$;

REVOKE ALL ON FUNCTION public._pii_decrypt(BYTEA, SMALLINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._pii_decrypt(BYTEA, SMALLINT) FROM authenticated, anon;

-- ── Internal: is the caller authorized for this employee's protected fields ──
-- Mirrors the existing trust model exactly:
--   - admin/hr_manager: full access (same as prevent_employee_protected_
--     field_bypass's v_privileged check, and adminOverride's existing
--     direct-write path).
--   - the employee themself: read-only for reveal purposes (these 15
--     fields are all correction-required, i.e. NOT direct-editable by the
--     employee even today — see 20260827000001's v_protected arrays — so
--     "owner" authorization below only ever applies to *decrypt*, never
--     to *encrypt_and_store*).
CREATE OR REPLACE FUNCTION public._pii_is_owner_or_staff(p_employee_id UUID, OUT is_owner BOOLEAN, OUT is_staff_caller BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  is_staff_caller := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager');
  is_owner := EXISTS (
    SELECT 1 FROM public.employees WHERE id = p_employee_id AND user_id = auth.uid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public._pii_is_owner_or_staff(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._pii_is_owner_or_staff(UUID) FROM authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 5 — decrypt_employee_field(): the ONLY way plaintext for one of the
-- 15 fields reaches an application caller for a live employee row.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.decrypt_employee_field(
  p_employee_id UUID,
  p_field_key   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner    BOOLEAN;
  v_staff    BOOLEAN;
  v_cipher   BYTEA;
  v_version  SMALLINT;
  v_plain    TEXT;
BEGIN
  SELECT is_owner, is_staff_caller INTO v_owner, v_staff
  FROM public._pii_is_owner_or_staff(p_employee_id);

  IF NOT (v_owner OR v_staff) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Fixed CASE over the 15 approved field keys — no client-supplied table
  -- or column identifier is ever used to build SQL.
  CASE p_field_key
    WHEN 'aadhaar_number' THEN
      SELECT aadhaar_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_govt_ids WHERE employee_id = p_employee_id;
    WHEN 'uan_number' THEN
      SELECT uan_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_govt_ids WHERE employee_id = p_employee_id;
    WHEN 'passport_number' THEN
      SELECT passport_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_govt_ids WHERE employee_id = p_employee_id;
    WHEN 'driving_license' THEN
      SELECT driving_license_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_govt_ids WHERE employee_id = p_employee_id;
    WHEN 'voter_id' THEN
      SELECT voter_id_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_govt_ids WHERE employee_id = p_employee_id;

    WHEN 'pan_number' THEN
      SELECT pan_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_financial_details WHERE employee_id = p_employee_id;
    WHEN 'bank_account_number' THEN
      SELECT bank_account_number_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_financial_details WHERE employee_id = p_employee_id;
    WHEN 'ifsc_code' THEN
      SELECT ifsc_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_financial_details WHERE employee_id = p_employee_id;
    WHEN 'upi_id' THEN
      SELECT upi_id_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_financial_details WHERE employee_id = p_employee_id;
    WHEN 'pf_account' THEN
      SELECT pf_account_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_financial_details WHERE employee_id = p_employee_id;
    WHEN 'esic_number' THEN
      SELECT esic_number_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_financial_details WHERE employee_id = p_employee_id;
    WHEN 'ctc' THEN
      SELECT ctc_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_financial_details WHERE employee_id = p_employee_id;

    WHEN 'disability_status' THEN
      SELECT disability_status_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_health_info WHERE employee_id = p_employee_id;
    WHEN 'chronic_conditions' THEN
      SELECT chronic_conditions_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_health_info WHERE employee_id = p_employee_id;
    WHEN 'allergies' THEN
      SELECT allergies_encrypted, encryption_key_version INTO v_cipher, v_version
      FROM public.employee_health_info WHERE employee_id = p_employee_id;

    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Field is not an encrypted PII field');
  END CASE;

  v_plain := public._pii_decrypt(v_cipher, v_version);

  -- Audit the reveal — field name only, never the value. Matches existing
  -- behavior: an owner viewing their own data is never audited (only a
  -- non-owner, i.e. staff, revealing someone else's data is).
  IF NOT v_owner THEN
    INSERT INTO public.audit_logs (
      actor_user_id, user_email, action, entity_type, entity_id, metadata, success, source
    ) VALUES (
      auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      'sensitive_data.revealed',
      'Employee',
      p_employee_id,
      jsonb_build_object('field', p_field_key),
      true,
      'rpc'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'value', v_plain);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrypt_employee_field(UUID, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- encrypt_and_store_employee_field(): the write side, used by the admin
-- direct-override path (EmployeeService.adminOverride). Employees cannot
-- call this to write their own data — all 15 fields are correction-
-- required today (prevent_employee_protected_field_bypass's v_protected
-- arrays), so this mirrors that: only admin/hr_manager may write.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.encrypt_and_store_employee_field(
  p_employee_id UUID,
  p_field_key   TEXT,
  p_plaintext   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff   BOOLEAN;
  v_version SMALLINT;
  v_cipher  BYTEA;
BEGIN
  v_staff := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager');
  IF NOT v_staff THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Employee not found');
  END IF;

  v_version := public._pii_active_key_version();
  v_cipher  := public._pii_encrypt(p_plaintext, v_version);

  CASE p_field_key
    WHEN 'aadhaar_number' THEN
      UPDATE public.employee_govt_ids SET aadhaar_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'uan_number' THEN
      UPDATE public.employee_govt_ids SET uan_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'passport_number' THEN
      UPDATE public.employee_govt_ids SET passport_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'driving_license' THEN
      UPDATE public.employee_govt_ids SET driving_license_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'voter_id' THEN
      UPDATE public.employee_govt_ids SET voter_id_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;

    WHEN 'pan_number' THEN
      UPDATE public.employee_financial_details SET pan_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'bank_account_number' THEN
      UPDATE public.employee_financial_details SET bank_account_number_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'ifsc_code' THEN
      UPDATE public.employee_financial_details SET ifsc_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'upi_id' THEN
      UPDATE public.employee_financial_details SET upi_id_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'pf_account' THEN
      UPDATE public.employee_financial_details SET pf_account_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'esic_number' THEN
      UPDATE public.employee_financial_details SET esic_number_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'ctc' THEN
      UPDATE public.employee_financial_details SET ctc_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;

    WHEN 'disability_status' THEN
      UPDATE public.employee_health_info SET disability_status_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'chronic_conditions' THEN
      UPDATE public.employee_health_info SET chronic_conditions_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;
    WHEN 'allergies' THEN
      UPDATE public.employee_health_info SET allergies_encrypted = v_cipher, encryption_key_version = v_version, updated_at = now() WHERE employee_id = p_employee_id;

    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Field is not an encrypted PII field');
  END CASE;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.encrypt_and_store_employee_field(UUID, TEXT, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 8 support — encrypt_correction_values(): called by
-- CorrectionService.submit() so old_value/new_value are NEVER written to
-- correction_requests as plaintext for these 15 fields. Any authenticated
-- user may call this (it does not touch any employee row — it's a pure
-- transform used only to prepare the caller's OWN submission), but the
-- field_key must be one of the 15 approved keys.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.encrypt_correction_values(
  p_field_key  TEXT,
  p_old_value  TEXT,
  p_new_value  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version SMALLINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_field_key NOT IN (
    'aadhaar_number', 'uan_number', 'passport_number', 'driving_license', 'voter_id',
    'pan_number', 'bank_account_number', 'ifsc_code', 'upi_id', 'pf_account', 'esic_number', 'ctc',
    'disability_status', 'chronic_conditions', 'allergies'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Field is not an encrypted PII field');
  END IF;

  v_version := public._pii_active_key_version();

  RETURN jsonb_build_object(
    'success', true,
    'key_version', v_version,
    'old_value_encrypted', encode(public._pii_encrypt(p_old_value, v_version), 'base64'),
    'new_value_encrypted', encode(public._pii_encrypt(p_new_value, v_version), 'base64')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.encrypt_correction_values(TEXT, TEXT, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- decrypt_correction_value(): admin-review-only decrypt for an encrypted
-- old_value/new_value sitting in correction_requests. Staff-gated the same
-- way approve_correction()/reject_correction() are.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.decrypt_correction_value(
  p_request_id UUID,
  p_which      TEXT -- 'old' | 'new'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req    public.correction_requests%ROWTYPE;
  v_cipher BYTEA;
  v_plain  TEXT;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_manager')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_which NOT IN ('old', 'new') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid selector');
  END IF;

  SELECT * INTO v_req FROM public.correction_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.encryption_key_version IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This request does not hold an encrypted value');
  END IF;

  BEGIN
    v_cipher := decode(CASE WHEN p_which = 'old' THEN v_req.old_value ELSE v_req.new_value END, 'base64');
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Malformed stored ciphertext');
  END;

  v_plain := public._pii_decrypt(v_cipher, v_req.encryption_key_version);

  INSERT INTO public.audit_logs (
    actor_user_id, user_email, action, entity_type, entity_id, metadata, success, source
  ) VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'sensitive_data.revealed',
    'Correction',
    v_req.employee_id,
    jsonb_build_object('field', v_req.field_name, 'table', v_req.table_name, 'context', 'correction_request'),
    true,
    'rpc'
  );

  RETURN jsonb_build_object('success', true, 'value', v_plain);
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrypt_correction_value(UUID, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 4 support — presence views. Expose ONLY "does a value exist" per
-- encrypted field, never plaintext, never ciphertext. security_invoker
-- ensures RLS is evaluated as the querying role (Postgres 15+, matching
-- this project's Supabase runtime), not the view owner — same access
-- boundary as querying the base table directly.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.employee_financial_details_pii_presence
WITH (security_invoker = true) AS
SELECT
  employee_id,
  pan_encrypted IS NOT NULL                 AS pan_number_has_value,
  bank_account_number_encrypted IS NOT NULL AS bank_account_number_has_value,
  ifsc_encrypted IS NOT NULL                AS ifsc_code_has_value,
  upi_id_encrypted IS NOT NULL              AS upi_id_has_value,
  pf_account_encrypted IS NOT NULL          AS pf_account_has_value,
  esic_number_encrypted IS NOT NULL         AS esic_number_has_value,
  ctc_encrypted IS NOT NULL                 AS ctc_has_value
FROM public.employee_financial_details;

CREATE OR REPLACE VIEW public.employee_govt_ids_pii_presence
WITH (security_invoker = true) AS
SELECT
  employee_id,
  aadhaar_encrypted IS NOT NULL         AS aadhaar_number_has_value,
  uan_encrypted IS NOT NULL             AS uan_number_has_value,
  passport_encrypted IS NOT NULL        AS passport_number_has_value,
  driving_license_encrypted IS NOT NULL AS driving_license_has_value,
  voter_id_encrypted IS NOT NULL        AS voter_id_has_value
FROM public.employee_govt_ids;

CREATE OR REPLACE VIEW public.employee_health_info_pii_presence
WITH (security_invoker = true) AS
SELECT
  employee_id,
  disability_status_encrypted IS NOT NULL  AS disability_status_has_value,
  chronic_conditions_encrypted IS NOT NULL AS chronic_conditions_has_value,
  allergies_encrypted IS NOT NULL          AS allergies_has_value
FROM public.employee_health_info;

GRANT SELECT ON public.employee_financial_details_pii_presence TO authenticated;
GRANT SELECT ON public.employee_govt_ids_pii_presence TO authenticated;
GRANT SELECT ON public.employee_health_info_pii_presence TO authenticated;

COMMENT ON VIEW public.employee_financial_details_pii_presence IS
  'Presence-only view (has-value booleans, never plaintext or ciphertext) for the 7 encrypted financial fields. security_invoker=true so the base table''s existing RLS applies to the querying role, same as querying the table directly.';
COMMENT ON VIEW public.employee_govt_ids_pii_presence IS
  'Presence-only view for the 5 encrypted government-ID fields. See employee_financial_details_pii_presence for the security_invoker rationale.';
COMMENT ON VIEW public.employee_health_info_pii_presence IS
  'Presence-only view for the 3 encrypted health fields. See employee_financial_details_pii_presence for the security_invoker rationale.';
