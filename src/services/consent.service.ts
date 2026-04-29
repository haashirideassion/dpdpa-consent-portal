import { supabase } from "@/integrations/supabase/client";

export interface ConsentPurpose {
  id: string;
  purpose_key: string;
  label: string;
  description: string;
  is_mandatory: boolean;
  legal_basis: string;
  display_order: number;
}

export interface ConsentTemplate {
  id: string;
  version: string;
  name: string;
  purposes: ConsentPurpose[];
}

export interface ConsentSubmission {
  employeeId: string;
  userId: string;
  templateId: string;
  templateVersion: string;
  purposes: { purpose_key: string; consented: boolean; is_mandatory: boolean }[];
  esignName: string;
  videoEventId?: string;
}

export const ConsentService = {
  /**
   * Fetches the active consent template and its purposes
   */
  async getActiveTemplate(): Promise<ConsentTemplate | null> {
    const { data: templateData, error: templateError } = await supabase
      .from("consent_templates")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (templateError || !templateData) {
      console.error("Failed to fetch active template", templateError);
      return null;
    }

    const { data: purposesData, error: purposesError } = await supabase
      .from("consent_purposes")
      .select("*")
      .eq("template_id", templateData.id)
      .order("display_order", { ascending: true });

    if (purposesError) {
      console.error("Failed to fetch template purposes", purposesError);
      return null;
    }

    return {
      id: templateData.id,
      version: templateData.version,
      name: templateData.name,
      purposes: purposesData as ConsentPurpose[],
    };
  },

  /**
   * Checks if the employee has already consented to this specific template version
   */
  async hasConsentedToVersion(employeeId: string, version: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("consent_records")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("template_version", version)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to check existing consent", error);
      return false;
    }
    return !!data;
  },

  /**
   * Submits granular consent records
   */
  async submitConsent(payload: ConsentSubmission): Promise<boolean> {
    try {
      // Create an array of rows to insert
      const rows = payload.purposes.map((p) => ({
        employee_id: payload.employeeId,
        user_id: payload.userId,
        template_id: payload.templateId,
        template_version: payload.templateVersion,
        purpose_key: p.purpose_key,
        consented: p.consented,
        is_mandatory: p.is_mandatory,
        esign_name: payload.esignName,
        video_event_id: payload.videoEventId || null,
        // IP and UserAgent are best-effort client-side. Edge functions are better,
        // but we'll capture user_agent here.
        user_agent: navigator.userAgent,
      }));

      const { error } = await supabase.from("consent_records").insert(rows);

      if (error) {
        console.error("Failed to insert consent records", error);
        return false;
      }

      return true;
    } catch (err) {
      console.error("Consent submission error:", err);
      return false;
    }
  },
};
