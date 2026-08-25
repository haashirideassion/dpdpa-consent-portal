/**
 * Centralized audit-event presentation layer.
 *
 * The audit_logs table stores different metadata shapes per action (see
 * src/lib/auditActions.ts for exactly which call site writes which shape).
 * This module is the single place that turns those shapes into:
 *   - a human-readable one-line summary (used in the table's "Change" column
 *     and in the CSV export)
 *   - structured, privacy-safe detail rows (used in the audit row's details
 *     drawer)
 *
 * PRIVACY CONTRACT (do not weaken):
 *   - Never fetches current employee data to reconstruct a historical value.
 *     Only what is actually present in `metadata` at read time is ever shown.
 *   - Never displays the real old/new value of a field considered sensitive
 *     (see isSensitiveField below) — shows "Value changed" instead, even if
 *     the underlying metadata happens to contain a raw value already
 *     (e.g. admin.override's per-field payload). This is a presentation-only
 *     restriction; it does not change what is stored.
 *   - Falls back to a safe, generic summary for any action/shape this module
 *     doesn't explicitly recognize — never JSON.stringify()'s a metadata
 *     blob that might contain something sensitive nobody has reviewed yet.
 */
import { isDpdpaField, maskValue } from "@/lib/dpdpa";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/auditActions";

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id?: string | null;
  created_at: string;
  user_email: string | null;
  metadata?: Record<string, any> | null;
  success?: boolean | null;
  source?: string | null;
  actor_role?: string | null;
  correlation_id?: string | null;
  failure_reason?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Action labels
// ─────────────────────────────────────────────────────────────────────────

const ACTION_LABELS: Partial<Record<AuditAction, string>> = {
  USER_LOGIN: "User Login",
  logout: "User Logout",
  "consent.granted": "Consent Granted",
  "consent.withdrawn": "Consent Withdrawn",
  "video.completed": "Video Completed",
  "education.completed": "Education Completed",
  "admin.override": "Admin Override",
  "dsr.status_updated": "DSR Status Updated",
  bootstrap_admin: "Admin Bootstrapped",
  reset_onboarding: "Onboarding Reset",
  "employee.created": "Employee Created",
  "employee.updated": "Employee Updated",
  "employee.import_completed": "Employee Import Completed",
  "jurisdiction.assigned": "Jurisdiction Assigned",
  "csv.exported": "CSV Exported",
  "video.created": "Video Created",
  "video.published": "Video Published",
  "video.deactivated": "Video Deactivated",
  "correction.submitted": "Correction Submitted",
  "correction.approved": "Correction Approved",
  "correction.rejected": "Correction Rejected",
  "dsr.created": "DSR Created",
  "compliance.updated": "Compliance Updated",
  "breach.updated": "Breach Updated",
};

/** "some_unknown.action" → "Some Unknown Action" — never throws, never returns raw dots/underscores. */
function humanizeFallback(raw: string): string {
  return raw
    .replace(/[._]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatAuditActionLabel(action: string): string {
  return ACTION_LABELS[action as AuditAction] ?? humanizeFallback(action);
}

// ─────────────────────────────────────────────────────────────────────────
// Field labels (UI field key → human label). Covers every key that appears
// in FIELD_MAP across employee.service.ts / correction.service.ts.
// ─────────────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  employee_code: "Employee Code",
  first_name: "First Name",
  last_name: "Last Name",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  blood_group: "Blood Group",
  marital_status: "Marital Status",
  nationality: "Nationality",
  father_name: "Father's Name",
  mother_name: "Mother's Name",
  work_email: "Work Email",
  personal_email: "Personal Email",
  phone_number: "Phone Number",
  alternate_phone: "Alternate Phone",
  current_address: "Current Address",
  permanent_address: "Permanent Address",
  city: "City",
  state: "State",
  pincode: "Pincode",
  department: "Department",
  designation: "Designation",
  date_of_joining: "Date of Joining",
  employment_type: "Employment Type",
  reporting_manager: "Reporting Manager",
  work_location: "Work Location",
  employee_status: "Employee Status",
  bank_name: "Bank Name",
  bank_account_number: "Bank Account Number",
  ifsc_code: "IFSC Code",
  pan_number: "PAN Number",
  ctc: "CTC",
  bank_branch: "Bank Branch",
  upi_id: "UPI ID",
  pf_account: "PF Account",
  esic_number: "ESIC Number",
  aadhaar_number: "Aadhaar Number",
  uan_number: "UAN Number",
  passport_number: "Passport Number",
  passport_expiry: "Passport Expiry",
  driving_license: "Driving License",
  voter_id: "Voter ID",
  emergency_contact_name: "Emergency Contact Name",
  emergency_contact_relation: "Emergency Contact Relation",
  emergency_contact_phone: "Emergency Contact Phone",
  emergency_contact_email: "Emergency Contact Email",
  qualifications: "Qualifications",
  certifications: "Certifications",
  languages: "Languages",
  notes: "Notes",
  disability_status: "Disability Status",
  chronic_conditions: "Chronic Conditions",
  allergies: "Allergies",
};

export function formatFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? humanizeFallback(key);
}

