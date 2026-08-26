import { supabase } from "@/integrations/supabase/client";
import { AuditService } from "@/services/audit.service";
// New tables added in migration 20260625000001 — cast to any until types.ts is regenerated
const db = supabase as any;

export type DsrType = "access" | "correction" | "erasure" | "portability" | "nomination" | "grievance";
export type DsrStatus = "new" | "in_review" | "action_required" | "resolved" | "closed" | "rejected";
export type DsrPriority = "low" | "medium" | "high";

// ── Erasure request assessment (request_type = 'erasure' only) ──────────────
// Categories mirror the ACTUAL employee data tables present in the schema
// (see supabase/migrations/20260827000001_erasure_request_workflow.sql) —
// nothing here is invented; this list and the DB CHECK constraint on
// erasure_assessments.category must be kept in sync.
export const ERASURE_CATEGORIES = [
  { value: "personal_details", label: "Personal Details" },
  { value: "contact_details", label: "Contact Details" },
  { value: "employment_details", label: "Employment Details" },
  { value: "financial_details", label: "Financial Details" },
  { value: "government_ids", label: "Government IDs" },
  { value: "health_information", label: "Health Information" },
  { value: "additional_details", label: "Additional Details (qualifications, languages, notes)" },
  { value: "education", label: "Education" },
  { value: "certifications", label: "Certifications" },
  { value: "employment_history", label: "Employment History" },
  { value: "nominees_dependents", label: "Nominees / Dependents" },
  { value: "emergency_contacts", label: "Emergency Contacts" },
  { value: "consent_information", label: "Consent-Related Information" },
] as const;

export type ErasureCategory = (typeof ERASURE_CATEGORIES)[number]["value"];
export type ErasureDecision = "eligible" | "retained" | "anonymized";

/**
 * Human-readable description of each category, for the admin Retention
 * Assessment UI only. `fields` mirrors — and must be kept in sync with —
 * the exact columns process_erasure_request() operates on for that
 * category (20260827000001_erasure_request_workflow.sql). `sections`
 * names the existing consent_sections.section_name value(s) (v2.0 consent
 * template) whose purposes' retention_period values are actually relevant
 * to that category — used only to SHOW the employee's real, already-
 * configured retention periods; it never gates or drives processing.
 * Categories with no clear corresponding consent section (e.g.
 * employment_details, additional_details, consent_information) are left
 * with an empty `sections` list — the UI shows "Retention basis not
 * specified" for those rather than guessing.
 */
export const ERASURE_CATEGORY_META: Record<ErasureCategory, { fields: string; sections: string[] }> = {
  personal_details: {
    fields: "Date of Birth, Gender, Blood Group, Marital Status, Nationality, Father's Name, Mother's Name",
    sections: ["Personal Information"],
  },
  contact_details: {
    fields: "Work Email, Personal Email, Phone, Alternate Phone, Current Address, Permanent Address, City, State, Pincode",
    sections: ["Contact Details"],
  },
  employment_details: {
    fields: "Department, Designation, Joining Date, Employment Type, Manager, Work Location",
    sections: [],
  },
  financial_details: {
    fields: "Bank Name, Bank Account Number, IFSC, PAN, CTC, Bank Branch, UPI ID, PF Account, ESIC Number",
    sections: ["Banking Information"],
  },
  government_ids: {
    fields: "Aadhaar, UAN, Passport, Passport Expiry, Driving License, Voter ID",
    sections: ["Government IDs", "Passport and Visa"],
  },
  health_information: {
    fields: "Disability Status, Chronic Conditions, Allergies",
    sections: ["Health Information"],
  },
  additional_details: {
    fields: "Qualifications (summary), Certifications (summary), Languages, Notes",
    sections: [],
  },
  education: {
    fields: "Qualification, Specialisation, Institution, University, Year of Passing, Grade, Mode, Roll Number",
    sections: ["Educational Qualifications"],
  },
  certifications: {
    fields: "Certification Name, Issuing Body, Issue/Expiry Date, Certification ID, Verification URL",
    sections: ["Certifications"],
  },
  employment_history: {
    fields: "Employer Name, Designation, Start/End Date, Reason for Leaving, Last Drawn Salary",
    sections: ["Previous Employment"],
  },
  nominees_dependents: {
    fields: "Nominee/Dependent Name, Relationship, Date of Birth, Address, Mobile, Allocation %, Guardian details",
    sections: ["Insurance Nominee Details", "Dependents"],
  },
  emergency_contacts: {
    fields: "Contact Name, Relation, Contact Phone, Contact Email",
    sections: ["Emergency Contacts"],
  },
  consent_information: {
    fields: "Consent record metadata (IP address, User agent, Withdrawal reason text) — consent decisions themselves are preserved as compliance evidence and are never deleted",
    sections: [],
  },
};

