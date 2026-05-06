import { useState } from "react";
import { CheckCircleBoldDuotone, InfoCircleBoldDuotone } from "solar-icon-set";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConsentService, type ConsentTemplate } from "@/services/consent.service";

interface GranularConsentFormProps {
  employeeId: string;
  userId: string;
  template: ConsentTemplate;
  hasConsented: boolean;
  onConsentSubmitted: () => void;
}

export function GranularConsentForm({
  employeeId,
  userId,
  template,
  hasConsented,
  onConsentSubmitted,
}: GranularConsentFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [esignName, setEsignName] = useState("");
  
  // Initialize state: mandatory purposes are locked ON, optional are OFF
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    template.purposes.forEach((p) => {
      init[p.purpose_key] = p.is_mandatory;
    });
    return init;
  });

  if (hasConsented) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border border-success/20 bg-success/5 mt-4">
        <CheckCircleBoldDuotone size={20} color="var(--success)" className="shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">Consent Submitted</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Granular consent for {template.name} ({template.version}) was recorded.
          </p>
        </div>
      </div>
    );
  }

  const handleToggle = (key: string, checked: boolean) => {
    setToggles((prev) => ({ ...prev, [key]: checked }));
  };

  const handleSubmit = async () => {
    if (!esignName.trim()) return;
    setSubmitting(true);

    const purposes = template.purposes.map((p) => ({
      purpose_key: p.purpose_key,
      consented: toggles[p.purpose_key] ?? false,
      is_mandatory: p.is_mandatory,
    }));

    const consentStatementText = "By typing my name below and clicking \"Submit Consent\", I acknowledge that I have read and understood the purposes for data processing as defined under the Digital Personal Data Protection Act, 2023.";

    const success = await ConsentService.submitConsent({
      employeeId,
      userId,
      templateId: template.id,
      templateVersion: template.version,
      purposes,
      esignName,
      consentStatementText,
      language: navigator.language || 'en',
      device: navigator.userAgent, // Basic client-side device tracking
    });

    setSubmitting(false);
    if (success) {
      onConsentSubmitted();
    }
  };

  return (
    <div className="space-y-5 mt-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Data Processing Consent</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review the purposes for which we process your data.
          Mandatory purposes are required for your employment.
        </p>
      </div>

      <div className="grid gap-3">
        {template.purposes.map((purpose) => (
          <Card key={purpose.id} className={purpose.is_mandatory ? "bg-muted/30 border-border" : "border-border"}>
            <CardHeader className="py-3.5 px-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm font-semibold">{purpose.label}</CardTitle>
                    {purpose.is_mandatory && (
                      <span className="text-[10px] uppercase font-semibold badge-warning border rounded-full px-2 py-0.5 tracking-wider">
                        Mandatory
                      </span>
                    )}
                  </div>
                  <CardDescription className="mt-1.5 text-xs leading-relaxed text-foreground/80">
                    {purpose.description}
                  </CardDescription>
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <InfoCircleBoldDuotone size={12} className="opacity-70" />
                    Legal Basis: {purpose.legal_basis}
                  </div>
                  {(purpose.data_categories || purpose.third_parties || purpose.retention_period) && (
                    <details className="mt-2.5 text-xs text-muted-foreground group cursor-pointer">
                      <summary className="font-medium outline-none">View detailed information</summary>
                      <div className="mt-2 pl-2 border-l-2 border-muted space-y-1.5 py-1">
                        {purpose.data_categories && (
                          <p><strong className="text-foreground/80">Data Categories:</strong> {purpose.data_categories}</p>
                        )}
                        {purpose.third_parties && (
                          <p><strong className="text-foreground/80">Third Parties:</strong> {purpose.third_parties}</p>
                        )}
                        {purpose.retention_period && (
                          <p><strong className="text-foreground/80">Retention Period:</strong> {purpose.retention_period}</p>
                        )}
                      </div>
                    </details>
                  )}
                </div>
                
                <div className="pt-0.5 flex items-center gap-2 shrink-0">
                  <Checkbox 
                    id={`purpose-${purpose.id}`}
                    checked={toggles[purpose.purpose_key]}
                    disabled={purpose.is_mandatory}
                    onCheckedChange={(val) => handleToggle(purpose.purpose_key, val === true)}
                    className="h-4 w-4"
                  />
                  <label htmlFor={`purpose-${purpose.id}`} className="text-xs font-medium sr-only">
                    Consent to {purpose.label}
                  </label>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <p className="text-xs leading-relaxed text-foreground/90">
          By typing my name below and clicking &ldquo;Submit Consent&rdquo;, I acknowledge that I have read and
          understood the purposes for data processing as defined under the Digital Personal Data
          Protection Act, 2023.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="esign" className="text-xs font-medium">Digital Signature (Type your full name)</Label>
          <Input
            id="esign"
            placeholder="e.g. John Doe"
            value={esignName}
            onChange={(e) => setEsignName(e.target.value)}
            className="max-w-xs bg-background h-9 text-sm"
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting || !esignName.trim()}
          className="gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Recording Consent…
            </>
          ) : (
            "Submit Consent"
          )}
        </Button>
      </div>
    </div>
  );
}
