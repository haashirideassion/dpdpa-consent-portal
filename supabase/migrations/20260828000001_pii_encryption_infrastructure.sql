-- ============================================================
-- 20260828000001_pii_encryption_infrastructure.sql
--
-- PHASE 1 of the approved field-level encryption requirement
-- (Aadhaar/PAN/Passport/Driving License/Voter ID/UAN, Bank account/IFSC/
-- UPI/PF account/ESIC/CTC, Disability status/Chronic conditions/Allergies).
--
-- Sets up the encryption key material ONLY. No employee data table is
-- touched here (see 20260828000002 for the encrypted columns). The key
-- itself is stored in Supabase Vault (encrypted at rest, outside any
-- normal application table) and is NEVER readable by `authenticated` or
-- `anon` — only the SECURITY DEFINER helper functions defined in
-- 20260828000003 (owned by the migration-running role, effectively
-- postgres) can read it, and only because Postgres grants a role's own
-- SECURITY DEFINER functions superuser-equivalent access to objects that
-- role owns; `authenticated`/`anon` are never granted EXECUTE on the key
-- accessor itself.
--
-- Versioned from day one: `encryption_key_versions` lets a future key
-- rotation add a new version and re-point `is_active` without needing a
-- risky one-shot re-encryption migration — old ciphertext keeps
-- decrypting under the key version it was written with (see
-- encryption_key_version columns added in 20260828000002).
-- ============================================================

-- pgcrypto provides pgp_sym_encrypt/pgp_sym_decrypt used by the functions
-- in 20260828000003. Supabase projects ship this extension already
-- available; CREATE EXTENSION IF NOT EXISTS is a no-op if so.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Key version registry ────────────────────────────────────────────────────
-- Stores WHICH Vault secret backs each key version — never the key value
-- itself. `vault_secret_name` is looked up against vault.decrypted_secrets
-- only inside the locked-down helper functions in 20260828000003.
CREATE TABLE IF NOT EXISTS public.encryption_key_versions (
  version           SMALLINT PRIMARY KEY,
  vault_secret_name TEXT NOT NULL UNIQUE,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at        TIMESTAMPTZ
);

ALTER TABLE public.encryption_key_versions ENABLE ROW LEVEL SECURITY;

-- No one queries this table directly from the client — it carries no key
-- material, only version bookkeeping, but is still locked to staff so an
-- ordinary employee session can't enumerate key version metadata.
DROP POLICY IF EXISTS "encryption_key_versions_staff_only" ON public.encryption_key_versions;
CREATE POLICY "encryption_key_versions_staff_only"
  ON public.encryption_key_versions FOR SELECT
  USING (public.is_staff());

-- No INSERT/UPDATE/DELETE policy is defined for any role — rows are only
-- ever written by this migration (as the migration-running/superuser role,
-- which bypasses RLS) or by a future, explicitly-reviewed key-rotation
-- migration. Application roles (including staff) can read but never write.

-- ── Seed key version 1 ───────────────────────────────────────────────────────
-- Idempotent: only creates the secret + row the first time this migration
-- runs in a given environment. A random 256-bit key is generated with
-- pgcrypto's CSPRNG and stored ONLY in Vault (vault.create_secret) —
-- it is never selected back out in this migration, never logged, and
-- never appears in any RAISE/NOTICE.
DO $$
DECLARE
  v_secret_name CONSTANT TEXT := 'employee_pii_encryption_key_v1';
  v_key_hex     TEXT;
  v_secret_id   UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.encryption_key_versions WHERE version = 1
  ) THEN
    -- Only generate + store a new secret if one with this name doesn't
    -- already exist in Vault (defensive — avoids clobbering a key created
    -- out-of-band by an operator ahead of this migration).
    IF NOT EXISTS (
      SELECT 1 FROM vault.secrets WHERE name = v_secret_name
    ) THEN
      v_key_hex := encode(gen_random_bytes(32), 'hex');
      v_secret_id := vault.create_secret(
        v_key_hex,
        v_secret_name,
        'Symmetric key (v1) for employee PII field-level encryption (pgcrypto pgp_sym_encrypt/decrypt). Provisioned by 20260828000001. Rotate by adding a new key_version row + secret, never by editing this one in place.'
      );
    END IF;

    INSERT INTO public.encryption_key_versions (version, vault_secret_name, is_active)
    VALUES (1, v_secret_name, true);
  END IF;
END $$;

COMMENT ON TABLE public.encryption_key_versions IS
  'Registry of PII encryption key versions. Each row references a Vault '
  'secret by name only — the key VALUE is never stored here and is only '
  'readable via vault.decrypted_secrets, which itself is restricted to '
  'the SECURITY DEFINER functions in 20260828000003 (never granted to '
  'authenticated/anon). Rotation = insert a new version row + Vault '
  'secret, flip is_active, keep old versions readable for existing '
  'ciphertext.';
