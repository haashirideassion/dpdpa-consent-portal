import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BellBoldDuotone, DangerTriangleBoldDuotone } from "solar-icon-set";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { NotificationService, type AppNotification } from "@/services/notification.service";

/**
 * Notification bell + panel — the header entry point for the notification
 * center. All reads/writes go through NotificationService, which itself
 * only ever talks to the recipient-scoped RPCs/RLS described in
 * supabase/migrations/20260825000001_notification_center_hardening.sql.
 */
export function NotificationDropdown({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [open, setOpen] = useState(false);

  // Guards against the realtime INSERT callback and the initial/periodic
  // fetch both adding the same row — dedupe is always by notification id.
  const knownIds = useRef<Set<string>>(new Set());

  const mergeNotifications = useCallback((incoming: AppNotification[], mode: "replace" | "prepend" | "append") => {
    setNotifications((prev) => {
      const fresh = incoming.filter((n) => !knownIds.current.has(n.id) || mode === "replace");
      if (mode === "replace") {
        knownIds.current = new Set(incoming.map((n) => n.id));
        return incoming;
      }
      fresh.forEach((n) => knownIds.current.add(n.id));
      if (mode === "prepend") return [...fresh, ...prev];
      return [...prev, ...fresh];
    });
  }, []);

  const fetchInitial = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [rows, count] = await Promise.all([
        NotificationService.list(userId),
        NotificationService.getUnreadCount(),
      ]);
      mergeNotifications(rows, "replace");
      setUnreadCount(count);
      setHasMore(rows.length >= 20);
    } catch (err) {
      console.error("NotificationDropdown: failed to load notifications", err);
      setError("Couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, [userId, mergeNotifications]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // Realtime: reuse the existing single channel/subscription pattern —
  // extended to also react to UPDATE (e.g. read-state changed in another
  // tab) in addition to the original INSERT. Each event patches local
  // state directly instead of re-fetching, so a fast burst of events can
  // never produce a duplicate row or a duplicate toast.
  useEffect(() => {
    if (!userId) return;

    const sub = supabase
      .channel("public:notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as AppNotification;
          if (knownIds.current.has(row.id)) return;
          mergeNotifications([row], "prepend");
          setUnreadCount((c) => c + (row.is_read ? 0 : 1));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as AppNotification;
          setNotifications((prev) => prev.map((n) => (n.id === row.id ? row : n)));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [userId, mergeNotifications]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || notifications.length === 0) return;
    setLoadingMore(true);
    try {
      const oldestCreatedAt = notifications[notifications.length - 1].created_at;
      const rows = await NotificationService.list(userId, { beforeCursor: oldestCreatedAt });
      mergeNotifications(rows, "append");
      setHasMore(rows.length >= 20);
    } catch (err) {
      console.error("NotificationDropdown: failed to load more notifications", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const markAsRead = async (n: AppNotification) => {
    if (n.is_read) return;
    setNotifications((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, is_read: true, read_at: new Date().toISOString() } : x)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await NotificationService.markAsRead(n.id);
    } catch (err) {
      console.error("NotificationDropdown: failed to mark notification read", err);
    }
  };

  const markAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at ?? now })));
    setUnreadCount(0);
    try {
      await NotificationService.markAllAsRead();
    } catch (err) {
      console.error("NotificationDropdown: failed to mark all notifications read", err);
    }
  };

  const handleNotificationClick = (n: AppNotification) => {
    markAsRead(n);
    if (n.action_url) {
      setOpen(false);
      navigate({ to: n.action_url });
    }
  };

  const groups = groupByRecency(notifications);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <BellBoldDuotone size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[22rem] p-0 border-muted shadow-lg"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              Mark all as read
            </button>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto py-1">
          {loading ? (
            <div className="p-3 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 p-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-1/4" />
                </div>
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={<DangerTriangleBoldDuotone size={28} />}
              title={error}
              className="py-8"
            />
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={<BellBoldDuotone size={28} />}
              title="You're all caught up."
              className="py-8"
            />
          ) : (
            <>
              {groups.map((group) => (
                <div key={group.label}>
                  <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {group.label}
                  </div>
                  {group.items.map((n) => (
                    <NotificationRow key={n.id} notification={n} onClick={() => handleNotificationClick(n)} />
                  ))}
                </div>
              ))}
              {hasMore && (
                <div className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationRow({ notification: n, onClick }: { notification: AppNotification; onClick: () => void }) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault(); // keep the panel open when marking read without a destination
        onClick();
      }}
      className={`flex flex-col items-start gap-1 px-4 py-2.5 cursor-pointer rounded-none border-b last:border-0 border-muted/50 ${
        !n.is_read ? "bg-primary/5 hover:bg-primary/10 focus:bg-primary/10" : "hover:bg-muted/50 focus:bg-muted/50"
      }`}
    >
      <div className="flex w-full justify-between items-start gap-3">
        <span className={`text-sm ${!n.is_read ? "font-medium text-foreground" : "font-normal text-muted-foreground"}`}>
          {n.title}
        </span>
        {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" aria-hidden="true" />}
      </div>
      <span className={`text-xs leading-relaxed whitespace-pre-wrap ${!n.is_read ? "text-muted-foreground/90" : "text-muted-foreground/70"}`}>
        {n.message}
      </span>
      <span className="text-[10px] font-medium text-muted-foreground/60 mt-0.5 uppercase tracking-wider">
        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
      </span>
    </DropdownMenuItem>
  );
}

function groupByRecency(items: AppNotification[]): { label: string; items: AppNotification[] }[] {
  const today: AppNotification[] = [];
  const yesterday: AppNotification[] = [];
  const earlier: AppNotification[] = [];

  for (const n of items) {
    const date = new Date(n.created_at);
    if (isToday(date)) today.push(n);
    else if (isYesterday(date)) yesterday.push(n);
    else earlier.push(n);
  }

  return [
    { label: "Today", items: today },
    { label: "Yesterday", items: yesterday },
    { label: "Earlier", items: earlier },
  ].filter((g) => g.items.length > 0);
}
