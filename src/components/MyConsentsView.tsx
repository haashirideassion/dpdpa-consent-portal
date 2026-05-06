import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ConsentService, type PurposeConsentStatus } from "@/services/consent.service";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircleBoldDuotone,
  CloseCircleBoldDuotone,
  DocumentBoldDuotone,
  ShieldWarningBoldDuotone,
  HistoryBoldDuotone,
  InfoCircleBoldDuotone,
  LockKeyholeMinimalisticBoldDuotone,
  RefreshBoldDuotone,
  ArrowDownBoldDuotone,
  AddCircleBoldDuotone,
} from "solar-icon-set";
import { format } from "date-fns";
import { toast } from "sonner";

// ── Consequence copy per purpose_key ─────────────────────────────────────────
const WITHDRAWAL_CONSEQUENCES: Record<string, string[]> = {
  payroll: [
    "Salary and statutory payment processing will be affected.",
    "PF, ESI, and TDS obligations cannot be fulfilled without this consent.",
    "This consent is mandatory and cannot be withdrawn.",
  ],
  benefits: [
    "Health insurance and other employment benefits may be suspended.",
    "Insurance claims may not be processed until consent is restored.",
    "This consent is mandatory and cannot be withdrawn.",
  ],
  background_check: [
    "Employment verification may be placed on hold.",
    "Some regulatory submissions may be delayed.",
    "This consent is mandatory and cannot be withdrawn.",
  ],
  training: [
    "Access to internal and external learning platforms may be revoked.",
    "Certifications linked to company-sponsored training may be affected.",
    "You can re-consent at any time to regain access.",
  ],
  marketing: [
    "You will be removed from internal newsletters and company announcements.",
    "Your name and photo will no longer appear in company publications.",
    "This will not affect your core employment or benefits.",
  ],
  cross_border: [
    "Your data will only be processed within India.",
    "Some features of global HR systems may become unavailable.",
    "Transfers to adequacy-compliant jurisdictions will be paused.",
  ],
};

