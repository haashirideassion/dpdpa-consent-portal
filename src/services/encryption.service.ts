import { supabase } from "@/integrations/supabase/client";

/**
 * ENCRYPTION SERVICE
 *
 * Client-side gateway to the field-level PII encryption RPCs added in
 * supabase/migrations/20260828000003-4. This service NEVER handles a key —
 * there is no key on the client, ever. Every function here is a thin
 * wrapper around a SECURITY DEFINER Postgres RPC that does the actual
 * encrypt/decrypt server-side (pgcrypto + a Supabase Vault-stored key) and
 * enforces its own authorization (ownership or admin/hr_manager role)
 * independent of anything the client claims.
 *
 * See src/lib/dpdpa.ts ENCRYPTED_FIELDS for the canonical list of the 15
 * fields these RPCs apply to.
 */

interface RpcResult<T = unknown> {
  success: boolean;
  error?: string;
  value?: T;
}

export const EncryptionService = {
  /**
   * Decrypts one encrypted field for one employee. Called on:
   *  - owner auto-load (DataField effect, unaudited server-side — matches
   *    the existing "owner sees own data unmasked" policy)
   *  - admin/HR explicit reveal click (audited server-side as
   *    sensitive_data.revealed, field name only)
   * The RPC itself re-checks ownership/role — this call cannot be used to
   * read another employee's data no matter what the client passes.
   */
  async revealEmployeeField(employeeId: string, fieldKey: string): Promise<string | null> {
    // NOTE: cast to `any` here because src/integrations/supabase/types.ts
    // is a stale generated snapshot (pre-dates the normalized schema —
    // see employee.service.ts's header comment) and doesn't know about
    // this migration's new RPCs. This mirrors the same `as any` pattern
    // already used throughout correction.service.ts for the same reason.
    const { data, error } = await (supabase.rpc as any)("decrypt_employee_field", {
      p_employee_id: employeeId,
      p_field_key: fieldKey,
    });
    if (error) throw error;
    const result = data as unknown as RpcResult<string | null>;
    if (!result?.success) throw new Error(result?.error ?? "Decrypt failed");
    return result.value ?? null;
  },

  /**
   * Admin-only write path for one of the 15 encrypted fields (used by
   * EmployeeService.adminOverride). Employees can never call this
   * successfully — these fields are correction-required, not
   * direct-editable, matching the pre-existing policy enforced by
   * prevent_employee_protected_field_bypass.
   */
  async encryptAndStoreField(employeeId: string, fieldKey: string, plaintext: string): Promise<void> {
    const { data, error } = await (supabase.rpc as any)("encrypt_and_store_employee_field", {
      p_employee_id: employeeId,
      p_field_key: fieldKey,
      p_plaintext: plaintext,
    });
    if (error) throw error;
    const result = data as unknown as RpcResult;
    if (!result?.success) throw new Error(result?.error ?? "Encrypt failed");
  },

  /**
   * Encrypts an old/new value pair for a correction request submission —
   * called by CorrectionService.submit() BEFORE the row is inserted, so
   * correction_requests.old_value/new_value never hold plaintext for an
   * encrypted field. Returns base64 ciphertext strings (correction_requests
   * columns are TEXT) plus the key version used, which must be stored on
   * the same row so decrypt_correction_value()/approve_correction() know
   * which key to use later.
   */
  async encryptCorrectionValues(
    fieldKey: string,
    oldValue: string | null,
    newValue: string | null,
  ): Promise<{ oldValueEncrypted: string | null; newValueEncrypted: string | null; keyVersion: number }> {
    const { data, error } = await (supabase.rpc as any)("encrypt_correction_values", {
      p_field_key: fieldKey,
      p_old_value: oldValue,
      p_new_value: newValue,
    });
    if (error) throw error;
    const result = data as unknown as RpcResult & {
      old_value_encrypted?: string | null;
      new_value_encrypted?: string | null;
      key_version?: number;
    };
    if (!result?.success) throw new Error(result?.error ?? "Encrypt failed");
    return {
      oldValueEncrypted: result.old_value_encrypted ?? null,
      newValueEncrypted: result.new_value_encrypted ?? null,
      keyVersion: result.key_version ?? 0,
    };
  },

  /**
   * Admin-only decrypt of a stored correction_requests old_value/new_value
   * for an encrypted field — used by the corrections review queue's reveal
   * toggle. Audited server-side as sensitive_data.revealed.
   */
  async decryptCorrectionValue(requestId: string, which: "old" | "new"): Promise<string | null> {
    const { data, error } = await (supabase.rpc as any)("decrypt_correction_value", {
      p_request_id: requestId,
      p_which: which,
    });
    if (error) throw error;
    const result = data as unknown as RpcResult<string | null>;
    if (!result?.success) throw new Error(result?.error ?? "Decrypt failed");
    return result.value ?? null;
  },

  /**
   * PHASE 15 backfill — staff-only (RPC re-checks is_staff() server-side
   * regardless of what the client claims). Returns ONLY the safe summary
   * JSON the RPC itself produces (counts, last_employee_id, failures as
   * {employee_id, sqlstate} pairs) — never a value, per
   * backfill_employee_pii_encryption's own no-plaintext-anywhere design.
   * See supabase/migrations/20260828000005_pii_encryption_backfill.sql.
   */
  async runBackfillBatch(
    batchSize: number,
    afterEmployeeId: string | null,
  ): Promise<{
    success: boolean;
    error?: string;
    processed?: number;
    fields_encrypted?: number;
    last_employee_id?: string | null;
    failures?: Array<{ employee_id: string; sqlstate: string }>;
    done?: boolean;
  }> {
    const { data, error } = await (supabase.rpc as any)("backfill_employee_pii_encryption", {
      p_batch_size: batchSize,
      p_after_employee_id: afterEmployeeId,
    });
    if (error) throw error;
    return data as any;
  },

  /**
   * PHASE 15 verification — staff-only. Returns ONLY plaintext-vs-encrypted
   * COUNTS per field, never a value (see verify_employee_pii_encryption's
   * own design — it selects count(*) FILTER(...) exclusively).
   */
  async verifyBackfill(): Promise<{ success: boolean; error?: string; counts?: Record<string, any> }> {
    const { data, error } = await (supabase.rpc as any)("verify_employee_pii_encryption", {});
    if (error) throw error;
    return data as any;
  },
};
