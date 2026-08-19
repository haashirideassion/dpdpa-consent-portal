import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { CloudDownloadBoldDuotone, CloudUploadBoldDuotone } from "solar-icon-set";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { downloadCsv } from "@/lib/csv";
import { EmployeeService } from "@/services/employee.service";
import { CountryService, type Country } from "@/services/country.service";
import { FrameworkService, type RegulatoryFramework } from "@/services/framework.service";
import { JurisdictionService } from "@/services/jurisdiction.service";

/**
 * BULK IMPORT EMPLOYEES (CSV)
 *
 * Replaces the previous "upload and hope" flow (which posted straight to a
 * `bulk_import_employees` RPC that does not exist in any migration) with a
 * client-driven import that reuses the SAME, unmodified employee-creation
 * architecture as "Add New Employee":
 *
 *   - master + personal + contact fields  → create_employee_with_details()
 *     RPC (unchanged — same signature, same admin-only guard)
 *   - employment fields + father/mother    → EmployeeService.updateEmployee()
 *     name (not covered by the RPC)          (existing translation layer,
 *                                              unchanged)
 *   - country → jurisdiction assignment    → CountryService / FrameworkService
 *                                              / JurisdictionService (existing,
 *                                              unchanged)
 *
 * No new Supabase queries are written against employee tables here beyond
 * the duplicate employee_code/email pre-check, which mirrors the existing
 * pattern already used by AddEmployeeModal in the same route file.
 *
 * Region/regulatory framework are NEVER read from the CSV directly — only
 * `country` is. The applicable framework is always resolved from the
 * database via regulatory_framework_countries, exactly like the Add
 * Employee form's Jurisdiction section. A country with zero or more than
 * one active framework is reported as a row-level error, never guessed.
 */

const CSV_HEADERS = [
  "employee_code",
  "first_name",
  "last_name",
  "email",
  "date_of_joining",
  "department",
  "designation",
  "employment_type",
  "work_location",
  "date_of_birth",
  "gender",
  "blood_group",
  "marital_status",
  "nationality",
  "father_name",
  "mother_name",
  "personal_email",
  "phone_number",
  "alternate_phone",
  "current_address",
  "permanent_address",
  "city",
  "state",
  "pincode",
  "country",
] as const;

const EXAMPLE_ROW = [
  "EMP-1010",
  "Asha",
  "Verma",
  "asha.verma@company.com",
  "2024-01-15",
  "Engineering",
  "Software Engineer",
  "Full-time",
  "Bengaluru",
  "1996-05-20",
  "Female",
  "O+",
  "Single",
  "Indian",
  "Ramesh Verma",
  "Sunita Verma",
  "asha.personal@gmail.com",
  "+91 9876543210",
  "",
  "123 MG Road, Bengaluru",
  "123 MG Road, Bengaluru",
  "Bengaluru",
  "Karnataka",
  "560001",
  "India",
];

// Same enumerations the Add Employee form / Employee Details view already
// use (EmployeeDataView.tsx) — kept in sync manually since neither is
// exported as a shared constant today.
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Intern", "Consultant"];
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed", "Separated"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-()]{7,15}$/;
const PINCODE_RE = /^\d{4,10}$/;
const DATE_FIELDS = ["date_of_birth", "date_of_joining"] as const;

interface ParsedRow {
  rowNumber: number; // 1-based, excludes header — matches what a user sees in a spreadsheet
  data: Record<string, string>;
  errors: string[];
  countryId: string | null;
  regulatoryFrameworkId: string | null;
}

interface ImportOutcome {
  row: ParsedRow;
  success: boolean;
  error?: string;
  warning?: string;
}

type Step = "upload" | "preview" | "importing" | "result";

function normalizeDate(val: string): string {
  const dmy = val.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : val;
}

function isValidDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const d = new Date(val);
  return !Number.isNaN(d.getTime());
}

/** Splits a CSV line on commas that are not inside a quoted field. */
function splitCsvLine(line: string): string[] {
  return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
}

function parseCsv(text: string): { headers: string[]; dataLines: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new Error("File must contain a header row and at least one data row.");
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return { headers, dataLines: lines.slice(1) };
}

