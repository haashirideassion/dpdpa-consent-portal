-- ============================================================
-- 20260828000002_pii_encrypted_columns.sql
--
-- PHASE 2 — Encrypted storage, added ALONGSIDE the existing plaintext
-- columns. Nothing is dropped or renamed here (see Phase 16 — plaintext
-- columns are only dropped in a later, separate, explicitly-approved
-- migration after backfill + soak verification).
--
-- Naming convention: <original_column>_encrypted (BYTEA — pgcrypto's
-- pgp_sym_encrypt() returns bytea; storing it natively avoids a base64
-- round-trip on every read/write inside Postgres). Each of the 3 tables
-- gets one shared `encryption_key_version` column (not per-field) — every
-- encrypted field on a given row is (re-)written under the row's current
-- active key version at time of write, which is enough to support
-- versioned rotation without per-column version bookkeeping overhead.
--
-- NULL behavior is preserved by construction: these columns default to
-- NULL and are only ever populated by the encryption RPCs in
-- 20260828000003, which are NULL-safe (NULL/empty plaintext in → NULL
-- ciphertext out, never an encrypted empty string standing in for "no
-- value").
-- ============================================================

-- ── employee_financial_details: pan, bank_account_number, ifsc, upi_id, pf_account, esic_number, ctc
ALTER TABLE public.employee_financial_details
  ADD COLUMN IF NOT EXISTS pan_encrypted                 BYTEA,
  ADD COLUMN IF NOT EXISTS bank_account_number_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS ifsc_encrypted                BYTEA,
  ADD COLUMN IF NOT EXISTS upi_id_encrypted              BYTEA,
  ADD COLUMN IF NOT EXISTS pf_account_encrypted          BYTEA,
  ADD COLUMN IF NOT EXISTS esic_number_encrypted         BYTEA,
  ADD COLUMN IF NOT EXISTS ctc_encrypted                 BYTEA,
  ADD COLUMN IF NOT EXISTS encryption_key_version        SMALLINT;

-- ── employee_govt_ids: aadhaar, uan, passport, driving_license, voter_id
-- (passport_expiry is a DATE, not in the encryption scope requested)
ALTER TABLE public.employee_govt_ids
  ADD COLUMN IF NOT EXISTS aadhaar_encrypted         BYTEA,
  ADD COLUMN IF NOT EXISTS uan_encrypted             BYTEA,
  ADD COLUMN IF NOT EXISTS passport_encrypted        BYTEA,
  ADD COLUMN IF NOT EXISTS driving_license_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS voter_id_encrypted        BYTEA,
  ADD COLUMN IF NOT EXISTS encryption_key_version    SMALLINT;

-- ── employee_health_info: disability_status, chronic_conditions, allergies
ALTER TABLE public.employee_health_info
  ADD COLUMN IF NOT EXISTS disability_status_encrypted  BYTEA,
  ADD COLUMN IF NOT EXISTS chronic_conditions_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS allergies_encrypted          BYTEA,
  ADD COLUMN IF NOT EXISTS encryption_key_version       SMALLINT;

-- ── correction_requests: carry the key version used to encrypt an
-- encrypted-field old_value/new_value at submission time, so
-- approve_correction() can copy it straight into the target table's
-- encryption_key_version without re-deriving it. NULL for
-- non-encrypted-field / section requests, same as today.
ALTER TABLE public.correction_requests
  ADD COLUMN IF NOT EXISTS encryption_key_version SMALLINT;

COMMENT ON COLUMN public.employee_financial_details.encryption_key_version IS
  'Key version (see public.encryption_key_versions) the *_encrypted columns on this row were last written under. NULL = no encrypted value has been written yet.';
COMMENT ON COLUMN public.employee_govt_ids.encryption_key_version IS
  'Key version (see public.encryption_key_versions) the *_encrypted columns on this row were last written under. NULL = no encrypted value has been written yet.';
COMMENT ON COLUMN public.employee_health_info.encryption_key_version IS
  'Key version (see public.encryption_key_versions) the *_encrypted columns on this row were last written under. NULL = no encrypted value has been written yet.';
COMMENT ON COLUMN public.correction_requests.encryption_key_version IS
  'Key version old_value/new_value were encrypted under, when field_name/table_name is one of the 15 encryption-scoped PII fields. NULL otherwise.';
