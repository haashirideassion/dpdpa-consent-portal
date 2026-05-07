import { useState } from "react";
import { isDpdpaField, maskValue } from "@/lib/dpdpa";
import { EyeBoldDuotone, EyeClosedBoldDuotone } from "solar-icon-set";
import { DpdpaBadge } from "./DpdpaBadge";
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
}: DataFieldProps) {
  const sensitive = isDpdpaField(fieldKey);

  const SENSITIVE_FIELDS = [
    "aadhaar_number",
    "passport_number",
    "pan_number",
    "bank_account_number",
    "voter_id",
    "driving_license",
    "uan_number",
  ];

  const shouldMask = (field: string) => SENSITIVE_FIELDS.includes(field);

  // For admins, locked fields are still editable
  const effectivelyLocked = locked && !isAdmin;

  const [showUnmasked, setShowUnmasked] = useState(false);

  // Masking logic
  const getDisplayValue = () => {
    if (!value) return "—";
    
    // Ownership check: Owners see their own data unmasked
    if (isOwner) return value;

    // Admin toggle: Admins can reveal sensitive data
    if (showUnmasked) return value;

    if (editMode) return value;

    // CTC is always masked for admin/non-owner views.
    if (fieldKey === "ctc") return "Confidential";

    // Strict sensitive fields masking
    if (shouldMask(fieldKey)) {
      return maskValue(value, 4);
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
          {isAdmin && !isOwner && shouldMask(fieldKey) && value && (
            <button
              onClick={() => setShowUnmasked(!showUnmasked)}
              className="text-muted-foreground hover:text-foreground transition-colors ml-1"
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
