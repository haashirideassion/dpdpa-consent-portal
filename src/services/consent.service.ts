import { supabase } from "@/integrations/supabase/client";
import { AuditService } from "@/services/audit.service";

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

  /**
   * Returns per-purpose consent statuses for an employee.
   * Uses the active template to enumerate all purposes, then cross-references
   * consent_purpose_records and consent_withdrawals to compute current state.
   */
  async getConsentStatuses(employeeId: string): Promise<{
    template: ConsentTemplate | null;
    statuses: PurposeConsentStatus[];
  }> {
    const template = await ConsentService.getActiveTemplate();
    if (!template) return { template: null, statuses: [] };

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

      // Latest grant where consented=true
      const latestGrant = purposeGrants.find((r) => r.consented) ?? null;
      // Latest withdrawal
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

    return { template, statuses };
  },

  /**
   * Records a consent withdrawal for a single purpose.
   * - Inserts into consent_withdrawals
   * - Writes audit log (consent.withdrawn)
   * - Sends in-app notification to the employee (acknowledgement)
   * - Calls SECURITY DEFINER RPC to notify HR/DPO
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

      // Audit log — silent failure
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

      // Self-notification: withdrawal acknowledgement to employee
      await supabase.from("notifications" as any).insert({
        user_id: params.userId,
        type: "CONSENT_WITHDRAWAL",
        title: "Consent Withdrawal Recorded",
        message: `Your consent for "${params.purposeLabel}" has been withdrawn. HR and DPO have been notified.`,
      });

      // Notify HR/DPO via SECURITY DEFINER RPC (bypasses RLS)
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
          employee_id: params.employeeId,
          user_id: params.userId,
          template_id: params.templateId,
          template_version: params.templateVersion,
          purpose_key: params.purposeKey,
          consented: true,
          is_mandatory: params.isMandatory,
          esign_name: params.employeeName,
        });

      if (error) {
        console.error("ConsentService: failed to insert re-grant record", error);
        return false;
      }

      // Audit log
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

      // Self-notification: re-consent acknowledgement
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
