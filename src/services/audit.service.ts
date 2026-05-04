import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "USER_LOGIN"
  | "login"
  | "logout"
  | "consent.granted"
  | "consent.withdrawn"
  | "video.completed"
  | "video.progress"
  | "education.completed"
  | "data.edited"
  | "invite.sent"
  | "dpr.created"
  | "campaign.created"
  | "campaign.activated"
  | "admin.override";

interface AuditPayload {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
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

  async log({ action, entityType, entityId, metadata }: AuditPayload): Promise<void> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const userId = session?.user?.id ?? null;

      await supabase.from("audit_logs").insert({
        actor_user_id: userId,
        user_email: session?.user?.email ?? null,
        action,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        metadata: metadata ?? null,
        // IP is captured server-side; best-effort from client
        ip_address: null,
      });
    } catch (err) {
      // Audit failures must NEVER block the user flow
      console.warn("[AuditService] Failed to write audit log:", err);
    }
  },
};
