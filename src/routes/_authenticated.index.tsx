import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { VideoService } from "@/services/video.service";
import { EducationService } from "@/services/education.service";
import { ConsentService, type ConsentTemplate } from "@/services/consent.service";
import { EmployeeService } from "@/services/employee.service";
import { OnboardingService } from "@/services/onboarding.service";
import { EmployeeDataView } from "@/components/EmployeeDataView";
import { GranularConsentForm } from "@/components/GranularConsentForm";
import { MyConsentsView } from "@/components/MyConsentsView";
import { DpdpaLegend } from "@/components/DpdpaLegend";
import { DpdpaInfo } from "@/components/DpdpaInfo";
import { DpdpaActContent } from "@/components/DpdpaActContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

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
  const { user, employeeId, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState<Tables<"employees"> | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<ConsentTemplate | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dpdpaInfoDismissed, setDpdpaInfoDismissed] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let routedAway = false;
    try {
      // 1. Strict Role-Based Routing via Backend
      const { screen } = await OnboardingService.getScreen().catch(() => ({ screen: "SHOW_EMPLOYEE_PORTAL" as const }));

      switch (screen) {
        case "ADMIN_DASHBOARD":
          navigate({ to: "/admin" });
          routedAway = true;
          return;
        case "SHOW_VIDEO":
          navigate({ to: "/consent/video" });
          routedAway = true;
          return;
        case "SHOW_EDUCATION":
          navigate({ to: "/consent/education" });
          routedAway = true;
          return;
        case "NO_EMPLOYEE_RECORD":
          // Fall through to show "No Employee Record Found" UI
          break;
        case "SHOW_EMPLOYEE_PORTAL":
          // Proceed with loading employee portal data
          break;
      }

      // 2. Fetch Employee Data
      let empRes = await EmployeeService.getByUserId(user.id).catch(() => null);

      const activeTemplateData = await ConsentService.getActiveTemplate().catch(() => null);

      const employeeData = empRes;
      const resolvedEmployeeId = employeeData?.id ?? employeeId;

      if (!resolvedEmployeeId) {
        return; // will fall through to finally → setLoading(false)
      }

      let consentedToActive = false;
      if (activeTemplateData) {
        consentedToActive = await ConsentService.hasConsentedToVersion(resolvedEmployeeId, activeTemplateData.version).catch(() => false);
      }

      setEmployee(employeeData as any);
      setActiveTemplate(activeTemplateData);
      setHasConsented(consentedToActive);
    } catch (err) {
      console.error("[fetchData] Unexpected error:", err);
    } finally {
      // Only stop the spinner if we are staying on this screen.
      // If we are routing away, keep the skeleton showing until unmount.
      if (!routedAway) {
        setLoading(false);
      }
    }
  }, [employeeId, user, navigate]);

  useEffect(() => {
    if (!authLoading && user) fetchData();
    else if (!authLoading) setLoading(false);
  }, [authLoading, user, fetchData]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h2 className="text-lg font-semibold">No Employee Record Found</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Your account is not linked to an employee record. Please contact HR for assistance.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Tabs defaultValue="my-data">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">DPDPA Compliance Portal</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review your data, read the Act, and submit your consent
            </p>
          </div>
          <TabsList className="shrink-0">
            <TabsTrigger value="my-data">My Data & Consent</TabsTrigger>
            <TabsTrigger value="history">My Consents History</TabsTrigger>
            <TabsTrigger value="dpdpa-act">DPDPA Act</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Tab 1: My Data & Consent ── */}
        <TabsContent value="my-data" className="space-y-6 mt-0">
          {!dpdpaInfoDismissed && <DpdpaInfo onDismiss={() => setDpdpaInfoDismissed(true)} />}

          <DpdpaLegend />

          <EmployeeDataView
            employee={employee}
            hasConsented={hasConsented}
            onEmployeeUpdated={(updated) => { if (updated) setEmployee(updated); }}
          />

          {user && activeTemplate && (
            <GranularConsentForm
              employeeId={employee.id}
              userId={user.id}
              template={activeTemplate}
              hasConsented={hasConsented}
              onConsentSubmitted={fetchData}
            />
          )}
        </TabsContent>

        {/* ── Tab 2: My Consents History ── */}
        <TabsContent value="history" className="mt-0">
          <MyConsentsView employeeId={employee.id} />
        </TabsContent>

        {/* ── Tab 3: DPDPA Act ── */}
        <TabsContent value="dpdpa-act" className="mt-0">
          <DpdpaActContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}
