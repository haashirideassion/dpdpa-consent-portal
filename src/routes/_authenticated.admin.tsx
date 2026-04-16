import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import {
  ChartSquareBoldDuotone,
  UsersGroupTwoRoundedBoldDuotone,
} from 'solar-icon-set';

export const Route = createFileRoute('/_authenticated/admin')({
  component: AdminLayout,
});

function AdminLayout() {
  const { role, loading } = useAuth();

  if (loading) return null;

  if (role !== 'admin') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted-foreground mt-2">
          You do not have admin privileges. Contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <div className="flex flex-col sm:flex-row gap-6">
        <aside className="sm:w-56 shrink-0">
          <nav className="flex sm:flex-col gap-1">
            <Link
              to="/admin"
              activeOptions={{ exact: true }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              activeProps={{ className: 'bg-accent text-foreground' }}
            >
              <ChartSquareBoldDuotone size={18} />
              Dashboard
            </Link>
            <Link
              to="/admin/employees"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              activeProps={{ className: 'bg-accent text-foreground' }}
            >
              <UsersGroupTwoRoundedBoldDuotone size={18} />
              Employees
            </Link>
          </nav>
        </aside>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
