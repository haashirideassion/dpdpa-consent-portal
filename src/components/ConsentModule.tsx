import { useState } from 'react';
import { CheckCircleBoldDuotone } from 'solar-icon-set';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { CONSENT_STATEMENT, CONSENT_VERSION } from '@/lib/dpdpa';
import { supabase } from '@/integrations/supabase/client';

interface ConsentModuleProps {
  employeeId: string;
  userId: string;
  hasExistingConsent: boolean;
  lastConsentDate?: string;
  onConsentSubmitted: () => void;
}

export function ConsentModule({
  employeeId,
  userId,
  hasExistingConsent,
  lastConsentDate,
  onConsentSubmitted,
}: ConsentModuleProps) {
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(hasExistingConsent);

  async function handleSubmit() {
    if (!checked) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('consent_logs').insert({
        employee_id: employeeId,
        user_id: userId,
        consent_status: 'granted',
        consent_version: CONSENT_VERSION,
        ip_address: null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      if (error) throw error;
      setSubmitted(true);
      onConsentSubmitted();
    } catch (err) {
      console.error('Consent submission error:', err);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card className="border-success/30 bg-success/5">
        <CardContent className="flex items-center gap-3 py-6">
          <CheckCircleBoldDuotone size={24} color="var(--success)" />
          <div>
            <p className="font-semibold text-foreground">Consent Submitted</p>
            <p className="text-sm text-muted-foreground">
              Your consent was recorded{lastConsentDate ? ` on ${new Date(lastConsentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}.
              Version: {CONSENT_VERSION}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Data Processing Consent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
          {CONSENT_STATEMENT}
        </div>
        <div className="flex items-start gap-3">
          <Checkbox
            id="consent-check"
            checked={checked}
            onCheckedChange={(val) => setChecked(val === true)}
          />
          <label htmlFor="consent-check" className="text-sm leading-snug cursor-pointer">
            I acknowledge and consent to the storage and processing of my personal data as described above, in accordance with the DPDPA.
          </label>
        </div>
        <Button onClick={handleSubmit} disabled={!checked || submitting} className="w-full sm:w-auto">
          {submitting ? 'Submitting...' : 'Submit Consent'}
        </Button>
      </CardContent>
    </Card>
  );
}
