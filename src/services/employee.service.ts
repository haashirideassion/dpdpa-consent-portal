import { supabase } from "@/integrations/supabase/client";

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
  first_name:  { table: "employees", column: "first_name" },
  last_name:   { table: "employees", column: "last_name" },

  // ── employee_personal_details ───────────────────────────────────────────
  // UI key "date_of_birth" → DB column "dob"
  date_of_birth:  { table: "employee_personal_details", column: "dob" },
  gender:         { table: "employee_personal_details", column: "gender" },
  blood_group:    { table: "employee_personal_details", column: "blood_group" },
  marital_status: { table: "employee_personal_details", column: "marital_status" },
  nationality:    { table: "employee_personal_details", column: "nationality" },

  // ── employee_contact_details ────────────────────────────────────────────
  work_email:       { table: "employee_contact_details", column: "work_email" },
  personal_email:   { table: "employee_contact_details", column: "personal_email" },
  // UI key "phone_number" → DB column "phone"
  phone_number:     { table: "employee_contact_details", column: "phone" },
  alternate_phone:  { table: "employee_contact_details", column: "alternate_phone" },
  current_address:  { table: "employee_contact_details", column: "current_address" },
  permanent_address:{ table: "employee_contact_details", column: "permanent_address" },
  city:             { table: "employee_contact_details", column: "city" },
  state:            { table: "employee_contact_details", column: "state" },
  pincode:          { table: "employee_contact_details", column: "pincode" },

  // ── employee_employment_details ─────────────────────────────────────────
  department:       { table: "employee_employment_details", column: "department" },
  designation:      { table: "employee_employment_details", column: "designation" },
  // UI key "date_of_joining" → DB column "joining_date"
  date_of_joining:  { table: "employee_employment_details", column: "joining_date" },
  employment_type:  { table: "employee_employment_details", column: "employment_type" },
  // UI key "reporting_manager" → DB column "manager"
  reporting_manager:{ table: "employee_employment_details", column: "manager" },
  work_location:    { table: "employee_employment_details", column: "work_location" },
  // UI key "employee_status" → DB column "status"
  employee_status:  { table: "employee_employment_details", column: "status" },

  // ── employee_financial_details ──────────────────────────────────────────
  bank_name:           { table: "employee_financial_details", column: "bank_name" },
  bank_account_number: { table: "employee_financial_details", column: "bank_account_number" },
  // UI key "ifsc_code" → DB column "ifsc"
  ifsc_code:           { table: "employee_financial_details", column: "ifsc" },
  // UI key "pan_number" → DB column "pan"
  pan_number:          { table: "employee_financial_details", column: "pan" },
  ctc:                 { table: "employee_financial_details", column: "ctc" },

  // ── employee_govt_ids ───────────────────────────────────────────────────
  // UI key "aadhaar_number" → DB column "aadhaar"
  aadhaar_number:  { table: "employee_govt_ids", column: "aadhaar" },
  // UI key "uan_number" → DB column "uan"
  uan_number:      { table: "employee_govt_ids", column: "uan" },
  // UI key "passport_number" → DB column "passport"
  passport_number: { table: "employee_govt_ids", column: "passport" },
  passport_expiry: { table: "employee_govt_ids", column: "passport_expiry" },
  driving_license: { table: "employee_govt_ids", column: "driving_license" },
  voter_id:        { table: "employee_govt_ids", column: "voter_id" },

  // ── employee_emergency_contacts ─────────────────────────────────────────
  // UI key "emergency_contact_name" → DB column "contact_name"
  emergency_contact_name:     { table: "employee_emergency_contacts", column: "contact_name" },
  emergency_contact_relation: { table: "employee_emergency_contacts", column: "relation" },
  // UI key "emergency_contact_phone" → DB column "contact_phone"
  emergency_contact_phone:    { table: "employee_emergency_contacts", column: "contact_phone" },
  emergency_contact_email:    { table: "employee_emergency_contacts", column: "contact_email" },

  // ── employee_additional_details ─────────────────────────────────────────
  qualifications: { table: "employee_additional_details", column: "qualifications" },
  certifications: { table: "employee_additional_details", column: "certifications" },
  languages:      { table: "employee_additional_details", column: "languages" },
  notes:          { table: "employee_additional_details", column: "notes" },
};

// ---------------------------------------------------------------------------
// Reverse alias map: DB column → UI key (used when flattening joined data)
// ---------------------------------------------------------------------------
const DB_TO_UI: Record<string, string> = {
  dob:           "date_of_birth",
  phone:         "phone_number",
  joining_date:  "date_of_joining",
  manager:       "reporting_manager",
  status:        "employee_status",
  ifsc:          "ifsc_code",
  pan:           "pan_number",
  aadhaar:       "aadhaar_number",
  uan:           "uan_number",
  passport:      "passport_number",
  contact_name:  "emergency_contact_name",
  relation:      "emergency_contact_relation",
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
// Service
// ---------------------------------------------------------------------------
export const EmployeeService = {
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
        employee_additional_details (*)
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
        employee_additional_details (*)
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
      id: employee.id,
    };
  },

  /**
   * Updates employee fields by routing each field to the correct normalized table.
   * Translates UI field keys → actual DB column names using FIELD_MAP.
   *
   * @param employeeId - The `employees.id` UUID (must exist in the employees table)
   * @param updates    - Key/value pairs using UI field keys (e.g. "date_of_birth", "phone_number")
   */
  async updateEmployee(employeeId: string, updates: Record<string, any>) {
    if (!employeeId || Object.keys(updates).length === 0) return;

    // 1. Group updates by target table, translating UI key → DB column name
    const byTable: Record<string, Record<string, any>> = {};

    for (const [uiKey, value] of Object.entries(updates)) {
      const mapping = FIELD_MAP[uiKey];
      if (!mapping || value === undefined || value === "") continue;

      if (!byTable[mapping.table]) byTable[mapping.table] = {};
      byTable[mapping.table][mapping.column] = value;
    }

    // 2. Execute one operation per affected table
    for (const [tableName, tableUpdates] of Object.entries(byTable)) {
      if (tableName === "employees") {
        // Master table: simple UPDATE by primary key
        const { error } = await supabase
          .from("employees")
          .update({ ...tableUpdates, updated_at: new Date().toISOString() })
          .eq("id", employeeId);

        if (error) {
          console.error(`EmployeeService: error updating ${tableName}:`, error);
          throw error;
        }
      } else {
        // Detail tables: UPSERT on employee_id (trigger pre-creates the row,
        // but upsert handles the case where it doesn't exist yet)
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
};
