import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ShieldCheckBoldDuotone, FileTextBoldDuotone } from "solar-icon-set";
import { format, startOfDay, endOfDay } from "date-fns";
import { maskValue, isDpdpaField } from "@/lib/dpdpa";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({
    meta: [{ title: "Audit Logs — Admin" }],
  }),
  component: AuditAdminPage,
});

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  ip_address: string;
  created_at: string;
  user_email: string | null;
  metadata?: any;
}

const ADMIN_ACTIONS = ['admin.override', 'invite.sent', 'dpr.created', 'campaign.created', 'campaign.activated'];
const USER_ACTIONS = ['USER_LOGIN', 'login', 'logout', 'consent.granted', 'consent.withdrawn', 'video.completed', 'education.completed', 'data.edited'];

function AuditAdminPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(0);
  const pageSize = 10;

  // Filters
  const [actionFilter, setActionFilter] = useState("All Actions");
  const [searchEmail, setSearchEmail] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const SENSITIVE_FIELDS = [
    "aadhaar_number",
    "passport_number",
    "pan_number",
    "bank_account_number",
    "voter_id",
    "driving_license",
    "uan_number",
  ];

  const shouldMask = (field: string) => SENSITIVE_FIELDS.includes(field) || field.includes("id");

  const fetchLogs = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("audit_logs")
      .select("*", { count: "exact" });

    // Apply Action Filter
    if (actionFilter === "Admin Actions") {
      query = query.in("action", ADMIN_ACTIONS);
    } else if (actionFilter === "User Actions") {
      query = query.in("action", USER_ACTIONS);
    }

    // Apply Email Search
    if (searchEmail) {
      query = query.ilike("user_email", `%${searchEmail}%`);
    }

    // Apply Date Filter
    if (dateFilter) {
      const date = new Date(dateFilter);
      if (!isNaN(date.getTime())) {
        query = query.gte("created_at", startOfDay(date).toISOString());
        query = query.lte("created_at", endOfDay(date).toISOString());
      }
    }

    // Pagination & Sorting
    query = query
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
  }, [page, actionFilter, searchEmail, dateFilter]);

  // Refetch when dependencies change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [actionFilter, searchEmail, dateFilter]);

  const formatAction = (action: string) => {
    switch (action) {
      case "admin.override":
        return "Admin updated employee";
      case "USER_LOGIN":
      case "login":
        return "User Login";
      case "consent.granted":
        return "Consent submitted";
      case "data.edited":
        return "Data edited";
      case "invite.sent":
        return "Invite sent";
      case "campaign.created":
        return "Campaign created";
      case "campaign.activated":
        return "Campaign activated";
      default:
        return action;
    }
  };

  const getBadge = (action: string) => {
    if (ADMIN_ACTIONS.includes(action)) {
      return "badge-warning border";
    }
    if (action === "USER_LOGIN" || action === "login" || action === "logout") {
      return "badge-info border";
    }
    if (action.includes("consent")) {
      return "badge-success border";
    }
    return "badge-neutral border";
  };

  const renderMetadata = (log: AuditLog) => {
    if (log.metadata?.field) {
      return (
        <div className="text-xs">
          <span className="font-medium text-foreground capitalize mr-1">{log.metadata.field.replace(/_/g, " ")}:</span>
          <span className="text-red-500 line-through mr-1">
            {shouldMask(log.metadata.field) && log.metadata.old_value
              ? maskValue(log.metadata.old_value, 4)
              : (log.metadata.old_value || "null")}
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="text-green-600 dark:text-green-400 font-semibold ml-1">
            {shouldMask(log.metadata.field) && log.metadata.new_value
              ? maskValue(log.metadata.new_value, 4)
              : (log.metadata.new_value || "null")}
          </span>
        </div>
      );
    }

    if (log.action === "USER_LOGIN" || log.action === "login") {
      const provider = typeof log.metadata?.provider === "string" ? log.metadata.provider : "azure";
      return (
        <span className="text-xs text-muted-foreground">
          Provider: <span className="font-medium text-foreground">{provider}</span>
        </span>
      );
    }

    if (log.metadata) {
      return (
        <span className="text-xs text-muted-foreground truncate block max-w-[280px]" title={JSON.stringify(log.metadata)}>
          {JSON.stringify(log.metadata)}
        </span>
      );
    }

    return <span className="text-muted-foreground">—</span>;
  };

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
          
          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Actions">All Actions</SelectItem>
                <SelectItem value="Admin Actions">Admin Actions</SelectItem>
                <SelectItem value="User Actions">User Actions</SelectItem>
              </SelectContent>
            </Select>

            <Input 
              type="date" 
              className="w-full sm:w-[160px]"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />

            <Input 
              type="text"
              placeholder="Search user email..." 
              className="w-full sm:flex-1"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-14 flex flex-col items-center gap-2 text-center">
              <FileTextBoldDuotone size={40} className="text-muted-foreground/25" />
              <p className="text-sm font-medium text-foreground">No audit activity found</p>
              <p className="text-xs text-muted-foreground">Try adjusting your filters or date range.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-muted">
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs">Action</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs">User</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs">Entity</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs">Change</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground uppercase tracking-wider text-xs text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-muted/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 align-top">
                        <Badge variant="outline" className={`font-medium whitespace-nowrap capitalize ${getBadge(log.action)}`}>
                          {formatAction(log.action)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-top truncate max-w-[200px]">
                        {log.user_email || <span className="text-muted-foreground italic">System / Unknown</span>}
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground capitalize">
                        {log.entity_type || "—"}
                      </td>
                      <td className="px-4 py-3 align-top max-w-[300px]">
                        {renderMetadata(log)}
                      </td>
                      <td className="px-4 py-3 align-top text-muted-foreground text-right whitespace-nowrap">
                        {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
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
    </div>
  );
}
