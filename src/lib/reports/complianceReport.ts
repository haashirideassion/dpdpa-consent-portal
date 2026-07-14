import type { DashboardData } from "@/routes/_authenticated.admin.index";
import type { ComplianceItem, ComplianceStatus } from "@/services/compliance.service";
import type { ReportDocument, RiskLevel } from "./types";

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "critical"];

function deriveRiskLevel(data: DashboardData): RiskLevel {
  let level: RiskLevel =
    data.compliancePct >= 80 ? "low" : data.compliancePct >= 50 ? "medium" : "high";
  // Any open breach incident escalates risk by one tier — a breach is a live incident
  // regardless of how strong overall consent completion looks.
  if (data.openBreaches > 0) {
    level = RISK_ORDER[Math.min(RISK_ORDER.indexOf(level) + 1, RISK_ORDER.length - 1)];
  }
  return level;
}

function buildExecutiveSummary(data: DashboardData): string[] {
  const lines: string[] = [];
  lines.push(
    `${data.consentPct}% of employees (${data.consented} of ${data.totalEmployees}) have completed consent as of the report date.`
  );
  lines.push(
    data.pendingConsent > 0
      ? `${data.pendingConsent} employee${data.pendingConsent === 1 ? "" : "s"} still have pending consent and require follow-up.`
      : "All employees have completed consent."
  );
  lines.push(
    data.overdue > 0
      ? `${data.overdue} data subject request${data.overdue === 1 ? "" : "s"} are past their SLA due date.`
      : "No data subject requests are currently overdue."
  );
  lines.push(
    data.openBreaches > 0
      ? `${data.openBreaches} breach incident${data.openBreaches === 1 ? "" : "s"} are open and require notification or closure.`
      : "No breach incidents are currently open."
  );
  return lines;
}

/** Maps the Compliance Dashboard's existing DashboardData into the generic ReportDocument shape. */
export function buildComplianceReportDocument(
  data: DashboardData,
  generatedBy: string
): ReportDocument {
  return {
    title: "Compliance Report",
    subtitle: "Organization-wide DPDPA compliance overview",
    generatedAt: new Date(),
    generatedBy,
    complianceScore: data.compliancePct,
    riskLevel: deriveRiskLevel(data),
    executiveSummary: buildExecutiveSummary(data),
    kpis: [
      { label: "Total Employees", value: data.totalEmployees },
      { label: "Consented", value: data.consented },
      { label: "Pending Consent", value: data.pendingConsent },
      { label: "Completion", value: `${data.consentPct}%` },
      { label: "New Requests", value: data.pendingRequests },
      { label: "In Review", value: data.inReview },
      { label: "Resolved", value: data.resolved },
      { label: "Overdue Requests", value: data.overdue },
      { label: "Open Breaches", value: data.openBreaches },
    ],
    tables: [
      {
        title: "Department Consent Completion",
        columns: [
          { key: "dept", header: "Department", width: 2 },
          { key: "total", header: "Total", width: 1 },
          { key: "consented", header: "Consented", width: 1 },
          { key: "pct", header: "Completion", width: 1 },
        ],
        rows: data.deptBreakdown.map((d) => ({
          dept: d.dept,
          total: d.total,
          consented: d.consented,
          pct: `${d.total > 0 ? Math.round((d.consented / d.total) * 100) : 0}%`,
        })),
      },
      {
        title: "Data Requests by Type",
        columns: [
          { key: "name", header: "Request Type", width: 2 },
          { key: "value", header: "Count", width: 1 },
        ],
        rows: data.dsrByType.map((t) => ({ name: t.name, value: t.value })),
      },
    ],
  };
}

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  compliant: "Compliant",
  at_risk: "At Risk",
};

function deriveChecklistRiskLevel(score: number, items: ComplianceItem[]): RiskLevel {
  let level: RiskLevel = score >= 80 ? "low" : score >= 50 ? "medium" : "high";
  const atRiskCount = items.filter((i) => i.status === "at_risk").length;
  if (atRiskCount > 0) {
    level = RISK_ORDER[Math.min(RISK_ORDER.indexOf(level) + 1, RISK_ORDER.length - 1)];
  }
  return level;
}

function buildChecklistExecutiveSummary(score: number, items: ComplianceItem[]): string[] {
  const total = items.length;
  const compliant = items.filter((i) => i.status === "compliant").length;
  const atRisk = items.filter((i) => i.status === "at_risk").length;
  const notStarted = items.filter((i) => i.status === "not_started").length;
  const lines: string[] = [
    `Overall compliance score is ${score}% across ${total} tracked obligation${total === 1 ? "" : "s"}.`,
    `${compliant} of ${total} obligation${total === 1 ? "" : "s"} are fully compliant.`,
  ];
  lines.push(
    atRisk > 0
      ? `${atRisk} obligation${atRisk === 1 ? "" : "s"} are flagged at risk and require immediate attention.`
      : "No obligations are currently flagged at risk."
  );
  lines.push(
    notStarted > 0
      ? `${notStarted} obligation${notStarted === 1 ? "" : "s"} have not been started yet.`
      : "All obligations are at least in progress."
  );
  return lines;
}

/** Maps the Compliance Tracker's checklist (ComplianceItem[] + computed score) into the generic ReportDocument shape. */
export function buildComplianceChecklistReportDocument(
  items: ComplianceItem[],
  score: number,
  generatedBy: string
): ReportDocument {
  const statusCounts = Object.keys(STATUS_LABELS).reduce<Record<string, number>>((acc, status) => {
    acc[status] = items.filter((i) => i.status === status).length;
    return acc;
  }, {});

  const categories = Array.from(new Set(items.map((i) => i.category)));

  return {
    title: "Compliance Report",
    subtitle: "DPDPA obligation checklist and compliance posture",
    generatedAt: new Date(),
    generatedBy,
    complianceScore: score,
    riskLevel: deriveChecklistRiskLevel(score, items),
    executiveSummary: buildChecklistExecutiveSummary(score, items),
    kpis: [
      { label: "Total Obligations", value: items.length },
      { label: "Compliant", value: statusCounts.compliant ?? 0 },
      { label: "In Progress", value: statusCounts.in_progress ?? 0 },
      { label: "At Risk", value: statusCounts.at_risk ?? 0 },
      { label: "Not Started", value: statusCounts.not_started ?? 0 },
    ],
    tables: categories.map((category) => ({
      title: category,
      columns: [
        { key: "title", header: "Obligation", width: 2 },
        { key: "status", header: "Status", width: 1 },
        { key: "due_date", header: "Due Date", width: 1 },
        { key: "last_reviewed_at", header: "Last Reviewed", width: 1 },
      ],
      rows: items
        .filter((i) => i.category === category)
        .map((i) => ({
          title: i.title,
          status: STATUS_LABELS[i.status],
          due_date: i.due_date ? new Date(i.due_date).toLocaleDateString("en-IN") : "—",
          last_reviewed_at: i.last_reviewed_at
            ? new Date(i.last_reviewed_at).toLocaleDateString("en-IN")
            : "—",
        })),
    })),
  };
}
