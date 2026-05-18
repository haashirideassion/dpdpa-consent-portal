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
import type { SectionConsentStatus } from "@/lib/section-consent";

interface SectionConsentBadgeProps {
  status: SectionConsentStatus;
}

export function SectionConsentBadge({ status }: SectionConsentBadgeProps) {
  if (status === "not_applicable") return null;

  const config: Record<
    Exclude<SectionConsentStatus, "not_applicable">,
    { label: string; icon: React.ReactNode; className: string }
  > = {
    active: {
      label: "Consented",
      icon: <CheckCircleBoldDuotone size={10} />,
      className:
        "bg-emerald-50 text-emerald-700 border border-emerald-200",
    },
    pending: {
      label: "Pending",
      icon: <ClockCircleBoldDuotone size={10} />,
      className:
        "bg-amber-50 text-amber-700 border border-amber-200",
    },
    withdrawn: {
      label: "Withdrawn",
      icon: <CloseCircleBoldDuotone size={10} />,
      className:
        "bg-red-50 text-red-600 border border-red-200",
    },
    mandatory: {
      label: "Required",
      icon: <LockKeyholeMinimalisticBoldDuotone size={10} />,
      className:
        "bg-slate-100 text-slate-500 border border-slate-200",
    },
  };

  const { label, icon, className } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}
