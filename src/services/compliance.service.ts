import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;

export type ComplianceStatus = "not_started" | "in_progress" | "compliant" | "at_risk";

export interface ComplianceItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  owner_user_id: string | null;
  status: ComplianceStatus;
  due_date: string | null;
  evidence_url: string | null;
  last_reviewed_at: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export const ComplianceService = {
  async getAll(): Promise<ComplianceItem[]> {
    const { data, error } = await db
      .from("compliance_items")
      .select("*")
      .order("display_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ComplianceItem[];
  },

  async update(
    id: string,
    patch: Partial<Pick<ComplianceItem, "status" | "owner_user_id" | "due_date" | "evidence_url" | "last_reviewed_at">>
  ): Promise<void> {
    const { error } = await db
      .from("compliance_items")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
  },

  async create(item: Omit<ComplianceItem, "id" | "created_at" | "updated_at">): Promise<void> {
    const { error } = await db.from("compliance_items").insert(item);
    if (error) throw error;
  },

  computeScore(items: ComplianceItem[]): number {
    if (items.length === 0) return 0;
    const compliant = items.filter((i) => i.status === "compliant").length;
    return Math.round((compliant / items.length) * 100);
  },
};
