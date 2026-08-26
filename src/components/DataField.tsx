import { useEffect, useState } from "react";
import { isDpdpaField, isMaskableField, maskFieldValue, isEncryptedField } from "@/lib/dpdpa";
import { EyeBoldDuotone, EyeClosedBoldDuotone } from "solar-icon-set";
import { DpdpaBadge } from "./DpdpaBadge";
import { EncryptionService } from "@/services/encryption.service";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FieldDef {
  label: string;
  key: string;
  value: string | null | undefined;
  type?: "text" | "email" | "tel" | "date" | "textarea" | "select";
  options?: string[];
  /** locked: prevents editing in pre-consent mode (e.g. HR-only fields). Can still request correction post-consent. */
  locked?: boolean;
  /** uncorrectable: field can NEVER be corrected by the employee (e.g. work email, system IDs). */
  uncorrectable?: boolean;
  /**
   * True for one of the 15 field-level-encrypted PII fields (see
   * src/lib/dpdpa.ts ENCRYPTED_FIELDS). `value` for these fields is NOT the
   * plaintext — the initial profile load never fetches it — it's just a
   * presence flag surfaced via `hasValue` below. Plaintext only ever
   * arrives via an explicit decrypt RPC call (owner: automatic; admin:
   * on reveal click) — see DataField's effect/toggleReveal.
   */
  encrypted?: boolean;
  /** Whether ciphertext exists for this field (from the *_pii_presence views) — only meaningful when `encrypted` is true. */
  hasValue?: boolean;
}

// Omit 'key' from FieldDef because React's JSX treats 'key' as a special
// reconciliation hint and never forwards it to the component as a prop.
// The field identifier is passed separately as 'fieldKey'.
interface DataFieldProps extends Omit<FieldDef, "key"> {
  fieldKey: string;
  editMode?: boolean;
  draft?: string;
  onDraftChange?: (key: string, value: string) => void;
  /**
   * When true (admin context), locked fields are STILL editable.
   * Shows "Admin Editable" badge instead of "locked".
   */
  isAdmin?: boolean;
  /**
   * When true, the current user is the owner of the data.
   * Owners see their own data unmasked.
   */
  isOwner?: boolean;
  /**
   * The employee this field belongs to — required for the reveal audit
   * event ("sensitive_data.revealed") to carry a target. Optional because
   * not every caller of DataField has one at hand (e.g. static/demo usage);
   * when omitted, reveal still works but is not audited.
   */
  employeeId?: string;
}

