import { supabase } from "@/integrations/supabase/client";
import { AuditService } from "./audit.service";
import { NotificationService } from "./notification.service";
import type { AuditSource } from "@/lib/auditActions";
import { isSensitiveField } from "@/lib/dpdpa";

/**
 * EMPLOYEE SERVICE
 * Handles all employee-related Supabase queries against the NORMALIZED schema.
 *
 * The live DB schema (migration 20260430000002) is normalized into:
 *   - employees (master: id, user_id, employee_code, first_name, last_name, email)
 *   - employee_personal_details  (dob, gender, blood_group, marital_status, nationality)
 *   - employee_contact_details   (work_email, personal_email, phone, alternate_phone, ...)
 *   - employee_employment_details(department, designation, joining_date, employment_type, ...)
 *   - employee_financial_details (bank_name, bank_account_number, ifsc, pan, ctc)
 *   - employee_govt_ids          (aadhaar, uan, passport, passport_expiry, ...)
 *   - employee_emergency_contacts(contact_name, relation, contact_phone, contact_email)
 *   - employee_additional_details(qualifications, certifications, languages, notes)
 *   - consent_records            (employee_id, status, signed_at)
 *
 * The UI / types.ts uses OLD column names (e.g. date_of_birth, phone_number, ifsc_code).
 * This service translates between the two without requiring a types.ts regeneration.
 */

// ---------------------------------------------------------------------------
// Table + column mapping: UI field key → { table, dbColumn }
// This is the single source of truth for the translation layer.
// ---------------------------------------------------------------------------
interface FieldMapping {
  table: string;
  column: string;
}

const FIELD_MAP: Record<string, FieldMapping> = {
  // ── employees (master) ──────────────────────────────────────────────────
  employee_code: { table: "employees", column: "employee_code" },
  first_name: { table: "employees", column: "first_name" },
  last_name: { table: "employees", column: "last_name" },

  // ── employee_personal_details ───────────────────────────────────────────
  // UI key "date_of_birth" → DB column "dob"
  date_of_birth: { table: "employee_personal_details", column: "dob" },
  gender: { table: "employee_personal_details", column: "gender" },
  blood_group: { table: "employee_personal_details", column: "blood_group" },
  marital_status: { table: "employee_personal_details", column: "marital_status" },
  nationality: { table: "employee_personal_details", column: "nationality" },

  // ── employee_contact_details ────────────────────────────────────────────
  work_email: { table: "employee_contact_details", column: "work_email" },
  personal_email: { table: "employee_contact_details", column: "personal_email" },
  // UI key "phone_number" → DB column "phone"
  phone_number: { table: "employee_contact_details", column: "phone" },
  alternate_phone: { table: "employee_contact_details", column: "alternate_phone" },
  current_address: { table: "employee_contact_details", column: "current_address" },
  permanent_address: { table: "employee_contact_details", column: "permanent_address" },
  city: { table: "employee_contact_details", column: "city" },
  state: { table: "employee_contact_details", column: "state" },
  pincode: { table: "employee_contact_details", column: "pincode" },

  // ── employee_employment_details ─────────────────────────────────────────
  department: { table: "employee_employment_details", column: "department" },
  designation: { table: "employee_employment_details", column: "designation" },
  // UI key "date_of_joining" → DB column "joining_date"
  date_of_joining: { table: "employee_employment_details", column: "joining_date" },
  employment_type: { table: "employee_employment_details", column: "employment_type" },
  // UI key "reporting_manager" → DB column "manager"
  reporting_manager: { table: "employee_employment_details", column: "manager" },
  work_location: { table: "employee_employment_details", column: "work_location" },
  // UI key "employee_status" → DB column "status"
  employee_status: { table: "employee_employment_details", column: "status" },

  // ── employee_financial_details ──────────────────────────────────────────
  bank_name: { table: "employee_financial_details", column: "bank_name" },
  bank_account_number: { table: "employee_financial_details", column: "bank_account_number" },
  // UI key "ifsc_code" → DB column "ifsc"
  ifsc_code: { table: "employee_financial_details", column: "ifsc" },
  // UI key "pan_number" → DB column "pan"
  pan_number: { table: "employee_financial_details", column: "pan" },
  ctc: { table: "employee_financial_details", column: "ctc" },

  // ── employee_govt_ids ───────────────────────────────────────────────────
  // UI key "aadhaar_number" → DB column "aadhaar"
  aadhaar_number: { table: "employee_govt_ids", column: "aadhaar" },
  // UI key "uan_number" → DB column "uan"
  uan_number: { table: "employee_govt_ids", column: "uan" },
  // UI key "passport_number" → DB column "passport"
  passport_number: { table: "employee_govt_ids", column: "passport" },
  passport_expiry: { table: "employee_govt_ids", column: "passport_expiry" },
  driving_license: { table: "employee_govt_ids", column: "driving_license" },
  voter_id: { table: "employee_govt_ids", column: "voter_id" },

  // ── employee_emergency_contacts ─────────────────────────────────────────
  // UI key "emergency_contact_name" → DB column "contact_name"
  emergency_contact_name: { table: "employee_emergency_contacts", column: "contact_name" },
  emergency_contact_relation: { table: "employee_emergency_contacts", column: "relation" },
  // UI key "emergency_contact_phone" → DB column "contact_phone"
  emergency_contact_phone: { table: "employee_emergency_contacts", column: "contact_phone" },
  emergency_contact_email: { table: "employee_emergency_contacts", column: "contact_email" },

  // ── employee_additional_details ─────────────────────────────────────────
  qualifications: { table: "employee_additional_details", column: "qualifications" },
  certifications: { table: "employee_additional_details", column: "certifications" },
  languages: { table: "employee_additional_details", column: "languages" },
  notes: { table: "employee_additional_details", column: "notes" },

  // ── employee_personal_details — PRD additions ───────────────────────────
  father_name: { table: "employee_personal_details", column: "father_name" },
  mother_name: { table: "employee_personal_details", column: "mother_name" },

  // ── employee_financial_details — PRD additions ──────────────────────────
  bank_branch: { table: "employee_financial_details", column: "bank_branch" },
  upi_id: { table: "employee_financial_details", column: "upi_id" },
  pf_account: { table: "employee_financial_details", column: "pf_account" },
  esic_number: { table: "employee_financial_details", column: "esic_number" },

  // ── employee_health_info ────────────────────────────────────────────────
  disability_status: { table: "employee_health_info", column: "disability_status" },
  chronic_conditions: { table: "employee_health_info", column: "chronic_conditions" },
  allergies: { table: "employee_health_info", column: "allergies" },
};

