import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { EmployeeDataView } from "@/components/EmployeeDataView";
import { ConsentModule } from "@/components/ConsentModule";
import { DpdpaLegend } from "@/components/DpdpaLegend";
import { DpdpaInfo } from "@/components/DpdpaInfo";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "My Data — Employee Data Consent Portal" },
      {
        name: "description",
        content: "Review your stored personal data and provide DPDPA consent.",
      },
    ],
  }),
  component: EmployeePortal,
});

function EmployeePortal() {
  const { user, employeeId, loading: authLoading } = useAuth();
  const [employee, setEmployee] = useState<Tables<"employees"> | null>(null);
  const [consentLog, setConsentLog] = useState<Tables<"consent_logs"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [dpdpaInfoDismissed, setDpdpaInfoDismissed] = useState(false);

  const fetchData = useCallback(async () => {
    if (!employeeId || !user) return;
    setLoading(true);

    const [empRes, consentRes] = await Promise.all([
      supabase.from("employees").select("*").eq("id", employeeId).maybeSingle(),
      supabase
        .from("consent_logs")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setEmployee(empRes.data);
    setConsentLog(consentRes.data);
    setLoading(false);
  }, [employeeId, user]);

  useEffect(() => {
    if (!authLoading && employeeId) fetchData();
    else if (!authLoading) setLoading(false);
  }, [authLoading, employeeId, fetchData]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h2 className="text-lg font-semibold">No Employee Record Found</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Your account is not linked to an employee record. Please contact HR for assistance.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your Employee Data</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review all personal and employment-related information stored by the organization.
        </p>
      </div>

      {!dpdpaInfoDismissed && <DpdpaInfo onDismiss={() => setDpdpaInfoDismissed(true)} />}

      <DpdpaLegend />

      <EmployeeDataView employee={employee} />

      {user && (
        <ConsentModule
          employeeId={employee.id}
          userId={user.id}
          hasExistingConsent={!!consentLog}
          lastConsentDate={consentLog?.created_at}
          onConsentSubmitted={fetchData}
        />
      )}
    </div>
  );
}