/**
 * Suggested reasons for a data removal / erasure request — shared by the
 * employee submission form (MyRequestsView) and the admin request-detail
 * header, which parses the same label back out of `description` (see
 * parseErasureRequestReason below). Purely a UI convenience folded into
 * the free-text `description` sent to DsrService.create() — no schema
 * change; the DB stores the same erasure DSR row it always has.
 */
export const ERASURE_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "leaving", label: "Leaving organization" },
  { value: "no_longer_required", label: "No longer require processing" },
  { value: "remove_personal_data", label: "Request removal" },
  { value: "other", label: "Other" },
];

/**
 * Best-effort extraction of the reason/extra-details an employee picked in
 * MyRequestsView's erasure form back out of `data_requests.description`
 * (which is stored as "Reason: <label>\n\nAdditional details: <text>").
 * Returns nulls (never a guess) when the description doesn't match that
 * shape — e.g. an admin-raised erasure request's free-text description.
 */
export function parseErasureRequestReason(description: string): { reasonLabel: string | null; extra: string | null } {
  const match = /^Reason:\s*(.+?)(?:\n\nAdditional details:\s*([\s\S]*))?$/.exec(description ?? "");
  if (!match) return { reasonLabel: null, extra: null };
  return { reasonLabel: match[1]?.trim() || null, extra: match[2]?.trim() || null };
}

export interface ErasureAssessment {
  id: string;
  request_id: string;
  category: ErasureCategory;
  decision: ErasureDecision;
  basis: string | null;
  assessed_by: string | null;
  assessed_at: string;
  processed_at: string | null;
}

export interface ErasureAssessmentInput {
  category: ErasureCategory;
  decision: ErasureDecision;
  basis?: string;
}

export interface DataRequest {
  id: string;
  employee_id: string | null;
  raised_by: string | null;
  request_type: DsrType;
  status: DsrStatus;
  priority: DsrPriority;
  subject: string;
  description: string;
  resolution_note: string | null;
  sla_due_at: string | null;
  ai_summary: string | null;
  erasure_processed_at: string | null;
  erasure_processed_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  employee_name?: string;
  employee_code?: string;
  raised_by_email?: string;
}

export interface DataRequestMessage {
  id: string;
  request_id: string;
  author_id: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
  author_email?: string;
}

export interface CreateDsrInput {
  request_type: DsrType;
  subject: string;
  description: string;
  employee_id?: string;
}

