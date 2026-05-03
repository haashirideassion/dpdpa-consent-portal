import { isDpdpaField } from "@/lib/dpdpa";
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

interface DataFieldProps extends FieldDef {
  editMode?: boolean;
  draft?: string;
  onDraftChange?: (key: string, value: string) => void;
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
}: DataFieldProps & { fieldKey: string }) {
  const sensitive = isDpdpaField(fieldKey);

  // Masking logic
  const getDisplayValue = () => {
    if (!value) return "—";
    if (editMode) return value; // Don't mask in edit mode
    
    switch (fieldKey) {
      case "aadhaar_number":
        return value.length >= 4 ? `XXXX-XXXX-${value.slice(-4)}` : "XXXX";
      case "pan_number":
        return value.length >= 5 ? `${value.slice(0, 2)}XXXXX${value.slice(-3)}` : "XXXX";
      case "bank_account_number":
        return value.length >= 4 ? `XXXX${value.slice(-4)}` : "XXXX";
      case "ctc":
        return "Confidential";
      default:
        return value;
    }
  };

  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {sensitive && <DpdpaBadge />}
        {editMode && locked && (
          <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
            locked
          </span>
        )}
      </div>

      {editMode && !locked ? (
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
        <span
          className={`text-sm font-medium ${sensitive ? "text-dpdpa-foreground" : "text-foreground"}`}
        >
          {getDisplayValue()}
        </span>
      )}
    </div>
  );
}
