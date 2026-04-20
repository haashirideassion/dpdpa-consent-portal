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
  locked?: boolean;
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
          {value || "—"}
        </span>
      )}
    </div>
  );
}
