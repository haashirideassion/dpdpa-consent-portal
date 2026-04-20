import { isDpdpaField } from "@/lib/dpdpa";
import { DpdpaBadge } from "./DpdpaBadge";

interface DataFieldProps {
  label: string;
  value: string | null | undefined;
  fieldKey: string;
}

export function DataField({ label, value, fieldKey }: DataFieldProps) {
  const sensitive = isDpdpaField(fieldKey);

  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        {sensitive && <DpdpaBadge />}
      </div>
      <span
        className={`text-sm font-medium ${sensitive ? "text-dpdpa-foreground" : "text-foreground"}`}
      >
        {value || "—"}
      </span>
    </div>
  );
}
