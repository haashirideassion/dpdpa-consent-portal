import { supabase } from "@/integrations/supabase/client";
import type { NotificationCategory } from "@/lib/notificationTypes";

/**
 * NOTIFICATION SERVICE
 *
 * Single client-side entry point for the notification center. All reads are
 * always scoped to the authenticated user's own notifications — enforced
 * both here (explicit .eq("user_id", userId)) and, more importantly, by the
 * DB itself (RLS SELECT-own-only policy on public.notifications).
 *
 * Writes are NOT performed by inserting into the table directly — the
 * notification-hardening migration removed the INSERT/UPDATE RLS policies
 * that used to allow that (including a self-spoofing gap where any user
 * could insert an arbitrary notification for themself). All writes go
 * through SECURITY DEFINER RPCs:
 *   - create_notification()      — general purpose (self, or staff → anyone)
 *   - notify_staff_audience()    — narrow, employee → staff audience only
 *   - mark_notification_read()   — recipient-scoped read-state change
 *   - mark_all_notifications_read()
 * See supabase/migrations/20260825000001_notification_center_hardening.sql.
 */

export interface AppNotification {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  category: NotificationCategory | string | null;
  type: string | null;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

const PAGE_SIZE = 20;

export const NotificationService = {
  /**
   * Fetches one page of the current user's notifications, newest first.
   * Pass the `created_at` of the last row already loaded as `beforeCursor`
   * to load the next page ("Load more") — unread count is NOT derived from
   * this list, see getUnreadCount().
   */
  async list(userId: string, opts?: { beforeCursor?: string; limit?: number }): Promise<AppNotification[]> {
    let query = (supabase as any)
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? PAGE_SIZE);

    if (opts?.beforeCursor) {
      query = query.lt("created_at", opts.beforeCursor);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as AppNotification[];
  },

  /**
   * True unread count for the current user — an efficient COUNT query via
   * RPC, independent of pagination (fixes the old dropdown's bug of
   * computing "unread" from only the last 20 loaded rows).
   */
  async getUnreadCount(): Promise<number> {
    const { data, error } = await (supabase as any).rpc("get_unread_notification_count");
    if (error) throw error;
    return (data as number) ?? 0;
  },

  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await (supabase as any).rpc("mark_notification_read", {
      p_notification_id: notificationId,
    });
    if (error) throw error;
  },

  async markAllAsRead(): Promise<void> {
    const { error } = await (supabase as any).rpc("mark_all_notifications_read");
    if (error) throw error;
  },

  /**
   * Creates a notification for `recipientUserId`. Callers must be either
   * the recipient themself, or hold an admin/hr_manager/dpo role — enforced
   * server-side by create_notification(); a rejected call throws.
   *
   * Best-effort by convention: callers wrap this in try/catch so a
   * notification failure never blocks the underlying business operation
   * (see each call site — e.g. EmployeeService.adminOverride,
   * ConsentService.withdrawConsent/reGrantConsent).
   */
  async create(params: {
    recipientUserId: string;
    category: NotificationCategory;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    actionUrl?: string;
  }): Promise<void> {
    const { error } = await (supabase as any).rpc("create_notification", {
      p_recipient_user_id: params.recipientUserId,
      p_category: params.category,
      p_title: params.title,
      p_message: params.message,
      p_entity_type: params.entityType ?? null,
      p_entity_id: params.entityId ?? null,
      p_action_url: params.actionUrl ?? null,
    });
    if (error) throw error;
  },

  /**
   * Notifies the admin/hr_manager/dpo audience of an employee-initiated
   * onboarding-step event. Restricted server-side to
   * 'education.completed' | 'video.completed'.
   */
  async notifyStaff(params: {
    category: Extract<NotificationCategory, "education.completed" | "video.completed">;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    actionUrl?: string;
  }): Promise<void> {
    const { error } = await (supabase as any).rpc("notify_staff_audience", {
      p_category: params.category,
      p_title: params.title,
      p_message: params.message,
      p_entity_type: params.entityType ?? null,
      p_entity_id: params.entityId ?? null,
      p_action_url: params.actionUrl ?? null,
    });
    if (error) throw error;
  },
};
