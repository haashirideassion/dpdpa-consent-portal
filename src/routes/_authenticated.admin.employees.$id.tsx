import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { EmployeeDataView } from "@/components/EmployeeDataView";
import { EmployeeService } from "@/services/employee.service";
import { DpdpaLegend } from "@/components/DpdpaLegend";
import { JurisdictionSection } from "@/components/JurisdictionSection";
import { ProfileSidebar } from "@/components/ProfileSidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeftBoldDuotone,
  CheckCircleBoldDuotone,
  ClockCircleBoldDuotone,
} from "solar-icon-set";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/admin/employees/$id")({
  head: () => ({
    meta: [
      { title: "Employee Detail — Admin Dashboard" },
      {
        name: "description",
        content: "View detailed employee profile with DPDPA fields and consent history.",
      },
    ],
  }),
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { id } = Route.useParams();
  const { hasRole, user } = useAuth();
  const canManage = hasRole("admin") || hasRole("hr_manager");
  const [employee, setEmployee] = useState<Tables<"employees"> | null>(null);
  const [consentLogs, setConsentLogs] = useState<Tables<"consent_logs">[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const [fullEmployee, logsRes] = await Promise.all([
        EmployeeService.getById(id),
        supabase
          .from("consent_logs")
          .select("*")
          .eq("employee_id", id)
          .order("created_at", { ascending: false }),
      ]);

      setEmployee(fullEmployee as any);
      setConsentLogs(logsRes.data ?? []);
      setLoading(false);
    }
    fetch();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <Skeleton className="h-[420px] rounded-xl" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-lg font-semibold">Employee Not Found</h2>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/admin/employees">Back to Employees</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Back + page title ── */}
      <div className="flex items-center gap-3 mb-1">
        <Button variant="ghost" size="icon" asChild className="shrink-0 mb-2">
          <Link to="/admin/employees">
            <ArrowLeftBoldDuotone size={18} />
          </Link>
        </Button>
        <div className="page-header pb-0">
          <h1 className="truncate">
            {[(employee as any).first_name, (employee as any).last_name]
              .filter(Boolean)
              .join(" ") || "Employee"}
          </h1>
          <p>Viewing and editing employee data as admin</p>
        </div>
      </div>

      {/* ── Two-column profile layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">

        {/* Left: sticky profile sidebar */}
        <ProfileSidebar employee={employee} role="employee" />

        {/* Right: fields + consent history */}
        <div className="space-y-5 min-w-0">
          <DpdpaLegend />

          <JurisdictionSection employeeId={id} canManage={canManage} currentUserId={user?.id} />

          <EmployeeDataView
            key={id}
            employee={employee}
            isAdmin={canManage}
            adminReview={true}
            readOnly={!canManage}
            onEmployeeUpdated={async () => {
              const updated = await EmployeeService.getById(id);
              if (updated) setEmployee(updated as any);
            }}
          />

          {/* Consent History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Consent History</CardTitle>
            </CardHeader>
            <CardContent>
              {consentLogs.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <ClockCircleBoldDuotone size={16} />
                  <span>No consent records found for this employee.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {consentLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 rounded-lg border p-3">
                      <CheckCircleBoldDuotone size={18} color="var(--success)" className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge tone="success" className="text-xs">
                            {log.consent_status}
                          </StatusBadge>
                          <span className="text-xs text-muted-foreground">
                            Version: {log.consent_version}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(log.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