export const DsrService = {
  async create(input: CreateDsrInput): Promise<DataRequest> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("Not authenticated");

    // Compute SLA due date from settings
    const { data: slaRow } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "sla_days")
      .single();

    const slaDays: number = slaRow?.value?.[input.request_type] ?? 30;
    const slaDate = new Date();
    slaDate.setDate(slaDate.getDate() + slaDays);

    const { data, error } = await db
      .from("data_requests")
      .insert({
        raised_by: user.user.id,
        employee_id: input.employee_id ?? null,
        request_type: input.request_type,
        subject: input.subject,
        description: input.description,
        sla_due_at: slaDate.toISOString(),
      })
      .select()
      .single();

    if (error) {
      await AuditService.log({
        action: "dsr.created",
        entityType: "DSR",
        // subject/description are free-text employee narrative — never logged.
        metadata: { request_type: input.request_type, change: "failed" },
        source: "web_portal",
        success: false,
        failureReason: error.message ?? "DSR creation failed",
      });
      throw error;
    }

    await AuditService.log({
      action: "dsr.created",
      entityType: "DSR",
      entityId: (data as DataRequest).id,
      metadata: { request_type: input.request_type },
      source: "web_portal",
      success: true,
    });
    return data as DataRequest;
  },

  async getAll(filters?: { status?: string; request_type?: string }): Promise<DataRequest[]> {
    let query = db
      .from("data_requests")
      .select(`
        *,
        employees!data_requests_employee_id_fkey(first_name, last_name, employee_code)
      `)
      .order("created_at", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.request_type) query = query.eq("request_type", filters.request_type);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((r: any) => ({
      ...r,
      employee_name: r.employees
        ? `${r.employees.first_name} ${r.employees.last_name}`
        : null,
      employee_code: r.employees?.employee_code ?? null,
    }));
  },

  async getByUser(userId: string): Promise<DataRequest[]> {
    const { data, error } = await db
      .from("data_requests")
      .select("*")
      .eq("raised_by", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as DataRequest[];
  },

  async getById(id: string): Promise<DataRequest | null> {
    const { data, error } = await db
      .from("data_requests")
      .select(`
        *,
        employees!data_requests_employee_id_fkey(first_name, last_name, employee_code)
      `)
      .eq("id", id)
      .single();

    if (error) return null;
    return {
      ...data,
      employee_name: (data as any).employees
        ? `${(data as any).employees.first_name} ${(data as any).employees.last_name}`
        : null,
      employee_code: (data as any).employees?.employee_code ?? null,
    } as DataRequest;
  },

  async updateStatus(
    id: string,
    status: DsrStatus,
    resolutionNote?: string
  ): Promise<void> {
    // Fetch the prior status first so the audit event carries a real
    // from/to, rather than relying on whatever the caller happened to have
    // in local state (the previous implementation logged this from the
    // route component, which silently produced no audit row for any other
    // caller of updateStatus — see Audit Logs gap report).
    const previousStatus = await db
      .from("data_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }: { data: { status?: DsrStatus } | null }) => data?.status ?? null)
      .catch(() => null);

    const update: Record<string, unknown> = { status };
    if (resolutionNote !== undefined) update.resolution_note = resolutionNote;

    const { error } = await db
      .from("data_requests")
      .update(update)
      .eq("id", id);

    await AuditService.log({
      action: "dsr.status_updated",
      entityType: "DSR",
      entityId: id,
      metadata: { from: previousStatus, to: status },
      source: "web_portal",
      success: !error,
      failureReason: error ? (error.message ?? "DSR status update failed") : undefined,
    });

    if (error) throw error;
  },

  async updatePriority(id: string, priority: DsrPriority): Promise<void> {
    const { error } = await db
      .from("data_requests")
      .update({ priority })
      .eq("id", id);

    if (error) throw error;
  },

  async getMessages(requestId: string): Promise<DataRequestMessage[]> {
    const { data, error } = await db
      .from("data_request_messages")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data ?? []) as DataRequestMessage[];
  },

  async addMessage(
    requestId: string,
    body: string,
    isInternal = false
  ): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("Not authenticated");

    const { error } = await db.from("data_request_messages").insert({
      request_id: requestId,
      author_id: user.user.id,
      body,
      is_internal: isInternal,
    });

    if (error) throw error;
  },

  async getStats(): Promise<{
    total: number;
    new_: number;
    in_review: number;
    resolved: number;
    overdue: number;
  }> {
    const { data, error } = await db.from("data_requests").select("status, sla_due_at");
    if (error) throw error;

    const rows = data ?? [];
    const now = new Date();
    return {
      total: rows.length,
      new_: rows.filter((r: any) => r.status === "new").length,
      in_review: rows.filter((r: any) => ["in_review", "action_required"].includes(r.status)).length,
      resolved: rows.filter((r: any) => ["resolved", "closed"].includes(r.status)).length,
      overdue: rows.filter(
        (r: any) =>
          !["resolved", "closed", "rejected"].includes(r.status) &&
          r.sla_due_at &&
          new Date(r.sla_due_at) < now
      ).length,
    };
  },

  // ── Erasure request assessment/processing (request_type = 'erasure') ──────
  // Both write paths go through SECURITY DEFINER RPCs — never a direct
  // table write — see 20260827000001_erasure_request_workflow.sql. Both
  // RPCs reject a caller who isn't admin/dpo server-side, independent of
  // whatever the client sends.

  async getErasureAssessments(requestId: string): Promise<ErasureAssessment[]> {
    const { data, error } = await db
      .from("erasure_assessments")
      .select("*")
      .eq("request_id", requestId)
      .order("category", { ascending: true });

    if (error) throw error;
    return (data ?? []) as ErasureAssessment[];
  },

  /**
   * Saves (or updates) the admin's per-category retention decision for an
   * erasure request. Does NOT process/modify any employee data by itself —
   * that only happens via processErasure(). Writes the "dsr.erasure_assessed"
   * audit event server-side, inside the RPC.
   */
  async assessErasure(requestId: string, assessments: ErasureAssessmentInput[]): Promise<void> {
    const { data, error } = await db.rpc("assess_erasure_request", {
      p_request_id: requestId,
      p_assessments: assessments,
    });
    if (error) throw error;
    if (data && data.success === false) {
      throw new Error(data.error ?? "Failed to save retention assessment");
    }
  },

  /**
   * Processes an erasure request: removes/anonymizes only the categories
   * marked 'eligible'/'anonymized' in the saved assessment; categories
   * marked 'retained' are left untouched. Idempotent — the RPC rejects a
   * request that has already been processed. Writes the
   * "dsr.erasure_processed" audit event and the employee-facing
   * notification server-side, inside the RPC.
   */
  async processErasure(requestId: string): Promise<{ removed: string[]; anonymized: string[]; retained: string[] }> {
    const { data, error } = await db.rpc("process_erasure_request", {
      p_request_id: requestId,
    });
    if (error) throw error;
    if (data && data.success === false) {
      throw new Error(data.error ?? "Failed to process erasure request");
    }
    return {
      removed: data?.removed ?? [],
      anonymized: data?.anonymized ?? [],
      retained: data?.retained ?? [],
    };
  },
};
