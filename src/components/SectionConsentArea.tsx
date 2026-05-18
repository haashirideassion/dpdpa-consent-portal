import { useState } from "react";
import {
  CheckCircleBoldDuotone,
  ClockCircleBoldDuotone,
  CloseCircleBoldDuotone,
  LockKeyholeMinimalisticBoldDuotone,
  ShieldWarningBoldDuotone,
  ArrowDownBoldDuotone,
  GlobalBoldDuotone,
} from "solar-icon-set";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  ConsentService,
  type ConsentSection,
  type ConsentPurpose,
  type PurposeConsentStatus,
  type PurposeType,
} from "@/services/consent.service";

// ── Purpose type badge (compact) ──────────────────────────────────────────────
function TypeBadge({ type }: { type: PurposeType }) {
  if (type === "mandatory") {
    return (
      <Badge className="gap-0.5 bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-100 text-[9px] font-semibold px-1.5 py-0 h-4 uppercase tracking-wider">
        <LockKeyholeMinimalisticBoldDuotone size={8} />
        Mandatory
      </Badge>
    );
  }
  if (type === "conditional") {
    return (
      <Badge className="gap-0.5 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50 text-[9px] font-semibold px-1.5 py-0 h-4 uppercase tracking-wider">
        <ShieldWarningBoldDuotone size={8} />
        Conditional
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-50 text-[9px] font-semibold px-1.5 py-0 h-4 uppercase tracking-wider">
      Optional
    </Badge>
  );
}

// ── Pre-consent: single purpose row with checkbox ─────────────────────────────
function PreConsentRow({
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
    <div
      className={`rounded-md border px-3 py-2 ${
        type === "mandatory"
          ? "bg-muted/20 border-border/40"
          : type === "conditional"
          ? "border-amber-200/70 bg-amber-50/30"
          : "border-border/50 bg-background"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          <span className="text-xs font-medium text-foreground leading-tight">{purpose.label}</span>
          <TypeBadge type={type} />
          {purpose.cross_border && (
            <Badge className="gap-0.5 bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-50 text-[9px] py-0 px-1.5 h-4">
              <GlobalBoldDuotone size={8} />
              Cross-border
            </Badge>
          )}
        </div>
        <div className="shrink-0">
          {isSelectable ? (
            <Checkbox
              checked={checked}
              onCheckedChange={(val) => onToggle(purpose.purpose_key, val === true)}
              className="h-3.5 w-3.5"
            />
          ) : (
            <div className="h-3.5 w-3.5 rounded-sm border-2 border-slate-300 bg-slate-100 flex items-center justify-center">
              <LockKeyholeMinimalisticBoldDuotone size={8} className="text-slate-400" />
            </div>
          )}
        </div>
      </div>

      {/* Conditional: consequence warning */}
      {type === "conditional" && purpose.consequence_of_declining && (
        <div className="flex items-start gap-1.5 mt-2 rounded bg-amber-50 border border-amber-200/60 px-2 py-1.5">
          <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-[10px] text-amber-800 leading-relaxed">
            <span className="font-semibold">If declined: </span>
            {purpose.consequence_of_declining}
          </p>
        </div>
      )}

      {/* Collapsible disclosure details */}
      {(purpose.data_used ?? purpose.data_categories ?? purpose.shared_with ?? purpose.retention_period) && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1.5">
              <ArrowDownBoldDuotone
                size={9}
                className={`transition-transform ${open ? "rotate-180" : ""}`}
              />
              {open ? "Hide" : "View"} details
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1.5 space-y-0.5">
              {(purpose.data_used ?? purpose.data_categories) && (
                <p className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground/60">Data used: </span>
                  {purpose.data_used ?? purpose.data_categories}
                </p>
              )}
              {(purpose.shared_with ?? purpose.third_parties) && (
                <p className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground/60">Shared with: </span>
                  {purpose.shared_with ?? purpose.third_parties}
                </p>
              )}
              {purpose.retention_period && (
                <p className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground/60">Retention: </span>
                  {purpose.retention_period}
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ── Post-consent: single purpose row with status + action ─────────────────────
function PostConsentRow({
  status,
  employeeId,
  userId,
  employeeName,
  onRefresh,
  readOnly = false,
}: {
  status: PurposeConsentStatus;
  employeeId: string;
  userId?: string;
  employeeName?: string;
  onRefresh?: () => void;
  readOnly?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const type = status.purpose.purpose_type ?? (status.purpose.is_mandatory ? "mandatory" : "optional");
  const isMandatory = type === "mandatory";

  const hasDisclosure =
    status.purpose.data_used ||
    status.purpose.data_categories ||
    status.purpose.shared_with ||
    status.purpose.third_parties ||
    status.purpose.retention_period ||
    (type === "conditional" && status.purpose.consequence_of_declining);

  function formatTs(ts: string | null) {
    if (!ts) return null;
    return new Date(ts).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  async function handleWithdraw() {
    if (!userId || !employeeName || !onRefresh) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    setConfirming(false);
    await ConsentService.withdrawConsent({
      employeeId,
      userId,
      purposeKey: status.purpose.purpose_key,
      purposeLabel: status.purpose.label,
      employeeName,
    });
    setLoading(false);
    onRefresh();
  }

  async function handleReConsent() {
    if (!userId || !employeeName || !onRefresh) return;
    setLoading(true);
    await ConsentService.reGrantConsent({
      employeeId,
      userId,
      purposeKey: status.purpose.purpose_key,
      purposeLabel: status.purpose.label,
      templateId: status.purpose.templateId,
      templateVersion: status.purpose.templateVersion,
      isMandatory: status.purpose.is_mandatory,
      employeeName,
    });
    setLoading(false);
    onRefresh();
  }

  const statusBadge = () => {
    if (isMandatory) {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
          <LockKeyholeMinimalisticBoldDuotone size={8} />
          Required
        </span>
      );
    }
    if (status.currentStatus === "active") {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
          <CheckCircleBoldDuotone size={8} />
          Active
        </span>
      );
    }
    if (status.currentStatus === "withdrawn") {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
          <CloseCircleBoldDuotone size={8} />
          Withdrawn
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
        <ClockCircleBoldDuotone size={8} />
        Pending
      </span>
    );
  };

  const actionButton = () => {
    if (isMandatory || readOnly) return null;
    if (loading) return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;

    if (status.currentStatus === "active") {
      if (confirming) {
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground">Confirm?</span>
            <button
              type="button"
              onClick={handleWithdraw}
              className="text-[9px] font-semibold text-destructive hover:underline"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[9px] text-muted-foreground hover:underline"
            >
              No
            </button>
          </div>
        );
      }
      return (
        <button
          type="button"
          onClick={handleWithdraw}
          className="text-[9px] font-medium text-destructive border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 rounded-full px-2 py-0.5 transition-colors"
        >
          Withdraw
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleReConsent}
        className="text-[9px] font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 rounded-full px-2 py-0.5 transition-colors"
      >
        {status.currentStatus === "withdrawn" ? "Re-consent" : "Give Consent"}
      </button>
    );
  };

  // ── Read-only (admin) layout — expanded with disclosure + timestamp ──────────
  if (readOnly) {
    return (
      <div className={`rounded-md border px-3 py-2 mb-1.5 last:mb-0 ${
        isMandatory
          ? "bg-muted/20 border-border/40"
          : type === "conditional"
          ? "border-amber-200/70 bg-amber-50/30"
          : "border-border/50 bg-background"
      }`}>
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            <span className="text-xs font-medium text-foreground leading-tight">{status.purpose.label}</span>
            <TypeBadge type={type} />
            {status.purpose.cross_border && (
              <Badge className="gap-0.5 bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-50 text-[9px] py-0 px-1.5 h-4">
                <GlobalBoldDuotone size={8} />
                Cross-border
              </Badge>
            )}
          </div>
          <div className="shrink-0">{statusBadge()}</div>
        </div>

        {/* Timestamp */}
        {(status.grantedAt || status.withdrawnAt) && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {status.currentStatus === "withdrawn" && status.withdrawnAt
              ? `Withdrawn: ${formatTs(status.withdrawnAt)}`
              : status.grantedAt
              ? `Consented: ${formatTs(status.grantedAt)}`
              : null}
          </p>
        )}

        {/* Conditional consequence */}
        {type === "conditional" && status.purpose.consequence_of_declining && (
          <div className="flex items-start gap-1.5 mt-1.5 rounded bg-amber-50 border border-amber-200/60 px-2 py-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-800 leading-relaxed">
              <span className="font-semibold">If declined: </span>
              {status.purpose.consequence_of_declining}
            </p>
          </div>
        )}

        {/* Collapsible disclosure details */}
        {hasDisclosure && (
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1.5">
                <ArrowDownBoldDuotone
                  size={9}
                  className={`transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                />
                {detailsOpen ? "Hide" : "View"} details
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 space-y-0.5">
                {(status.purpose.data_used ?? status.purpose.data_categories) && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground/60">Data used: </span>
                    {status.purpose.data_used ?? status.purpose.data_categories}
                  </p>
                )}
                {(status.purpose.shared_with ?? status.purpose.third_parties) && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground/60">Shared with: </span>
                    {status.purpose.shared_with ?? status.purpose.third_parties}
                  </p>
                )}
                {status.purpose.retention_period && (
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground/60">Retention: </span>
                    {status.purpose.retention_period}
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    );
  }

  // ── Interactive (employee) layout ─────────────────────────────────────────
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
        <span className="text-xs text-foreground/80 truncate">{status.purpose.label}</span>
        <TypeBadge type={type} />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {statusBadge()}
        {actionButton()}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface SectionConsentAreaProps {
  hasConsented: boolean;
  // Pre-consent props
  consentSections?: ConsentSection[];
  toggles?: Record<string, boolean>;
  onToggle?: (key: string, val: boolean) => void;
  // Post-consent props
  purposeStatuses?: PurposeConsentStatus[];
  employeeId?: string;
  userId?: string;
  employeeName?: string;
  onRefresh?: () => void;
  /** When true, suppresses all action buttons (Withdraw / Re-consent). Use for admin read-only views. */
  readOnly?: boolean;
}

export function SectionConsentArea({
  hasConsented,
  consentSections,
  toggles,
  onToggle,
  purposeStatuses,
  employeeId,
  userId,
  employeeName,
  onRefresh,
  readOnly = false,
}: SectionConsentAreaProps) {
  // ── Pre-consent mode ────────────────────────────────────────────────────────
  if (!hasConsented) {
    if (!consentSections?.length || !toggles || !onToggle) return null;

    return (
      <div className="mt-3 pt-3 border-t border-border/40">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Consent for this section
        </p>
        <div className="space-y-1.5">
          {consentSections.flatMap((section) =>
            section.purposes.map((purpose) => (
              <PreConsentRow
                key={purpose.id}
                purpose={purpose}
                checked={toggles[purpose.purpose_key] ?? false}
                onToggle={onToggle}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  // ── Post-consent mode ───────────────────────────────────────────────────────
  if (!purposeStatuses?.length || !employeeId) return null;
  if (!readOnly && (!userId || !employeeName || !onRefresh)) return null;

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
        Consent status
      </p>
      <div>
        {purposeStatuses.map((s) => (
          <PostConsentRow
            key={s.purpose.id}
            status={s}
            employeeId={employeeId}
            userId={userId}
            employeeName={employeeName}
            onRefresh={onRefresh}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}