export function DataField({
  label,
  value,
  fieldKey,
  type = "text",
  options,
  locked,
  editMode,
  draft,
  onDraftChange,
  isAdmin = false,
  isOwner = false,
  employeeId,
  encrypted = false,
  hasValue = false,
}: DataFieldProps) {
  const sensitive = isDpdpaField(fieldKey);
  const isEncrypted = encrypted && isEncryptedField(fieldKey);

  // For admins, locked fields are still editable
  const effectivelyLocked = locked && !isAdmin;

  const [showUnmasked, setShowUnmasked] = useState(false);
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState(false);

  // Owner convenience: for an encrypted field, the owner's own value is
  // never fetched at profile-load time (see EmployeeService.getByUserId/
  // getById) — only a hasValue flag is. To preserve the existing "owner
  // sees their own data unmasked, no click needed" UX, decrypt it once
  // automatically here. This call is NOT audited server-side (the
  // decrypt_employee_field RPC only inserts a sensitive_data.revealed row
  // when the caller is not the record owner), matching current behavior
  // where an owner viewing their own data was never audited either.
  useEffect(() => {
    if (!isEncrypted || !isOwner || !hasValue || !employeeId) return;
    if (revealedValue !== null || revealing) return;
    setRevealing(true);
    EncryptionService.revealEmployeeField(employeeId, fieldKey)
      .then((v) => setRevealedValue(v ?? ""))
      .catch(() => setRevealError(true))
      .finally(() => setRevealing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEncrypted, isOwner, hasValue, employeeId, fieldKey]);

  // Admin reveal — now a real server round-trip (decrypt_employee_field),
  // not a toggle over data already present client-side. The RPC re-checks
  // authorization and, since the caller here is never the owner, always
  // audits the reveal server-side as sensitive_data.revealed (field name
  // only, never the value) — no separate client-side audit call is made,
  // to avoid a duplicate event.
  async function toggleReveal() {
    if (isEncrypted) {
      if (showUnmasked) {
        setShowUnmasked(false);
        return;
      }
      if (revealedValue === null && employeeId) {
        setRevealing(true);
        try {
          const v = await EncryptionService.revealEmployeeField(employeeId, fieldKey);
          setRevealedValue(v ?? "");
        } catch {
          setRevealError(true);
          return;
        } finally {
          setRevealing(false);
        }
      }
      setShowUnmasked(true);
      return;
    }
    setShowUnmasked(!showUnmasked);
  }

  // Masking logic
  const getDisplayValue = () => {
    if (isEncrypted) {
      if (revealError) return "Unable to load";
      if (isOwner) return revealing ? "…" : (revealedValue ?? "—");
      if (showUnmasked) return revealing ? "…" : (revealedValue ?? "—");
      if (editMode) return revealing ? "…" : (revealedValue ?? "—");
      if (!hasValue) return "—";
      // Fully masked placeholder — real length is never shipped to the
      // browser for an unrevealed encrypted field, so this is a fixed
      // placeholder, not a partial reveal of the real value's length.
      return "•••• •••• ••••";
    }

    if (!value) return "—";

    // Ownership check: Owners see their own data unmasked
    if (isOwner) return value;

    // Admin toggle: Admins can reveal sensitive data
    if (showUnmasked) return value;

    if (editMode) return value;

    // CTC is always masked for admin/non-owner views.
    if (fieldKey === "ctc") return "Confidential";

    // Centralized masking policy (see src/lib/dpdpa.ts MASKED_FIELDS)
    if (isMaskableField(fieldKey)) {
      return maskFieldValue(fieldKey, value);
    }

    return value;
  };

  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-2">
        <span className="field-label">
          {label}
        </span>
        {sensitive && <DpdpaBadge />}
        {editMode && effectivelyLocked && (
          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
            locked
          </span>
        )}
      </div>

      {editMode && !effectivelyLocked ? (
        type === "textarea" ? (
          <Textarea
            value={draft ?? ""}
            onChange={(e) => onDraftChange?.(fieldKey, e.target.value)}
            rows={3}
            className="text-sm resize-none"
            placeholder={`Enter ${label.toLowerCase()}`}
          />
        ) : type === "select" && options ? (
          <Select value={draft ?? ""} onValueChange={(v) => onDraftChange?.(fieldKey, v)}>
            <SelectTrigger className="text-sm h-8">
              <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            type={type}
            value={draft ?? ""}
            onChange={(e) => onDraftChange?.(fieldKey, e.target.value)}
            className="text-sm h-8"
            placeholder={`Enter ${label.toLowerCase()}`}
          />
        )
      ) : (
        <div className="flex items-center gap-2">
          <span
            className={`field-value ${sensitive ? "text-dpdpa-foreground" : ""}`}
          >
            {getDisplayValue()}
          </span>
          {isAdmin && !isOwner && isMaskableField(fieldKey) && (isEncrypted ? hasValue : !!value) && (
            <button
              onClick={() => void toggleReveal()}
              disabled={revealing}
              className="text-muted-foreground hover:text-foreground transition-colors ml-1 disabled:opacity-50"
              title={showUnmasked ? "Hide value" : "Show full value"}
            >
              {showUnmasked ? <EyeClosedBoldDuotone size={14} /> : <EyeBoldDuotone size={14} />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
