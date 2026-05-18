import { supabase } from "@/integrations/supabase/client";
import { AuditService } from "@/services/audit.service";

// ── Purpose type classification ──────────────────────────────────────────────
export type PurposeType = "mandatory" | "conditional" | "optional";

// ── Per-purpose consent status (used by MyConsentsView) ─────────────────────

export interface PurposeConsentStatus {
  purpose: ConsentPurpose & { templateId: string; templateVersion: string };
  /** 'active' = consented and not withdrawn, 'withdrawn' = previously withdrawn,
   *  'pending' = never given or last action was decline */
  currentStatus: "active" | "withdrawn" | "pending";
  grantedAt: string | null;    // created_at of the latest consented=true record
  withdrawnAt: string | null;  // withdrawn_at of the latest withdrawal record
  grantHistory: Array<{ id: string; consented: boolean; created_at: string; template_version: string }>;
  withdrawalHistory: Array<{ id: string; withdrawn_at: string; reason: string | null }>;
}

export interface ConsentSection {
  id: string;
  section_number: number;
  section_name: string;
  section_header_text: string | null;
  display_order: number;
  purposes: ConsentPurpose[];
}

export interface ConsentPurpose {
  id: string;
  purpose_key: string;
  label: string;
  description: string;
  is_mandatory: boolean;
  purpose_type: PurposeType;
  legal_basis: string;
  display_order: number;
  // Disclosure metadata
  data_categories?: string;   // v1.0 legacy field
  data_used?: string;         // v2.0 field
  third_parties?: string;     // v1.0 legacy field
  shared_with?: string;       // v2.0 field
  retention_period?: string;
  cross_border?: boolean;
  cross_border_details?: string;
  // Consent-action fields
  consequence_of_declining?: string;
  consent_action_label?: string;
  // Section reference (optional — present when loaded via sections)
  section_id?: string;
}

export interface ConsentTemplate {
  id: string;
  version: string;
  name: string;
  purposes: ConsentPurpose[];
  sections: ConsentSection[];  // grouped view; empty for v1.0 templates
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
   * Fetches the active consent template, its purposes, and section groupings.
   * For v2.0+ templates that have sections, returns purposes grouped by section.
   * For legacy v1.0 templates (no sections), sections array will be empty.
   */
  async getActiveTemplate(): Promise<ConsentTemplate | null> {
    const templateResult = await (supabase as any)
      .from("consent_templates")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (templateResult.error || !templateResult.data) {
      console.error("Failed to fetch active template", templateResult.error);
      return null;
    }
    const templateData = templateResult.data as { id: string; version: string; name: string };

    const purposesResult = await (supabase as any)
      .from("consent_purposes")
      .select("*")
      .eq("template_id", templateData.id)
      .order("display_order", { ascending: true });

    if (purposesResult.error) {
      console.error("Failed to fetch template purposes", purposesResult.error);
      return null;
    }

    // Fetch sections (v2.0+)
    const sectionsResult = await (supabase as any)
      .from("consent_sections")
      .select("*")
      .eq("template_id", templateData.id)
      .order("display_order", { ascending: true });

    const purposes = ((purposesResult.data ?? []) as any[]) as ConsentPurpose[];

    // Build section grouping
    const sections: ConsentSection[] = ((sectionsResult.data ?? []) as any[]).map((sec: any) => ({
      id: sec.id,
      section_number: sec.section_number,
      section_name: sec.section_name,
      section_header_text: sec.section_header_text ?? null,
      display_order: sec.display_order,
      purposes: purposes.filter((p) => p.section_id === sec.id),
    }));

    return {
      id: templateData.id,
      version: templateData.version,
      name: templateData.name,
      purposes,
      sections,
    };
  },

