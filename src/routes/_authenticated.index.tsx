import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { VideoService } from "@/services/video.service";
import { EducationService } from "@/services/education.service";
import { ConsentService, type ConsentTemplate } from "@/services/consent.service";
import { EmployeeService } from "@/services/employee.service";
import { JurisdictionService } from "@/services/jurisdiction.service";
import { OnboardingService } from "@/services/onboarding.service";
import { EmployeeDataView } from "@/components/EmployeeDataView";
import { GranularConsentForm } from "@/components/GranularConsentForm";
import { MyConsentsView } from "@/components/MyConsentsView";
import { DpdpaLegend } from "@/components/DpdpaLegend";
import { DpdpaInfo } from "@/components/DpdpaInfo";
import { DpdpaActContent } from "@/components/DpdpaActContent";
import { ProfileSidebar, calcProfileCompletion } from "@/components/ProfileSidebar";
import { MyRequestsView } from "@/components/MyRequestsView";
import { ProgressRing } from "@/components/ProgressRing";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserBoldDuotone,
  ClockCircleBoldDuotone,
  ClipboardListBoldDuotone,
  ShieldCheckBoldDuotone,
  CheckCircleBoldDuotone,
} from "solar-icon-set";
import { StatusBadge } from "@/components/StatusBadge";
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
  // Phase 4 (Region / Regulatory Framework): true only if this employee has
  // an explicit jurisdiction assignment that resolves to no active
  // framework at all. Never set for the default (no-jurisdiction) case —
  // that keeps resolving to the existing India/DPDPA experience.
  const [noFrameworkConfigured, setNoFrameworkConfigured] = useState(false);

  // ── Shared toggle state for consent purposes ───────────────────────────────
  // Initialized from the active template: mandatory=ON (locked), others=OFF.
  // Lifted here so GranularConsentForm and inline SectionConsentArea share state.
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  const handleToggle = useCallback((key: string, val: boolean) => {
    setToggles((prev) => ({ ...prev, [key]: val }));
  }, []);

  // Re-initialize toggles whenever the active template changes
  useEffect(() => {
    if (!activeTemplate) return;
    const init: Record<string, boolean> = {};
    activeTemplate.purposes.forEach((p) => {
      const type = p.purpose_type ?? (p.is_mandatory ? "mandatory" : "optional");
      init[p.purpose_key] = type === "mandatory";
    });
    setToggles(init);
  }, [activeTemplate]);

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
      const employeeData = empRes;
      const resolvedEmployeeId = employeeData?.id ?? employeeId;

      if (!resolvedEmployeeId) return;

      // Phase 4: resolve the employee's applicable regulatory framework
      // (employee_jurisdiction_details → country → regulatory_framework_countries
      // → regulatory_frameworks) before fetching the active consent
      // template. No jurisdiction row → existing India/DPDPA default,
      // identical to pre-Phase-4 behavior.
      const frameworkResolution = await JurisdictionService
        .resolveFrameworkForEmployee(resolvedEmployeeId)
        .catch(() => ({ framework: null, source: "none" as const }));

      setNoFrameworkConfigured(frameworkResolution.source === "none");

      const activeTemplateData =
        frameworkResolution.source === "none"
          ? null
          : await ConsentService.getActiveTemplate(frameworkResolution.framework!.id).catch(() => null);

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

  const firstName = employee.first_name || "there";
  const completion = calcProfileCompletion(employee);

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 space-y-5">
      {/* ── Welcome header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">{firstName}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {completion < 100
              ? "Complete your profile to enable all company benefits."
              : "Your profile is complete — review your data or manage consent below."}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ProgressRing value={completion} size={64} strokeWidth={5} />
        </div>
      </div>

      {/* ── Getting started checklist ──────────────────────────────────────────
          Employees currently have to infer "what's left" from four separate
          tabs. This surfaces the two things that actually gate a fully-set-up
          profile — using state already loaded above, no extra fetch — so the
          answer to "what's pending / what's next" is visible at a glance. */}
      {!(completion === 100 && hasConsented) && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="field-label mb-2.5">Getting started</p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <ChecklistItem
              done={completion === 100}
              label="Complete your profile"
              hint={completion === 100 ? "All sections filled in" : `${completion}% filled in`}
            />
            <ChecklistItem
              done={hasConsented}
              label="Give your consent"
              hint={hasConsented ? "Recorded" : "Review and submit below"}
            />
          </div>
        </div>
      )}

      <Tabs defaultValue="my-data">
        <TabsList className="mb-5">
          <TabsTrigger value="my-data" className="gap-1.5">
            <UserBoldDuotone size={15} />
            My Data &amp; Consent
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <ClockCircleBoldDuotone size={15} />
            My Consents
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-1.5">
            <ClipboardListBoldDuotone size={15} />
            My Requests
          </TabsTrigger>
          <TabsTrigger value="dpdpa-act" className="gap-1.5">
            <ShieldCheckBoldDuotone size={15} />
            DPDPA Act
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: My Data & Consent ── */}
        <TabsContent value="my-data" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">

            {/* Left: sticky profile sidebar */}
            <ProfileSidebar employee={employee} role="employee" />

            {/* Right: data fields + consent */}
            <div className="space-y-5 min-w-0">
              {/* Phase 4: only ever shown if this employee's explicit jurisdiction
                  resolves to no active regulatory framework — never shown for the
                  default (no-jurisdiction) India/DPDPA case. */}
              {noFrameworkConfigured && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                  No regulatory framework configured for this jurisdiction.
                </div>
              )}

              {/* DPDPA banner: shown only once until dismissed or consented */}
              {!dpdpaInfoDismissed && <DpdpaInfo onDismiss={dismissDpdpa} />}

              <DpdpaLegend />

              <EmployeeDataView
                employee={employee}
                hasConsented={hasConsented}
                template={activeTemplate}
                toggles={toggles}
                onToggle={handleToggle}
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
                  toggles={toggles}
                  onToggle={handleToggle}
                  onConsentSubmitted={fetchData}
                />
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 2: My Consents History ── */}
        <TabsContent value="history" className="mt-0">
          <MyConsentsView
            employeeId={employee.id}
            employeeName={`${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim()}
            userId={user?.id}
          />
        </TabsContent>

        {/* ── Tab 3: My Requests ── */}
        <TabsContent value="requests" className="mt-0">
          {user && (
            <MyRequestsView employeeId={employee.id} userId={user.id} />
          )}
        </TabsContent>

        {/* ── Tab 4: DPDPA Act ── */}
        <TabsContent value="dpdpa-act" className="mt-0">
          <DpdpaActContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChecklistItem({ done, label, hint }: { done: boolean; label: string; hint: string }) {
  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
      {done ? (
        <CheckCircleBoldDuotone size={18} color="var(--success)" className="shrink-0" />
      ) : (
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground leading-tight mt-0.5">{hint}</p>
      </div>
      {done && <StatusBadge tone="success" className="ml-auto shrink-0">Done</StatusBadge>}
    </div>
  );
}
