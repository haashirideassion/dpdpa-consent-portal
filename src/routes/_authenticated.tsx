import { useEffect, useState } from "react";
import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ShieldCheckBoldDuotone, LogoutBoldDuotone } from "solar-icon-set";
import { IdeassionLogo } from "@/components/IdeassionLogo";
import { AuditService } from "@/services/audit.service";
import { supabase } from "@/integrations/supabase/client";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandBar } from "@/components/CommandBar";
import { MinimalisticMagniferBoldDuotone } from "solar-icon-set";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading, role, hasRole } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [commandBarOpen, setCommandBarOpen] = useState(false);

  // Same admin-role check the admin shell itself uses, so the command bar's
  // admin destinations only show for roles that can actually reach them.
  const isAdmin = hasRole("admin") || hasRole("hr_manager") || hasRole("dpo");

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        // Stable per-auth-session id (shared across tabs for the same session).
        const sessionMarker = `${session.user.id}:${session.expires_at ?? "no-expiry"}`;
        const storageKey = "audit:last-login-session";
        const lastLoggedSession = sessionStorage.getItem(storageKey);

        if (lastLoggedSession === sessionMarker) {
          return;
        }

        sessionStorage.setItem(storageKey, sessionMarker);
        AuditService.logUserLogin(
          sessionMarker,
          session.user.app_metadata?.provider || "azure",
          session.user.email ?? null,
        );
      }

      if (event === "SIGNED_OUT") {
        sessionStorage.removeItem("audit:last-login-session");
        AuditService.log({ action: "logout" });
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const linkEmployee = async () => {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData?.user) return;

      // Call RPC to link employee
      const { data, error } = await supabase.rpc("link_employee_record" as never);

      if (error) {
        console.error("Linking failed:", error);
      }
    };

    linkEmployee();
  }, []);

  useEffect(() => {
    if (!loading && !user && !isSigningOut) {
      navigate({ to: "/login" });
    }
  }, [user, loading, navigate, isSigningOut]);

  if (loading || isSigningOut) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">
            {isSigningOut ? "Signing out..." : ""}
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
      navigate({ to: "/login" });
    } catch (error) {
      console.error("Sign out error:", error);
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <IdeassionLogo height={28} />
            <div className="h-4 w-px bg-border hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5">
              <ShieldCheckBoldDuotone size={16} color="var(--primary)" />
              <span className="font-medium text-sm text-muted-foreground">
                DPDPA Consent Portal
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCommandBarOpen(true)}
              className="hidden md:flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Search (Ctrl+K)"
            >
              <MinimalisticMagniferBoldDuotone size={14} />
              Search
              <kbd className="ml-1 rounded border border-border bg-card px-1 font-mono text-[10px]">
                Ctrl K
              </kbd>
            </button>
            {role === "admin" && (
              <nav className="hidden sm:flex items-center gap-1">
                <Link
                  to="/admin/my-data"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  activeProps={{ className: "text-foreground bg-accent" }}
                >
                  My Data
                </Link>
                <Link
                  to="/admin"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  activeProps={{ className: "text-foreground bg-accent" }}
                >
                  Admin
                </Link>
              </nav>
            )}
            <div className="hidden sm:flex flex-col items-end mr-2">
              <span className="text-xs font-medium text-foreground">{user.email}</span>
            </div>

            <ThemeToggle />

            <NotificationDropdown userId={user.id} />

            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1"
            >
              <LogoutBoldDuotone size={18} />
            </Button>
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <CommandBar isAdmin={isAdmin} open={commandBarOpen} onOpenChange={setCommandBarOpen} />
    </div>
  );
}
