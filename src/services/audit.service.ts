import { supabase } from "@/integrations/supabase/client";
import type { AuditAction, AuditSource } from "@/lib/auditActions";

export type { AuditAction } from "@/lib/auditActions";

interface AuditPayload {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  /**
   * Phase 1 foundation fields (see supabase/migrations/20260821000012_audit_logs_foundation.sql).
   */
  success?: boolean;
  source?: AuditSource;
  /**
   * Actor's role at the time of the event. Optional — if omitted, `log()`
   * resolves it itself from the `employees` table (see resolveActorRole
   * below), so callers do not need to plumb useAuth() into every service.
   * Pass it explicitly only when the caller already has a trustworthy role
   * in hand and wants to avoid the extra lookup.
   */
  actorRole?: string;
  correlationId?: string;
  failureReason?: string;
}

/**
 * Best-effort, per-session cache of userId → role, so a burst of audit events
 * from the same actor (e.g. a CSV import writing one row per employee) doesn't
 * issue a separate `employees` lookup per event. Never a source of truth by
 * itself — a lookup miss/error just leaves actor_role NULL for that event
 * rather than guessing.
 */
const actorRoleCache = new Map<string, string | null>();

async function resolveActorRole(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  if (actorRoleCache.has(userId)) return actorRoleCache.get(userId) ?? null;

  try {
    // Cast to `any` — the generated Database type (types.ts) is stale and
    // doesn't include employees.user_id/role, the same pre-existing gap
    // documented across the rest of the codebase (e.g. employee.service.ts).
    const { data, error } = await (supabase as any)
      .from("employees")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const role = error ? null : ((data as { role?: string } | null)?.role ?? "employee");
    actorRoleCache.set(userId, role);
    return role;
  } catch {
    // Never let a role lookup failure block or fail the audit write itself.
    actorRoleCache.set(userId, null);
    return null;
  }
}

/**
 * AUDIT SERVICE
 * Inserts append-only audit log entries.
 * Silently catches errors so audit failures never block the main flow.
 */
export const AuditService = {
  async logUserLogin(sessionId: string, provider?: string, email?: string | null): Promise<void> {
    try {
      await supabase.rpc("upsert_user_login_audit", {
        p_session_id: sessionId,
        p_provider: provider ?? "azure",
        p_email: email ?? null,
      });
    } catch (err) {
      console.warn("[AuditService] Failed to upsert USER_LOGIN audit log:", err);
    }
  },

  async log({
    action,
    entityType,
    entityId,
    metadata,
    success,
    source,
    actorRole,
    correlationId,
    failureReason,
  }: AuditPayload): Promise<void> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const userId = session?.user?.id ?? null;
      const resolvedRole = actorRole ?? (await resolveActorRole(userId));

      await supabase.from("audit_logs").insert({
        actor_user_id: userId,
        user_email: session?.user?.email ?? null,
        action,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        metadata: metadata ?? null,
        // ip_address is intentionally NOT set here — the client cannot be
        // trusted to self-report it. The enforce_audit_log_integrity()
        // BEFORE INSERT trigger (see supabase/migrations/
        // 20260826000002_audit_log_ip_capture.sql) unconditionally
        // overwrites this column with the real IP derived from the
        // request's own HTTP headers (PostgREST's `request.headers` GUC),
        // the same way it already overwrites actor_role. Whatever is
        // passed here is discarded, so it is left unset rather than
        // implying the client controls it.
        // Phase 1 foundation fields — undefined values are dropped by
        // JSON serialization, so omitting them lets the column defaults
        // (success = true) or NULL apply exactly as before this change.
        ...(success !== undefined ? { success } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(resolvedRole !== null ? { actor_role: resolvedRole } : {}),
        ...(correlationId !== undefined ? { correlation_id: correlationId } : {}),
        ...(failureReason !== undefined ? { failure_reason: failureReason } : {}),
      });
    } catch (err) {
      // Audit failures must NEVER block the user flow
      console.warn("[AuditService] Failed to write audit log:", err);
    }
  },
};
