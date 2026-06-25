import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  ChartSquareBoldDuotone,
  UsersGroupTwoRoundedBoldDuotone,
  ShieldCheckBoldDuotone,
  CheckCircleBoldDuotone,
  UserBoldDuotone,
  PlayCircleBoldDuotone,
  DocumentTextBoldDuotone,
  FolderOpenBoldDuotone,
  DangerTriangleBoldDuotone,
  GraphUpBoldDuotone,
  ClipboardListBoldDuotone,
  ChartBoldDuotone,
} from "solar-icon-set";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  section?: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  // ── Personal ──────────────────────────────
  { to: "/admin/my-data", icon: <UserBoldDuotone size={16} />, label: "My Data", section: "Personal" },

  // ── Overview ─────────────────────────────
  { to: "/admin", icon: <ChartSquareBoldDuotone size={16} />, label: "Dashboard", section: "Overview", exact: true },
  { to: "/admin/employees", icon: <UsersGroupTwoRoundedBoldDuotone size={16} />, label: "Employees" },

  // ── Data Rights ──────────────────────────
  { to: "/admin/requests", icon: <DocumentTextBoldDuotone size={16} />, label: "Data Requests", section: "Data Rights" },
  { to: "/admin/corrections", icon: <CheckCircleBoldDuotone size={16} />, label: "Update Queue" },
  { to: "/admin/consent", icon: <ClipboardListBoldDuotone size={16} />, label: "Consent Register" },

  // ── Compliance ───────────────────────────
  { to: "/admin/compliance", icon: <ShieldCheckBoldDuotone size={16} />, label: "Compliance", section: "Compliance" },
  { to: "/admin/risks", icon: <DangerTriangleBoldDuotone size={16} />, label: "Risks & DPIA" },
  { to: "/admin/inventory", icon: <FolderOpenBoldDuotone size={16} />, label: "Data Inventory" },
  { to: "/admin/breaches", icon: <DangerTriangleBoldDuotone size={16} />, label: "Breach Log" },

  // ── Analytics ────────────────────────────
  { to: "/admin/reports", icon: <GraphUpBoldDuotone size={16} />, label: "Reports", section: "Analytics" },

  // ── Admin ────────────────────────────────
  { to: "/admin/videos", icon: <PlayCircleBoldDuotone size={16} />, label: "Videos", section: "Admin" },
  { to: "/admin/audit", icon: <ChartBoldDuotone size={16} />, label: "Audit Logs" },
];

const linkBase = "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors";
const linkActive = "bg-primary/10 text-primary hover:bg-primary/15";

function AdminLayout() {
  const { loading, hasRole } = useAuth();

  if (loading) return null;

  if (!hasRole("admin") && !hasRole("hr_manager") && !hasRole("dpo")) {
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

  // Group nav items by section
  const sections: { title: string; items: NavItem[] }[] = [];
  let current: NavItem[] = [];
  let currentTitle = "";
  for (const item of NAV_ITEMS) {
    if (item.section !== undefined) {
      if (current.length > 0) sections.push({ title: currentTitle, items: current });
      currentTitle = item.section;
      current = [item];
    } else {
      current.push(item);
    }
  }
  if (current.length > 0) sections.push({ title: currentTitle, items: current });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5">
      <div className="flex flex-col sm:flex-row gap-5">
        {/* Sidebar */}
        <aside className="sm:w-52 shrink-0">
          <div className="rounded-xl border border-border bg-card p-1.5 sticky top-5">
            <nav className="flex sm:flex-col gap-0.5">
              {sections.map((sec, si) => (
                <div key={si} className="w-full">
                  {sec.title && (
                    <p className="hidden sm:block px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                      {sec.title}
                    </p>
                  )}
                  {sec.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={linkBase}
                      activeProps={{ className: linkActive }}
                      activeOptions={item.exact ? { exact: true } : undefined}
                    >
                      {item.icon}
                      <span className="hidden sm:inline">{item.label}</span>
                    </Link>
                  ))}
                </div>
              ))}
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
