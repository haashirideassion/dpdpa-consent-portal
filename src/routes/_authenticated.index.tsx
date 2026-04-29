import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { VideoService } from "@/services/video.service";
import { EducationService } from "@/services/education.service";
import { ConsentService, type ConsentTemplate } from "@/services/consent.service";
import { EmployeeDataView } from "@/components/EmployeeDataView";
import { GranularConsentForm } from "@/components/GranularConsentForm";
import { MyConsentsView } from "@/components/MyConsentsView";
import { DpdpaLegend } from "@/components/DpdpaLegend";
import { DpdpaInfo } from "@/components/DpdpaInfo";
import { DpdpaActContent } from "@/components/DpdpaActContent";
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

  // Admins go straight to admin panel
  useEffect(() => {
    if (!authLoading && role === "admin") {
      navigate({ to: "/admin" });
    }
  }, [role, authLoading, navigate]);
  const [employee, setEmployee] = useState<Tables<"employees"> | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<ConsentTemplate | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dpdpaInfoDismissed, setDpdpaInfoDismissed] = useState(false);

  const fetchData = useCallback(async () => {
    if (!employeeId || !user) return;
    setLoading(true);

    const [empRes, activeVideo, activeEducation, activeTemplateData] = await Promise.all([
      supabase.from("employees").select("*").eq("id", employeeId).maybeSingle(),
      VideoService.getActiveVideoVersion(),
      EducationService.getActiveModule(),
      ConsentService.getActiveTemplate(),
    ]);

    let consentedToActive = false;
    if (activeTemplateData) {
      consentedToActive = await ConsentService.hasConsentedToVersion(employeeId, activeTemplateData.version);
    }

    // Check video gate
    if (activeVideo) {
      const hasCompletedVideo = await VideoService.hasCompletedVideo(employeeId, activeVideo.id);
      if (!hasCompletedVideo) {
        navigate({ to: "/consent/video" });
        return;
      }
    }

    // Check education gate
    if (activeEducation) {
      const hasCompletedEducation = await EducationService.hasCompletedModule(employeeId, activeEducation.version);
      if (!hasCompletedEducation) {
        navigate({ to: "/consent/education" });
        return;
      }
    }

    setEmployee(empRes.data);
    setActiveTemplate(activeTemplateData);
    setHasConsented(consentedToActive);
    setLoading(false);
  }, [employeeId, user, navigate]);

  useEffect(() => {
    if (!authLoading && employeeId) fetchData();
    else if (!authLoading) setLoading(false);
  }, [authLoading, employeeId, fetchData]);

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
            onEmployeeUpdated={(updated) => setEmployee(updated)}
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
