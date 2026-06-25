import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;

export type BreachSeverity = "low" | "medium" | "high" | "critical";
export type BreachStatus = "reported" | "investigating" | "contained" | "notified" | "closed";

export interface BreachIncident {
  id: string;
  title: string;
  description: string | null;
  severity: BreachSeverity;
  status: BreachStatus;
  discovered_at: string;
  affected_count: number | null;
  affected_data_categories: string[];
  root_cause: string | null;
  remediation: string | null;
  board_notified_at: string | null;
  principals_notified_at: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export const BreachService = {
  async getAll(): Promise<BreachIncident[]> {
    const { data, error } = await db
      .from("breach_incidents")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as BreachIncident[];
  },

  async getById(id: string): Promise<BreachIncident | null> {
    const { data, error } = await db
      .from("breach_incidents")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return null;
    return data as BreachIncident;
  },

  async create(input: Omit<BreachIncident, "id" | "created_at" | "updated_at">): Promise<BreachIncident> {
    const { data, error } = await db
      .from("breach_incidents")
      .insert(input)
      .select()
      .single();
    if (error) throw error;
    return data as BreachIncident;
  },

  async update(id: string, patch: Partial<BreachIncident>): Promise<void> {
    const { error } = await db
      .from("breach_incidents")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
  },

  async recordBoardNotification(id: string): Promise<void> {
    const { error } = await db
      .from("breach_incidents")
      .update({ board_notified_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async recordPrincipalNotification(id: string): Promise<void> {
    const { error } = await db
      .from("breach_incidents")
      .update({ principals_notified_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  severityColor(severity: BreachSeverity): string {
    return {
      low: "text-blue-600",
      medium: "text-yellow-600",
      high: "text-orange-600",
      critical: "text-red-600",
    }[severity];
  },
};
