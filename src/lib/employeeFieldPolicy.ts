/**
 * EMPLOYEE FIELD MODIFICATION POLICY
 *
 * Organization-defined access control for employee-editable UI field keys
 * (see EmployeeService.FIELD_MAP / CorrectionService's FIELD_MAP for the
 * UI-key -> {table, column} translation these keys refer to), based on data
 * classification, business ownership, and approval requirements — not a
 * blanket rule that every field needs HR approval.
 *
 * Three modification categories:
 *
 *   DIRECT_EDIT        — low-risk, employee-owned contact/profile data.
 *                         The employee can self-service edit it immediately;
 *                         no correction request, no approval.
 *   CORRECTION_REQUIRED — protected/confidential personal information the
 *                         employee owns but cannot write directly. Changes
 *                         go through the existing correction-request +
 *                         HR/Admin approval workflow.
 *   ADMIN_MANAGED       — organization-controlled fields the employee does
 *                         not own at all (identity/system fields, HR/org
 *                         assignments). The employee gets neither an Edit
 *                         nor a correction affordance — these are changed
 *                         directly by an authorized HR/Admin.
 *
 * This is a UI-gating convenience only — the actual authorization boundary
 * lives in the database:
 *   - supabase/migrations/20260825000006_field_level_modification_approval.sql
 *     (BEFORE INSERT/UPDATE triggers blocking self-writes to
 *     approval-required and admin-managed columns alike — both categories
 *     are enforced by the same "employee cannot write this column directly"
 *     trigger; ADMIN_MANAGED is simply the UI choosing not to also offer a
 *     correction-request affordance for them)
 *   - the existing correction_allowed_field() allowlist
 *     (20260821000004_harden_approve_correction_column_allowlist.sql)
 *     used by approve_correction()
 *
 * Keep this in sync with the migration's classification when either
 * changes — this file does not read from the database.
 */

/**
 * Fields an employee may update directly (no correction request,
 * no approval) — validated normally and written straight to the
 * employee record.
 */
export const DIRECT_EDIT_FIELDS = new Set<string>([
  "personal_email",
  "phone_number",
  "current_address",
  "permanent_address",
  "emergency_contact_name",
  "emergency_contact_relation",
  "emergency_contact_phone",
  "emergency_contact_email",
]);

/**
 * Organization-controlled fields the employee does not own — set/changed
 * only by an authorized HR/Admin (directly, via the admin employee editor),
 * never by the employee, and never through the correction-request workflow
 * either. Distinct from CORRECTION_REQUIRED: those are the employee's own
 * protected data (they can ask for a change); these are the business's
 * data about the employee (only the business changes them).
 */
export const ADMIN_MANAGED_FIELDS = new Set<string>([
  // Identity/system-generated
  "employee_code",
  "work_email",
  // HR/org-assignment
  "department",
  "designation",
  "date_of_joining",
  "employment_type",
  "employee_status",
  "reporting_manager",
  "work_location",
]);

/**
 * Subset of ADMIN_MANAGED_FIELDS that are system/identity-generated rather
 * than merely HR-decided — surfaced with "System managed" instead of
 * "Managed by HR/Admin" so the reason read-only is a bit more precise.
 */
const SYSTEM_MANAGED_FIELDS = new Set<string>(["employee_code", "work_email"]);

export type FieldModificationPolicy = "direct_edit" | "correction_required" | "admin_managed";

/** Resolves the single modification category for a UI field key. */
export function getFieldModificationPolicy(uiKey: string): FieldModificationPolicy {
  if (DIRECT_EDIT_FIELDS.has(uiKey)) return "direct_edit";
  if (ADMIN_MANAGED_FIELDS.has(uiKey)) return "admin_managed";
  return "correction_required";
}

export function isDirectEditField(uiKey: string): boolean {
  return DIRECT_EDIT_FIELDS.has(uiKey);
}

export function isAdminManagedField(uiKey: string): boolean {
  return ADMIN_MANAGED_FIELDS.has(uiKey);
}

export function isApprovalRequiredField(uiKey: string): boolean {
  return !DIRECT_EDIT_FIELDS.has(uiKey) && !ADMIN_MANAGED_FIELDS.has(uiKey);
}

/** Compact read-only label for an ADMIN_MANAGED field's indicator pill. */
export function adminManagedLabel(uiKey: string): string {
  return SYSTEM_MANAGED_FIELDS.has(uiKey) ? "System managed" : "Managed by HR/Admin";
}
