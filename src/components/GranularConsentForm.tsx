import { useState } from "react";
import {
  CheckCircleBoldDuotone,
  InfoCircleBoldDuotone,
  ShieldWarningBoldDuotone,
  LockKeyholeMinimalisticBoldDuotone,
  GlobalBoldDuotone,
  ArrowDownBoldDuotone,
} from "solar-icon-set";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ConsentService,
  type ConsentTemplate,
  type ConsentPurpose,
  type ConsentSection,
  type PurposeType,
} from "@/services/consent.service";
import { CONSENT_STATEMENT } from "@/lib/dpdpa";
import { GrievanceOfficerBlock } from "@/components/GrievanceOfficerBlock";

interface GranularConsentFormProps {
  employeeId: string;
  userId: string;
  template: ConsentTemplate;
  hasConsented: boolean;
  onConsentSubmitted: () => void;
}

// ── Purpose type badge ────────────────────────────────────────────────────────
function PurposeTypeBadge({ type }: { type: PurposeType }) {
  if (type === "mandatory") {
    return (
      <Badge className="gap-1 bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-100 text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wider">
        <LockKeyholeMinimalisticBoldDuotone size={9} />
        Mandatory
      </Badge>
    );
  }
  if (type === "conditional") {
    return (
      <Badge className="gap-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50 text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wider">
        <ShieldWarningBoldDuotone size={9} />
        Conditional
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-50 text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wider">
      Optional
    </Badge>
  );
}

// ── Disclosure table ──────────────────────────────────────────────────────────
function DisclosureTable({ purpose }: { purpose: ConsentPurpose }) {
  // Support both v1.0 (data_categories / third_parties) and v2.0 (data_used / shared_with) fields
  const dataUsed     = purpose.data_used     ?? purpose.data_categories;
  const sharedWith   = purpose.shared_with   ?? purpose.third_parties;
  const retention    = purpose.retention_period;
  const crossBorder  = purpose.cross_border;
  const cbDetails    = purpose.cross_border_details ?? (crossBorder ? "Yes" : "No");

  const rows: Array<{ label: string; value: string }> = [];
  if (dataUsed)  rows.push({ label: "Data used",            value: dataUsed });
  if (sharedWith) rows.push({ label: "Shared with",         value: sharedWith });
  if (retention) rows.push({ label: "Retention",            value: retention });
  rows.push({
    label: "Cross-border transfer",
    value: crossBorder ? cbDetails : "No",
  });

  if (rows.length === 0) return null;

  return (
    <div className="mt-2.5 overflow-hidden rounded-md border border-border/50">
      <table className="w-full text-xs">
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-muted/20" : "bg-transparent"}>
              <td className="py-1.5 px-3 font-medium text-foreground/70 whitespace-nowrap w-40 align-top">
                {row.label}
              </td>
              <td className="py-1.5 px-3 text-foreground/80">
                {row.label === "Cross-border transfer" && crossBorder ? (
                  <span className="flex items-center gap-1">
                    <GlobalBoldDuotone size={11} className="text-amber-500 shrink-0" />
                    {row.value}
                  </span>
                ) : (
                  row.value
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Single purpose card ───────────────────────────────────────────────────────
function PurposeCard({
  purpose,
  checked,
  onToggle,
}: {
  purpose: ConsentPurpose;
  checked: boolean;
  onToggle: (key: string, val: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const type = purpose.purpose_type ?? (purpose.is_mandatory ? "mandatory" : "optional");
  const isSelectable = type !== "mandatory";

  return (
    <Card
      className={
        type === "mandatory"
          ? "bg-muted/20 border-border/50 shadow-none"
          : type === "conditional"
          ? "border-amber-200/60 shadow-none"
          : "border-border/60 shadow-none"
      }
    >
      <CardHeader className="py-3.5 px-4 pb-0">
        <div className="flex items-start justify-between gap-4">
          {/* Left: meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{purpose.label}</span>
              <PurposeTypeBadge type={type} />
            </div>
            <p className="mt-1.5 text-xs text-foreground/75 leading-relaxed">
              {purpose.description}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
              <InfoCircleBoldDuotone size={11} className="opacity-60 shrink-0" />
              {purpose.legal_basis}
            </p>
          </div>

          {/* Right: checkbox or lock icon */}
          <div className="pt-0.5 shrink-0">
            {isSelectable ? (
              <Checkbox
                id={`p-${purpose.id}`}
                checked={checked}
                onCheckedChange={(val) => onToggle(purpose.purpose_key, val === true)}
                className="h-4 w-4"
              />
            ) : (
              <div className="h-4 w-4 rounded-sm border-2 border-slate-300 bg-slate-100 flex items-center justify-center">
                <LockKeyholeMinimalisticBoldDuotone size={9} className="text-slate-400" />
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3.5 pt-2.5">
        {/* Conditional: consequence warning */}
        {type === "conditional" && purpose.consequence_of_declining && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200/70 p-2.5 mb-2.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-amber-800 leading-relaxed">
              <span className="font-semibold">If you decline: </span>
              {purpose.consequence_of_declining}
            </p>
          </div>
        )}

        {/* Mandatory: required notice */}
        {type === "mandatory" && (
          <p className="text-[11px] text-muted-foreground italic mb-2.5">
            Required by law — cannot be declined.
          </p>
        )}

        {/* Disclosure table (collapsible) */}
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              <ArrowDownBoldDuotone
                size={10}
                className={`transition-transform ${open ? "rotate-180" : ""}`}
              />
              {open ? "Hide" : "View"} disclosure details
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <DisclosureTable purpose={purpose} />
          </CollapsibleContent>
        </Collapsible>

        {/* Consent action label (for selectable purposes) */}
        {isSelectable && purpose.consent_action_label && (
          <label
            htmlFor={`p-${purpose.id}`}
            className="mt-2.5 flex items-center gap-2 text-[11px] font-medium text-foreground/70 cursor-pointer select-none"
          >
            <Checkbox
              id={`p-label-${purpose.id}`}
              checked={checked}
              onCheckedChange={(val) => onToggle(purpose.purpose_key, val === true)}
              className="h-3.5 w-3.5"
            />
            {purpose.consent_action_label}
          </label>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section block (v2.0) ──────────────────────────────────────────────────────
function SectionBlock({
  section,
  toggles,
  onToggle,
}: {
  section: ConsentSection;
  toggles: Record<string, boolean>;
  onToggle: (key: string, val: boolean) => void;
}) {
  return (
    <div className="space-y-2.5">
      {/* Section header */}
      <div className="pt-2">
        <h3 className="text-sm font-semibold text-foreground tracking-tight">
          {section.section_number}. {section.section_name}
        </h3>
        {section.section_header_text && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {section.section_header_text}
          </p>
        )}
      </div>
      <div className="space-y-2 pl-0">
        {section.purposes.map((p) => (
          <PurposeCard
            key={p.id}
            purpose={p}
            checked={toggles[p.purpose_key] ?? false}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

// ── Consent review summary (shown before submission) ─────────────────────────
function ConsentReviewSummary({
  template,
  toggles,
}: {
  template: ConsentTemplate;
  toggles: Record<string, boolean>;
}) {
  const [open, setOpen] = useState(false);
  const hasSections = template.sections.length > 0;

  const purposeStatusBadge = (purpose: ConsentPurpose) => {
    const type = purpose.purpose_type ?? (purpose.is_mandatory ? "mandatory" : "optional");
    if (type === "mandatory") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
          <LockKeyholeMinimalisticBoldDuotone size={8} />
          Required by law
        </span>
      );
    }
    const consented = toggles[purpose.purpose_key] ?? false;
    return consented ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
        <CheckCircleBoldDuotone size={8} />
        Granted
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
        Declined
      </span>
    );
  };

  const renderPurposeRows = (purposes: ConsentPurpose[]) =>
    purposes.map((p) => (
      <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 gap-2">
        <span className="text-xs text-foreground/80 leading-snug flex-1 min-w-0 truncate">{p.label}</span>
        {purposeStatusBadge(p)}
      </div>
    ));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between text-sm font-semibold text-foreground/80 hover:text-foreground py-2.5 px-4 rounded-lg border border-border/50 bg-muted/20 transition-colors">
          <span>Review your consent choices</span>
          <ArrowDownBoldDuotone
            size={13}
            className={`text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-lg border border-border/50 overflow-hidden">
          {hasSections ? (
            template.sections.map((section, si) => (
              <div key={section.id} className={si > 0 ? "border-t border-border/40" : ""}>
                <div className="bg-muted/30 px-4 py-2">
                  <span className="text-[11px] font-semibold text-foreground/70 uppercase tracking-wider">
                    {section.section_number}. {section.section_name}
                  </span>
                </div>
                <div className="px-4 py-1">
                  {renderPurposeRows(section.purposes)}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-1">
              {renderPurposeRows(template.purposes)}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function GranularConsentForm({
  employeeId,
  userId,
  template,
  hasConsented,
  onConsentSubmitted,
}: GranularConsentFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [esignName, setEsignName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  // Initialize toggles: mandatory purposes ON (locked), others OFF
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    template.purposes.forEach((p) => {
      const type = p.purpose_type ?? (p.is_mandatory ? "mandatory" : "optional");
      init[p.purpose_key] = type === "mandatory";
    });
    return init;
  });

  const handleToggle = (key: string, val: boolean) => {
    setToggles((prev) => ({ ...prev, [key]: val }));
  };

  const canSubmit = esignName.trim().length > 0 && acknowledged && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const purposes = template.purposes.map((p) => ({
      purpose_key: p.purpose_key,
      consented: toggles[p.purpose_key] ?? false,
      is_mandatory: p.is_mandatory,
    }));

    const consentStatementText = CONSENT_STATEMENT;

    const success = await ConsentService.submitConsent({
      employeeId,
      userId,
      templateId: template.id,
      templateVersion: template.version,
      purposes,
      esignName,
      consentStatementText,
      language: navigator.language || "en",
      device: navigator.userAgent,
    });

    setSubmitting(false);
    if (success) onConsentSubmitted();
  };

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

  const hasSections = template.sections.length > 0;

  return (
    <div className="space-y-6 mt-4">
      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Data Processing Consent</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review the purposes for which we process your personal data.
          Mandatory purposes are required by law. Conditional purposes affect certain
          benefits or assignments. Optional purposes are entirely your choice.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <PurposeTypeBadge type="mandatory" />
          <span className="text-[11px] text-muted-foreground self-center">Required by law — cannot be declined</span>
          <span className="text-muted-foreground/40 self-center">·</span>
          <PurposeTypeBadge type="conditional" />
          <span className="text-[11px] text-muted-foreground self-center">Declining has disclosed consequences</span>
          <span className="text-muted-foreground/40 self-center">·</span>
          <PurposeTypeBadge type="optional" />
          <span className="text-[11px] text-muted-foreground self-center">No employment impact if declined</span>
        </div>
      </div>

      {/* Purposes — section-grouped (v2.0) or flat list (v1.0) */}
      <div className="space-y-6 divide-y divide-border/40">
        {hasSections ? (
          template.sections.map((section) => (
            <SectionBlock
              key={section.id}
              section={section}
              toggles={toggles}
              onToggle={handleToggle}
            />
          ))
        ) : (
          <div className="space-y-2.5">
            {template.purposes.map((p) => (
              <PurposeCard
                key={p.id}
                purpose={p}
                checked={toggles[p.purpose_key] ?? false}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Review summary (collapsible, shown before declaration) ── */}
      <ConsentReviewSummary template={template} toggles={toggles} />

      {/* ── Final consent declaration + e-signature ── */}

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Review and Confirm</h3>
          <p className="text-xs text-muted-foreground mt-1">
            By typing your full name below and clicking Submit, you confirm that:
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-foreground/80 list-none">
            {[
              "I have reviewed my personal information in each section above.",
              "I have made an informed decision for each purpose, understanding the data used, the parties involved, the retention period, and the consequences of declining.",
              "My consent for each Optional and Conditional purpose is given freely and without coercion.",
              "I understand I can withdraw consent for any Optional or Conditional purpose at any time through the My Consents area.",
              "I understand my rights under DPDPA — to access, correct, erase, nominate, and raise grievances.",
            ].map((point, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary/50 shrink-0" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="esign" className="text-xs font-medium">
            Type your full name as your e-signature
          </Label>
          <Input
            id="esign"
            placeholder="e.g. Jane Doe"
            value={esignName}
            onChange={(e) => setEsignName(e.target.value)}
            className="max-w-xs bg-background h-9 text-sm"
          />
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            onCheckedChange={(val) => setAcknowledged(val === true)}
            className="h-4 w-4 mt-0.5"
          />
          <label htmlFor="acknowledge" className="text-xs text-foreground/80 leading-relaxed cursor-pointer">
            I have read and agree to the above declaration.
          </label>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
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

      {/* ── Grievance Officer / DPO contact ── */}
      <GrievanceOfficerBlock />
    </div>
  );
}
