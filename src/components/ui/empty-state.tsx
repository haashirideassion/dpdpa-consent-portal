/**
 * EmptyState
 *
 * Shared "nothing here yet" block — icon + title + short description +
 * optional call-to-action. Wraps the existing `.empty-state*` utility
 * classes defined in styles.css so every empty state in the app (table
 * rows, standalone panels, section bodies) looks the same.
 *
 * Purely presentational — callers keep whatever logic decided the list
 * is empty; this component only renders the message.
 */

import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Small muted icon shown above the title (e.g. a solar-icon-set icon). */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional call-to-action rendered below the description (e.g. a Button). */
  cta?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, cta, className }: EmptyStateProps) {
  return (
    <div className={`empty-state ${className ?? ""}`.trim()}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-desc">{description}</p>}
      {cta && <div className="mt-1">{cta}</div>}
    </div>
  );
}
