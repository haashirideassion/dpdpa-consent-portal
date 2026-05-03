import { supabase } from "@/integrations/supabase/client";
import { AuditService } from "@/services/audit.service";

export interface ConsentPurpose {
  id: string;
  purpose_key: string;
  label: string;
  description: string;
  is_mandatory: boolean;
  legal_basis: string;
  display_order: number;
  data_categories?: string;
  third_parties?: string;
  retention_period?: string;
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
  educationVersionId?: string;
  device?: string;
  location?: string;
  language?: string;
  consentStatementText: string;
}

export const ConsentService = {
  /**
   * Fetches the active consent template and its purposes.
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
   * Checks if the employee has already consented to THIS specific template version.
   *
   * FIX (Deploy-Blocker #6): The `version` parameter was previously ignored.
   * This caused employees who consented to v1.0 to bypass the gate for v2.0.
   */
  async hasConsentedToVersion(employeeId: string, version: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("consent_records")
      .select("status")
      .eq("employee_id", employeeId)
      .eq("status", "consented")
      .eq("template_version", version) // ← was missing: version check is now enforced
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to check existing consent", error);
      return false;
    }
    return !!data;
  },

  /**
   * Submits consent for all purposes in the active template.
   *
   * FIX (Deploy-Blocker #4): Removed console.log(payload) — was leaking PII.
   * FIX (Deploy-Blocker #5): Now writes BOTH:
   *   1. consent_records — master status record (UPSERT, UNIQUE per employee)
   *      Extended with template_version + esign_name for version gate check.
   *   2. consent_purpose_records — granular per-purpose evidence (INSERT only)
   *      Immutable DPDPA §7 evidence (no UPDATE/DELETE policy on this table).
   * FIX: AuditService.log("consent.granted") now called on every submission.
   */
  async submitConsent(payload: ConsentSubmission): Promise<boolean> {
    // ── DO NOT log payload — it contains PII (employeeId, esignName) ──
    try {
      // ── Step 1: Update master consent status record ──────────────────
      // UPSERT (UNIQUE on employee_id) — captures the current signed state.
      // Now includes template_version so hasConsentedToVersion() can check it.
      const { error: statusError } = await supabase
        .from("consent_records")
        .upsert(
          {
            employee_id:      payload.employeeId,
            status:           "consented",
            signed_at:        new Date().toISOString(),
            template_id:      payload.templateId,
            template_version: payload.templateVersion,
            esign_name:       payload.esignName,
            device:           payload.device,
            location:         payload.location,
            language:         payload.language || 'en',
            video_version_id: payload.videoEventId,
            education_version_id: payload.educationVersionId,
            consent_statement_text: payload.consentStatementText,
          },
          { onConflict: "employee_id" },
        );

      if (statusError) {
        console.error("ConsentService: failed to update master consent status", statusError);
        return false;
      }

      // ── Step 2: Insert granular per-purpose records (DPDPA §7 evidence) ─
      // These rows are IMMUTABLE — no UPDATE/DELETE policy exists on this table.
      // One row per purpose per submission → full audit history preserved.
      const purposeRows = payload.purposes.map((p) => ({
        employee_id:      payload.employeeId,
        user_id:          payload.userId,
        template_id:      payload.templateId,
        template_version: payload.templateVersion,
        purpose_key:      p.purpose_key,
        consented:        p.consented,
        is_mandatory:     p.is_mandatory,
        esign_name:       payload.esignName,
        video_event_id:   payload.videoEventId ?? null,
      }));

      const { error: purposeError } = await supabase
        .from("consent_purpose_records" as any)
        .insert(purposeRows);

      if (purposeError) {
        // The master status was saved. Log for investigation but don't fail the
        // user flow — they have already consented, the granular log can be
        // reconstructed from audit_logs if needed.
        console.error("ConsentService: failed to save granular purpose records", purposeError);
      }

      // ── Step 3: Write to immutable audit log ─────────────────────────
      await AuditService.log({
        action: "consent.granted",
        entityType: "consent_record",
        entityId: payload.employeeId,
        metadata: {
          template_version:   payload.templateVersion,
          esign_name:         payload.esignName,
          purposes_consented: payload.purposes
            .filter((p) => p.consented)
            .map((p) => p.purpose_key),
          purposes_declined:  payload.purposes
            .filter((p) => !p.consented && !p.is_mandatory)
            .map((p) => p.purpose_key),
        },
      });

      return true;
    } catch (err) {
      console.error("ConsentService: unexpected error during submission", err);
      return false;
    }
  },
};
