import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;

/**
 * REGION SERVICE
 * Minimal read access to the `regions` configuration table introduced by
 * migration 20260819000001 (Region / Regulatory Framework architecture,
 * Phase 1). Not yet surfaced in any Admin UI — this is the read-side
 * foundation only. Cast via `db = supabase as any` because `regions` is
 * not present in the generated `types.ts` yet, matching the existing
 * pattern in compliance.service.ts.
 */
export interface Region {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const RegionService = {
  async getAll(): Promise<Region[]> {
    const { data, error } = await db
      .from("regions")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Region[];
  },

  async getActive(): Promise<Region[]> {
    const { data, error } = await db
      .from("regions")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Region[];
  },
};
