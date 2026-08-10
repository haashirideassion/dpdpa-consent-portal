/**
 * StatusBadge
 *
 * One consistent status pill for the whole app. Wraps the shadcn `Badge`
 * (outline variant) with the existing `.badge-success/warning/info/danger/
 * neutral` tone classes from styles.css, so every status color — consent
 * state, correction status, compliance state — traces back to the same
 * CSS variables instead of each component hardcoding its own Tailwind
 * palette classes.
 *
 * Purely presentational: callers still decide which tone applies based on
 * their own status value — this component doesn't encode any business rule.
 */

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "info" | "danger" | "neutral";

interface StatusBadgeProps {
  tone: StatusTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

const TONE_CLASS: Record<StatusTone, string> = {
  success: "badge-success",
  warning: "badge-warning",
  info: "badge-info",
  danger: "badge-danger",
  neutral: "badge-neutral",
};

export function StatusBadge({ tone, children, icon, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-medium", TONE_CLASS[tone], className)}
    >
      {icon}
      {children}
    </Badge>
  );
}
