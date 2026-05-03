import { supabase } from "@/integrations/supabase/client";

// Maps UI field keys to their actual DB table + column
// Mirrors the mapping in employee.service.ts
const FIELD_MAP: Record<string, { table: string; column: string }> = {
  first_name:                  { table: "employees",                    column: "first_name" },
  last_name:                   { table: "employees",                    column: "last_name" },
  date_of_birth:               { table: "employee_personal_details",    column: "dob" },
  gender:                      { table: "employee_personal_details",    column: "gender" },
  blood_group:                 { table: "employee_personal_details",    column: "blood_group" },
  marital_status:              { table: "employee_personal_details",    column: "marital_status" },
  nationality:                 { table: "employee_personal_details",    column: "nationality" },
  personal_email:              { table: "employee_contact_details",     column: "personal_email" },
  phone_number:                { table: "employee_contact_details",     column: "phone" },
  alternate_phone:             { table: "employee_contact_details",     column: "alternate_phone" },
  current_address:             { table: "employee_contact_details",     column: "current_address" },
  permanent_address:           { table: "employee_contact_details",     column: "permanent_address" },
  city:                        { table: "employee_contact_details",     column: "city" },
  state:                       { table: "employee_contact_details",     column: "state" },
  pincode:                     { table: "employee_contact_details",     column: "pincode" },
  bank_name:                   { table: "employee_financial_details",   column: "bank_name" },
  bank_account_number:         { table: "employee_financial_details",   column: "bank_account_number" },
  ifsc_code:                   { table: "employee_financial_details",   column: "ifsc" },
  pan_number:                  { table: "employee_financial_details",   column: "pan" },
  ctc:                         { table: "employee_financial_details",   column: "ctc" },
  aadhaar_number:              { table: "employee_govt_ids",            column: "aadhaar" },
  uan_number:                  { table: "employee_govt_ids",            column: "uan" },
  passport_number:             { table: "employee_govt_ids",            column: "passport" },
  passport_expiry:             { table: "employee_govt_ids",            column: "passport_expiry" },
  driving_license:             { table: "employee_govt_ids",            column: "driving_license" },
  voter_id:                    { table: "employee_govt_ids",            column: "voter_id" },
  emergency_contact_name:      { table: "employee_emergency_contacts",  column: "contact_name" },
  emergency_contact_relation:  { table: "employee_emergency_contacts",  column: "relation" },
  emergency_contact_phone:     { table: "employee_emergency_contacts",  column: "contact_phone" },
  emergency_contact_email:     { table: "employee_emergency_contacts",  column: "contact_email" },
  qualifications:              { table: "employee_additional_details",  column: "qualifications" },
  certifications:              { table: "employee_additional_details",  column: "certifications" },
  languages:                   { table: "employee_additional_details",  column: "languages" },
  notes:                       { table: "employee_additional_details",  column: "notes" },
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

    if (error) throw error;
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
    const { data, error } = await supabase.rpc("approve_correction", {
      p_request_id: requestId,
      p_comments:   comments ?? null,
    });
    if (error) throw error;
    if (data && !data.success) throw new Error(data.error ?? "Approval failed");
  },

  /**
   * Admin: reject a correction.
   */
  async reject(requestId: string, comments: string): Promise<void> {
    const { data, error } = await supabase.rpc("reject_correction", {
      p_request_id: requestId,
      p_comments:   comments,
    });
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
};
