/**
 * Timeline
 *
 * Generic vertical timeline list — icon/dot + label + timestamp +
 * description per entry. Used for consent history, approval history,
 * correction history, and audit log rendering. Purely presentational;
 * callers pass already-fetched data, no querying happens here.
 */

import type { ReactNode } from "react";

export interface TimelineEntry {
  id: string;
  title: ReactNode;
  timestamp?: string;
  description?: ReactNode;
  /** Optional trailing content, e.g. a StatusBadge. */
  meta?: ReactNode;
}

interface TimelineProps {
  entries: TimelineEntry[];
  className?: string;
}

export function Timeline({ entries, className }: TimelineProps) {
  return (
    <div className={`timeline ${className ?? ""}`.trim()}>
      {entries.map((entry) => (
        <div key={entry.id} className="timeline-item">
          <span className="timeline-dot" aria-hidden="true" />
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{entry.title}</p>
              {entry.meta}
            </div>
            {entry.timestamp && (
              <p className="text-xs text-muted-foreground mt-0.5">{entry.timestamp}</p>
            )}
            {entry.description && (
              <div className="text-xs text-muted-foreground mt-1">{entry.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
