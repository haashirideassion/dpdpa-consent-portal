import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ConsentService, type PurposeConsentStatus, type PurposeType } from "@/services/consent.service";
import { Card, CardContent } from "@/components/ui/card";
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
  GlobalBoldDuotone,
} from "solar-icon-set";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { GrievanceOfficerBlock } from "@/components/GrievanceOfficerBlock";
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state";

// ── Purpose type badge ────────────────────────────────────────────────────────
function PurposeTypeBadge({ type }: { type: PurposeType }) {
  if (type === "mandatory") {
    return (
      <Badge variant="secondary" className="text-[9px] uppercase tracking-wide py-0 px-1.5 h-4 font-semibold gap-0.5">
        <LockKeyholeMinimalisticBoldDuotone size={9} className="mr-0.5" />
        Mandatory
      </Badge>
    );
  }
  if (type === "conditional") {
    return (
      <Badge className="text-[9px] uppercase tracking-wide py-0 px-1.5 h-4 font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50 gap-0.5">
        <ShieldWarningBoldDuotone size={9} className="mr-0.5" />
        Conditional
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] uppercase tracking-wide py-0 px-1.5 h-4 text-muted-foreground">
      Optional
    </Badge>
  );
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
  const purposeType: PurposeType = item.purpose.purpose_type ?? (item.purpose.is_mandatory ? "mandatory" : "optional");
  const isSelectable = purposeType !== "mandatory";
  // Support v1.0 and v2.0 fields
  const dataUsed   = item.purpose.data_used   ?? item.purpose.data_categories;
  const sharedWith = item.purpose.shared_with ?? item.purpose.third_parties;

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
              <PurposeTypeBadge type={purposeType} />
              {item.purpose.cross_border && (
                <Badge className="gap-1 bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-50 text-[9px] py-0 px-1.5 h-4">
                  <GlobalBoldDuotone size={9} />
                  Cross-border
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed max-w-prose">
              {item.purpose.description}
            </p>

            {/* Disclosure mini-summary */}
            {(dataUsed || sharedWith || item.purpose.retention_period) && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                {dataUsed && (
                  <span className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/60">Data: </span>
                    {dataUsed}
                  </span>
                )}
                {item.purpose.retention_period && (
                  <span className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/60">Retention: </span>
                    {item.purpose.retention_period}
                  </span>
                )}
              </div>
            )}

            {/* Conditional: consequence info */}
            {purposeType === "conditional" && item.purpose.consequence_of_declining && item.currentStatus !== "active" && (
              <div className="flex items-start gap-1.5 mt-1.5 text-[11px] text-amber-700">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{item.purpose.consequence_of_declining}</span>
              </div>
            )}

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

            {canAct && isSelectable && (
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

            {!isSelectable && item.currentStatus === "active" && (
              <span className="text-[10px] text-muted-foreground italic">Required by law</span>
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
    if (!item) { setStep(1); setReason(""); }
  }, [item]);

  if (!item) return null;

  // Use purpose-level consequence text (v2.0) when available
  const consequence = item.purpose.consequence_of_declining;

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
                <span className="font-semibold text-foreground">{item.purpose.label}</span>{" "}
                will have the following effects:
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 my-2">
              {consequence ? (
                <div className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{consequence}</span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-sm">
                  <InfoCircleBoldDuotone size={15} className="text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Some optional services related to this purpose may no longer be available.
                    You can re-consent at any time to restore these services.
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
              You may re-consent at any time. This withdrawal will be recorded in your
              compliance history and HR / DPO will be notified.
            </p>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose} className="text-sm">Cancel</Button>
              <Button variant="default" onClick={() => setStep(2)} className="text-sm">Continue</Button>
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
                <span className="font-semibold text-foreground">{item.purpose.label}</span>?
                This action will be recorded.
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

            <GrievanceOfficerBlock />

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="text-sm">Back</Button>
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

// ── Give Consent dialog (first-time / pending optional purpose) ───────────────
function GiveConsentDialog({
  item, onClose, onConfirm, loading,
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
            <span className="font-semibold text-foreground">{item.purpose.label}</span>.
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
          A timestamped consent record will be created. You may withdraw this consent at any time.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="text-sm">Cancel</Button>
          <Button onClick={onConfirm} disabled={loading} className="text-sm gap-1 bg-emerald-600 hover:bg-emerald-700">
            {loading ? "Processing..." : "Confirm Consent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Re-consent confirmation dialog ───────────────────────────────────────────
function ReConsentDialog({
  item, onClose, onConfirm, loading,
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
            <span className="font-semibold text-foreground">{item.purpose.label}</span>.
            This will restore any services or processing associated with this purpose.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground bg-emerald-50 border border-emerald-100 rounded-md p-3">
          A new consent record will be created with today's date and timestamp.
          Your previous withdrawal history is preserved.
        </p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="text-sm">Cancel</Button>
          <Button onClick={onConfirm} disabled={loading} className="text-sm gap-1 bg-emerald-600 hover:bg-emerald-700">
            {loading ? "Processing..." : "Confirm Consent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── DPR dialog (Exercise My Rights) ──────────────────────────────────────────
function DprDialog({
  employeeId, open, onOpenChange,
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
      setDprType(""); setDprDesc("");
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
              Details <span className="text-muted-foreground font-normal">(optional)</span>
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
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
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
    <SharedEmptyState
      icon={<DocumentBoldDuotone size={24} />}
      title="No Consent Template Active"
      description="No active consent template was found. Please contact HR if you believe this is an error."
      className="py-12"
    />
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
  const [sectionedStatuses, setSectionedStatuses] = useState<
    Array<{ section: { id: string; section_number: number; section_name: string }; statuses: PurposeConsentStatus[] }>
  >([]);

  const [withdrawTarget, setWithdrawTarget] = useState<PurposeConsentStatus | null>(null);
  const [reConsentTarget, setReConsentTarget] = useState<PurposeConsentStatus | null>(null);
  const [giveConsentTarget, setGiveConsentTarget] = useState<PurposeConsentStatus | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dprOpen, setDprOpen] = useState(false);

  const fetchStatuses = useCallback(async () => {
    setLoading(true);
    const result = await ConsentService.getConsentStatuses(employeeId);
    setStatuses(result.statuses);
    setSectionedStatuses(result.sectionedStatuses);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { fetchStatuses(); }, [fetchStatuses]);

  const handleWithdrawConfirm = async (reason: string) => {
    if (!withdrawTarget || !userId) return;
    setActionLoading(true);
    const ok = await ConsentService.withdrawConsent({
      employeeId, userId,
      purposeKey: withdrawTarget.purpose.purpose_key,
      purposeLabel: withdrawTarget.purpose.label,
      reason: reason || undefined,
      employeeName: employeeName ?? "Employee",
    });
    setActionLoading(false);
    if (ok) {
      toast.success("Consent withdrawn", {
        description: "Your consent withdrawal has been recorded.",
      });
      setWithdrawTarget(null);
      fetchStatuses();
    } else {
      toast.error("Unable to withdraw consent", {
        description: "We couldn't process your withdrawal. Please try again.",
      });
    }
  };

  const handleReConsentConfirm = async () => {
    if (!reConsentTarget || !userId) return;
    setActionLoading(true);
    const ok = await ConsentService.reGrantConsent({
      employeeId, userId,
      purposeKey: reConsentTarget.purpose.purpose_key,
      purposeLabel: reConsentTarget.purpose.label,
      templateId: reConsentTarget.purpose.templateId,
      templateVersion: reConsentTarget.purpose.templateVersion,
      isMandatory: reConsentTarget.purpose.is_mandatory,
      employeeName: employeeName ?? "Employee",
      isReConsent: true,
    });
    setActionLoading(false);
    if (ok) {
      toast.success("Consent restored", {
        description: "Your consent has been successfully restored.",
      });
      setReConsentTarget(null);
      fetchStatuses();
    } else {
      toast.error("Unable to restore consent", {
        description: "We couldn't restore your consent. Please try again.",
      });
    }
  };

  const handleGiveConsentConfirm = async () => {
    if (!giveConsentTarget || !userId) return;
    setActionLoading(true);
    const ok = await ConsentService.reGrantConsent({
      employeeId, userId,
      purposeKey: giveConsentTarget.purpose.purpose_key,
      purposeLabel: giveConsentTarget.purpose.label,
      templateId: giveConsentTarget.purpose.templateId,
      templateVersion: giveConsentTarget.purpose.templateVersion,
      isMandatory: giveConsentTarget.purpose.is_mandatory,
      employeeName: employeeName ?? "Employee",
    });
    setActionLoading(false);
    if (ok) {
      toast.success("Consent recorded", {
        description: "Your consent has been successfully recorded.",
      });
      setGiveConsentTarget(null);
      fetchStatuses();
    } else {
      toast.error("Unable to record consent", {
        description: "We couldn't record your consent. Please try again.",
      });
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

  if (statuses.length === 0) return <EmptyState />;

  const activeCount   = statuses.filter((s) => s.currentStatus === "active").length;
  const withdrawnCount = statuses.filter((s) => s.currentStatus === "withdrawn").length;
  const pendingCount  = statuses.filter((s) => s.currentStatus === "pending" && s.purpose.purpose_type !== "mandatory").length;
  const canAct        = !!userId;
  const hasSections   = sectionedStatuses.length > 0;

  // Render grouped (v2.0) or flat (v1.0)
  const renderConsents = () => {
    if (hasSections) {
      return (
        <div className="space-y-6 divide-y divide-border/40">
          {sectionedStatuses.map(({ section, statuses: sStatuses }) => (
            <div key={section.id} className="pt-4 first:pt-0 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.section_number}. {section.section_name}
              </p>
              <div className="space-y-2">
                {sStatuses.map((item) => (
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
            </div>
          ))}
        </div>
      );
    }

    // Flat list (legacy v1.0)
    const mandatory = statuses.filter((s) => s.purpose.is_mandatory);
    const optional  = statuses.filter((s) => !s.purpose.is_mandatory);
    return (
      <>
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
                <ConsentCard key={item.purpose.purpose_key} item={item} canAct={canAct}
                  onWithdraw={setWithdrawTarget} onReConsent={setReConsentTarget} onGiveConsent={setGiveConsentTarget} />
              ))}
            </div>
          </section>
        )}
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
                <ConsentCard key={item.purpose.purpose_key} item={item} canAct={canAct}
                  onWithdraw={setWithdrawTarget} onReConsent={setReConsentTarget} onGiveConsent={setGiveConsentTarget} />
              ))}
            </div>
          </section>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6 mt-4 animate-in fade-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">
            Manage your DPDPA consent preferences. You may withdraw optional and conditional consents
            at any time and re-consent when needed.
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
            {pendingCount > 0 && (
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-amber-600">{pendingCount}</span> pending
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

      {/* Consent list */}
      {renderConsents()}

      <Separator />

      <p className="text-[11px] text-muted-foreground text-center">
        All consent actions are logged with timestamps for DPDPA compliance. Mandatory
        consents cannot be withdrawn as they are required for your employment relationship.
      </p>

      {/* Grievance Officer Block — always shown per spec */}
      <GrievanceOfficerBlock />

      {/* Dialogs */}
      <WithdrawDialog item={withdrawTarget} onClose={() => setWithdrawTarget(null)} onConfirm={handleWithdrawConfirm} loading={actionLoading} />
      <ReConsentDialog item={reConsentTarget} onClose={() => setReConsentTarget(null)} onConfirm={handleReConsentConfirm} loading={actionLoading} />
      <GiveConsentDialog item={giveConsentTarget} onClose={() => setGiveConsentTarget(null)} onConfirm={handleGiveConsentConfirm} loading={actionLoading} />
      <DprDialog employeeId={employeeId} open={dprOpen} onOpenChange={setDprOpen} />
    </div>
  );
}
