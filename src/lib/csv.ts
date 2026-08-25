import { AuditService } from "@/services/audit.service";

/**
 * Neutralizes spreadsheet formula injection: Excel/Sheets treat a cell
 * starting with =, +, -, or @ as a formula when the file is opened. Prefixing
 * a leading single-quote forces those apps to render the value as plain text
 * without altering what every other consumer (CSV parsers, humans reading
 * the raw file) sees. Only cells that actually start with a trigger
 * character are touched, so ordinary employee names/data are unaffected.
 */
function sanitizeCsvCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export interface CsvExportAudit {
  /** What was exported, e.g. "Consent Report", "Audit Logs" — not sensitive, used only as entity_type. */
  entityType: string;
  /** Optional non-sensitive context (filters applied, etc.) — never row-level PII. */
  metadata?: Record<string, unknown>;
}

/**
 * Builds a CSV blob from header+data rows and triggers a browser download.
 *
 * When `audit` is passed, fires a best-effort `csv.exported` audit event
 * (row count + the caller's own non-sensitive metadata) — never blocks or
 * delays the download itself, and never includes the exported row content.
 */
export function downloadCsv(filename: string, rows: string[][], audit?: CsvExportAudit): void {
  const csv = rows
    .map((r) => r.map((c) => `"${sanitizeCsvCell(String(c)).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  if (audit) {
    const rowCount = Math.max(0, rows.length - 1); // exclude header row
    // Fire-and-forget: AuditService.log is already best-effort/non-throwing,
    // and the download above has already happened synchronously.
    void AuditService.log({
      action: "csv.exported",
      entityType: audit.entityType,
      metadata: { filename, row_count: rowCount, ...audit.metadata },
      source: "csv_export",
      success: true,
    });
  }
}
