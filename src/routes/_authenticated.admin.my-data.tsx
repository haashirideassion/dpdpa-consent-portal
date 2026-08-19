import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { EmployeeService } from "@/services/employee.service";
import { ConsentService, type ConsentTemplate } from "@/services/consent.service";
import { JurisdictionService } from "@/services/jurisdiction.service";
import { EmployeeDataView } from "@/components/EmployeeDataView";
import { GranularConsentForm } from "@/components/GranularConsentForm";
import { MyConsentsView } from "@/components/MyConsentsView";
import { DpdpaLegend } from "@/components/DpdpaLegend";
import { DpdpaActContent } from "@/components/DpdpaActContent";
import { ProfileSidebar } from "@/components/ProfileSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserBoldDuotone } from "solar-icon-set";

export const Route = createFileRoute("/_authenticated/admin/my-data")({
  head: () => ({
    meta: [
      { title: "My Data — Admin Profile" },
      {
        name: "description",
        content: "View and edit your own employee profile as an admin.",
      },
    ],
  }),
  component: AdminMyData,
});

function AdminMyData() {
  const { user } = useAuth();
  const [employee, setEmployee] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notLinked, setNotLinked] = useState(false);

  const [activeTemplate, setActiveTemplate] = useState<ConsentTemplate | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  // Phase 4: see _authenticated.index.tsx — only true if this admin's own
  // explicit jurisdiction resolves to no active framework at all.
  const [noFrameworkConfigured, setNoFrameworkConfigured] = useState(false);

  const handleToggle = useCallback((key: string, val: boolean) => {
    setToggles((prev) => ({ ...prev, [key]: val }));
  }, []);

  useEffect(() => {
    if (!activeTemplate) return;
    const init: Record<string, boolean> = {};
    activeTemplate.purposes.forEach((p) => {
      const type = p.purpose_type ?? (p.is_mandatory ? "mandatory" : "optional");
      init[p.purpose_key] = type === "mandatory";
    });
    setToggles(init);
  }, [activeTemplate]);

  useEffect(() => {
    if (!user?.id) return;

    async function fetchMyData() {
      try {
        const record = await EmployeeService.getByUserId(user!.id);
        if (!record) {
          setNotLinked(true);
        } else {
          setEmployee(record);

          // Phase 4: resolve this employee's applicable regulatory
          // framework before fetching the active template — see
          // _authenticated.index.tsx for the full explanation.
          const frameworkResolution = await JurisdictionService
            .resolveFrameworkForEmployee(record.id)
            .catch(() => ({ framework: null, source: "none" as const }));

          setNoFrameworkConfigured(frameworkResolution.source === "none");

          const activeTemplateData =
            frameworkResolution.source === "none"
              ? null
              : await ConsentService.getActiveTemplate(frameworkResolution.framework!.id).catch(() => null);
          let consentedToActive = false;
          if (activeTemplateData) {
            consentedToActive = await ConsentService.hasConsentedToVersion(
              record.id,
              activeTemplateData.version
            ).catch(() => false);
          }
          setActiveTemplate(activeTemplateData);
          setHasConsented(consentedToActive);
        }
      } catch (err) {
        console.error("AdminMyData: failed to fetch employee record", err);
        setNotLinked(true);
      } finally {
        setLoading(false);
      }
    }

    fetchMyData();
  }, [user?.id]);

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
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

  // ── No employee record linked ───────────────────────────────────────────
  if (notLinked) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
        <UserBoldDuotone size={48} color="var(--muted-foreground)" />
        <h2 className="text-lg font-semibold">Account Not Linked</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your account is not linked to an employee profile. Please contact HR
          to associate your account with an employee record.
        </p>
      </div>
    );
  }

  const isOwnData = employee.user_id === user?.id;

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="page-header">
        <h1>My Profile</h1>
        <p>View and update your personal employee profile, and manage DPDPA consent.</p>
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

            {/* Left: sticky profile sidebar — no DPDPA banner for admin */}
            <ProfileSidebar employee={employee} role="admin" />

            {/* Right: profile fields + consent */}
            <div className="space-y-5 min-w-0">
              {noFrameworkConfigured && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                  No regulatory framework configured for this jurisdiction.
                </div>
              )}

              <DpdpaLegend />

              <EmployeeDataView
                employee={employee}
                hasConsented={hasConsented}
                isAdmin={true}
                template={activeTemplate}
                toggles={toggles}
                onToggle={handleToggle}
                onEmployeeUpdated={async (updated) => {
                  if (updated) {
                    setEmployee(updated);
                  } else {
                    const fresh = await EmployeeService.getByUserId(user!.id);
                    if (fresh) setEmployee(fresh);
                  }
                }}
              />

              {isOwnData && user && activeTemplate && (
                <GranularConsentForm
                  employeeId={employee.id}
                  userId={user.id}
                  template={activeTemplate}
                  hasConsented={hasConsented}
                  toggles={toggles}
                  onToggle={handleToggle}
                  onConsentSubmitted={async () => {
                    const consentedToActive = await ConsentService.hasConsentedToVersion(
                      employee.id,
                      activeTemplate.version
                    ).catch(() => false);
                    setHasConsented(consentedToActive);
                  }}
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

        {/* ── Tab 3: DPDPA Act ── */}
        <TabsContent value="dpdpa-act" className="mt-0">
          <DpdpaActContent />
        </TabsContent>
      </Tabs>
    </div>
  );
}