  /**
   * Checks if the employee has already consented to THIS specific template version.
   *
   * FIX (Deploy-Blocker #6): The `version` parameter was previously ignored.
   * This caused employees who consented to v1.0 to bypass the gate for v2.0.
   */
  async hasConsentedToVersion(employeeId: string, version: string): Promise<boolean> {
    const result = await (supabase as any)
      .from("consent_records")
      .select("status")
      .eq("employee_id", employeeId)
      .eq("status", "consented")
      .eq("template_version", version) // ← version check enforced
      .limit(1)
      .maybeSingle();

    if (result.error) {
      console.error("Failed to check existing consent", result.error);
      return false;
    }
    return !!result.data;
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
      const { error: statusError } = await (supabase as any)
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
      const now = new Date().toISOString();
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
        granted_at:       p.consented ? now : null,
        declined_at:      !p.consented && !p.is_mandatory ? now : null,
        audit_metadata: {
          device:   payload.device ?? null,
          language: payload.language ?? "en",
          location: payload.location ?? null,
        },
      }));

      const { error: purposeError } = await supabase
        .from("consent_purpose_records" as any)
        .insert(purposeRows);

      if (purposeError) {
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

  /**
   * Returns per-purpose consent statuses for an employee, grouped by section
   * for v2.0+ templates.
   */
  async getConsentStatuses(employeeId: string): Promise<{
    template: ConsentTemplate | null;
    statuses: PurposeConsentStatus[];
    sectionedStatuses: Array<{ section: ConsentSection; statuses: PurposeConsentStatus[] }>;
  }> {
    const template = await ConsentService.getActiveTemplate();
    if (!template) return { template: null, statuses: [], sectionedStatuses: [] };

    // Fetch all grant records for this employee (immutable history)
    const { data: grantRows } = await supabase
      .from("consent_purpose_records" as any)
      .select("id, purpose_key, consented, created_at, template_version")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    // Fetch all withdrawal records for this employee
    const { data: withdrawalRows } = await supabase
      .from("consent_withdrawals" as any)
      .select("id, purpose_key, withdrawn_at, reason")
      .eq("employee_id", employeeId)
      .order("withdrawn_at", { ascending: false });

    const grants = (grantRows ?? []) as unknown as Array<{
      id: string; purpose_key: string; consented: boolean; created_at: string; template_version: string;
    }>;
    const withdrawals = (withdrawalRows ?? []) as unknown as Array<{
      id: string; purpose_key: string; withdrawn_at: string; reason: string | null;
    }>;

    const statuses: PurposeConsentStatus[] = template.purposes.map((purpose) => {
      const purposeGrants = grants.filter((r) => r.purpose_key === purpose.purpose_key);
      const purposeWithdrawals = withdrawals.filter((w) => w.purpose_key === purpose.purpose_key);

      const latestGrant = purposeGrants.find((r) => r.consented) ?? null;
      const latestWithdrawal = purposeWithdrawals[0] ?? null;

      let currentStatus: "active" | "withdrawn" | "pending" = "pending";
      if (latestGrant) {
        if (latestWithdrawal) {
          const grantTime = new Date(latestGrant.created_at).getTime();
          const withdrawTime = new Date(latestWithdrawal.withdrawn_at).getTime();
          currentStatus = withdrawTime > grantTime ? "withdrawn" : "active";
        } else {
          currentStatus = "active";
        }
      }

      return {
        purpose: { ...purpose, templateId: template.id, templateVersion: template.version },
        currentStatus,
        grantedAt: latestGrant?.created_at ?? null,
        withdrawnAt: latestWithdrawal?.withdrawn_at ?? null,
        grantHistory: purposeGrants,
        withdrawalHistory: purposeWithdrawals,
      };
    });

    // Build section-grouped statuses for v2.0+ templates
    const sectionedStatuses = template.sections.map((section) => ({
      section,
      statuses: statuses.filter((s) => section.purposes.some((p) => p.id === s.purpose.id)),
    }));

    return { template, statuses, sectionedStatuses };
  },

  /**
   * Records a consent withdrawal for a single purpose.
   */
  async withdrawConsent(params: {
    employeeId: string;
    userId: string;
    purposeKey: string;
    purposeLabel: string;
    reason?: string;
    employeeName: string;
  }): Promise<boolean> {
    try {
      const { error } = await supabase.from("consent_withdrawals" as any).insert({
        employee_id: params.employeeId,
        user_id: params.userId,
        purpose_key: params.purposeKey,
        reason: params.reason ?? null,
      });

      if (error) {
        console.error("ConsentService: failed to insert consent withdrawal", error);
        return false;
      }

      await AuditService.log({
        action: "consent.withdrawn",
        entityType: "consent_withdrawal",
        entityId: params.employeeId,
        metadata: {
          purpose_key: params.purposeKey,
          purpose_label: params.purposeLabel,
          reason: params.reason ?? null,
        },
      });

      await supabase.from("notifications" as any).insert({
        user_id: params.userId,
        type: "CONSENT_WITHDRAWAL",
        title: "Consent Withdrawal Recorded",
        message: `Your consent for "${params.purposeLabel}" has been withdrawn. HR and DPO have been notified.`,
      });

      await supabase.rpc("notify_hr_dpo_consent_withdrawal" as any, {
        p_employee_name: params.employeeName,
        p_purpose_label: params.purposeLabel,
        p_purpose_key: params.purposeKey,
      });

      return true;
    } catch (err) {
      console.error("ConsentService: unexpected error during withdrawal", err);
      return false;
    }
  },

  /**
   * Re-grants consent for a previously withdrawn purpose.
   * Inserts a new consent_purpose_records row (immutable, append-only).
   * Does NOT delete any withdrawal records — history is fully preserved.
   */
  async reGrantConsent(params: {
    employeeId: string;
    userId: string;
    purposeKey: string;
    purposeLabel: string;
    templateId: string;
    templateVersion: string;
    isMandatory: boolean;
    employeeName: string;
  }): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("consent_purpose_records" as any)
        .insert({
          employee_id:   params.employeeId,
          user_id:       params.userId,
          template_id:   params.templateId,
          template_version: params.templateVersion,
          purpose_key:   params.purposeKey,
          consented:     true,
          is_mandatory:  params.isMandatory,
          esign_name:    params.employeeName,
          granted_at:    new Date().toISOString(),
          audit_metadata: { re_consent: true },
        });

      if (error) {
        console.error("ConsentService: failed to insert re-grant record", error);
        return false;
      }

      await AuditService.log({
        action: "consent.granted",
        entityType: "consent_purpose_records",
        entityId: params.employeeId,
        metadata: {
          purpose_key: params.purposeKey,
          purpose_label: params.purposeLabel,
          template_version: params.templateVersion,
          re_consent: true,
        },
      });

      await supabase.from("notifications" as any).insert({
        user_id: params.userId,
        type: "CONSENT_GRANTED",
        title: "Consent Re-Granted",
        message: `Your consent for "${params.purposeLabel}" has been recorded.`,
      });

      return true;
    } catch (err) {
      console.error("ConsentService: unexpected error during re-grant", err);
      return false;
    }
  },
};
