/**
 * Canonical allowlist of audit_logs.action values.
 *
 * This is the single source of truth for which action strings are actually
 * ever written to public.audit_logs. It exists because the Audit Logs gap
 * report found several action strings referenced by the audit page's filters
 * (and by the old AuditAction type) that no code path ever writes:
 * "invite.sent", "dpr.created", "campaign.created", "campaign.activated",
 * "data.edited". The old AuditAction type also carried "login" and
 * "video.progress", confirmed unused by the same trace. All of these are
 * omitted here.
 *
 * "breach.updated" and "compliance.updated" WERE on that dead list too, but
 * Phase 2 wires real call sites for both (see comments below) — they are no
 * longer aspirational.
 *
 * This is intentionally enforced only at the TypeScript layer for now — the
 * `action` column has no DB CHECK constraint, so this list can grow as new
 * audit call sites are added in later phases without requiring a migration.
 *
 * Each entry documents where it is currently written from, so future changes
 * can tell at a glance whether an action is live or aspirational.
 */
export const AUDIT_ACTIONS = [
  // ── Phase 1 (pre-existing, unchanged) ─────────────────────────────────────
  /** src/routes/_authenticated.tsx — on SIGNED_IN, via RPC upsert_user_login_audit */
  "USER_LOGIN",
  /** src/routes/_authenticated.tsx — on SIGNED_OUT */
  "logout",
  /** src/services/consent.service.ts — submitConsent / reGrantConsent */
  "consent.granted",
  /** src/services/consent.service.ts — withdrawConsent */
  "consent.withdrawn",
  /** src/components/IntroVideoPlayer.tsx — on video completion */
  "video.completed",
  /** src/routes/_authenticated.consent.education.tsx — on module completion */
  "education.completed",
  /** src/services/employee.service.ts — adminOverride, per changed field (old/new values) */
  "admin.override",
  /** src/services/dsr.service.ts — updateStatus (moved server-side from the route in Phase 2) */
  "dsr.status_updated",
  /** supabase/migrations/20260821000006_harden_bootstrap_admin.sql — bootstrap_admin() RPC */
  "bootstrap_admin",
  /** supabase/migrations/20260430000001_tracking_reset_v1.sql — reset_user_onboarding() RPC */
  "reset_onboarding",

  // ── Phase 2 additions ──────────────────────────────────────────────────────
  /** src/routes/_authenticated.admin.employees.index.tsx (AddEmployeeModal) and
   *  src/components/BulkImportEmployeesModal.tsx (per row) — employee creation,
   *  success and failure, distinguished by `source: web_portal | csv_import` */
  "employee.created",
  /** src/services/employee.service.ts — updateEmployee (field-name list only, no
   *  values) and the multi-entry section CRUD helpers (education/certifications/
   *  employment history/nominees/dependents/additional notes) */
  "employee.updated",
  /** src/components/BulkImportEmployeesModal.tsx — one summary row per CSV
   *  import batch (counts + correlation_id grouping the per-row employee.created events) */
  "employee.import_completed",
  /** src/services/jurisdiction.service.ts — assignForEmployee (country/framework
   *  ids only — not sensitive personal data) */
  "jurisdiction.assigned",
  /** src/lib/csv.ts — downloadCsv(), whenever a caller passes an `audit` descriptor.
   *  Currently wired from the Reports page (consent/DSR/breach/RoPA exports) and
   *  the Audit Logs page's own CSV export. */
  "csv.exported",
  /** src/services/video.service.ts — createVideoVersion (draft upload) */
  "video.created",
  /** src/services/video.service.ts — publishVideo */
  "video.published",
  /** src/services/video.service.ts — deactivateVideo */
  "video.deactivated",
  /** src/services/correction.service.ts — submit / submitSectionRecordCorrection / submitSectionDeleteRequest */
  "correction.submitted",
  /** src/services/correction.service.ts — approve() (wraps RPC approve_correction) */
  "correction.approved",
  /** src/services/correction.service.ts — reject() (wraps RPC reject_correction) */
  "correction.rejected",
  /** src/services/dsr.service.ts — create() */
  "dsr.created",
  /** src/services/compliance.service.ts, risk.service.ts, inventory.service.ts —
   *  create/update (record id + change type only, no free-text field values) */
  "compliance.updated",
  /** src/services/breach.service.ts — create/update/recordBoardNotification/recordPrincipalNotification */
  "breach.updated",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Origins an audit event can be attributed to. */
export const AUDIT_SOURCES = [
  "web_portal",
  "csv_import",
  "csv_export",
  "rpc",
] as const;

export type AuditSource = (typeof AUDIT_SOURCES)[number];
