import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;

/**
 * REGULATORY FRAMEWORK SERVICE
 * Minimal read access to `regulatory_frameworks` and
 * `regulatory_framework_countries`, introduced by migration
 * 20260819000001 (Region / Regulatory Framework architecture, Phase 1).
 *
 * The only real row seeded in this phase is DPDPA 2023 (code
 * 'DPDPA_2023'), tied to India. `getDefault()` resolves that row and is
 * the intended fallback wherever an employee has no
 * employee_jurisdiction_details assignment yet — which, today, is every
 * employee — so existing behavior is unaffected until a later phase
 * actually wires this into the consent/compliance resolution path.
 *
 * Not yet surfaced in any Admin UI.
 */
export interface RegulatoryFramework {
  id: string;
  name: string;
  code: string;
  version: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_FRAMEWORK_CODE = "DPDPA_2023";

export const FrameworkService = {
  async getAll(): Promise<RegulatoryFramework[]> {
    const { data, error } = await db
      .from("regulatory_frameworks")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as RegulatoryFramework[];
  },

  async getActive(): Promise<RegulatoryFramework[]> {
    const { data, error } = await db
      .from("regulatory_frameworks")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as RegulatoryFramework[];
  },

  async getByCode(code: string): Promise<RegulatoryFramework | null> {
    const { data, error } = await db
      .from("regulatory_frameworks")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as RegulatoryFramework | null;
  },

  async getById(id: string): Promise<RegulatoryFramework | null> {
    const { data, error } = await db
      .from("regulatory_frameworks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as RegulatoryFramework | null;
  },

  /** Resolves the DPDPA 2023 framework row — the existing default. */
  async getDefault(): Promise<RegulatoryFramework | null> {
    return this.getByCode(DEFAULT_FRAMEWORK_CODE);
  },

  /**
   * Active frameworks applicable to a given country, via
   * regulatory_framework_countries. Used by the Admin jurisdiction
   * picker: exactly one result means the framework can be
   * auto-associated; more than one means HR/Admin must choose; zero
   * means no framework is configured for that country yet (never
   * fabricated here — the caller must surface that as a gap, not guess).
   */
  async getForCountry(countryId: string): Promise<RegulatoryFramework[]> {
    const { data, error } = await db
      .from("regulatory_framework_countries")
      .select("regulatory_frameworks (*)")
      .eq("country_id", countryId);
    if (error) throw error;
    return ((data ?? []) as any[])
      .map((row) => row.regulatory_frameworks)
      .filter((f): f is RegulatoryFramework => Boolean(f) && f.is_active === true);
  },
};
