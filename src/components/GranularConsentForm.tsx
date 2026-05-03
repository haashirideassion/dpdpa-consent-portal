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
      <Card className="border-success/30 bg-success/5 mt-6">
        <CardContent className="flex items-center gap-3 py-6">
          <CheckCircleBoldDuotone size={24} color="var(--success)" />
          <div>
            <p className="font-semibold text-foreground">Consent Submitted</p>
            <p className="text-sm text-muted-foreground">
              Your granular consent for {template.name} ({template.version}) was successfully recorded.
            </p>
          </div>
        </CardContent>
      </Card>
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
    <div className="space-y-6 mt-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Data Processing Consent</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Please review the purposes for which we process your data. 
          Mandatory purposes are required for your employment. You may opt out of optional purposes.
        </p>
      </div>

      <div className="grid gap-4">
        {template.purposes.map((purpose) => (
          <Card key={purpose.id} className={purpose.is_mandatory ? "bg-muted/30" : ""}>
            <CardHeader className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{purpose.label}</CardTitle>
                    {purpose.is_mandatory && (
                      <span className="text-[10px] uppercase font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full tracking-wider">
                        Mandatory
                      </span>
                    )}
                  </div>
                  <CardDescription className="mt-1.5 text-sm leading-relaxed text-foreground/80">
                    {purpose.description}
                  </CardDescription>
                  <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <InfoCircleBoldDuotone size={14} className="opacity-70" />
                    Legal Basis: {purpose.legal_basis}
                  </div>
                  {(purpose.data_categories || purpose.third_parties || purpose.retention_period) && (
                    <details className="mt-3 text-xs text-muted-foreground group cursor-pointer">
                      <summary className="font-medium outline-none">View detailed processing information</summary>
                      <div className="mt-2 pl-2 border-l-2 border-muted space-y-2 py-1">
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
                
                <div className="pt-1 flex items-center gap-2">
                  <Checkbox 
                    id={`purpose-${purpose.id}`}
                    checked={toggles[purpose.purpose_key]}
                    disabled={purpose.is_mandatory}
                    onCheckedChange={(val) => handleToggle(purpose.purpose_key, val === true)}
                    className="h-5 w-5"
                  />
                  <label htmlFor={`purpose-${purpose.id}`} className="text-sm font-medium sr-only">
                    Consent to {purpose.label}
                  </label>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 space-y-4">
          <p className="text-sm leading-relaxed font-medium">
            By typing my name below and clicking "Submit Consent", I acknowledge that I have read and 
            understood the purposes for data processing as defined under the Digital Personal Data Protection Act, 2023.
          </p>
          
          <div className="space-y-2">
            <Label htmlFor="esign">Digital Signature (Type your full name)</Label>
            <Input 
              id="esign" 
              placeholder="e.g. John Doe" 
              value={esignName}
              onChange={(e) => setEsignName(e.target.value)}
              className="max-w-xs bg-background"
            />
          </div>

          <Button 
            size="lg" 
            onClick={handleSubmit} 
            disabled={submitting || !esignName.trim()}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording Consent...
              </>
            ) : (
              "Submit Consent"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
