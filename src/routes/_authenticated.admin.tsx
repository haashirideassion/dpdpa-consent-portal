import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { ChartSquareBoldDuotone, UsersGroupTwoRoundedBoldDuotone, ShieldCheckBoldDuotone, CheckCircleBoldDuotone, UserBoldDuotone, PlayCircleBoldDuotone } from "solar-icon-set";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { role, loading, hasRole } = useAuth();

  if (loading) return null;

  // Only admin and hr_manager can access the admin section
  if (!hasRole("admin") && !hasRole("hr_manager")) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="inline-flex flex-col items-center gap-3">
          <ShieldCheckBoldDuotone size={40} className="text-muted-foreground/30" />
          <div>
            <h2 className="text-base font-semibold">Access Denied</h2>
            <p className="text-sm text-muted-foreground mt-1">
              You do not have admin privileges. Contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
      <div className="flex flex-col sm:flex-row gap-5">
        {/* Sidebar */}
        <aside className="sm:w-52 shrink-0">
          <div className="rounded-xl border border-border bg-card p-1.5">
            <nav className="flex sm:flex-col gap-0.5">
              <Link
                to="/admin/my-data"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                activeProps={{ className: "bg-primary/10 text-primary hover:bg-primary/15" }}
              >
                <UserBoldDuotone size={16} />
                My Data
              </Link>
              <Link
                to="/admin/employees"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                activeProps={{ className: "bg-primary/10 text-primary hover:bg-primary/15" }}
              >
                <UsersGroupTwoRoundedBoldDuotone size={16} />
                Employees
              </Link>
              <Link
                to="/admin/audit"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                activeProps={{ className: "bg-primary/10 text-primary hover:bg-primary/15" }}
              >
                <ShieldCheckBoldDuotone size={16} />
                Audit Logs
              </Link>
              <Link
                to="/admin/corrections"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                activeProps={{ className: "bg-primary/10 text-primary hover:bg-primary/15" }}
              >
                <CheckCircleBoldDuotone size={16} />
                Updates
              </Link>
              <Link
                to="/admin/videos"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                activeProps={{ className: "bg-primary/10 text-primary hover:bg-primary/15" }}
              >
                <PlayCircleBoldDuotone size={16} />
                Videos
              </Link>
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
