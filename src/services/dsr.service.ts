import { supabase } from "@/integrations/supabase/client";
import { AuditService } from "@/services/audit.service";
// New tables added in migration 20260625000001 — cast to any until types.ts is regenerated
const db = supabase as any;

export type DsrType = "access" | "correction" | "erasure" | "portability" | "nomination" | "grievance";
export type DsrStatus = "new" | "in_review" | "action_required" | "resolved" | "closed" | "rejected";
export type DsrPriority = "low" | "medium" | "high";

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
};
