import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardListBoldDuotone, CheckCircleBoldDuotone, ClockCircleBoldDuotone } from "solar-icon-set";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/dpr")({
  head: () => ({
    meta: [{ title: "DPR Requests — Admin" }],
  }),
  component: DprAdminPage,
});

interface DprRequest {
  id: string;
  employee_id: string;
  request_type: string;
  description: string;
  status: string;
  created_at: string;
  employee: { first_name: string; last_name: string; employee_id: string };
}

function DprAdminPage() {
  const [requests, setRequests] = useState<DprRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRequests() {
      const { data, error } = await supabase
        .from("dpr_requests")
        .select(`
          id, employee_id, request_type, description, status, created_at,
          employee:employees(first_name, last_name, employee_id)
        `)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setRequests(data as any as DprRequest[]);
      }
      setLoading(false);
    }
    fetchRequests();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
      case "in_progress":
        return <Badge variant="outline" className="bg-info/10 text-info border-info/20">In Progress</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-success/10 text-success border-success/20">Completed</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data Principal Rights (DPR)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage employee requests for data access, correction, erasure, and portability.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardListBoldDuotone size={18} className="text-primary" />
            Active Requests
          </CardTitle>
          <CardDescription>Review and respond to DPDPA rights requests.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No DPR requests found.
            </div>
          ) : (
            <div className="divide-y">
              {requests.map((req) => (
                <div key={req.id} className="py-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:bg-muted/10 transition-colors px-2 -mx-2 rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {req.employee?.first_name} {req.employee?.last_name}
                      </span>
                      <span className="text-xs text-muted-foreground border px-1.5 py-0.5 rounded">
                        {req.employee?.employee_id}
                      </span>
                      <span className="text-xs uppercase tracking-wider font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {req.request_type}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-1 max-w-xl">
                      {req.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      <ClockCircleBoldDuotone size={12} />
                      {format(new Date(req.created_at), "PPp")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    {getStatusBadge(req.status)}
                    <Button variant="secondary" size="sm">Review</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