function getConsequences(purposeKey: string, isMandatory: boolean): string[] {
  if (WITHDRAWAL_CONSEQUENCES[purposeKey]) return WITHDRAWAL_CONSEQUENCES[purposeKey];
  if (isMandatory) {
    return [
      "This is a mandatory consent required for your employment.",
      "Withdrawing this may impact core HR processes.",
    ];
  }
  return [
    "Some optional services related to this purpose may no longer be available.",
    "You can re-consent at any time to restore these services.",
  ];
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: PurposeConsentStatus["currentStatus"] }) {
  if (status === "active") {
    return (
      <Badge className="gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 text-[11px] font-medium px-2 py-0.5">
        <CheckCircleBoldDuotone size={12} />
        Active
      </Badge>
    );
  }
  if (status === "withdrawn") {
    return (
      <Badge className="gap-1 bg-red-50 text-red-700 border border-red-200 hover:bg-red-50 text-[11px] font-medium px-2 py-0.5">
        <CloseCircleBoldDuotone size={12} />
        Withdrawn
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50 text-[11px] font-medium px-2 py-0.5">
      <InfoCircleBoldDuotone size={12} />
      Pending
    </Badge>
  );
}

// ── Consent history timeline for a single purpose ────────────────────────────
function ConsentHistoryTimeline({ item }: { item: PurposeConsentStatus }) {
  const allEvents: Array<{ type: "grant" | "withdrawal"; date: string; label: string; detail?: string }> = [];

  for (const g of item.grantHistory) {
    allEvents.push({
      type: "grant",
      date: g.created_at,
      label: g.consented ? "Consent Given" : "Consent Declined",
      detail: `Template ${g.template_version}`,
    });
  }
  for (const w of item.withdrawalHistory) {
    allEvents.push({
      type: "withdrawal",
      date: w.withdrawn_at,
      label: "Consent Withdrawn",
      detail: w.reason ?? undefined,
    });
  }

  allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (allEvents.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-dashed border-muted-foreground/15 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 flex items-center gap-1">
        <HistoryBoldDuotone size={11} /> History
      </p>
      <div className="space-y-1.5">
        {allEvents.map((ev, idx) => (
          <div key={idx} className="flex items-start gap-2 text-[11px]">
            <div
              className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                ev.type === "grant" ? "bg-emerald-500" : "bg-red-400"
              }`}
            />
            <div className="flex-1 min-w-0">
              <span className="text-foreground/80 font-medium">{ev.label}</span>
              {ev.detail && (
                <span className="text-muted-foreground ml-1">· {ev.detail}</span>
              )}
            </div>
            <span className="text-muted-foreground shrink-0">
              {format(new Date(ev.date), "dd MMM yyyy, h:mm a")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Single consent card ───────────────────────────────────────────────────────
function ConsentCard({
  item,
  canAct,
  onWithdraw,
  onReConsent,
  onGiveConsent,
}: {
  item: PurposeConsentStatus;
  canAct: boolean;
  onWithdraw: (item: PurposeConsentStatus) => void;
  onReConsent: (item: PurposeConsentStatus) => void;
  onGiveConsent: (item: PurposeConsentStatus) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const hasHistory = item.grantHistory.length + item.withdrawalHistory.length > 0;

  return (
    <Card className="overflow-hidden border border-border/60 shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {/* Left: title + meta */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">
                {item.purpose.label}
              </span>
              {item.purpose.is_mandatory ? (
                <Badge
                  variant="secondary"
                  className="text-[9px] uppercase tracking-wide py-0 px-1.5 h-4 font-semibold"
                >
                  <LockKeyholeMinimalisticBoldDuotone size={9} className="mr-0.5" />
                  Mandatory
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[9px] uppercase tracking-wide py-0 px-1.5 h-4 text-muted-foreground"
                >
                  Optional
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
              {item.purpose.description}
            </p>

            {/* Date info */}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
              {item.grantedAt && (
                <span className="text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/70">Consented:</span>{" "}
                  {format(new Date(item.grantedAt), "dd MMM yyyy, h:mm a")}
                </span>
              )}
              {item.withdrawnAt && item.currentStatus === "withdrawn" && (
                <span className="text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/70">Withdrawn:</span>{" "}
                  {format(new Date(item.withdrawnAt), "dd MMM yyyy, h:mm a")}
                </span>
              )}
            </div>
          </div>

          {/* Right: status + actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <StatusBadge status={item.currentStatus} />

            {canAct && !item.purpose.is_mandatory && (
              <>
                {item.currentStatus === "pending" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 gap-1"
                    onClick={() => onGiveConsent(item)}
                  >
                    <AddCircleBoldDuotone size={13} />
                    Give Consent
                  </Button>
                )}
                {item.currentStatus === "active" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5 hover:border-destructive/50 gap-1"
                    onClick={() => onWithdraw(item)}
                  >
                    <CloseCircleBoldDuotone size={13} />
                    Withdraw
                  </Button>
                )}
                {item.currentStatus === "withdrawn" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 gap-1"
                    onClick={() => onReConsent(item)}
                  >
                    <RefreshBoldDuotone size={13} />
                    Give Consent Again
                  </Button>
                )}
              </>
            )}

            {item.purpose.is_mandatory && item.currentStatus === "active" && (
              <span className="text-[10px] text-muted-foreground italic">Required</span>
            )}
          </div>
        </div>

        {/* Collapsible history */}
        {hasHistory && (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <button className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                <ArrowDownBoldDuotone
                  size={11}
                  className={`transition-transform ${historyOpen ? "rotate-180" : ""}`}
                />
                {historyOpen ? "Hide" : "Show"} history
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ConsentHistoryTimeline item={item} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

// ── Withdraw confirmation dialog (2-step) ────────────────────────────────────
function WithdrawDialog({
  item,
  onClose,
  onConfirm,
  loading,
}: {
  item: PurposeConsentStatus | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!item) {
      setStep(1);
      setReason("");
    }
  }, [item]);

  if (!item) return null;

  const consequences = getConsequences(item.purpose.purpose_key, item.purpose.is_mandatory);

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        {step === 1 ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ShieldWarningBoldDuotone size={20} className="text-amber-500" />
                Before You Withdraw
              </DialogTitle>
              <DialogDescription className="text-sm">
                Withdrawing consent for{" "}
                <span className="font-semibold text-foreground">
                  {item.purpose.label}
                </span>{" "}
                will have the following effects:
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-2 my-2">
              {consequences.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <InfoCircleBoldDuotone
                    size={15}
                    className="text-amber-500 mt-0.5 shrink-0"
                  />
                  <span className="text-muted-foreground">{c}</span>
                </li>
              ))}
            </ul>

            <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
              You may re-consent at any time. This withdrawal will be recorded in your
              compliance history and HR / DPO will be notified.
            </p>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose} className="text-sm">
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={() => setStep(2)}
                className="text-sm"
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <CloseCircleBoldDuotone size={20} className="text-destructive" />
                Confirm Withdrawal
              </DialogTitle>
              <DialogDescription className="text-sm">
                Are you sure you want to withdraw consent for{" "}
                <span className="font-semibold text-foreground">
                  {item.purpose.label}
                </span>
                ? This action will be recorded.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 my-1">
              <Label className="text-xs font-medium">
                Reason for withdrawal{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                placeholder="Briefly describe why you are withdrawing this consent..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="text-sm"
              >
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={() => onConfirm(reason)}
                disabled={loading}
                className="text-sm gap-1"
              >
                {loading ? "Processing..." : "Confirm Withdrawal"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Give Consent dialog (first-time, pending optional purpose) ────────────────
function GiveConsentDialog({
  item,
  onClose,
  onConfirm,
  loading,
}: {
  item: PurposeConsentStatus | null;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AddCircleBoldDuotone size={20} className="text-emerald-600" />
            Give Consent
          </DialogTitle>
          <DialogDescription className="text-sm">
            You are consenting to{" "}
            <span className="font-semibold text-foreground">
              {item.purpose.label}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="leading-relaxed">{item.purpose.description}</p>
          {item.purpose.legal_basis && (
            <p className="text-xs bg-muted/50 rounded px-3 py-2">
              <span className="font-medium text-foreground">Legal basis:</span>{" "}
              {item.purpose.legal_basis}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground bg-emerald-50 border border-emerald-100 rounded-md p-3">
          A timestamped consent record will be created. You may withdraw this
          consent at any time.
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="text-sm">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="text-sm gap-1 bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? "Processing..." : "Confirm Consent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Re-consent confirmation dialog ───────────────────────────────────────────
function ReConsentDialog({
  item,
  onClose,
  onConfirm,
  loading,
}: {
  item: PurposeConsentStatus | null;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshBoldDuotone size={20} className="text-emerald-600" />
            Re-Give Consent
          </DialogTitle>
          <DialogDescription className="text-sm">
            You are about to consent again to{" "}
            <span className="font-semibold text-foreground">
              {item.purpose.label}
            </span>
            . This will restore any services or processing associated with this purpose.
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground bg-emerald-50 border border-emerald-100 rounded-md p-3">
          A new consent record will be created with today's date and timestamp.
          Your previous withdrawal history is preserved.
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="text-sm">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="text-sm gap-1 bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? "Processing..." : "Confirm Consent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── DPR dialog (Exercise My Rights) ──────────────────────────────────────────
function DprDialog({
  employeeId,
  open,
  onOpenChange,
}: {
  employeeId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [dprType, setDprType] = useState("");
  const [dprDesc, setDprDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!dprType) return;
    setSubmitting(true);
    const { error } = await supabase.from("dpr_requests" as any).insert({
      employee_id: employeeId,
      request_type: dprType,
      description: dprDesc,
      status: "pending",
    });
    setSubmitting(false);
    if (!error) {
      onOpenChange(false);
      toast.success("Your DPDPA request has been submitted to the DPO.");
      setDprType("");
      setDprDesc("");
    } else {
      toast.error("Failed to submit request. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Submit a DPDPA Request</DialogTitle>
          <DialogDescription className="text-sm">
            Exercise your rights under the Digital Personal Data Protection Act. This
            request will be routed to the Data Protection Officer (DPO).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Request Type</Label>
            <Select value={dprType} onValueChange={setDprType}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select a right to exercise" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="access">Right to Access Data</SelectItem>
                <SelectItem value="correction">Right to Correction</SelectItem>
                <SelectItem value="erasure">Right to Erasure (Deletion)</SelectItem>
                <SelectItem value="portability">Right to Data Portability</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">
              Details{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              placeholder="Provide any specific context for your request..."
              value={dprDesc}
              onChange={(e) => setDprDesc(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!dprType || submitting}>
            {submitting ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="py-12 flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
        <DocumentBoldDuotone size={24} className="text-muted-foreground/40" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">No Consent Template Active</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          No active consent template was found. Please contact HR if you believe this
          is an error.
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MyConsentsView({
  employeeId,
  employeeName,
  userId,
}: {
  employeeId: string;
  employeeName?: string;
  userId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<PurposeConsentStatus[]>([]);

  // Dialog state
  const [withdrawTarget, setWithdrawTarget] = useState<PurposeConsentStatus | null>(null);
  const [reConsentTarget, setReConsentTarget] = useState<PurposeConsentStatus | null>(null);
  const [giveConsentTarget, setGiveConsentTarget] = useState<PurposeConsentStatus | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dprOpen, setDprOpen] = useState(false);

  const fetchStatuses = useCallback(async () => {
    setLoading(true);
    const { statuses: s } = await ConsentService.getConsentStatuses(employeeId);
    setStatuses(s);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  const handleWithdrawConfirm = async (reason: string) => {
    if (!withdrawTarget || !userId) return;
    setActionLoading(true);
    const ok = await ConsentService.withdrawConsent({
      employeeId,
      userId,
      purposeKey: withdrawTarget.purpose.purpose_key,
      purposeLabel: withdrawTarget.purpose.label,
      reason: reason || undefined,
      employeeName: employeeName ?? "Employee",
    });
    setActionLoading(false);
    if (ok) {
      toast.success(`Consent withdrawn for "${withdrawTarget.purpose.label}".`);
      setWithdrawTarget(null);
      fetchStatuses();
    } else {
      toast.error("Failed to withdraw consent. Please try again.");
    }
  };

  const handleReConsentConfirm = async () => {
    if (!reConsentTarget || !userId) return;
    setActionLoading(true);
    const ok = await ConsentService.reGrantConsent({
      employeeId,
      userId,
      purposeKey: reConsentTarget.purpose.purpose_key,
      purposeLabel: reConsentTarget.purpose.label,
      templateId: reConsentTarget.purpose.templateId,
      templateVersion: reConsentTarget.purpose.templateVersion,
      isMandatory: reConsentTarget.purpose.is_mandatory,
      employeeName: employeeName ?? "Employee",
    });
    setActionLoading(false);
    if (ok) {
      toast.success(`Consent granted for "${reConsentTarget.purpose.label}".`);
      setReConsentTarget(null);
      fetchStatuses();
    } else {
      toast.error("Failed to record consent. Please try again.");
    }
  };

  const handleGiveConsentConfirm = async () => {
    if (!giveConsentTarget || !userId) return;
    setActionLoading(true);
    const ok = await ConsentService.reGrantConsent({
      employeeId,
      userId,
      purposeKey: giveConsentTarget.purpose.purpose_key,
      purposeLabel: giveConsentTarget.purpose.label,
      templateId: giveConsentTarget.purpose.templateId,
      templateVersion: giveConsentTarget.purpose.templateVersion,
      isMandatory: giveConsentTarget.purpose.is_mandatory,
      employeeName: employeeName ?? "Employee",
    });
    setActionLoading(false);
    if (ok) {
      toast.success(`Consent given for "${giveConsentTarget.purpose.label}".`);
      setGiveConsentTarget(null);
      fetchStatuses();
    } else {
      toast.error("Failed to record consent. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 mt-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (statuses.length === 0) {
    return <EmptyState />;
  }

  const mandatory = statuses.filter((s) => s.purpose.is_mandatory);
  const optional = statuses.filter((s) => !s.purpose.is_mandatory);

  const activeCount = statuses.filter((s) => s.currentStatus === "active").length;
  const withdrawnCount = statuses.filter((s) => s.currentStatus === "withdrawn").length;
  const pendingOptionalCount = optional.filter((s) => s.currentStatus === "pending").length;
  const canAct = !!userId;

  return (
    <div className="space-y-6 mt-4 animate-in fade-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            Manage your DPDPA consent preferences. You may withdraw optional consents at
            any time and re-consent when needed.
          </p>
          <div className="flex gap-3 mt-2">
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-emerald-700">{activeCount}</span> active
            </span>
            {withdrawnCount > 0 && (
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-red-600">{withdrawnCount}</span> withdrawn
              </span>
            )}
            {pendingOptionalCount > 0 && (
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-amber-600">{pendingOptionalCount}</span> pending
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold">{statuses.length}</span> total
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0 border-primary/20 text-primary hover:bg-primary/5 text-xs h-8"
          onClick={() => setDprOpen(true)}
        >
          <CheckCircleBoldDuotone size={15} />
          Exercise My Rights
        </Button>
      </div>

      {/* Mandatory consents */}
      {mandatory.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <LockKeyholeMinimalisticBoldDuotone size={13} className="text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Mandatory Consents
            </span>
          </div>
          <div className="space-y-2">
            {mandatory.map((item) => (
              <ConsentCard
                key={item.purpose.purpose_key}
                item={item}
                canAct={canAct}
                onWithdraw={setWithdrawTarget}
                onReConsent={setReConsentTarget}
                onGiveConsent={setGiveConsentTarget}
              />
            ))}
          </div>
        </section>
      )}

      {/* Optional consents */}
      {optional.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <InfoCircleBoldDuotone size={13} className="text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Optional Consents
            </span>
          </div>
          <div className="space-y-2">
            {optional.map((item) => (
              <ConsentCard
                key={item.purpose.purpose_key}
                item={item}
                canAct={canAct}
                onWithdraw={setWithdrawTarget}
                onReConsent={setReConsentTarget}
                onGiveConsent={setGiveConsentTarget}
              />
            ))}
          </div>
        </section>
      )}

      <Separator />

      <p className="text-[11px] text-muted-foreground text-center pb-2">
        All consent actions are logged with timestamps for DPDPA compliance. Mandatory
        consents cannot be withdrawn as they are required for your employment relationship.
      </p>

      {/* Dialogs */}
      <WithdrawDialog
        item={withdrawTarget}
        onClose={() => setWithdrawTarget(null)}
        onConfirm={handleWithdrawConfirm}
        loading={actionLoading}
      />
      <ReConsentDialog
        item={reConsentTarget}
        onClose={() => setReConsentTarget(null)}
        onConfirm={handleReConsentConfirm}
        loading={actionLoading}
      />
      <GiveConsentDialog
        item={giveConsentTarget}
        onClose={() => setGiveConsentTarget(null)}
        onConfirm={handleGiveConsentConfirm}
        loading={actionLoading}
      />
      <DprDialog
        employeeId={employeeId}
        open={dprOpen}
        onOpenChange={setDprOpen}
      />
    </div>
  );
}
