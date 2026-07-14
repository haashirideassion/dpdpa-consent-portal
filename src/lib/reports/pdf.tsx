import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { ReportDocument, RiskLevel } from "./types";

const COMPANY_NAME = "Ideassion";
const LOGO_SRC = "/ideassion-logo.png";

const COLORS = {
  primary: "#3730d9",
  border: "#e2e8f0",
  muted: "#64748b",
  text: "#0f172a",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
};

const RISK_COLOR: Record<RiskLevel, string> = {
  low: COLORS.success,
  medium: COLORS.warning,
  high: "#ea580c",
  critical: COLORS.danger,
};

function scoreColor(score: number): string {
  if (score >= 80) return COLORS.success;
  if (score >= 50) return COLORS.warning;
  return COLORS.danger;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 90,
    paddingBottom: 50,
    paddingHorizontal: 36,
    fontSize: 10,
    color: COLORS.text,
    fontFamily: "Helvetica",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 70,
    paddingHorizontal: 36,
    paddingTop: 18,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLogo: { height: 24, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  headerCompany: { fontSize: 11, fontWeight: 700, color: COLORS.text },
  headerTagline: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    fontSize: 8,
    color: COLORS.muted,
  },
  titleBlock: { marginBottom: 14 },
  title: { fontSize: 18, fontWeight: 700, color: COLORS.text },
  subtitle: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
  metaRow: { flexDirection: "row", marginTop: 8, gap: 16 },
  metaLabel: { fontSize: 8, color: COLORS.muted },
  metaValue: { fontSize: 9, fontWeight: 700, color: COLORS.text },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: COLORS.text,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scoreRow: { flexDirection: "row", gap: 12 },
  scoreCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 12,
  },
  scoreCardLabel: { fontSize: 8, color: COLORS.muted, marginBottom: 4, textTransform: "uppercase" },
  scoreCardValue: { fontSize: 24, fontWeight: 700 },
  scoreCardBadge: { fontSize: 8, marginTop: 4, fontWeight: 700 },
  summaryText: { fontSize: 9.5, lineHeight: 1.5, marginBottom: 4, color: COLORS.text },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: {
    width: "23%",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 8,
  },
  kpiValue: { fontSize: 14, fontWeight: 700, color: COLORS.text },
  kpiLabel: { fontSize: 7.5, color: COLORS.muted, marginTop: 2 },
  kpiSub: { fontSize: 7, color: COLORS.muted, marginTop: 1 },
  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 3 },
  tableTitle: { fontSize: 9.5, fontWeight: 700, marginBottom: 6, color: COLORS.text },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tableHeaderRow: { backgroundColor: "#f8fafc" },
  tableCell: { padding: 6, fontSize: 8.5, flex: 1 },
  tableHeaderCell: { padding: 6, fontSize: 8, fontWeight: 700, flex: 1, color: COLORS.muted, textTransform: "uppercase" },
});

function ReportHeader() {
  return (
    <View style={styles.header} fixed>
      <Image style={styles.headerLogo} src={LOGO_SRC} />
      <View style={styles.headerRight}>
        <Text style={styles.headerCompany}>{COMPANY_NAME}</Text>
        <Text style={styles.headerTagline}>DPDPA Consent Management Portal</Text>
      </View>
    </View>
  );
}

function ReportFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text>Confidential — For internal compliance use only</Text>
      <Text
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

function ReportTableView({ table }: { table: ReportDocument["tables"][number] }) {
  const totalWeight = table.columns.reduce((sum, c) => sum + (c.width ?? 1), 0);
  return (
    <View style={styles.table} wrap={false}>
      <Text style={[styles.tableTitle, { padding: 8, paddingBottom: 0 }]}>{table.title}</Text>
      <View style={[styles.tableRow, styles.tableHeaderRow]}>
        {table.columns.map((col) => (
          <Text
            key={col.key}
            style={[styles.tableHeaderCell, { flex: col.width ?? 1 / totalWeight }]}
          >
            {col.header}
          </Text>
        ))}
      </View>
      {table.rows.map((row, i) => (
        <View key={i} style={styles.tableRow}>
          {table.columns.map((col) => (
            <Text key={col.key} style={[styles.tableCell, { flex: col.width ?? 1 / totalWeight }]}>
              {row[col.key] ?? ""}
            </Text>
          ))}
        </View>
      ))}
      {table.rows.length === 0 && (
        <Text style={{ padding: 8, fontSize: 8.5, color: COLORS.muted }}>No records.</Text>
      )}
    </View>
  );
}

function ReportPdfDocument({ doc }: { doc: ReportDocument }) {
  return (
    <Document title={doc.title} author={COMPANY_NAME}>
      <Page size="A4" style={styles.page}>
        <ReportHeader />

        <View style={styles.titleBlock}>
          <Text style={styles.title}>{doc.title}</Text>
          {doc.subtitle && <Text style={styles.subtitle}>{doc.subtitle}</Text>}
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>Generated</Text>
              <Text style={styles.metaValue}>
                {doc.generatedAt.toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Generated By</Text>
              <Text style={styles.metaValue}>{doc.generatedBy}</Text>
            </View>
          </View>
        </View>

        {(doc.complianceScore !== undefined || doc.riskLevel) && (
          <View style={styles.section}>
            <View style={styles.scoreRow}>
              {doc.complianceScore !== undefined && (
                <View style={styles.scoreCard}>
                  <Text style={styles.scoreCardLabel}>Compliance Score</Text>
                  <Text style={[styles.scoreCardValue, { color: scoreColor(doc.complianceScore) }]}>
                    {doc.complianceScore}%
                  </Text>
                  <Text style={[styles.scoreCardBadge, { color: scoreColor(doc.complianceScore) }]}>
                    {doc.complianceScore >= 80
                      ? "On Track"
                      : doc.complianceScore >= 50
                      ? "Needs Attention"
                      : "At Risk"}
                  </Text>
                </View>
              )}
              {doc.riskLevel && (
                <View style={styles.scoreCard}>
                  <Text style={styles.scoreCardLabel}>Risk Level</Text>
                  <Text style={[styles.scoreCardValue, { color: RISK_COLOR[doc.riskLevel] }]}>
                    {doc.riskLevel.charAt(0).toUpperCase() + doc.riskLevel.slice(1)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {doc.executiveSummary && doc.executiveSummary.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            {doc.executiveSummary.map((line, i) => (
              <Text key={i} style={styles.summaryText}>
                • {line}
              </Text>
            ))}
          </View>
        )}

        {doc.kpis.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Metrics</Text>
            <View style={styles.kpiGrid}>
              {doc.kpis.map((kpi, i) => (
                <View key={i} style={styles.kpiCard}>
                  <Text style={styles.kpiValue}>{kpi.value}</Text>
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                  {kpi.sub && <Text style={styles.kpiSub}>{kpi.sub}</Text>}
                </View>
              ))}
            </View>
          </View>
        )}

        {doc.tables.map((table, i) => (
          <View key={i} style={styles.section}>
            <ReportTableView table={table} />
          </View>
        ))}

        <ReportFooter />
      </Page>
    </Document>
  );
}

/** Renders a ReportDocument to a PDF Blob. Shared by every report's PDF export. */
export async function renderReportPdf(doc: ReportDocument): Promise<Blob> {
  return pdf(<ReportPdfDocument doc={doc} />).toBlob();
}

/** Renders and triggers a browser download for the given ReportDocument. */
export async function downloadReportPdf(doc: ReportDocument, filename: string): Promise<void> {
  const blob = await renderReportPdf(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
