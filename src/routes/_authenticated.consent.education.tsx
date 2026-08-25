import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { EducationService, type EducationModule as EducationModuleType } from "@/services/education.service";
import { EducationModule } from "@/components/EducationModule";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditService } from "@/services/audit.service";
import { NotificationService } from "@/services/notification.service";

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
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  useEffect(() => {
    async function initEducation() {
      setLoading(true);
      // Prevent admin from seeing this
      if (role === "admin") {
         navigate({ to: "/admin" });
         return;
      }
      if (!employeeId) {
        setLoading(false);
        return;
      }
      
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
  }, [employeeId, navigate, role]);

  const handleComplete = async () => {
    if (!employeeId || !user || !moduleData) return;

    setCompletionError(null);
    setIsCompleting(true);

    const marked = await EducationService.markCompleted(employeeId, user.id, moduleData.version);
    if (!marked) {
      setCompletionError("Could not save your acknowledgement. Please try again.");
      setIsCompleting(false);
      return;
    }

    await AuditService.log({
      action: "education.completed",
      entityType: "education_module",
      entityId: moduleData.id,
      metadata: { version: moduleData.version }
    });

    // Best-effort — never blocks the employee's onboarding flow.
    try {
      await NotificationService.notifyStaff({
        category: "education.completed",
        title: "Education completed",
        message: "An employee has completed the required DPDPA education module.",
        entityType: "education_module",
        entityId: moduleData.id,
      });
    } catch (err) {
      console.error("Failed to notify staff of education completion:", err);
    }

    navigate({ to: "/" });
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
      isCompleting={isCompleting}
      completionError={completionError}
    />
  );
}
