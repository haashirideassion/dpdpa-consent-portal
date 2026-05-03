import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { EducationService, type EducationModule as EducationModuleType } from "@/services/education.service";
import { EducationModule } from "@/components/EducationModule";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditService } from "@/services/audit.service";

export const Route = createFileRoute("/_authenticated/consent/education")({
  head: () => ({
    meta: [
      { title: "Know Your Rights — DPDPA Portal" },
      { name: "description", content: "Review your rights under the DPDPA." },
    ],
  }),
  component: ConsentEducationStep,
});

function ConsentEducationStep() {
  const { employeeId, user, role } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [moduleData, setModuleData] = useState<EducationModuleType | null>(null);

  useEffect(() => {
    async function initEducation() {
      // Prevent admin from seeing this
      if (role === "admin") {
         navigate({ to: "/admin" });
         return;
      }
      if (!employeeId) return;
      
      const activeModule = await EducationService.getActiveModule();
      
      if (!activeModule) {
         // No active education module configured, skip this step
         navigate({ to: "/" });
         return;
      }

      // Check if already completed
      const hasCompleted = await EducationService.hasCompletedModule(employeeId, activeModule.version);
      
      if (hasCompleted) {
         navigate({ to: "/" });
         return;
      }

      setModuleData(activeModule);
      setLoading(false);
    }
    
    initEducation();
  }, [employeeId, navigate]);

  const handleComplete = async () => {
    if (!employeeId || !user || !moduleData) return;
    
    // Optimistically navigate first for snappy UX
    navigate({ to: "/" });
    
    // Run background tasks
    await EducationService.markCompleted(employeeId, user.id, moduleData.version);
    await AuditService.log({
      action: "education.completed",
      entityType: "education_module",
      entityId: moduleData.id,
      metadata: { version: moduleData.version }
    });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 space-y-4">
        <Skeleton className="h-8 w-64 mx-auto mb-6" />
        <Skeleton className="w-full h-2 mb-6" />
        <Skeleton className="w-full h-[400px] rounded-xl" />
      </div>
    );
  }

  if (!moduleData) return null;

  return (
    <EducationModule 
      slides={moduleData.content_json} 
      onComplete={handleComplete} 
    />
  );
}
