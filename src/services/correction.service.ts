import { supabase } from "@/integrations/supabase/client";
import { AuditService } from "@/services/audit.service";

/** Best-effort audit context looked up before approve/reject — see both methods below. */
interface CorrectionAuditContext {
  employee_id?: string;
  field_name?: string;
  table_name?: string;
}

// Maps UI field keys to their actual DB table + column.
// Must stay in sync with employee.service.ts FIELD_MAP.
const FIELD_MAP: Record<string, { table: string; column: string }> = {
  // ── employees (master) ────────────────────────────────────────────────────
  first_name:                  { table: "employees",                     column: "first_name" },
  last_name:                   { table: "employees",                     column: "last_name" },

  // ── employee_personal_details ─────────────────────────────────────────────
  date_of_birth:               { table: "employee_personal_details",     column: "dob" },
  gender:                      { table: "employee_personal_details",     column: "gender" },
  blood_group:                 { table: "employee_personal_details",     column: "blood_group" },
  marital_status:              { table: "employee_personal_details",     column: "marital_status" },
  nationality:                 { table: "employee_personal_details",     column: "nationality" },
  father_name:                 { table: "employee_personal_details",     column: "father_name" },
  mother_name:                 { table: "employee_personal_details",     column: "mother_name" },

  // ── employee_contact_details ──────────────────────────────────────────────
  personal_email:              { table: "employee_contact_details",      column: "personal_email" },
  phone_number:                { table: "employee_contact_details",      column: "phone" },
  alternate_phone:             { table: "employee_contact_details",      column: "alternate_phone" },
  current_address:             { table: "employee_contact_details",      column: "current_address" },
  permanent_address:           { table: "employee_contact_details",      column: "permanent_address" },
  city:                        { table: "employee_contact_details",      column: "city" },
  state:                       { table: "employee_contact_details",      column: "state" },
  pincode:                     { table: "employee_contact_details",      column: "pincode" },

  // ── employee_employment_details ───────────────────────────────────────────
  department:                  { table: "employee_employment_details",   column: "department" },
  designation:                 { table: "employee_employment_details",   column: "designation" },
  date_of_joining:             { table: "employee_employment_details",   column: "joining_date" },
  employment_type:             { table: "employee_employment_details",   column: "employment_type" },
  reporting_manager:           { table: "employee_employment_details",   column: "manager" },
  work_location:               { table: "employee_employment_details",   column: "work_location" },
  employee_status:             { table: "employee_employment_details",   column: "status" },

  // ── employee_financial_details ────────────────────────────────────────────
  bank_name:                   { table: "employee_financial_details",    column: "bank_name" },
  bank_account_number:         { table: "employee_financial_details",    column: "bank_account_number" },
  ifsc_code:                   { table: "employee_financial_details",    column: "ifsc" },
  pan_number:                  { table: "employee_financial_details",    column: "pan" },
  ctc:                         { table: "employee_financial_details",    column: "ctc" },
  bank_branch:                 { table: "employee_financial_details",    column: "bank_branch" },
  upi_id:                      { table: "employee_financial_details",    column: "upi_id" },
  pf_account:                  { table: "employee_financial_details",    column: "pf_account" },
  esic_number:                 { table: "employee_financial_details",    column: "esic_number" },

  // ── employee_govt_ids ─────────────────────────────────────────────────────
  aadhaar_number:              { table: "employee_govt_ids",             column: "aadhaar" },
  uan_number:                  { table: "employee_govt_ids",             column: "uan" },
  passport_number:             { table: "employee_govt_ids",             column: "passport" },
  passport_expiry:             { table: "employee_govt_ids",             column: "passport_expiry" },
  driving_license:             { table: "employee_govt_ids",             column: "driving_license" },
  voter_id:                    { table: "employee_govt_ids",             column: "voter_id" },

  // ── employee_emergency_contacts ───────────────────────────────────────────
  emergency_contact_name:      { table: "employee_emergency_contacts",   column: "contact_name" },
  emergency_contact_relation:  { table: "employee_emergency_contacts",   column: "relation" },
  emergency_contact_phone:     { table: "employee_emergency_contacts",   column: "contact_phone" },
  emergency_contact_email:     { table: "employee_emergency_contacts",   column: "contact_email" },

  // ── employee_additional_details ───────────────────────────────────────────
  qualifications:              { table: "employee_additional_details",   column: "qualifications" },
  certifications:              { table: "employee_additional_details",   column: "certifications" },
  languages:                   { table: "employee_additional_details",   column: "languages" },
  notes:                       { table: "employee_additional_details",   column: "notes" },

  // ── employee_health_info ──────────────────────────────────────────────────
  disability_status:           { table: "employee_health_info",          column: "disability_status" },
  chronic_conditions:          { table: "employee_health_info",          column: "chronic_conditions" },
  allergies:                   { table: "employee_health_info",          column: "allergies" },
};

