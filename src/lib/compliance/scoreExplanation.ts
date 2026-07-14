import type { ComplianceItem, ComplianceStatus } from "@/services/compliance.service";

// Display-only ordering for the category breakdown — mirrors the checklist's
// CATEGORY_ORDER in the Compliance Tracker route, kept separate since it's just
// presentation order, not scoring logic.
const CATEGORY_DISPLAY_ORDER = ["Consent", "Rights", "Governance", "Security", "Incidents", "Inventory"];

export type RiskLevel = "Excellent" | "Good" | "Moderate" | "At Risk" | "Critical";

export interface RiskLevelInfo {
  level: RiskLevel;
  badgeClassName: string;
}

/** Presentational 5-tier risk categorization of the already-computed score. Does not alter scoring. */
export function getRiskLevel(score: number): RiskLevelInfo {
  if (score >= 90) return { level: "Excellent", badgeClassName: "border-green-300 text-green-700" };
  if (score >= 75) return { level: "Good", badgeClassName: "border-emerald-300 text-emerald-700" };
  if (score >= 50) return { level: "Moderate", badgeClassName: "border-yellow-300 text-yellow-700" };
  if (score >= 25) return { level: "At Risk", badgeClassName: "border-orange-300 text-orange-700" };
  return { level: "Critical", badgeClassName: "border-red-300 text-red-700" };
}

export interface StatusCounts {
  total: number;
  compliant: number;
  in_progress: number;
  not_started: number;
  at_risk: number;
}

/** Shared status-counting helper — avoids re-deriving these counts inline in multiple places. */
export function getStatusCounts(items: ComplianceItem[]): StatusCounts {
  return {
    total: items.length,
    compliant: items.filter((i) => i.status === "compliant").length,
    in_progress: items.filter((i) => i.status === "in_progress").length,
    not_started: items.filter((i) => i.status === "not_started").length,
    at_risk: items.filter((i) => i.status === "at_risk").length,
  };
}

export interface CategoryBreakdownRow {
  category: string;
  completed: number;
  total: number;
  pct: number;
}

/** Categories are derived from the actual data, not a hardcoded list — any category present in items is included. */
export function getCategoryBreakdown(items: ComplianceItem[]): CategoryBreakdownRow[] {
  const categories = Array.from(new Set(items.map((i) => i.category)));
  categories.sort((a, b) => {
    const ai = CATEGORY_DISPLAY_ORDER.indexOf(a);
    const bi = CATEGORY_DISPLAY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return categories.map((category) => {
    const inCategory = items.filter((i) => i.category === category);
    const completed = inCategory.filter((i) => i.status === "compliant").length;
    const total = inCategory.length;
    return { category, completed, total, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
  });
}

const PRIORITY: Record<ComplianceStatus, number> = {
  at_risk: 0,
  not_started: 1,
  in_progress: 2,
  compliant: 3,
};

/** Incomplete obligations (not_started / in_progress / at_risk), most urgent first. */
export function getRecommendedActions(items: ComplianceItem[], limit = 5): ComplianceItem[] {
  return items
    .filter((i) => i.status !== "compliant")
    .slice()
    .sort((a, b) => {
      const byPriority = PRIORITY[a.status] - PRIORITY[b.status];
      if (byPriority !== 0) return byPriority;
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    })
    .slice(0, limit);
}

export interface NextBestAction {
  item: ComplianceItem;
  /** Percentage points the score would gain if this single obligation became compliant. */
  estimatedImprovement: number;
}

/** The single highest-priority incomplete obligation, with its projected score impact. */
export function getNextBestAction(items: ComplianceItem[]): NextBestAction | null {
  const [top] = getRecommendedActions(items, 1);
  if (!top) return null;
  const estimatedImprovement = items.length > 0 ? Math.round(100 / items.length) : 0;
  return { item: top, estimatedImprovement };
}