async function validateRows(
  dataLines: string[],
  headers: string[],
  existing: { codes: Set<string>; emails: Set<string> },
  countries: Country[],
): Promise<ParsedRow[]> {
  const seenCodes = new Set<string>();
  const seenEmails = new Set<string>();
  const frameworkCache = new Map<string, RegulatoryFramework[]>();
  const rows: ParsedRow[] = [];
  let rowNumber = 0;

  for (const line of dataLines) {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (!h) return;
      let val = values[idx]?.trim() ?? "";
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      row[h] = val;
    });
    if (Object.values(row).every((v) => v === "")) continue; // skip blank lines
    rowNumber += 1;

    const errors: string[] = [];
    const code = (row.employee_code || "").trim();
    const email = (row.email || "").trim().toLowerCase();

    if (!code) errors.push("employee_code is required");
    if (!(row.first_name || "").trim()) errors.push("first_name is required");
    if (!(row.last_name || "").trim()) errors.push("last_name is required");
    if (!email) errors.push("email is required");
    else if (!EMAIL_RE.test(email)) errors.push("Invalid email format");

    if (code) {
      const codeKey = code.toLowerCase();
      if (existing.codes.has(codeKey)) errors.push(`Employee code '${code}' already exists`);
      else if (seenCodes.has(codeKey)) errors.push(`Duplicate employee_code '${code}' within this file`);
      seenCodes.add(codeKey);
    }
    if (email) {
      if (existing.emails.has(email)) errors.push(`Email '${email}' already exists`);
      else if (seenEmails.has(email)) errors.push(`Duplicate email '${email}' within this file`);
      seenEmails.add(email);
    }

    if (row.personal_email && !EMAIL_RE.test(row.personal_email.trim())) {
      errors.push("Invalid personal_email format");
    }
    if (row.phone_number && !PHONE_RE.test(row.phone_number.trim())) {
      errors.push("Invalid phone_number format");
    }
    if (row.alternate_phone && !PHONE_RE.test(row.alternate_phone.trim())) {
      errors.push("Invalid alternate_phone format");
    }
    if (row.pincode && !PINCODE_RE.test(row.pincode.trim())) {
      errors.push("Invalid pincode");
    }

    for (const f of DATE_FIELDS) {
      if (row[f]) {
        const norm = normalizeDate(row[f].trim());
        row[f] = norm;
        if (!isValidDate(norm)) errors.push(`Invalid date format for ${f} (use YYYY-MM-DD or DD-MM-YYYY)`);
      }
    }

    if (row.employment_type && !EMPLOYMENT_TYPES.includes(row.employment_type.trim())) {
      errors.push(`Invalid employment_type '${row.employment_type}' (expected one of: ${EMPLOYMENT_TYPES.join(", ")})`);
    }
    if (row.gender && !GENDERS.includes(row.gender.trim())) {
      errors.push(`Invalid gender '${row.gender}'`);
    }
    if (row.blood_group && !BLOOD_GROUPS.includes(row.blood_group.trim())) {
      errors.push(`Invalid blood_group '${row.blood_group}'`);
    }
    if (row.marital_status && !MARITAL_STATUSES.includes(row.marital_status.trim())) {
      errors.push(`Invalid marital_status '${row.marital_status}'`);
    }

    // ── Country → jurisdiction resolution (DB-driven, never guessed) ─────
    let countryId: string | null = null;
    let regulatoryFrameworkId: string | null = null;
    const countryName = (row.country || "").trim();
    if (countryName) {
      const country = countries.find((c) => c.name.toLowerCase() === countryName.toLowerCase());
      if (!country) {
        errors.push(`Invalid country: ${countryName}`);
      } else if (!country.is_active) {
        errors.push(`Country '${countryName}' is not active`);
      } else {
        countryId = country.id;
        let frameworks = frameworkCache.get(country.id);
        if (!frameworks) {
          frameworks = await FrameworkService.getForCountry(country.id);
          frameworkCache.set(country.id, frameworks);
        }
        if (frameworks.length === 0) {
          errors.push(`No active regulatory framework is configured for '${countryName}'`);
        } else if (frameworks.length === 1) {
          regulatoryFrameworkId = frameworks[0].id;
        } else {
          errors.push(
            `Multiple regulatory frameworks apply to '${countryName}' — this row requires manual jurisdiction/framework selection`,
          );
        }
      }
    }

    rows.push({ rowNumber, data: row, errors, countryId, regulatoryFrameworkId });
  }

  return rows;
}

