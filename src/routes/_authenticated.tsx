import { createFileRoute, Outlet, Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheckBoldDuotone,
  LogoutBoldDuotone,
} from 'solar-icon-set';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading, role } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-8 w-48 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== 'undefined') {
      navigate({ to: '/login' });
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <ShieldCheckBoldDuotone size={24} color="var(--primary)" />
            <span className="font-semibold text-sm sm:text-base">DPDPA Consent Portal</span>
          </div>
          <div className="flex items-center gap-3">
            {role === 'admin' && (
              <nav className="hidden sm:flex items-center gap-1">
                <Link
                  to="/"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  activeProps={{ className: 'text-foreground bg-accent' }}
                  activeOptions={{ exact: true }}
                >
                  My Data
                </Link>
                <Link
                  to="/admin"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  activeProps={{ className: 'text-foreground bg-accent' }}
                >
                  Admin
                </Link>
              </nav>
            )}
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {user.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await signOut();
                navigate({ to: '/login' });
              }}
            >
              <LogoutBoldDuotone size={18} />
            </Button>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