// Section table names (employee.updated's multi-entry CRUD metadata) → label.
const SECTION_LABELS: Record<string, string> = {
  employee_education: "Education",
  employee_certifications_v2: "Certifications",
  employee_employment_history: "Employment History",
  employee_nominees: "Nominees",
  employee_dependents: "Dependents",
  employee_additional_details: "Additional Notes",
};

function formatSectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? humanizeFallback(key);
}

// ─────────────────────────────────────────────────────────────────────────
// Sensitive-field display rule — presentation layer only, does not change
// what is stored. Built on the app-wide canonical DPDPA_FIELDS list
// (src/lib/dpdpa.ts), plus a small supplement for keys that list doesn't
// cover but this audit UI must still never show real values for.
// ─────────────────────────────────────────────────────────────────────────

const AUDIT_EXTRA_SENSITIVE_FIELDS = new Set([
  "father_name",
  "mother_name",
  "disability_status",
  "chronic_conditions",
  "allergies",
]);

export function isSensitiveField(field: string): boolean {
  return isDpdpaField(field) || AUDIT_EXTRA_SENSITIVE_FIELDS.has(field);
}

/** The real value for a non-sensitive field; "Not set" when it's genuinely empty/null. */
function displayableValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (isSensitiveField(field)) return "Value changed";
  return String(value);
}

/**
 * "Set" / "Not set" state for a sensitive field — safe to show because it
 * reveals only whether a value exists, never the value itself. Only call
 * this when the underlying metadata actually captured old/new (see the
 * admin.override case below) — never invent a state for data that was
 * never recorded in the first place.
 */
function fieldStateLabel(value: unknown): string {
  return value === null || value === undefined || value === "" ? "Not set" : "Set";
}

// ─────────────────────────────────────────────────────────────────────────
// One-line summary — used in the table's "Change" column and the CSV export.
// ─────────────────────────────────────────────────────────────────────────

