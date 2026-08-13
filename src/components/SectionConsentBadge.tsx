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
import { StatusBadge } from "@/components/StatusBadge";
import { sectionConsentTone, type SectionConsentStatus } from "@/lib/section-consent";

interface SectionConsentBadgeProps {
  status: SectionConsentStatus;
}

export function SectionConsentBadge({ status }: SectionConsentBadgeProps) {
  if (status === "not_applicable") return null;

  // Label/icon per status; tone comes from the shared sectionConsentTone()
  // map so this badge and DataSection's card-accent border always agree on
  // what color a given status reads as.
  const config: Record<
    Exclude<SectionConsentStatus, "not_applicable">,
    { label: string; icon: React.ReactNode }
  > = {
    active: { label: "Consented", icon: <CheckCircleBoldDuotone size={10} /> },
    pending: { label: "Pending", icon: <ClockCircleBoldDuotone size={10} /> },
    withdrawn: { label: "Withdrawn", icon: <CloseCircleBoldDuotone size={10} /> },
    mandatory: { label: "Required", icon: <LockKeyholeMinimalisticBoldDuotone size={10} /> },
  };

  const { label, icon } = config[status];
  const tone = sectionConsentTone(status) ?? "neutral";

  return (
    <StatusBadge tone={tone} icon={icon} className="text-[10px] uppercase tracking-wide px-1.5 py-0.5">
      {label}
    </StatusBadge>
  );
}
