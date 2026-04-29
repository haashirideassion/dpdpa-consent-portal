import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileTextBoldDuotone, ShieldCheckBoldDuotone, ServerSquareBoldDuotone } from "solar-icon-set";
import { format } from "date-fns";

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
  actor: { email: string } | null;
}

function AuditAdminPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      // For security, only Admin/DPO can read this (enforced by RLS)
      const { data, error } = await supabase
        .from("audit_logs")
        .select(`
          id, action, entity_type, ip_address, created_at,
          actor:auth.users!audit_logs_actor_user_id_fkey(email)
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error && data) {
        // Due to the join, actor comes back as an array if not strict, handle carefully
        setLogs(data as any as AuditLog[]);
      } else if (error) {
        console.error("Failed to fetch audit logs", error);
      }
      setLoading(false);
    }
    fetchLogs();
  }, []);

  const getActionBadge = (action: string) => {
    if (action.includes("consent.granted")) {
      return <Badge className="bg-success/15 text-success border-success/30">{action}</Badge>;
    }
    if (action.includes("consent.withdrawn")) {
      return <Badge variant="destructive">{action}</Badge>;
    }
    if (action.includes("login")) {
      return <Badge variant="outline" className="text-info border-info/30">{action}</Badge>;
    }
    return <Badge variant="secondary">{action}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Immutable Audit Trail</h1>
        <p className="text-sm text-muted-foreground mt-1">
          System-wide immutable record of consents, access, and modifications.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheckBoldDuotone size={18} className="text-primary" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest 100 system events across all users.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm flex flex-col items-center">
              <FileTextBoldDuotone size={48} className="text-muted-foreground/30 mb-2" />
              No audit logs found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Timestamp</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Entity Type</th>
                    <th className="px-4 py-3 rounded-tr-lg">IP / Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => {
                    // Extract email, dealing with Supabase possible array return on auth.users join
                    const actorEmail = Array.isArray(log.actor) ? log.actor[0]?.email : log.actor?.email;
                    
                    return (
                      <tr key={log.id} className="hover:bg-muted/10">
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                        </td>
                        <td className="px-4 py-3">
                          {getActionBadge(log.action)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">
                          {actorEmail || "System / Unknown"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {log.entity_type || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground flex items-center gap-1.5">
                          <ServerSquareBoldDuotone size={14} className="opacity-50" />
                          {log.ip_address || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
