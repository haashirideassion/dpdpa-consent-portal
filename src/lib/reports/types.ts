// Shared shape every report (Compliance, Consent, DSR, Breach, Audit, RoPA) maps its
// data into before handing off to the generic PDF renderer in pdf.tsx.

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ReportKpi {
  label: string;
  value: string | number;
  sub?: string;
}

export interface ReportTableColumn {
  key: string;
  header: string;
  /** Relative column width weight (defaults to equal split). */
  width?: number;
}

export interface ReportTable {
  title: string;
  columns: ReportTableColumn[];
  rows: Record<string, string | number>[];
}

export interface ReportDocument {
  title: string;
  subtitle?: string;
  generatedAt: Date;
  generatedBy: string;
  complianceScore?: number;
  riskLevel?: RiskLevel;
  executiveSummary?: string[];
  kpis: ReportKpi[];
  tables: ReportTable[];
}