async function importRow(row: ParsedRow, assignedByUserId: string): Promise<ImportOutcome> {
  const d = row.data;
  try {
    const { data: newId, error: createError } = await (supabase as any).rpc("create_employee_with_details", {
      p_first_name: d.first_name.trim(),
      p_last_name: d.last_name.trim(),
      p_employee_code: d.employee_code.trim(),
      p_work_email: d.email.trim().toLowerCase(),
      p_personal_email: d.personal_email?.trim() || null,
      p_phone: d.phone_number?.trim() || null,
      p_alternate_phone: d.alternate_phone?.trim() || null,
      p_gender: d.gender?.trim() || null,
      p_dob: d.date_of_birth || null,
      p_marital_status: d.marital_status?.trim() || null,
      p_nationality: d.nationality?.trim() || null,
      p_blood_group: d.blood_group?.trim() || null,
      p_current_address: d.current_address?.trim() || null,
      p_permanent_address: d.permanent_address?.trim() || null,
      p_city: d.city?.trim() || null,
      p_state: d.state?.trim() || null,
      p_pincode: d.pincode?.trim() || null,
    });
    if (createError) throw createError;

    const employeeId = newId as string;
    let warning: string | undefined;

    // Employment fields + father/mother name are not part of the RPC's
    // payload (the Add Employee form doesn't collect them either) — routed
    // through the existing EmployeeService translation layer, same as any
    // other employee edit. A failure here does not roll back the employee
    // record that already exists, so it is surfaced as a warning.
    const followUp: Record<string, string> = {};
    if (d.father_name?.trim()) followUp.father_name = d.father_name.trim();
    if (d.mother_name?.trim()) followUp.mother_name = d.mother_name.trim();
    if (d.department?.trim()) followUp.department = d.department.trim();
    if (d.designation?.trim()) followUp.designation = d.designation.trim();
    if (d.employment_type?.trim()) followUp.employment_type = d.employment_type.trim();
    if (d.date_of_joining) followUp.date_of_joining = d.date_of_joining;
    if (d.work_location?.trim()) followUp.work_location = d.work_location.trim();
    if (Object.keys(followUp).length > 0) {
      try {
        await EmployeeService.updateEmployee(employeeId, followUp);
      } catch (err: any) {
        warning = `Employee created, but employment details failed to save: ${err?.message ?? "unknown error"}`;
      }
    }

    // Jurisdiction assignment — optional, best-effort, exactly like the Add
    // Employee form. Does not affect whether the employee row exists.
    if (row.countryId) {
      try {
        await JurisdictionService.assignForEmployee(
          employeeId,
          { countryId: row.countryId, regulatoryFrameworkId: row.regulatoryFrameworkId },
          assignedByUserId,
        );
      } catch (err: any) {
        warning = warning
          ? `${warning} Jurisdiction assignment also failed: ${err?.message ?? "unknown error"}`
          : `Employee created, but jurisdiction assignment failed: ${err?.message ?? "unknown error"}`;
      }
    }

    return { row, success: true, warning };
  } catch (err: any) {
    return { row, success: false, error: err?.message ?? "Failed to create employee" };
  }
}