export function summarizeAuditEvent(log: AuditLogRow): string {
  const m = log.metadata ?? {};
  const failed = log.success === false;

  switch (log.action as AuditAction) {
    case "USER_LOGIN": {
      const provider = typeof m.provider === "string" ? m.provider : "azure";
      return `Logged in via ${provider}`;
    }
    case "logout":
      return "User logged out";

    case "consent.granted":
      if (failed) return "Consent submission failed";
      if (m.re_consent) return `Consent re-granted${m.purpose_label ? ` for ${m.purpose_label}` : ""}`;
      return typeof m.purposes_consented?.length === "number"
        ? `Consent granted (${m.purposes_consented.length} purpose${m.purposes_consented.length === 1 ? "" : "s"})`
        : "Consent granted";
    case "consent.withdrawn":
      if (failed) return "Consent withdrawal failed";
      return m.purpose_label ? `Consent withdrawn for ${m.purpose_label}` : "Consent withdrawn";

    case "video.completed":
      return typeof m.completion_pct === "number" ? `Video completed (${m.completion_pct}%)` : "Video completed";
    case "education.completed":
      return m.version ? `Education module completed (v${m.version})` : "Education module completed";

    case "admin.override": {
      const label = formatFieldLabel(m.field ?? "");
      if (!m.field) return "Employee field updated";
      if (isSensitiveField(m.field) || m.change === "updated") return `${label}: value changed`;
      return `${label}: ${displayableValue(m.field, m.old_value)} → ${displayableValue(m.field, m.new_value)}`;
    }

    case "dsr.status_updated":
      return m.from && m.to ? `Status changed from ${m.from} to ${m.to}` : "Status updated";
    case "dsr.created":
      if (failed) return "DSR creation failed";
      return m.request_type ? `${humanizeFallback(m.request_type)} request created` : "DSR created";

    case "bootstrap_admin":
      return m.reason === "promoted_existing" ? "Existing employee promoted to admin" : "Admin account bootstrapped";
    case "reset_onboarding":
      return m.reason ? `Onboarding reset (${m.reason})` : "Onboarding reset";

    case "employee.created":
      if (failed) return "Employee creation failed";
      return m.employee_code ? `Employee record created (${m.employee_code})` : "Employee record created";

    case "employee.updated": {
      if (m.section) {
        const sec = formatSectionLabel(m.section);
        const change = m.change === "added" ? "added to" : m.change === "deleted" ? "removed from" : "updated in";
        return `${sec} record ${change}`;
      }
      if (failed) return "Employee update failed";
      const n = Array.isArray(m.fields) ? m.fields.length : 0;
      return n > 0 ? `${n} field${n === 1 ? "" : "s"} changed` : "Employee updated";
    }

    case "employee.import_completed": {
      const created = m.created ?? 0;
      const total = m.total_valid_rows ?? created;
      const failedCount = m.failed ?? 0;
      return failedCount > 0
        ? `${created} of ${total} employees imported (${failedCount} failed)`
        : `${created} employee${created === 1 ? "" : "s"} imported`;
    }

    case "jurisdiction.assigned":
      if (failed) return "Jurisdiction assignment failed";
      return m.change === "assigned" ? "Jurisdiction assigned" : "Jurisdiction/framework assignment updated";

    case "csv.exported": {
      const entity = log.entity_type ? log.entity_type.replace(/_/g, " ") : "Report";
      return typeof m.row_count === "number" ? `${entity} exported (${m.row_count} rows)` : `${entity} exported`;
    }

    case "video.created":
      if (failed) return "Video creation failed";
      return m.version ? `Video version ${m.version} created` : "Video version created";
    case "video.published":
      if (failed) return "Video publish failed";
      return m.version ? `Video version ${m.version} published` : "Video published";
    case "video.deactivated":
      if (failed) return "Video deactivation failed";
      return m.version ? `Video version ${m.version} deactivated` : "Video deactivated";

    case "correction.submitted": {
      if (failed) return "Correction submission failed";
      if (m.section) return `Correction submitted for ${formatSectionLabel(m.section)}`;
      return m.field ? `Correction submitted for ${formatFieldLabel(m.field)}` : "Correction submitted";
    }
    case "correction.approved":
      if (failed) return "Correction approval failed";
      return m.field ? `Correction approved for ${formatFieldLabel(m.field)}` : "Correction request approved";
    case "correction.rejected":
      if (failed) return "Correction rejection failed";
      return m.field ? `Correction rejected for ${formatFieldLabel(m.field)}` : "Correction request rejected";

    case "compliance.updated": {
      if (m.change === "created") return "Compliance record created";
      if (m.change === "reviewed") return "Compliance record marked reviewed";
      const n = Array.isArray(m.fields) ? m.fields.length : 0;
      return n > 0 ? `${n} compliance field${n === 1 ? "" : "s"} changed` : "Compliance record updated";
    }
    case "breach.updated": {
      if (m.change === "created") return m.severity ? `Breach recorded (${humanizeFallback(m.severity)} severity)` : "Breach recorded";
      if (m.change === "board_notified") return "Board notified of breach";
      if (m.change === "principals_notified") return "Affected principals notified of breach";
      return "Breach record updated";
    }

    default:
      // Unknown/future action — never crash, never dump raw metadata that
      // hasn't been reviewed for sensitivity. Just say something happened.
      return failed ? "Action failed" : "Action recorded";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Structured detail rows — used by the audit row details drawer.
// ─────────────────────────────────────────────────────────────────────────

export interface AuditDetailRow {
  label: string;
  value: string;
}

/**
 * Returns the "Change" detail rows for an audit event, or null when there is
 * genuinely nothing safe/useful to show beyond the one-line summary.
 * Never returns a raw old/new value for a sensitive field — see
 * displayableValue() above.
 */
export function getAuditDetailRows(log: AuditLogRow): AuditDetailRow[] | null {
  const m = log.metadata ?? {};

  switch (log.action as AuditAction) {
    case "admin.override": {
      if (!m.field) return null;
      const label = formatFieldLabel(m.field);

      // Sensitive fields never have old_value/new_value captured at all
      // (see SENSITIVE_OVERRIDE_FIELDS in employee.service.ts — the writer
      // only sends {field, change:"updated"} for these). Claiming a
      // "Not set" state for data that was never recorded would be
      // inventing information, so this is checked by key presence, not by
      // isSensitiveField() alone — if the data isn't there, say so plainly.
      const captured = "old_value" in m || "new_value" in m;
      if (!captured) {
        return [{ label, value: "Value changed" }];
      }

      if (isSensitiveField(m.field)) {
        // Presence/absence of a value is safe to reveal (it doesn't expose
        // the value itself), so this is more informative than a bare
        // "Value changed" whenever the data is actually available.
        return [
          { label: `${label} — Previous`, value: fieldStateLabel(m.old_value) },
          { label: `${label} — Current`, value: fieldStateLabel(m.new_value) },
        ];
      }

      return [
        { label: `${label} — Previous`, value: displayableValue(m.field, m.old_value) },
        { label: `${label} — Current`, value: displayableValue(m.field, m.new_value) },
      ];
    }

    case "employee.updated": {
      if (m.section) {
        return [
          { label: "Section", value: formatSectionLabel(m.section) },
          { label: "Change", value: m.change ? humanizeFallback(m.change) : "Updated" },
        ];
      }
      if (Array.isArray(m.fields) && m.fields.length > 0) {
        return m.fields.map((f: string) => ({ label: formatFieldLabel(f), value: "Value changed" }));
      }
      return null;
    }

    case "dsr.status_updated":
      if (!m.from && !m.to) return null;
      return [
        { label: "Previous Status", value: m.from ? humanizeFallback(m.from) : "—" },
        { label: "New Status", value: m.to ? humanizeFallback(m.to) : "—" },
      ];

    case "jurisdiction.assigned":
      return [{ label: "Change", value: m.change ? humanizeFallback(m.change) : "Updated" }];

    case "consent.granted":
      if (Array.isArray(m.purposes_consented) && m.purposes_consented.length > 0) {
        return [{ label: "Purposes Consented", value: String(m.purposes_consented.length) }];
      }
      return m.reason_code ? [{ label: "Failure Detail", value: humanizeFallback(m.reason_code) }] : null;
    case "consent.withdrawn":
      return m.purpose_label ? [{ label: "Purpose", value: m.purpose_label }] : null;

    case "employee.import_completed":
      return [
        { label: "Rows Attempted", value: String(m.total_valid_rows ?? "—") },
        { label: "Created", value: String(m.created ?? "—") },
        { label: "Failed", value: String(m.failed ?? 0) },
        { label: "Skipped (Invalid)", value: String(m.skipped_invalid_rows ?? 0) },
      ];

    case "correction.approved":
    case "correction.rejected":
    case "correction.submitted":
      if (!m.field && !m.section && !m.table) return null;
      return [
        m.field ? { label: "Field", value: formatFieldLabel(m.field) } : null,
        m.section ? { label: "Section", value: formatSectionLabel(m.section) } : null,
        m.table ? { label: "Table", value: humanizeFallback(m.table) } : null,
      ].filter((r): r is AuditDetailRow => r !== null);

    case "csv.exported":
      return [
        { label: "Rows Exported", value: String(m.row_count ?? "—") },
        { label: "File Name", value: m.filename ?? "—" },
      ];

    case "video.created":
    case "video.published":
    case "video.deactivated":
      return [
        m.language ? { label: "Language", value: m.language } : null,
        m.version ? { label: "Version", value: m.version } : null,
      ].filter((r): r is AuditDetailRow => r !== null);

    case "breach.updated":
      return [
        m.severity ? { label: "Severity", value: humanizeFallback(m.severity) } : null,
        m.status ? { label: "Status", value: humanizeFallback(m.status) } : null,
      ].filter((r): r is AuditDetailRow => r !== null);

    case "compliance.updated":
      if (Array.isArray(m.fields) && m.fields.length > 0) {
        return m.fields.map((f: string) => ({ label: formatFieldLabel(f), value: "Value changed" }));
      }
      return m.category ? [{ label: "Category", value: m.category }] : null;

    default:
      return null;
  }
}

// Sanity net (dev only): every AUDIT_ACTIONS entry should have an explicit
// summarizeAuditEvent() branch — if this ever warns, add a case above
// rather than relying on the generic fallback for a real, known action.
if (import.meta.env.DEV) {
  const HANDLED: ReadonlySet<string> = new Set([
    "USER_LOGIN", "logout", "consent.granted", "consent.withdrawn", "video.completed",
    "education.completed", "admin.override", "dsr.status_updated", "bootstrap_admin",
    "reset_onboarding", "employee.created", "employee.updated", "employee.import_completed",
    "jurisdiction.assigned", "csv.exported", "video.created", "video.published",
    "video.deactivated", "correction.submitted", "correction.approved", "correction.rejected",
    "dsr.created", "compliance.updated", "breach.updated",
  ]);
  (AUDIT_ACTIONS as readonly string[]).forEach((a) => {
    if (!HANDLED.has(a)) {
      console.warn(`[auditPresentation] "${a}" has no explicit summary case — update summarizeAuditEvent()`);
    }
  });
}
