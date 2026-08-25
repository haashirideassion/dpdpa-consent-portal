import { supabase } from "@/integrations/supabase/client";
import { AuditService } from "@/services/audit.service";
const db = supabase as any;

export type RiskStatus = "open" | "mitigated" | "accepted";

export interface RiskAssessment {
  id: string;
  title: string;
  description: string | null;
  processing_activity_id: string | null;
  likelihood: number;
  impact: number;
  risk_score: number;
  mitigation: string | null;
  status: RiskStatus;
  owner_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const RiskService = {
  async getAll(): Promise<RiskAssessment[]> {
    const { data, error } = await db
      .from("risk_assessments")
      .select("*")
      .order("risk_score", { ascending: false });
    if (error) throw error;
    return (data ?? []) as RiskAssessment[];
  },

  async create(input: Omit<RiskAssessment, "id" | "risk_score" | "created_at" | "updated_at">): Promise<void> {
    const { error } = await db.from("risk_assessments").insert(input);
    await AuditService.log({
      action: "compliance.updated",
      entityType: "Risk_assessment",
      metadata: { change: "created", status: input.status },
      source: "web_portal",
      success: !error,
      failureReason: error ? (error.message ?? "Risk assessment creation failed") : undefined,
    });
    if (error) throw error;
  },

  async update(id: string, patch: Partial<RiskAssessment>): Promise<void> {
    const { error } = await db
      .from("risk_assessments")
      .update(patch)
      .eq("id", id);
    // Field names only — description/mitigation are free text.
    await AuditService.log({
      action: "compliance.updated",
      entityType: "Risk_assessment",
      entityId: id,
      metadata: { fields: Object.keys(patch), change: "updated" },
      source: "web_portal",
      success: !error,
      failureReason: error ? (error.message ?? "Risk assessment update failed") : undefined,
    });
    if (error) throw error;
  },

  riskLevel(score: number): "low" | "medium" | "high" | "critical" {
    if (score <= 4) return "low";
    if (score <= 9) return "medium";
    if (score <= 16) return "high";
    return "critical";
  },

  riskColor(score: number): string {
    const level = RiskService.riskLevel(score);
    return {
      low: "bg-blue-100 text-blue-700",
      medium: "bg-yellow-100 text-yellow-700",
      high: "bg-orange-100 text-orange-700",
      critical: "bg-red-100 text-red-700",
    }[level];
  },
};
