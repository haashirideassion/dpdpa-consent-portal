import { ShieldCheckBoldDuotone } from "solar-icon-set";

export function DpdpaLegend() {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-dpdpa-muted/60 border border-dpdpa/20 px-4 py-2.5">
      <ShieldCheckBoldDuotone size={18} color="var(--dpdpa-foreground)" />
      <span className="text-sm text-dpdpa-foreground font-medium">
        Fields marked with the shield badge contain Protected Personal Data under the Digital
        Personal Data Protection Act, 2023 (DPDPA).
      </span>
    </div>
  );
}
