import { useEffect, useState } from 'react';
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
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {

    if (!loading && !user && !isSigningOut) {
      navigate({ to: '/login' });
    }
  }, [user, loading, navigate, isSigningOut]);

  // Loading or redirecting logic
  if (loading || isSigningOut) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">
            {isSigningOut ? 'Signing out...' : ''}
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  async function handleSignOut() {
    try {
      setIsSigningOut(true);
      await signOut();
      // Ensure local state is cleared before moving
      navigate({ to: '/login' });
    } catch (error) {
      console.error('Sign out error:', error);
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <ShieldCheckBoldDuotone size={24} color="var(--primary)" />
            <span className="font-semibold text-sm sm:text-base text-foreground">DPDPA Consent Portal</span>
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
            <div className="hidden sm:flex flex-col items-end mr-1">
              {/* <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground leading-none mb-0.5">Logged in as</span> */}
              <span className="text-xs font-medium text-foreground">{user.email}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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