// ---------------------------------------------------------------------------
// Reverse alias map: DB column → UI key (used when flattening joined data)
// ---------------------------------------------------------------------------
const DB_TO_UI: Record<string, string> = {
  dob: "date_of_birth",
  phone: "phone_number",
  joining_date: "date_of_joining",
  manager: "reporting_manager",
  status: "employee_status",
  ifsc: "ifsc_code",
  pan: "pan_number",
  aadhaar: "aadhaar_number",
  uan: "uan_number",
  passport: "passport_number",
  contact_name: "emergency_contact_name",
  relation: "emergency_contact_relation",
  contact_phone: "emergency_contact_phone",
  contact_email: "emergency_contact_email",
};

/** Rename DB fields → UI keys when flattening nested join data */
function aliasToUi(obj: Record<string, any> | null | undefined): Record<string, any> {
  if (!obj) return {};
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[DB_TO_UI[key] ?? key] = value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Audit helpers (Phase 2 — see Audit Logs gap report)
//
// `applyFieldUpdates` is the actual DB-writing logic, shared by the public
// `updateEmployee` (which audits generically — field names only, never
// values) and `adminOverride` (which already writes its own detailed
// per-field old/new audit entry). Routing both through the same private
// writer means a plain update and an admin override never produce two audit
// rows for the same write.
// ---------------------------------------------------------------------------
async function applyFieldUpdates(employeeId: string, updates: Record<string, any>): Promise<void> {
  const byTable: Record<string, Record<string, any>> = {};

  for (const [uiKey, value] of Object.entries(updates)) {
    const mapping = FIELD_MAP[uiKey];
    if (!mapping || value === undefined || value === "") continue;

    if (!byTable[mapping.table]) byTable[mapping.table] = {};
    byTable[mapping.table][mapping.column] = value;
  }

  for (const [tableName, tableUpdates] of Object.entries(byTable)) {
    if (tableName === "employees") {
      const { error } = await supabase
        .from("employees")
        .update({ ...tableUpdates, updated_at: new Date().toISOString() })
        .eq("id", employeeId);

      if (error) {
        console.error(`EmployeeService: error updating ${tableName}:`, error);
        throw error;
      }
    } else {
      const { error } = await supabase
        .from(tableName as any)
        .upsert(
          { employee_id: employeeId, ...tableUpdates, updated_at: new Date().toISOString() },
          { onConflict: "employee_id" },
        );

      if (error) {
        console.error(`EmployeeService: error upserting ${tableName}:`, error);
        throw error;
      }
    }
  }
}

/**
 * Treats null, undefined, and "" as the same "empty" state for change
 * comparison — prevents e.g. a persisted NULL vs. a submitted "" from being
 * falsely reported as a change, while still catching real
 * populated↔empty transitions (which do differ under this normalization).
 */
function normalizeForCompare(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

/**
 * Determines which UI field keys in `updates` actually differ from their
 * currently persisted value, by reading only the specific columns/tables
 * FIELD_MAP says those keys live in (never a full profile fetch). Used
 * solely to build accurate audit metadata — the persisted values it reads
 * are NEVER returned, logged, or included in any error; only the list of
 * UI keys that changed is returned.
 *
 * Unmapped keys are ignored, matching applyFieldUpdates' own behavior for
 * such keys (they're not written either).
 *
 * Best-effort: if a persisted-value read fails for a table, this falls
 * back to treating that table's requested fields as changed, so a read
 * failure can never cause a real change to be silently dropped from the
 * audit — the previous (over-inclusive) behavior for that subset only.
 */
async function computeChangedFields(employeeId: string, updates: Record<string, any>): Promise<string[]> {
  const byTable: Record<string, { uiKey: string; column: string }[]> = {};

  for (const uiKey of Object.keys(updates)) {
    const mapping = FIELD_MAP[uiKey];
    if (!mapping) continue;
    if (!byTable[mapping.table]) byTable[mapping.table] = [];
    byTable[mapping.table].push({ uiKey, column: mapping.column });
  }

  const changed: string[] = [];

  for (const [tableName, cols] of Object.entries(byTable)) {
    const columnList = cols.map((c) => c.column).join(",");
    try {
      let persisted: Record<string, any> | null = null;
      if (tableName === "employees") {
        const { data, error } = await supabase
          .from("employees")
          .select(columnList)
          .eq("id", employeeId)
          .maybeSingle();
        if (error) throw error;
        persisted = data as any;
      } else {
        const { data, error } = await supabase
          .from(tableName as any)
          .select(columnList)
          .eq("employee_id", employeeId)
          .maybeSingle();
        if (error) throw error;
        persisted = data as any;
      }

      for (const { uiKey, column } of cols) {
        if (normalizeForCompare(persisted?.[column]) !== normalizeForCompare(updates[uiKey])) {
          changed.push(uiKey);
        }
      }
    } catch (err) {
      console.error(`EmployeeService: failed to read persisted values for change comparison (${tableName}):`, err);
      cols.forEach(({ uiKey }) => changed.push(uiKey));
    }
  }

  return changed;
}

/**
 * Best-effort audit event for a multi-entry section CRUD op (education,
 * certifications, employment history, nominees, dependents, additional
 * notes). Field VALUES are never logged here — only the section name, the
 * operation, and the affected record id — since these sections can contain
 * free-text the caller didn't explicitly vet for sensitivity (e.g. "notes").
 */
async function logEmployeeSectionChange(
  employeeId: string | null,
  section: string,
  change: "added" | "updated" | "deleted",
  recordId?: string,
): Promise<void> {
  await AuditService.log({
    action: "employee.updated",
    entityType: "Employee",
    entityId: employeeId ?? undefined,
    metadata: { section, change, record_id: recordId ?? null },
    source: "web_portal",
    success: true,
  });
}

/** Looks up the owning employee_id for a section row, for update/delete calls that only receive the row's own id. */
async function getSectionOwnerEmployeeId(table: string, rowId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from(table as any).select("employee_id").eq("id", rowId).maybeSingle();
    return (data as { employee_id?: string } | null)?.employee_id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export const EmployeeService = {
  /**
   * Existing employee_code/email values, lower-cased, for duplicate
   * pre-checks (e.g. the CSV bulk importer). One query instead of a
   * per-row lookup — callers diff their candidate rows against these sets
   * client-side.
   */
  async getExistingIdentifiers(): Promise<{ codes: Set<string>; emails: Set<string> }> {
    const { data, error } = await supabase.from("employees").select("employee_code, email");
    if (error) throw error;
    const codes = new Set<string>();
    const emails = new Set<string>();
    for (const row of (data ?? []) as any[]) {
      if (row.employee_code) codes.add(String(row.employee_code).toLowerCase());
      if (row.email) emails.add(String(row.email).toLowerCase());
    }
    return { codes, emails };
  },

  /**
   * Fetches the full employee profile for a given auth user ID.
   * Joins all normalized detail tables and flattens into a single object,
   * aliasing DB column names back to the UI field keys used by EmployeeDataView.
   */
  async getByUserId(userId: string) {
    const { data: employee, error } = await supabase
      .from("employees")
      .select(`
        *,
        employee_personal_details (*),
        employee_contact_details (*),
        employee_employment_details (*),
        employee_financial_details (*),
        employee_govt_ids (*),
        employee_emergency_contacts (*),
        employee_additional_details (*),
        employee_health_info (*)
      `)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!employee) return null;

    // Flatten nested detail objects and apply UI-key aliases
    return {
      ...employee,
      ...aliasToUi(employee.employee_personal_details as any),
      ...aliasToUi(employee.employee_contact_details as any),
      ...aliasToUi(employee.employee_employment_details as any),
      ...aliasToUi(employee.employee_financial_details as any),
      ...aliasToUi(employee.employee_govt_ids as any),
      ...aliasToUi(employee.employee_emergency_contacts as any),
      ...aliasToUi(employee.employee_additional_details as any),
      ...aliasToUi((employee as any).employee_health_info as any),
      // Always preserve the master id
      id: employee.id,
    };
  },

  /**
   * Fetches a full employee profile by their employees.id (used by admin views).
   */
  async getById(employeeId: string) {
    const { data: employee, error } = await supabase
      .from("employees")
      .select(`
        *,
        employee_personal_details (*),
        employee_contact_details (*),
        employee_employment_details (*),
        employee_financial_details (*),
        employee_govt_ids (*),
        employee_emergency_contacts (*),
        employee_additional_details (*),
        employee_health_info (*)
      `)
      .eq("id", employeeId)
      .maybeSingle();

    if (error) throw error;
    if (!employee) return null;

    return {
      ...employee,
      ...aliasToUi(employee.employee_personal_details as any),
      ...aliasToUi(employee.employee_contact_details as any),
      ...aliasToUi(employee.employee_employment_details as any),
      ...aliasToUi(employee.employee_financial_details as any),
      ...aliasToUi(employee.employee_govt_ids as any),
      ...aliasToUi(employee.employee_emergency_contacts as any),
      ...aliasToUi(employee.employee_additional_details as any),
      ...aliasToUi((employee as any).employee_health_info as any),
      id: employee.id,
    };
  },

  /**
   * Updates employee fields by routing each field to the correct normalized table.
   * Translates UI field keys → actual DB column names using FIELD_MAP.
   *
   * @param employeeId - The `employees.id` UUID (must exist in the employees table)
   * @param updates    - Key/value pairs using UI field keys (e.g. "date_of_birth", "phone_number")
   * @param options    - `skipAudit`: true when the caller already audits this write at a higher
   *                     level, or when the update is a best-effort follow-up to a creation flow
   *                     that already logged `employee.created` (avoids a redundant, confusing
   *                     "employee.updated" firing seconds after "employee.created"). `source`
   *                     lets a CSV-driven caller attribute the write correctly (defaults to
   *                     "web_portal").
   */
  async updateEmployee(
    employeeId: string,
    updates: Record<string, any>,
    options?: { skipAudit?: boolean; source?: AuditSource },
  ) {
    if (!employeeId || Object.keys(updates).length === 0) return;

    // Audit-accuracy fix: `updates` is whatever the caller submitted (e.g.
    // an entire form section), which is NOT the same as "what actually
    // changed" — a field can be present in `updates` with its unchanged,
    // already-persisted value. Compute the real diff BEFORE writing, so the
    // audit event (below) reports only fields that actually changed,
    // instead of every key the caller happened to include. This does not
    // alter what gets written — applyFieldUpdates still receives the full
    // `updates` object, unchanged.
    const actualChangedFields = options?.skipAudit ? [] : await computeChangedFields(employeeId, updates);

    try {
      await applyFieldUpdates(employeeId, updates);
    } catch (err: any) {
      // Audit Logs Phase 3 verification: a failed update previously threw
      // before any audit call was reached, leaving zero trace of the
      // attempt. Log the failure (field names only, same rule as success)
      // then re-throw unchanged — audit logging must never mask or swallow
      // the real error from the caller. Skipped entirely when nothing was
      // actually going to change — there is nothing meaningful to report.
      if (!options?.skipAudit && actualChangedFields.length > 0) {
        await AuditService.log({
          action: "employee.updated",
          entityType: "Employee",
          entityId: employeeId,
          metadata: { fields: actualChangedFields, change: "failed" },
          source: options?.source ?? "web_portal",
          success: false,
          failureReason: err?.message ?? "Employee update failed",
        });
      }
      throw err;
    }

    if (!options?.skipAudit && actualChangedFields.length > 0) {
      // Field NAMES only — never the actual values, since this generic path
      // is used for both ordinary and sensitive fields (financial, govt ID,
      // health). Anyone needing before/after detail should go through
      // adminOverride, which already logs per-field old/new with masking
      // applied in the audit UI.
      await AuditService.log({
        action: "employee.updated",
        entityType: "Employee",
        entityId: employeeId,
        metadata: { fields: actualChangedFields, change: "updated" },
        source: options?.source ?? "web_portal",
        success: true,
      });
    }
  },

  /**
   * Admin-only override: updates fields, writes an audit log, creates a notification, and sends an email alert.
   */
  async adminOverride(employeeId: string, updates: Record<string, any>, oldValues: Record<string, any>) {
    if (!employeeId || Object.keys(updates).length === 0) return;

    // Fetch the employee details for notification/email
    const { data: employee } = await supabase
      .from("employees")
      .select("user_id, email, first_name")
      .eq("id", employeeId)
      .single();

    // 1. Perform the update first (shared writer — does NOT self-audit; the
    // per-field audit below is more detailed than updateEmployee's generic
    // one, so calling through applyFieldUpdates avoids a duplicate row).
    await applyFieldUpdates(employeeId, updates);

    // 2. Process side-effects for each changed field
    for (const [key, newValue] of Object.entries(updates)) {
      const oldValue = oldValues[key];

      // Only log if the value actually changed
      if (newValue !== oldValue) {
        // A. Audit Log — never the actual value for a DPDPA-sensitive field
        // (see isSensitiveField in src/lib/dpdpa.ts — the single canonical
        // list shared with the audit-log display layer).
        const isSensitive = isSensitiveField(key);
        await AuditService.log({
          action: "admin.override",
          entityType: "employee",
          entityId: employeeId,
          metadata: isSensitive
            ? { field: key, change: "updated", reason: "Admin manual override" }
            : {
                field: key,
                old_value: oldValue ?? null,
                new_value: newValue,
                reason: "Admin manual override",
              },
          source: "web_portal",
          success: true,
        });

        // Skip notification & email if employee details couldn't be loaded
        if (!employee) continue;

        // Ensure user is fully linked before notifying them
        if (!employee.user_id) {
          console.warn("[EmployeeService] Employee not linked, skipping in-app notification");
        } else {
          // B. In-App Notification (Wrapped in try/catch to prevent blocking).
          // Routed through create_notification() (SECURITY DEFINER RPC) —
          // the field name is safe to include (matches the existing message
          // wording), the actual old/new value is never sent.
          try {
            await NotificationService.create({
              recipientUserId: employee.user_id,
              category: "employee.updated",
              title: "Profile Updated",
              message: `Your ${key.replace(/_/g, " ")} was updated by an Admin.`,
              entityType: "employee",
              entityId: employeeId,
              actionUrl: "/",
            });
          } catch (err) {
            console.error("[EmployeeService] Failed to insert notification:", err);
          }
        }

        // C. Email Alert (Wrapped in try/catch). Same rule as the audit log
        // above: a sensitive field's raw old/new value is never sent — the
        // edge function renders a generic "value was updated" notice
        // instead when oldValue/newValue are omitted.
        if (employee.email && employee.email.includes("@")) {
          try {
            await supabase.functions.invoke("send-email", {
              body: {
                to: employee.email,
                subject: "Update to Your Personal Data",
                fieldName: key,
                ...(isSensitive ? {} : { oldValue, newValue }),
                employeeName: employee.first_name,
              }
            });
          } catch (err) {
            console.error("[EmployeeService] Failed to send email alert:", err);
          }
        }
      }
    }
  },

  /**
   * Logs a consent action and updates the consent_records status.
   * @param employeeId - The `employees.id` UUID (must exist in the employees table)
   */
  async logConsent(
    employeeId: string,
    status: "submitted" | "consented",
    version: string,
  ) {
    const { error: recordError } = await supabase
      .from("consent_records")
      .upsert(
        {
          employee_id: employeeId,
          status: status,
          signed_at: status === "consented" ? new Date().toISOString() : undefined,
        },
        { onConflict: "employee_id" },
      );

    if (recordError) throw recordError;

    const { error: logError } = await supabase.from("consent_logs").insert({
      employee_id: employeeId,
      consent_status: status,
      consent_version: version,
    });

    if (logError) throw logError;
  },

  // ── Multi-entry section CRUD ─────────────────────────────────────────────

  async getEducation(employeeId: string) {
    const { data, error } = await supabase
      .from("employee_education" as any)
      .select("*")
      .eq("employee_id", employeeId)
      .order("year_of_passing", { ascending: false });
    if (error) throw error;
    return (data ?? []) as any[];
  },
  async addEducation(employeeId: string, record: Record<string, any>) {
    const { error } = await supabase
      .from("employee_education" as any)
      .insert({ ...record, employee_id: employeeId });
    if (error) throw error;
    await logEmployeeSectionChange(employeeId, "employee_education", "added");
  },
  async updateEducation(id: string, record: Record<string, any>) {
    const ownerId = await getSectionOwnerEmployeeId("employee_education", id);
    const { error } = await supabase
      .from("employee_education" as any)
      .update({ ...record, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    await logEmployeeSectionChange(ownerId, "employee_education", "updated", id);
  },
  async deleteEducation(id: string) {
    const ownerId = await getSectionOwnerEmployeeId("employee_education", id);
    const { error } = await supabase
      .from("employee_education" as any)
      .delete()
      .eq("id", id);
    if (error) throw error;
    await logEmployeeSectionChange(ownerId, "employee_education", "deleted", id);
  },

  async getCertifications(employeeId: string) {
    const { data, error } = await supabase
      .from("employee_certifications_v2" as any)
      .select("*")
      .eq("employee_id", employeeId)
      .order("issue_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as any[];
  },
  async addCertification(employeeId: string, record: Record<string, any>) {
    const { error } = await supabase
      .from("employee_certifications_v2" as any)
      .insert({ ...record, employee_id: employeeId });
    if (error) throw error;
    await logEmployeeSectionChange(employeeId, "employee_certifications_v2", "added");
  },
  async updateCertification(id: string, record: Record<string, any>) {
    const ownerId = await getSectionOwnerEmployeeId("employee_certifications_v2", id);
    const { error } = await supabase
      .from("employee_certifications_v2" as any)
      .update({ ...record, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    await logEmployeeSectionChange(ownerId, "employee_certifications_v2", "updated", id);
  },
  async deleteCertification(id: string) {
    const ownerId = await getSectionOwnerEmployeeId("employee_certifications_v2", id);
    const { error } = await supabase
      .from("employee_certifications_v2" as any)
      .delete()
      .eq("id", id);
    if (error) throw error;
    await logEmployeeSectionChange(ownerId, "employee_certifications_v2", "deleted", id);
  },

  async getEmploymentHistory(employeeId: string) {
    const { data, error } = await supabase
      .from("employee_employment_history" as any)
      .select("*")
      .eq("employee_id", employeeId)
      .order("end_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as any[];
  },
  async addEmploymentHistory(employeeId: string, record: Record<string, any>) {
    const { error } = await supabase
      .from("employee_employment_history" as any)
      .insert({ ...record, employee_id: employeeId });
    if (error) throw error;
    await logEmployeeSectionChange(employeeId, "employee_employment_history", "added");
  },
  async updateEmploymentHistory(id: string, record: Record<string, any>) {
    const ownerId = await getSectionOwnerEmployeeId("employee_employment_history", id);
    const { error } = await supabase
      .from("employee_employment_history" as any)
      .update({ ...record, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    await logEmployeeSectionChange(ownerId, "employee_employment_history", "updated", id);
  },
  async deleteEmploymentHistory(id: string) {
    const ownerId = await getSectionOwnerEmployeeId("employee_employment_history", id);
    const { error } = await supabase
      .from("employee_employment_history" as any)
      .delete()
      .eq("id", id);
    if (error) throw error;
    await logEmployeeSectionChange(ownerId, "employee_employment_history", "deleted", id);
  },

  async getNominees(employeeId: string) {
    const { data, error } = await supabase
      .from("employee_nominees" as any)
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as any[];
  },
  async addNominee(employeeId: string, record: Record<string, any>) {
    const { error } = await supabase
      .from("employee_nominees" as any)
      .insert({ ...record, employee_id: employeeId });
    if (error) throw error;
    await logEmployeeSectionChange(employeeId, "employee_nominees", "added");
  },
  async updateNominee(id: string, record: Record<string, any>) {
    const ownerId = await getSectionOwnerEmployeeId("employee_nominees", id);
    const { error } = await supabase
      .from("employee_nominees" as any)
      .update({ ...record, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    await logEmployeeSectionChange(ownerId, "employee_nominees", "updated", id);
  },
  async deleteNominee(id: string) {
    const ownerId = await getSectionOwnerEmployeeId("employee_nominees", id);
    const { error } = await supabase
      .from("employee_nominees" as any)
      .delete()
      .eq("id", id);
    if (error) throw error;
    await logEmployeeSectionChange(ownerId, "employee_nominees", "deleted", id);
  },

  async getDependents(employeeId: string) {
    const { data, error } = await supabase
      .from("employee_dependents" as any)
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as any[];
  },
  async addDependent(employeeId: string, record: Record<string, any>) {
    const { error } = await supabase
      .from("employee_dependents" as any)
      .insert({ ...record, employee_id: employeeId });
    if (error) throw error;
    await logEmployeeSectionChange(employeeId, "employee_dependents", "added");
  },
  async updateDependent(id: string, record: Record<string, any>) {
    const ownerId = await getSectionOwnerEmployeeId("employee_dependents", id);
    const { error } = await supabase
      .from("employee_dependents" as any)
      .update({ ...record, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    await logEmployeeSectionChange(ownerId, "employee_dependents", "updated", id);
  },
  async deleteDependent(id: string) {
    const ownerId = await getSectionOwnerEmployeeId("employee_dependents", id);
    const { error } = await supabase
      .from("employee_dependents" as any)
      .delete()
      .eq("id", id);
    if (error) throw error;
    await logEmployeeSectionChange(ownerId, "employee_dependents", "deleted", id);
  },

  // ── employee_additional_details (single row per employee, exposed as a 0/1-entry list) ──
  async getAdditionalNotes(employeeId: string) {
    const { data, error } = await supabase
      .from("employee_additional_details" as any)
      .select("*")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return [];
    const record = data as any;
    const hasContent = [record.languages, record.qualifications, record.notes].some(
      (v) => v && String(v).trim() !== ""
    );
    // `id` must stay the employee_id: onUpdate/onDelete are keyed by employee_id,
    // not the table's own primary key, so record.id must not clobber it here.
    return hasContent ? [{ ...record, id: employeeId }] : [];
  },
  async addAdditionalNotes(employeeId: string, record: Record<string, any>) {
    const { error } = await supabase
      .from("employee_additional_details" as any)
      .upsert(
        { employee_id: employeeId, ...record, updated_at: new Date().toISOString() },
        { onConflict: "employee_id" }
      );
    if (error) throw error;
    await logEmployeeSectionChange(employeeId, "employee_additional_details", "added");
  },
  async updateAdditionalNotes(employeeId: string, record: Record<string, any>) {
    const { error } = await supabase
      .from("employee_additional_details" as any)
      .upsert(
        { employee_id: employeeId, ...record, updated_at: new Date().toISOString() },
        { onConflict: "employee_id" }
      );
    if (error) throw error;
    await logEmployeeSectionChange(employeeId, "employee_additional_details", "updated");
  },
  async deleteAdditionalNotes(employeeId: string) {
    const { data, error } = await supabase
      .from("employee_additional_details" as any)
      .delete()
      .eq("employee_id", employeeId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error("No matching additional notes record was found to delete.");
    }
    await logEmployeeSectionChange(employeeId, "employee_additional_details", "deleted");
  },
};
