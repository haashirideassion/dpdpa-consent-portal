import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { EmployeeService } from "@/services/employee.service";
import { EmployeeDataView } from "@/components/EmployeeDataView";
import { Skeleton } from "@/components/ui/skeleton";
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

  useEffect(() => {
    if (!user?.id) return;

    async function fetchMyData() {
      try {
        const record = await EmployeeService.getByUserId(user!.id);
        if (!record) {
          setNotLinked(true);
        } else {
          setEmployee(record);
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
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
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

  // ── Full editable profile ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">My Data</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View and update your personal employee profile.
          {employee?.employee_code && (
            <span className="ml-2 font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
              {employee.employee_code}
            </span>
          )}
        </p>
      </div>

      {/* Full employee profile with edit enabled (hasConsented=false so all sections are editable) */}
      <EmployeeDataView
        employee={employee}
        hasConsented={false}
        isAdmin={true}
        onEmployeeUpdated={async (updated) => {
          if (updated) {
            setEmployee(updated);
          } else {
            // Re-fetch fresh data from DB
            const fresh = await EmployeeService.getByUserId(user!.id);
            if (fresh) setEmployee(fresh);
          }
        }}
      />
    </div>
  );
}
