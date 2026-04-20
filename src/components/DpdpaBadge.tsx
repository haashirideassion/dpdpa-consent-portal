import { ShieldCheckBoldDuotone } from "solar-icon-set";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function DpdpaBadge() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded-full bg-dpdpa-muted px-2 py-0.5 text-xs font-medium text-dpdpa-foreground">
            <ShieldCheckBoldDuotone size={14} />
            DPDPA
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Protected Personal Data under DPDPA</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
