import { supabase } from "@/integrations/supabase/client";
import { FrameworkService, type RegulatoryFramework } from "@/services/framework.service";
import { AuditService } from "@/services/audit.service";
import type { AuditSource } from "@/lib/auditActions";
const db = supabase as any;

/**
 * EMPLOYEE JURISDICTION SERVICE
 * Minimal read/assign access to `employee_jurisdiction_details`,
 * introduced by migration 20260819000001 (Region / Regulatory Framework
 * architecture, Phase 2).
 *
 * This is a new, optional 1:1 detail table (same normalized pattern as
 * employee_personal_details / employee_health_info). It is intentionally
 * NOT auto-created on employee creation, so `getForEmployee` returning
 * `null` is the expected, common case for every existing employee today
 * — callers must treat `null` identically to "India / DPDPA applies", not
 * as an error or an incomplete profile.
 *
 * Not yet wired into any consent/compliance resolution logic or Admin UI
 * — this phase only provides the service methods. RLS restricts writes to
 * admin/hr_manager (see the migration), matching the fact that
 * jurisdiction assignment is an HR decision, not employee self-service.
 */
export interface EmployeeJurisdiction {
  id: string;
  employee_id: string;
  country_id: string | null;
  regulatory_framework_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * How an employee's applicable regulatory framework was determined:
 *  - "assigned": HR explicitly assigned a jurisdiction with a valid, active framework.
 *  - "default":  no employee_jurisdiction_details row exists — the existing
 *                India/DPDPA default applies, exactly as before Phase 4.
 *  - "none":     an explicit jurisdiction exists but no active framework
 *                could be resolved for it (e.g. framework deactivated, or a
 *                country with no regulatory_framework_countries link). This
 *                must NEVER silently fall back to DPDPA — callers must
 *                surface a clear "no framework configured" state instead.
 *
 * Invariant: `framework` is guaranteed non-null whenever `source !== "none"`.
 */
export type FrameworkResolutionSource = "assigned" | "default" | "none";

export interface FrameworkResolution {
  framework: RegulatoryFramework | null;
  source: FrameworkResolutionSource;
}

export const JurisdictionService = {
  /** Returns null when no jurisdiction has been explicitly assigned yet. */
  async getForEmployee(employeeId: string): Promise<EmployeeJurisdiction | null> {
    const { data, error } = await db
      .from("employee_jurisdiction_details")
      .select("*")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as EmployeeJurisdiction | null;
  },

  /**
   * Creates or updates the jurisdiction assignment for an employee.
   * Admin/HR only (enforced by RLS) — does not alter any other employee
   * data, consent record, or role.
   */
  async assignForEmployee(
    employeeId: string,
    input: { countryId?: string | null; regulatoryFrameworkId?: string | null; notes?: string | null },
    assignedByUserId?: string,
    source: AuditSource = "web_portal",
  ): Promise<void> {
    // Best-effort — only needed for the FAILURE log's metadata below; the
    // success case no longer needs this (see comment on the trigger call).
    const previous = await this.getForEmployee(employeeId).catch(() => null);

    const { error } = await db.from("employee_jurisdiction_details").upsert(
      {
        employee_id: employeeId,
        country_id: input.countryId ?? null,
        regulatory_framework_id: input.regulatoryFrameworkId ?? null,
        notes: input.notes ?? null,
        assigned_by: assignedByUserId ?? null,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "employee_id" },
    );
    if (error) {
      await AuditService.log({
        action: "jurisdiction.assigned",
        entityType: "Employee",
        entityId: employeeId,
        metadata: {
          change: previous ? "updated" : "assigned",
          new_country_id: input.countryId ?? null,
          new_regulatory_framework_id: input.regulatoryFrameworkId ?? null,
        },
        source,
        success: false,
        failureReason: error.message ?? "Jurisdiction assignment failed",
      });
      throw error;
    }

    // Phase 4: the SUCCESS event is now written server-side by a trigger on
    // employee_jurisdiction_details itself (trg_audit_jurisdiction_assignment,
    // see 20260821000013_audit_log_transactional_integrity.sql), in the same
    // transaction as this upsert — logging it again here would be a
    // duplicate, and would be rejected by the new audit_logs integrity
    // trigger anyway (this client call has no way to set the trusted-write
    // flag the DB trigger sets internally).
  },

  /**
   * Resolves the regulatory framework applicable to an employee — the
   * single database-driven path Phase 4 introduces for consent-template
   * resolution. Never hard-codes India/DPDPA: the "default" branch below
   * resolves the default framework BY CODE via FrameworkService.getDefault()
   * (itself a DB lookup), and the "assigned" branch always follows the
   * employee's actual employee_jurisdiction_details → regulatory_frameworks
   * relationship. Only active frameworks are ever returned.
   */
  async resolveFrameworkForEmployee(employeeId: string): Promise<FrameworkResolution> {
    const jurisdiction = await this.getForEmployee(employeeId);

    // No explicit jurisdiction row (every existing employee today): fall
    // back to the application-level default. This does NOT write anything
    // to the database — it's purely a read-time fallback, same as before
    // Phase 4 existed.
    if (!jurisdiction) {
      const fallback = await FrameworkService.getDefault();
      if (!fallback || !fallback.is_active) {
        return { framework: null, source: "none" };
      }
      return { framework: fallback, source: "default" };
    }

    // An explicit jurisdiction row exists but was never fully assigned a
    // framework (not reachable via the built Admin UI today — Save
    // requires one — but handled defensively for direct DB edits/future
    // import paths). Must NOT silently fall back to DPDPA.
    if (!jurisdiction.regulatory_framework_id) {
      return { framework: null, source: "none" };
    }

    const framework = await FrameworkService.getById(jurisdiction.regulatory_framework_id);

    // Only active frameworks may ever be resolved/used.
    if (!framework || !framework.is_active) {
      return { framework: null, source: "none" };
    }

    return { framework, source: "assigned" };
  },
};