export function BulkImportEmployeesModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  function reset() {
    setStep("upload");
    setParsing(false);
    setRows([]);
    setImporting(false);
    setProgress({ done: 0, total: 0 });
    setOutcomes([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    if (importing) return;
    reset();
    onClose();
  }

  function handleDownloadTemplate() {
    downloadCsv("employee_import_template.csv", [Array.from(CSV_HEADERS), EXAMPLE_ROW]);
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const text = await file.text();
      const { headers, dataLines } = parseCsv(text);
      const [existing, countries] = await Promise.all([
        EmployeeService.getExistingIdentifiers(),
        CountryService.getAll(),
      ]);
      const parsed = await validateRows(dataLines, headers, existing, countries);
      if (parsed.length === 0) {
        toast.error("No data rows found in the file.");
        return;
      }
      setRows(parsed);
      setStep("preview");
    } catch (err: any) {
      console.error("Bulk import: failed to parse CSV", err);
      toast.error(err?.message ?? "Failed to read CSV file.");
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!user?.id || validRows.length === 0) return;
    setImporting(true);
    setStep("importing");
    setProgress({ done: 0, total: validRows.length });

    const results: ImportOutcome[] = [];
    for (const row of validRows) {
      const outcome = await importRow(row, user.id);
      results.push(outcome);
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setImporting(false);

    const created = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const hasWarnings = results.some((r) => r.warning);

    if (created > 0) {
      toast.success(`Imported ${created} employee${created === 1 ? "" : "s"}.`);
    }

    // Clean run — every valid row imported with nothing to review: close and
    // refresh immediately (expected flow: upload → validate → import → close
    // → list refreshes) instead of parking on a result screen no one needs
    // to act on. Only keep the modal open on the result step when there's
    // something the admin should actually see (failures, warnings, or rows
    // that were skipped for validation errors).
    if (failed === 0 && !hasWarnings && invalidRows.length === 0) {
      onImported();
      reset();
      onClose();
      return;
    }

    setOutcomes(results);
    setStep("result");
    if (created > 0) onImported();
  }

  function handleDone() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Bulk Import Employees (CSV)</DialogTitle>
          <DialogDescription className="text-xs">
            Download the template, fill it in, then upload it here for validation before import.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Start from the template so your columns line up with what the importer expects.
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownloadTemplate}>
                  <CloudDownloadBoldDuotone size={14} />
                  Download CSV Template
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  id="bulk-import-file"
                  onChange={handleFileSelected}
                />
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parsing}
                >
                  <CloudUploadBoldDuotone size={14} />
                  {parsing ? "Parsing…" : "Upload CSV"}
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Region and regulatory framework are never taken from the file — only a country name.</p>
              <p>If you provide a country, its region and applicable framework are resolved from the database.</p>
              <p>Leave country blank to keep the existing default (India / DPDPA) behavior.</p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge tone="success" className="text-xs">Valid rows: {validRows.length}</StatusBadge>
              <StatusBadge tone={invalidRows.length > 0 ? "danger" : "neutral"} className="text-xs">
                Invalid rows: {invalidRows.length}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">
                Only valid rows will be imported. Invalid rows are skipped — fix them and re-upload if needed.
              </span>
            </div>

            <div className="max-h-[360px] overflow-y-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell className="text-xs text-muted-foreground align-top">{r.rowNumber}</TableCell>
                      <TableCell className="text-sm align-top">
                        <div className="font-medium">
                          {r.data.first_name} {r.data.last_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{r.data.employee_code}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground align-top">{r.data.email || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground align-top">{r.data.country || "—"}</TableCell>
                      <TableCell className="align-top">
                        {r.errors.length === 0 ? (
                          <StatusBadge tone="success" className="text-xs">Valid</StatusBadge>
                        ) : (
                          <div className="space-y-1">
                            <StatusBadge tone="danger" className="text-xs">Invalid</StatusBadge>
                            <ul className="text-[11px] text-destructive list-disc pl-4">
                              {r.errors.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-10 text-center space-y-3">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Importing {progress.done} of {progress.total}…
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge tone="success" className="text-xs">
                Created: {outcomes.filter((o) => o.success).length}
              </StatusBadge>
              <StatusBadge tone={outcomes.some((o) => !o.success) ? "danger" : "neutral"} className="text-xs">
                Failed: {outcomes.filter((o) => !o.success).length}
              </StatusBadge>
              {invalidRows.length > 0 && (
                <StatusBadge tone="warning" className="text-xs">
                  Skipped (invalid): {invalidRows.length}
                </StatusBadge>
              )}
            </div>

            {outcomes.some((o) => o.warning || !o.success) && (
              <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/60">
                {outcomes
                  .filter((o) => o.warning || !o.success)
                  .map((o) => (
                    <div key={o.row.rowNumber} className="px-3 py-2 text-xs">
                      <div className="font-medium">
                        Row {o.row.rowNumber} — {o.row.data.first_name} {o.row.data.last_name} ({o.row.data.employee_code})
                      </div>
                      <div className={o.success ? "text-warning" : "text-destructive"}>
                        {o.success ? o.warning : o.error}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {invalidRows.length > 0 && (
              <div className="rounded-lg border border-border/60">
                <p className="px-3 py-2 text-xs font-medium bg-muted/30">Skipped rows (validation errors)</p>
                <div className="max-h-[220px] overflow-y-auto divide-y divide-border/60">
                  {invalidRows.map((r) => (
                    <div key={r.rowNumber} className="px-3 py-2 text-xs">
                      <div className="font-medium">
                        Row {r.rowNumber} — {r.data.first_name} {r.data.last_name} ({r.data.employee_code || "no code"})
                      </div>
                      <ul className="text-destructive list-disc pl-4">
                        {r.errors.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 pt-2 border-t mt-2">
          {step === "preview" && (
            <>
              <Button variant="outline" size="sm" onClick={reset}>
                Back
              </Button>
              <Button size="sm" onClick={handleImport} disabled={validRows.length === 0}>
                Import {validRows.length} Valid Employee{validRows.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
          {step === "upload" && (
            <Button variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </Button>
          )}
          {step === "importing" && (
            <Button variant="outline" size="sm" disabled>
              Importing…
            </Button>
          )}
          {step === "result" && (
            <Button size="sm" onClick={handleDone}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Exported for reuse/testability without pulling the whole modal in.
export { CSV_HEADERS as BULK_IMPORT_CSV_HEADERS };
