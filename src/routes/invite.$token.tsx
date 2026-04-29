import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheckBoldDuotone, ClockCircleBoldDuotone, CheckCircleBoldDuotone } from "solar-icon-set";
import { IdeassionLogo } from "@/components/IdeassionLogo";
import { InviteService } from "@/services/invite.service";
import { signInWithMicrosoft } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Consent Invitation — DPDPA Portal" },
      { name: "description", content: "You have been invited to review and provide DPDPA consent." },
    ],
  }),
  component: InviteLanding,
});

type InviteState =
  | { status: "validating" }
  | { status: "valid"; language: string }
  | { status: "expired" }
  | { status: "already_used" }
  | { status: "not_found" }
  | { status: "signing_in" };

function InviteLanding() {
  const { token } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<InviteState>({ status: "validating" });

  // Step 1: Validate the token on mount
  useEffect(() => {
    async function validate() {
      const result = await InviteService.validateToken(token);
      if (result.valid) {
        // Persist token in sessionStorage so post-SSO redirect can mark it used
        sessionStorage.setItem("dpdpa_invite_token", token);
        sessionStorage.setItem("dpdpa_invite_lang", result.language);
        setState({ status: "valid", language: result.language });
      } else {
        setState({ status: result.reason });
      }
    }
    validate();
  }, [token]);

  // Step 2: If user is already logged in after OAuth redirect, mark token used and proceed
  useEffect(() => {
    if (authLoading) return;
    if (user && state.status === "valid") {
      const storedToken = sessionStorage.getItem("dpdpa_invite_token");
      if (storedToken) {
        InviteService.markTokenUsed(storedToken).then(() => {
          sessionStorage.removeItem("dpdpa_invite_token");
          // Redirect into the consent flow (Phase 2 will add /consent/video)
          navigate({ to: "/" });
        });
      }
    }
  }, [user, authLoading, state.status, navigate]);

  async function handleSignIn() {
    setState({ status: "signing_in" });
    await signInWithMicrosoft();
    // OAuth redirect takes over — the useEffect above handles post-redirect
  }

  // ── Render states ──────────────────────────────────────────────────────
  if (state.status === "validating") {
    return <InviteShell><p className="text-sm text-muted-foreground animate-pulse">Validating your invite link…</p></InviteShell>;
  }

  if (state.status === "expired") {
    return (
      <InviteShell>
        <div className="flex flex-col items-center gap-3 text-center">
          <ClockCircleBoldDuotone size={36} color="var(--warning)" />
          <h2 className="text-lg font-semibold">Invite Link Expired</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            This invite link is no longer valid. Please contact your HR team to request a new link.
          </p>
        </div>
      </InviteShell>
    );
  }

  if (state.status === "already_used") {
    return (
      <InviteShell>
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircleBoldDuotone size={36} color="var(--success)" />
          <h2 className="text-lg font-semibold">Already Submitted</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            You have already used this invite link. Sign in to view your consent status.
          </p>
          <Button onClick={handleSignIn} className="mt-2">Sign in with Microsoft</Button>
        </div>
      </InviteShell>
    );
  }

  if (state.status === "not_found") {
    return (
      <InviteShell>
        <div className="flex flex-col items-center gap-3 text-center">
          <h2 className="text-lg font-semibold">Invalid Link</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            This invite link is invalid or has been removed. Contact HR if you believe this is an error.
          </p>
        </div>
      </InviteShell>
    );
  }

  // status === "valid" or "signing_in"
  return (
    <InviteShell>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <ShieldCheckBoldDuotone size={24} color="var(--primary)" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">DPDPA Consent Invitation</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            You have been invited to review your personal data and provide consent under the Digital Personal
            Data Protection Act, 2023.
          </p>
        </div>
        <Button
          onClick={handleSignIn}
          disabled={state.status === "signing_in"}
          className="w-full h-11 text-base font-semibold gap-3"
          size="lg"
        >
          {state.status === "signing_in" ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          ) : (
            <svg viewBox="0 0 21 21" className="h-5 w-5" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
          )}
          {state.status === "signing_in" ? "Connecting to Microsoft…" : "Sign in with Microsoft to Continue"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Use your organization Microsoft account to proceed securely.
        </p>
      </div>
    </InviteShell>
  );
}

/** Shared centered shell for all invite states */
function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary animate-in fade-in zoom-in duration-300">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto"><IdeassionLogo height={40} /></div>
          <CardTitle className="text-xl font-bold tracking-tight">Employee Data Consent Portal</CardTitle>
          <CardDescription>Powered by Ideassion · DPDPA 2023 Compliant</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 pb-6 px-6">{children}</CardContent>
      </Card>
    </div>
  );
}
