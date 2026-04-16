import { createFileRoute } from '@tanstack/react-router';
import { signInWithMicrosoft } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ShieldCheckBoldDuotone } from 'solar-icon-set';

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
  async function handleLogin() {
    try {
      await signInWithMicrosoft();
    } catch (err) {
      console.error('Login failed:', err);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <ShieldCheckBoldDuotone size={28} color="var(--primary)" />
          </div>
          <div>
            <CardTitle className="text-xl font-bold">Employee Data Consent Portal</CardTitle>
            <CardDescription className="mt-1">
              Review your personal data and provide DPDPA consent
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <Button onClick={handleLogin} className="w-full h-11 text-sm font-medium gap-2" size="lg">
            <svg viewBox="0 0 21 21" className="h-5 w-5" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Microsoft
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Use your organization Microsoft account to sign in securely.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
