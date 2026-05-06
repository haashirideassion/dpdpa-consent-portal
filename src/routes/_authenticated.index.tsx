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
import { ProfileSidebar } from "@/components/ProfileSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const { user, employeeId, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState<Tables<"employees"> | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<ConsentTemplate | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noVideo, setNoVideo] = useState(false);

  // ── DPDPA banner: persisted per-user via localStorage ─────────────────────
  // Show only on first visit or before first consent. Never re-show once dismissed.
  const dpdpaStorageKey = user?.id ? `dpdpa_intro_dismissed_${user.id}` : null;
  const [dpdpaInfoDismissed, setDpdpaInfoDismissed] = useState(false);

  function dismissDpdpa() {
    if (dpdpaStorageKey) {
      localStorage.setItem(dpdpaStorageKey, "true");
    }
    setDpdpaInfoDismissed(true);
  }

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    let routedAway = false;
    try {
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
        case "NO_VIDEO_AVAILABLE":
          setNoVideo(true);
          break;
        case "NO_EMPLOYEE_RECORD":
          break;
        case "SHOW_EMPLOYEE_PORTAL":
          break;
      }

      const empRes = await EmployeeService.getByUserId(user.id).catch(() => null);
      const activeTemplateData = await ConsentService.getActiveTemplate().catch(() => null);
      const employeeData = empRes;
      const resolvedEmployeeId = employeeData?.id ?? employeeId;

      if (!resolvedEmployeeId) return;

      let consentedToActive = false;
      if (activeTemplateData) {
        consentedToActive = await ConsentService.hasConsentedToVersion(
          resolvedEmployeeId,
          activeTemplateData.version
        ).catch(() => false);
      }

      setEmployee(employeeData as any);
      setActiveTemplate(activeTemplateData);
      setHasConsented(consentedToActive);

      // Auto-dismiss banner if already consented or previously dismissed
      const alreadyDismissed =
        consentedToActive ||
        (dpdpaStorageKey ? localStorage.getItem(dpdpaStorageKey) === "true" : false);
      setDpdpaInfoDismissed(alreadyDismissed);
    } catch (err) {
      console.error("[fetchData] Unexpected error:", err);
    } finally {
      if (!routedAway) setLoading(false);
    }
  }, [employeeId, user, navigate, dpdpaStorageKey]);

  useEffect(() => {
    if (!authLoading && user) fetchData();
    else if (!authLoading) setLoading(false);
  }, [authLoading, user, fetchData]);

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <Skeleton className="h-[420px] rounded-xl" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (noVideo) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 flex flex-col items-center gap-3 text-center">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-destructive" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">No Onboarding Video Available</h2>
          <p className="text-xs text-muted-foreground mt-1">
            An active onboarding video is required to proceed. Please contact HR.
          </p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 flex flex-col items-center gap-3 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-muted-foreground" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">No Employee Record Found</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Your account is not linked to an employee record. Please contact HR.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 space-y-5">
      {/* ── Page header ── */}
      <div className="page-header">
        <h1>My Profile</h1>
        <p>Review your data, read the Act, and submit your DPDPA consent</p>
      </div>

      <Tabs defaultValue="my-data">
        <TabsList className="mb-5">
          <TabsTrigger value="my-data">My Data &amp; Consent</TabsTrigger>
          <TabsTrigger value="history">My Consents</TabsTrigger>
          <TabsTrigger value="dpdpa-act">DPDPA Act</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: My Data & Consent ── */}
        <TabsContent value="my-data" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">

            {/* Left: sticky profile sidebar */}
            <ProfileSidebar employee={employee} role="employee" />

            {/* Right: data fields + consent */}
            <div className="space-y-5 min-w-0">
              {/* DPDPA banner: shown only once until dismissed or consented */}
              {!dpdpaInfoDismissed && <DpdpaInfo onDismiss={dismissDpdpa} />}

              <DpdpaLegend />

              <EmployeeDataView
                employee={employee}
                hasConsented={hasConsented}
                onEmployeeUpdated={(updated) => {
                  if (updated) setEmployee(updated);
                }}
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
            </div>
          </div>
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