export interface CorrectionRequest {
  id: string;
  employee_id: string;
  field_name: string;
  table_name: string | null;
  old_value: string | null;
  new_value: string | null;
  status: "pending" | "approved" | "rejected";
  attachment_url: string | null;
  comments: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  // Joined via admin query
  employee?: { first_name: string; last_name: string; email: string; employee_code: string } | null;
}

export const CorrectionService = {
  /**
   * Submits a correction request for a single field.
   * Looks up the correct DB table from the field key.
   */
  async submit(params: {
    employeeId: string;
    fieldKey: string;
    fieldLabel: string;
    oldValue: string;
    newValue: string;
    attachmentUrl?: string;
  }): Promise<void> {
    const mapping = FIELD_MAP[params.fieldKey];
    const tableName = mapping?.table ?? null;
    const dbColumn = mapping?.column ?? params.fieldKey;

    const { error } = await supabase.from("correction_requests").insert({
      employee_id:    params.employeeId,
      field_name:     dbColumn,          // actual DB column name for RPC
      table_name:     tableName,
      old_value:      params.oldValue,
      new_value:      params.newValue,
      status:         "pending",
      attachment_url: params.attachmentUrl ?? null,
    });

    if (error) {
      await AuditService.log({
        action: "correction.submitted",
        entityType: "Correction",
        entityId: params.employeeId,
        // Field NAME only — old_value/new_value can be financial, government
        // ID, address, or health data, which must never appear in audit_logs.
        metadata: { field: dbColumn, table: tableName, change: "failed" },
        source: "web_portal",
        success: false,
        failureReason: error.message ?? "Correction submission failed",
      });
      throw error;
    }

    await AuditService.log({
      action: "correction.submitted",
      entityType: "Correction",
      entityId: params.employeeId,
      metadata: { field: dbColumn, table: tableName },
      source: "web_portal",
      success: true,
    });
  },

  /**
   * Returns all pending correction requests for the current employee.
   */
  async getMyRequests(employeeId: string): Promise<CorrectionRequest[]> {
    const { data, error } = await supabase
      .from("correction_requests")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as CorrectionRequest[];
  },

  /**
   * Admin: fetch all requests with employee info joined.
   */
  async getAllRequests(): Promise<CorrectionRequest[]> {
    const { data, error } = await supabase
      .from("correction_requests")
      .select(`
        *,
        employee:employees (first_name, last_name, email, employee_code)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as CorrectionRequest[];
  },

  /**
   * Admin: approve a correction. Calls the backend RPC.
   */
  async approve(requestId: string, comments?: string): Promise<void> {
    const { data, error } = (await supabase.rpc("approve_correction", {
      p_request_id: requestId,
      p_comments:   comments ?? null,
    })) as { data: { success: boolean; error?: string } | null; error: { message?: string } | null };

    const rpcFailed = !!error || (data != null && !data.success);

    // Phase 4: on SUCCESS, approve_correction()'s own status-setting UPDATE
    // now triggers a transactional server-side audit_logs insert
    // (trg_audit_correction_review) — logging it again here would be a
    // duplicate, and would be rejected by the new audit_logs integrity
    // trigger anyway. Only the FAILURE case still needs a client-side log,
    // since a failed/unauthorized attempt never reaches that trigger.
    if (rpcFailed) {
      // Best-effort context — field/table names only, never old/new values
      // (financial/govt-ID/health/address data). A failed lookup just means
      // a thinner audit row, never a blocked failure log.
      let context: CorrectionAuditContext | null = null;
      try {
        const { data: contextData } = await (supabase as any)
          .from("correction_requests")
          .select("employee_id, field_name, table_name")
          .eq("id", requestId)
          .maybeSingle();
        context = contextData as CorrectionAuditContext | null;
      } catch {
        // Best-effort only.
      }

      await AuditService.log({
        action: "correction.approved",
        entityType: "Correction",
        entityId: context?.employee_id ?? requestId,
        metadata: { request_id: requestId, field: context?.field_name, table: context?.table_name },
        source: "web_portal",
        success: false,
        failureReason: error?.message ?? data?.error ?? "Approval failed",
      });
    }

    if (error) throw error;
    if (data && !data.success) throw new Error(data.error ?? "Approval failed");
  },

  /**
   * Admin: reject a correction.
   */
  async reject(requestId: string, comments: string): Promise<void> {
    const { data, error } = (await supabase.rpc("reject_correction", {
      p_request_id: requestId,
      p_comments:   comments,
    })) as { data: { success: boolean; error?: string } | null; error: { message?: string } | null };

    const rpcFailed = !!error || (data != null && !data.success);

    // Phase 4: on SUCCESS, reject_correction()'s own status-setting UPDATE
    // now triggers a transactional server-side audit_logs insert
    // (trg_audit_correction_review) — see approve() above for the same
    // reasoning. Only the FAILURE case still needs a client-side log.
    if (rpcFailed) {
      let context: CorrectionAuditContext | null = null;
      try {
        const { data: contextData } = await (supabase as any)
          .from("correction_requests")
          .select("employee_id, field_name, table_name")
          .eq("id", requestId)
          .maybeSingle();
        context = contextData as CorrectionAuditContext | null;
      } catch {
        // Best-effort only.
      }

      await AuditService.log({
        action: "correction.rejected",
        entityType: "Correction",
        entityId: context?.employee_id ?? requestId,
        metadata: { request_id: requestId, field: context?.field_name, table: context?.table_name },
        source: "web_portal",
        success: false,
        failureReason: error?.message ?? data?.error ?? "Rejection failed",
      });
    }

    if (error) throw error;
    if (data && !data.success) throw new Error(data.error ?? "Rejection failed");
  },

  /**
   * Uploads a proof document to Supabase Storage bucket: correction-proofs
   * Returns the public URL.
   */
  async uploadProof(employeeId: string, file: File): Promise<string> {
    const ext = file.name.split(".").pop();
    const path = `${employeeId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("correction-proofs")
      .upload(path, file, { upsert: false });
    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from("correction-proofs")
      .getPublicUrl(path);
    return urlData.publicUrl;
  },

  /**
   * Checks if the employee already has a pending request for a specific field.
   */
  async hasPendingRequest(employeeId: string, fieldKey: string): Promise<boolean> {
    const mapping = FIELD_MAP[fieldKey];
    const dbColumn = mapping?.column ?? fieldKey;

    const { data } = await supabase
      .from("correction_requests")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("field_name", dbColumn)
      .eq("status", "pending")
      .maybeSingle();

    return !!data;
  },

  /**
   * Submits a structured record-level update request for a multi-entry section.
   * - type "edit": employee is requesting a change to an existing record
   * - type "add":  employee is requesting to add a new record
   *
   * Stores:
   *   field_name = "__section_edit__" | "__section_add__"
   *   table_name = sectionKey (e.g. "employee_education")
   *   old_value  = JSON { section, recordId, values: originalFields }
   *   new_value  = JSON { section, values: editedFields }
   *
   * Original data is NOT touched — admin reviews and applies on approval.
   */
  async submitSectionRecordCorrection(params: {
    employeeId: string;
    sectionKey: string;
    sectionLabel: string;
    type: "edit" | "add";
    recordId?: string;
    oldValues: Record<string, any>;
    newValues: Record<string, any>;
    attachmentUrl?: string;
  }): Promise<void> {
    const fieldName = params.type === "edit" ? "__section_edit__" : "__section_add__";

    const { error } = await (supabase.from("correction_requests") as any).insert({
      employee_id:    params.employeeId,
      field_name:     fieldName,
      table_name:     params.sectionKey,
      old_value:      JSON.stringify({
        section:  params.sectionLabel,
        recordId: params.recordId ?? null,
        values:   params.oldValues,
      }),
      new_value:      JSON.stringify({
        section: params.sectionLabel,
        values:  params.newValues,
      }),
      status:         "pending",
      attachment_url: params.attachmentUrl ?? null,
    });

    // Section values are never logged (they can hold anything from the
    // FIELD_MAP, including financial/govt-ID/health data) — only the
    // section identity and whether this was an add or edit request.
    await AuditService.log({
      action: "correction.submitted",
      entityType: "Correction",
      entityId: params.employeeId,
      metadata: { section: params.sectionKey, change: params.type, record_id: params.recordId ?? null },
      source: "web_portal",
      success: !error,
      failureReason: error ? (error.message ?? "Section correction submission failed") : undefined,
    });

    if (error) throw error;
  },

  /**
   * Submits a delete request for an existing multi-entry section record.
   * The record is NOT deleted immediately — admin must approve first.
   *
   * Stores:
   *   field_name = "__section_delete__"
   *   table_name = sectionKey
   *   old_value  = JSON { section, recordId, values: currentFields }
   *   new_value  = null
   */
  async submitSectionDeleteRequest(params: {
    employeeId: string;
    sectionKey: string;
    sectionLabel: string;
    recordId: string;
    recordValues: Record<string, any>;
  }): Promise<void> {
    const { error } = await (supabase.from("correction_requests") as any).insert({
      employee_id: params.employeeId,
      field_name:  "__section_delete__",
      table_name:  params.sectionKey,
      old_value:   JSON.stringify({
        section:  params.sectionLabel,
        recordId: params.recordId,
        values:   params.recordValues,
      }),
      new_value:   null,
      status:      "pending",
    });

    await AuditService.log({
      action: "correction.submitted",
      entityType: "Correction",
      entityId: params.employeeId,
      metadata: { section: params.sectionKey, change: "delete", record_id: params.recordId },
      source: "web_portal",
      success: !error,
      failureReason: error ? (error.message ?? "Section delete request submission failed") : undefined,
    });

    if (error) throw error;
  },

  /**
   * Returns true if the employee already has a pending EDIT request for the
   * specific record (identified by recordId).  Prevents duplicate edit requests
   * for the same record while allowing edits to other records in the same section.
   */
  async hasPendingEditForRecord(
    employeeId: string,
    sectionKey: string,
    recordId: string
  ): Promise<boolean> {
    const { data } = await (supabase.from("correction_requests") as any)
      .select("id, old_value")
      .eq("employee_id", employeeId)
      .eq("field_name", "__section_edit__")
      .eq("table_name", sectionKey)
      .eq("status", "pending");

    if (!data || data.length === 0) return false;

    return data.some((req: any) => {
      try {
        const parsed = JSON.parse(req.old_value ?? "{}");
        return parsed.recordId === recordId;
      } catch {
        return false;
      }
    });
  },

  /**
   * Returns true if the employee already has a pending DELETE request for the
   * specific record.
   */
  async hasPendingDeleteForRecord(
    employeeId: string,
    sectionKey: string,
    recordId: string
  ): Promise<boolean> {
    const { data } = await (supabase.from("correction_requests") as any)
      .select("id, old_value")
      .eq("employee_id", employeeId)
      .eq("field_name", "__section_delete__")
      .eq("table_name", sectionKey)
      .eq("status", "pending");

    if (!data || data.length === 0) return false;

    return data.some((req: any) => {
      try {
        const parsed = JSON.parse(req.old_value ?? "{}");
        return parsed.recordId === recordId;
      } catch {
        return false;
      }
    });
  },

  /**
   * Returns the set of record IDs within a section that currently have a
   * pending edit or delete request — so the UI can show a persistent
   * "Pending HR review" badge on those records instead of leaving employees
   * to wonder whether an "Add"/"Update" they clicked actually saved.
   * One query for the whole section instead of one per record.
   */
  async getPendingRecordIds(employeeId: string, sectionKey: string): Promise<Set<string>> {
    const { data } = await (supabase.from("correction_requests") as any)
      .select("old_value")
      .eq("employee_id", employeeId)
      .in("field_name", ["__section_edit__", "__section_delete__"])
      .eq("table_name", sectionKey)
      .eq("status", "pending");

    const ids = new Set<string>();
    (data ?? []).forEach((req: any) => {
      try {
        const parsed = JSON.parse(req.old_value ?? "{}");
        if (parsed.recordId) ids.add(parsed.recordId);
      } catch {
        // malformed old_value — skip
      }
    });
    return ids;
  },

  /**
   * @deprecated Use hasPendingEditForRecord for per-record precision.
   * Kept for backward compatibility — checks if ANY pending edit/add exists
   * for the given section.
   */
  async hasPendingSectionRecordCorrection(
    employeeId: string,
    sectionKey: string
  ): Promise<boolean> {
    const { data } = await (supabase.from("correction_requests") as any)
      .select("id")
      .eq("employee_id", employeeId)
      .in("field_name", ["__section_edit__", "__section_add__"])
      .eq("table_name", sectionKey)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    return !!data;
  },
};
