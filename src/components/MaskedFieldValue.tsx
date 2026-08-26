import { useState } from "react";
import { isSensitiveField, maskSensitiveValueForDisplay, isEncryptedField } from "@/lib/dpdpa";
import { EyeBoldDuotone, EyeClosedBoldDuotone } from "solar-icon-set";
import { AuditService } from "@/services/audit.service";

interface MaskedFieldValueProps {
  /** Canonical field key (see src/lib/dpdpa.ts DPDPA_FIELDS) — decides whether this value is masked at all. */
  fieldKey: string;
  /**
   * For a non-encrypted field, the plaintext value. For a field-level
   * encrypted field (see isEncryptedField), `value` is IGNORED for
   * display — it may be ciphertext (e.g. a correction_requests
   * old_value/new_value base64 string) or absent — the real value is only
   * ever obtained via `onReveal` below. This keeps the component from
   * ever accidentally rendering ciphertext as if it were a maskable
   * plaintext string.
   */
  value: string | null | undefined;
  /** Owner always sees their own data raw — no masking, no reveal button, no audit event. */
  isOwner?: boolean;
  /** Authorized reviewer (admin/HR) — gets a reveal toggle for masked sensitive values. */
  isAdmin?: boolean;
  /** Employee this value belongs to — required for the reveal audit event to carry a target. */
  employeeId?: string;
  className?: string;
  /**
   * Whether ciphertext/a value actually exists — required when the field is
   * encrypted (see isEncryptedField) since `value` isn't usable to infer
   * this. Ignored for non-encrypted fields (presence is inferred from
   * `value` itself, as before).
   */
  hasValue?: boolean;
  /**
   * Async decrypt callback — required when the field is encrypted. Called
   * once, on first reveal click; the caller (e.g. the corrections queue)
   * is responsible for invoking the correct server-side decrypt RPC
   * (decrypt_employee_field / decrypt_correction_value), which itself
   * re-checks authorization and performs its own server-side audit —
   * no separate client-side audit call is made for an encrypted field's
   * reveal, to avoid a duplicate event.
   */
  onReveal?: () => Promise<string | null>;
}

/**
 * Inline masked-value renderer for surfaces outside DataField/DataSection
 * that still need the same centralized masking policy and authorized-reveal
 * behavior — currently the correction-requests review queue and multi-entry
 * section cards (nominees, dependents, employment history). Defers entirely
 * to the canonical policy in src/lib/dpdpa.ts (isSensitiveField /
 * maskSensitiveValueForDisplay) so there is exactly one place that decides
 * which fields are confidential, not a second field-specific list here.
 *
 * Masking is presentation-only, same as DataField — RLS is still what
 * decides whether this value ever reached the browser in the first place.
 *
 * Reveal is audited via "sensitive_data.revealed" (field name only, never
 * the value) — fired only on an actual reveal click by a non-owner admin,
 * never for an owner viewing their own data and never on masked render.
 */
export function MaskedFieldValue({
  fieldKey,
  value,
  isOwner = false,
  isAdmin = false,
  employeeId,
  className,
  hasValue,
  onReveal,
}: MaskedFieldValueProps) {
  const [revealed, setRevealed] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState(false);

  const encrypted = isEncryptedField(fieldKey);

  if (encrypted) {
    const present = hasValue ?? (value !== null && value !== undefined && String(value).trim() !== "");
    if (!present) return <span className={className}>—</span>;

    const showRaw = isOwner || revealed;
    const display = revealError
      ? "Unable to load"
      : showRaw
        ? (revealing ? "…" : (revealedValue ?? "—"))
        : "•••• •••• ••••";

    async function handleEncryptedReveal() {
      if (revealed) {
        setRevealed(false);
        return;
      }
      if (revealedValue === null && onReveal) {
        setRevealing(true);
        try {
          const v = await onReveal();
          setRevealedValue(v ?? "");
        } catch {
          setRevealError(true);
          return;
        } finally {
          setRevealing(false);
        }
      }
      setRevealed(true);
    }

    return (
      <span className={className}>
        {display}
        {isAdmin && !isOwner && (
          <button
            type="button"
            onClick={() => void handleEncryptedReveal()}
            disabled={revealing}
            className="text-muted-foreground hover:text-foreground transition-colors ml-1 align-middle inline-flex disabled:opacity-50"
            title={revealed ? "Hide value" : "Show full value"}
          >
            {revealed ? <EyeClosedBoldDuotone size={12} /> : <EyeBoldDuotone size={12} />}
          </button>
        )}
      </span>
    );
  }

  if (value === null || value === undefined || String(value).trim() === "") {
    return <span className={className}>—</span>;
  }

  const sensitive = !isOwner && isSensitiveField(fieldKey);
  const showRaw = isOwner || !sensitive || revealed;
  const display = showRaw ? String(value) : maskSensitiveValueForDisplay(fieldKey, value);

  function handleReveal() {
    const next = !revealed;
    setRevealed(next);
    if (next && employeeId) {
      // Reveal only — hiding again is not a data-access event worth logging.
      void AuditService.log({
        action: "sensitive_data.revealed",
        entityType: "Employee",
        entityId: employeeId,
        metadata: { field: fieldKey },
        source: "web_portal",
        success: true,
      });
    }
  }

  return (
    <span className={className}>
      {display}
      {isAdmin && sensitive && (
        <button
          type="button"
          onClick={handleReveal}
          className="text-muted-foreground hover:text-foreground transition-colors ml-1 align-middle inline-flex"
          title={revealed ? "Hide value" : "Show full value"}
        >
          {revealed ? <EyeClosedBoldDuotone size={12} /> : <EyeBoldDuotone size={12} />}
        </button>
      )}
    </span>
  );
}
