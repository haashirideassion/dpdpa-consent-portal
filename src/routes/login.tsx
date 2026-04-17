import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { signInWithMicrosoft } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheckBoldDuotone } from 'solar-icon-set';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

export const Route = createFileRoute('/login')({
  head: () => ({
    meta: [
      { title: 'Sign In — Employee Data Consent Portal' },
      { name: 'description', content: 'Sign in to review your personal data and provide DPDPA consent.' },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Route Guard: Redirect already authenticated users to the dashboard
  useEffect(() => {
    if (user) {
      navigate({ to: '/' });
    }
  }, [user, navigate]);

  /**
   * Initiates the Microsoft OAuth flow via Supabase.
   * Redirects are handled by the browser/SDK.
   */
  async function handleLogin() {
    try {
      setIsLoading(true);
      setError(null);
      await signInWithMicrosoft();
    } catch (err: any) {
      console.error('Login: Sign in request failed', err);
      setError(err.message || 'An unexpected error occurred during sign in.');
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary animate-in fade-in zoom-in duration-300">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 transition-transform hover:scale-105 duration-300">
            <ShieldCheckBoldDuotone size={32} color="var(--primary)" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">Employee Data Consent Portal</CardTitle>
            <CardDescription className="mt-1.5 text-balance">
              Review your personal data and provide DPDPA consent securely
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {error && (
            <div className="p-4 text-sm text-destructive bg-destructive/5 border border-destructive/10 rounded-lg animate-in slide-in-from-top-2 duration-300">
              {error}
            </div>
          )}

          <Button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full h-12 text-base font-semibold gap-3 shadow-md hover:shadow-lg transition-all"
            size="lg"
          >
            {isLoading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            ) : (
              <svg viewBox="0 0 21 21" className="h-5 w-5" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
            )}
            {isLoading ? 'Connecting to Microsoft...' : 'Sign in with Microsoft'}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-muted" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Secure Access</span>
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground leading-relaxed px-4">
            Use your organization Microsoft account to sign in securely.

          </p>
        </CardContent>
      </Card>
    </div>
  );
}
