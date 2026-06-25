import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;

export interface DataInventoryItem {
  id: string;
  activity_name: string;
  purpose: string;
  data_categories: string[];
  data_principal_types: string[];
  legal_basis: string | null;
  recipients: string | null;
  storage_location: string | null;
  retention_period: string | null;
  cross_border: boolean;
  linked_consent_purpose_id: string | null;
  owner_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const InventoryService = {
  async getAll(): Promise<DataInventoryItem[]> {
    const { data, error } = await db
      .from("data_inventory")
      .select("*")
      .order("activity_name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as DataInventoryItem[];
  },

  async create(item: Omit<DataInventoryItem, "id" | "created_at" | "updated_at">): Promise<void> {
    const { error } = await db.from("data_inventory").insert(item);
    if (error) throw error;
  },

  async update(id: string, patch: Partial<DataInventoryItem>): Promise<void> {
    const { error } = await db
      .from("data_inventory")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
  },

  async markReviewed(id: string): Promise<void> {
    const { error } = await db
      .from("data_inventory")
      .update({ reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  isStale(item: DataInventoryItem): boolean {
    if (!item.reviewed_at) return true;
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    return new Date(item.reviewed_at) < twelveMonthsAgo;
  },
};
