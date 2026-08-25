import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  ShieldCheckBoldDuotone,
  FileTextBoldDuotone,
  DownloadMinimalisticBoldDuotone,
  AltArrowRightBoldDuotone,
} from "solar-icon-set";
import { format, startOfDay, endOfDay } from "date-fns";
import { downloadCsv } from "@/lib/csv";
import { toast } from "sonner";
import { AUDIT_ACTIONS } from "@/lib/auditActions";
import {
  formatAuditActionLabel,
  summarizeAuditEvent,
  getAuditDetailRows,
  type AuditLogRow,
} from "@/lib/auditPresentation";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [{ title: "Audit Logs — Admin" }],
  }),
  component: AuditAdminPage,
});

type AuditLog = AuditLogRow;

const ALL_VALUE = "__all__";

// Action filter options — sourced directly from the canonical AUDIT_ACTIONS
// allowlist (src/lib/auditActions.ts), sorted by their display label so the
// dropdown reads alphabetically rather than in declaration order. No second,
// manually-maintained action list.
const ACTION_OPTIONS = [...AUDIT_ACTIONS]
  .map((action) => ({ value: action, label: formatAuditActionLabel(action) }))
  .sort((a, b) => a.label.localeCompare(b.label));

// Actor filter options — the application's actual role model (see
// src/hooks/use-auth.tsx AppRole). Not invented: every value here is a real
// role the app assigns.
const ACTOR_OPTIONS: { value: string; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "hr_manager", label: "HR Manager" },
  { value: "dpo", label: "DPO" },
  { value: "employee", label: "Employee" },
];

function AuditAdminPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);
  const pageSize = 10;

  // Filters — Action ("what happened?") and Actor ("who performed it?") are
  // now two independent concepts instead of one ambiguous "Admin/User
  // Actions" dropdown that mixed both.
  const [actionFilter, setActionFilter] = useState(ALL_VALUE);
  const [actorFilter, setActorFilter] = useState(ALL_VALUE);
  const [searchEmail, setSearchEmail] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // Details drawer
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  function openDetails(log: AuditLog) {
    setSelectedLog(log);
    setDetailsOpen(true);
  }

  // Shared by the paginated table fetch and the CSV export — applies every
  // active filter identically so export always matches what's on screen.
  const buildFilteredQuery = useCallback(
    (countMode: "exact" | "planned" = "exact") => {
      let query = supabase.from("audit_logs").select("*", { count: countMode });

      if (actionFilter !== ALL_VALUE) {
        // Cast to `any` — audit_logs isn't in the generated (stale) Database
        // type, so its .eq() overload only resolves to the "id" column; same
        // pre-existing gap documented elsewhere in this file/codebase.
        query = (query as any).eq("action", actionFilter);
      }
      if (actorFilter !== ALL_VALUE) {
        query = (query as any).eq("actor_role", actorFilter);
      }
      if (searchEmail) {
        query = query.ilike("user_email", `%${searchEmail}%`);
      }
      if (dateFilter) {
        const date = new Date(dateFilter);
        if (!isNaN(date.getTime())) {
          query = query.gte("created_at", startOfDay(date).toISOString());
          query = query.lte("created_at", endOfDay(date).toISOString());
        }
      }

      return query;
    },
    [actionFilter, actorFilter, searchEmail, dateFilter]
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);

    const query = buildFilteredQuery()
      .order("created_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    const { data, count, error } = await query;

    if (!error && data) {
      setLogs(data as any as AuditLog[]);
      setTotalCount(count ?? 0);
    } else if (error) {
      console.error("Failed to fetch audit logs", error);
    }

    setLoading(false);
  }, [buildFilteredQuery, page]);

  // Refetch when dependencies change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [actionFilter, actorFilter, searchEmail, dateFilter]);

  const getBadgeTone = (action: string): StatusTone => {
    if (action === "USER_LOGIN" || action === "logout") return "info";
    if (action.startsWith("consent.")) return "success";
    if (action.includes("rejected") || action === "bootstrap_admin") return "warning";
    return "neutral";
  };

  const EXPORT_ROW_CAP = 5000;

  async function handleExportCsv() {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const query = buildFilteredQuery("exact")
        .order("created_at", { ascending: false })
        .limit(EXPORT_ROW_CAP);

      const { data, count, error } = await query;
      if (error) throw error;

      const matched = data as any as AuditLog[];
      if (!matched || matched.length === 0) {
        toast.error("No audit records match the current filters");
        return;
      }

      const rows: string[][] = [
        [
          "Timestamp",
          "Action",
          "Actor",
          "Actor Role",
          "Entity",
          "Entity ID",
          "Change Summary",
          "Source",
          "Status",
          "Failure Reason",
          "Correlation ID",
          "Event ID",
        ],
        ...matched.map((log) => [
          format(new Date(log.created_at), "MMM d, yyyy HH:mm"),
          formatAuditActionLabel(log.action),
          log.user_email || "System / Unknown",
          log.actor_role || "—",
          log.entity_type || "—",
          log.entity_id || "—",
          summarizeAuditEvent(log),
          log.source || "—",
          log.success === false ? "Failed" : "Success",
          log.failure_reason || "",
          log.correlation_id || "",
          log.id,
        ]),
      ];

      const filename = `audit_logs_${format(new Date(), "yyyy-MM-dd")}.csv`;
      // Exporting the audit trail is itself an audited action (source is
      // fixed to "csv_export" by downloadCsv) — this fires exactly once per
      // click, same as before this change.
      downloadCsv(filename, rows, {
        entityType: "Audit_log_export",
        metadata: {
          action_filter: actionFilter !== ALL_VALUE ? actionFilter : undefined,
          actor_filter: actorFilter !== ALL_VALUE ? actorFilter : undefined,
          search_email: searchEmail || undefined,
          date_filter: dateFilter || undefined,
        },
      });

      if ((count ?? 0) > EXPORT_ROW_CAP) {
        toast.success(
          `Exported first ${EXPORT_ROW_CAP.toLocaleString()} of ${(count ?? 0).toLocaleString()} matching records — narrow your filters for a complete export`
        );
      } else {
        toast.success(`Exported ${matched.length.toLocaleString()} audit record${matched.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      console.error("Failed to export audit logs", err);
      toast.error("Failed to export audit logs");
    } finally {
      setExportingCsv(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1>Immutable Audit Trail</h1>
        <p>System-wide immutable record of consents, access, and modifications.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheckBoldDuotone size={18} className="text-primary" />
            Audit Logs
          </CardTitle>
          <CardDescription>Comprehensive tracking of user and admin activities.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-full" title="What happened?">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={ALL_VALUE}>All Actions</SelectItem>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1 hidden lg:block">What happened?</p>
            </div>

            <div>
              <Select value={actorFilter} onValueChange={setActorFilter}>
                <SelectTrigger className="w-full" title="Who performed it?">
                  <SelectValue placeholder="Actor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_VALUE}>All Actors</SelectItem>
                  {ACTOR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1 hidden lg:block">Who performed it?</p>
            </div>

            <Input
              type="date"
              className="w-full"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />

            <Input
              type="text"
              placeholder="Search user email..."
              className="w-full"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
            />

            <Button
              variant="outline"
              size="sm"
              className="shrink-0 w-full"
              onClick={handleExportCsv}
              disabled={exportingCsv || (!loading && logs.length === 0)}
            >
              <DownloadMinimalisticBoldDuotone size={16} />
              {exportingCsv ? "Exporting…" : "Export CSV"}
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={<FileTextBoldDuotone size={40} />}
              title="No audit activity found"
              description="Try adjusting your filters or date range."
              className="py-14"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-muted">
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs">Action</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs">User</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs">Entity</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs">Change</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs">Source</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs">Status</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs text-right">Time</th>
                    <th className="px-2 py-3 w-8" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-muted/50 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => openDetails(log)}
                    >
                      <td className="px-4 py-3 align-top">
                        <StatusBadge tone={getBadgeTone(log.action)} className="font-medium whitespace-nowrap">
                          {formatAuditActionLabel(log.action)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 align-top truncate max-w-[200px]">
                        {log.user_email || <span className="text-muted-foreground italic">System / Unknown</span>}
                        {log.actor_role && (
                          <div className="text-[11px] text-muted-foreground capitalize">{log.actor_role.replace(/_/g, " ")}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground capitalize">
                        {log.entity_type || "—"}
                      </td>
                      <td className="px-4 py-3 align-top max-w-[300px] text-xs">
                        {summarizeAuditEvent(log)}
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground text-xs capitalize whitespace-nowrap">
                        {log.source ? log.source.replace(/_/g, " ") : "—"}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StatusBadge tone={log.success === false ? "danger" : "success"} className="text-xs">
                          {log.success === false ? "Failed" : "Success"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground text-right whitespace-nowrap">
                        {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                      </td>
                      <td className="px-2 py-3 align-top text-muted-foreground">
                        <AltArrowRightBoldDuotone size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {!loading && logs.length > 0 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-6 gap-4">
              <span className="text-sm text-muted-foreground">
                Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(p - 1, 0))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * pageSize >= totalCount}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AuditDetailsSheet open={detailsOpen} onOpenChange={setDetailsOpen} log={selectedLog} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Details drawer — one row's full, privacy-safe detail. Never fetches
// current employee data to reconstruct a historical value; only shows what
// getAuditDetailRows() finds in the row's own stored metadata.
// ─────────────────────────────────────────────────────────────────────────

function AuditDetailsSheet({
  open,
  onOpenChange,
  log,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: AuditLog | null;
}) {
  if (!log) return null;

  const detailRows = getAuditDetailRows(log);
  const failed = log.success === false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheckBoldDuotone size={18} />
            Audit Event Details
          </SheetTitle>
          <SheetDescription>{summarizeAuditEvent(log)}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-2">
          <Card>
            <CardContent className="py-4 space-y-1">
              <div className="flex items-center justify-between">
                <StatusBadge
                  tone={
                    log.action === "USER_LOGIN" || log.action === "logout"
                      ? "info"
                      : log.action.startsWith("consent.")
                      ? "success"
                      : "neutral"
                  }
                  className="font-medium"
                >
                  {formatAuditActionLabel(log.action)}
                </StatusBadge>
                <StatusBadge tone={failed ? "danger" : "success"} className="text-xs">
                  {failed ? "Failed" : "Success"}
                </StatusBadge>
              </div>
            </CardContent>
          </Card>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Who &amp; What
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <DetailTile label="Performed By" value={log.user_email || "System / Unknown"} />
              <DetailTile label="Actor Role" value={log.actor_role ? humanizeRole(log.actor_role) : "—"} />
              <DetailTile label="Entity" value={log.entity_type || "—"} />
              <DetailTile label="Entity ID" value={log.entity_id ? shortId(log.entity_id) : "—"} monospace />
              <DetailTile label="Source" value={log.source ? humanizeRole(log.source) : "—"} />
              <DetailTile label="Date &amp; Time" value={format(new Date(log.created_at), "d MMM yyyy, h:mm a")} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Change
            </h3>
            {detailRows && detailRows.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {detailRows.map((row, i) => (
                  <DetailTile key={i} label={row.label} value={row.value} small />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg py-2.5 px-3">
                Detailed values were not recorded for this event.
              </p>
            )}
          </div>

          {failed && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Failure Reason
              </h3>
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg py-2.5 px-3">
                {log.failure_reason || "No further detail was recorded."}
              </p>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Record
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <DetailTile label="Event ID" value={log.id} monospace small />
              {log.correlation_id && <DetailTile label="Correlation ID" value={log.correlation_id} monospace small />}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailTile({ label, value, monospace, small }: { label: string; value: string; monospace?: boolean; small?: boolean }) {
  return (
    <div className="bg-muted/40 rounded-lg py-2.5 px-3">
      <p className={`${small ? "text-[11px]" : "text-sm"} font-medium leading-snug break-all ${monospace ? "font-mono" : ""}`}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-none">{label}</p>
    </div>
  );
}

function humanizeRole(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}
