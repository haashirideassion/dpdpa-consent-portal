/**
 * SectionConsentBadge
 *
 * Displays the aggregate consent state for a data section in the employee
 * profile view. Returns null for sections with no consent mapping so the
 * UI stays clean for purely administrative sections.
 */

import {
  CheckCircleBoldDuotone,
  CloseCircleBoldDuotone,
  ClockCircleBoldDuotone,
  LockKeyholeMinimalisticBoldDuotone,
} from "solar-icon-set";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import type { SectionConsentStatus } from "@/lib/section-consent";

interface SectionConsentBadgeProps {
  status: SectionConsentStatus;
}

export function SectionConsentBadge({ status }: SectionConsentBadgeProps) {
  if (status === "not_applicable") return null;

  // Tones map onto the shared --success/--warning/--destructive/--muted CSS
  // variables via StatusBadge, instead of hardcoding a separate palette here.
  const config: Record<
    Exclude<SectionConsentStatus, "not_applicable">,
    { label: string; icon: React.ReactNode; tone: StatusTone }
  > = {
    active: { label: "Consented", icon: <CheckCircleBoldDuotone size={10} />, tone: "success" },
    pending: { label: "Pending", icon: <ClockCircleBoldDuotone size={10} />, tone: "warning" },
    withdrawn: { label: "Withdrawn", icon: <CloseCircleBoldDuotone size={10} />, tone: "danger" },
    mandatory: { label: "Required", icon: <LockKeyholeMinimalisticBoldDuotone size={10} />, tone: "neutral" },
  };

  const { label, icon, tone } = config[status];

  return (
    <StatusBadge tone={tone} icon={icon} className="text-[10px] uppercase tracking-wide px-1.5 py-0.5">
      {label}
    </StatusBadge>
  );
}
