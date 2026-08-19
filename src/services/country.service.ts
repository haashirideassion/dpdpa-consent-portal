import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;

/**
 * COUNTRY SERVICE
 * Minimal read access to the `countries` configuration table introduced
 * by migration 20260819000001 (Region / Regulatory Framework
 * architecture, Phase 1). Not yet surfaced in any Admin UI.
 */
export interface Country {
  id: string;
  region_id: string | null;
  name: string;
  iso_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const CountryService = {
  async getAll(): Promise<Country[]> {
    const { data, error } = await db
      .from("countries")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Country[];
  },

  async getActive(): Promise<Country[]> {
    const { data, error } = await db
      .from("countries")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Country[];
  },

  async getByRegion(regionId: string): Promise<Country[]> {
    const { data, error } = await db
      .from("countries")
      .select("*")
      .eq("region_id", regionId)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Country[];
  },

  async getByIsoCode(isoCode: string): Promise<Country | null> {
    const { data, error } = await db
      .from("countries")
      .select("*")
      .eq("iso_code", isoCode)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as Country | null;
  },

  /**
   * Case-insensitive exact match on `name` — used by the employee CSV
   * bulk importer, where the "country" column is a free-text country name
   * rather than an ISO code. Returns null (never a guess/fabrication) when
   * no country row matches.
   */
  async getByName(name: string): Promise<Country | null> {
    const { data, error } = await db
      .from("countries")
      .select("*")
      .ilike("name", name.trim())
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as Country | null;
  },
};
