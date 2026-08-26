import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DsrService, ERASURE_REASON_OPTIONS, type DataRequest, type DsrType } from "@/services/dsr.service";
import type { ConsentTemplate } from "@/services/consent.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  AddSquareBoldDuotone,
  DangerTriangleBoldDuotone,
  ClipboardListBoldDuotone,
  AltArrowDownBoldDuotone,
} from "solar-icon-set";
import { dsrRequestSchema, type DsrRequestFormValues } from "@/lib/validation/dsr";
import { cn } from "@/lib/utils";

interface Props {
  employeeId: string;
  userId: string;
  /** Optional — when provided, retention periods for the employee's active
   *  consent purposes are shown when "Erasure" is selected, sourced from
   *  the existing consent_purposes.retention_period values (never invented
   *  or hardcoded here). */
  template?: ConsentTemplate | null;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Submitted",
  in_review: "In Review",
  action_required: "Action Required",
  resolved: "Resolved",
  closed: "Closed",
  rejected: "Rejected",
};

const STATUS_TONES: Record<string, StatusTone> = {
  new: "warning",
  in_review: "info",
  action_required: "warning",
  resolved: "success",
  closed: "neutral",
  rejected: "danger",
};

const TYPE_OPTIONS: { value: DsrType; label: string; desc: string }[] = [
  { value: "access", label: "Access to Information", desc: "Request a copy of your personal data we hold (§11)" },
  { value: "correction", label: "Correction & Update", desc: "Request correction of inaccurate personal data (§12)" },
  { value: "erasure", label: "Erasure", desc: "Request deletion of personal data (§12)" },
  { value: "portability", label: "Data Portability", desc: "Request your data in a machine-readable format" },
  { value: "nomination", label: "Nomination", desc: "Nominate another person to exercise your rights (§14)" },
  { value: "grievance", label: "Grievance", desc: "Raise a grievance with the Data Protection Officer (§13)" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

const EMPTY_FORM: DsrRequestFormValues = { type: "", subject: "", description: "" };

export function MyRequestsView({ employeeId, userId, template }: Props) {
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [erasureReason, setErasureReason] = useState("");
  const [erasureExtra, setErasureExtra] = useState("");
  // Only shown after a submit attempt is blocked on a missing Reason —
  // mirrors FormMessage's styling/behavior for this locally-managed field
  // (Reason isn't part of the zod-validated schema, so it can't use
  // FormField/FormMessage directly — see the useFormField fix below).
  const [reasonSubmitError, setReasonSubmitError] = useState(false);
  // Retention details start collapsed every time the retention card
  // (re)appears — purely a display toggle, no form state involved.
  const [retentionExpanded, setRetentionExpanded] = useState(false);

  const form = useForm<DsrRequestFormValues>({
    resolver: zodResolver(dsrRequestSchema),
    defaultValues: EMPTY_FORM,
  });

  const selectedType = form.watch("type");
  const isErasure = selectedType === "erasure";
  // Retention periods for the employee's own active consent purposes —
  // read from the existing consent_purposes.retention_period values
  // (ConsentTemplate.purposes), never invented here.
  const retentionItems = (template?.purposes ?? []).filter((p) => p.retention_period);

  // Erasure keeps its own visible Subject field (pre-filled once, then
  // editable like any other request type) — only `description` is
  // composed from the reason/extra inputs behind the scenes, so the same
  // DsrService.create() call and DB row shape is used for every request
  // type. Pre-fill Subject exactly once when switching into Erasure, and
  // only if the employee hasn't already typed something.
  useEffect(() => {
    if (!isErasure) return;
    if (!form.getValues("subject").trim()) {
      form.setValue("subject", "Data erasure request", { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isErasure]);

  // Switching AWAY from Erasure to another request type: clear the
  // erasure-composed description (and the auto-filled Subject, if the
  // employee never edited it) so stale erasure content never bleeds into
  // another request type's Subject/Description fields. Note this does
  // NOT clear erasureReason/erasureExtra — those stay in local state for
  // the rest of the dialog session, so switching back to Erasure restores
  // whatever reason was already selected (only cleared on dialog close).
  const wasErasureRef = useRef(false);
  useEffect(() => {
    if (wasErasureRef.current && !isErasure) {
      if (form.getValues("subject") === "Data erasure request") {
        form.setValue("subject", "", { shouldValidate: true });
      }
      form.setValue("description", "", { shouldValidate: true });
    }
    // Reset the retention details to collapsed whenever the retention
    // card isn't showing — so selecting Erasure again always starts
    // collapsed, per the required UX.
    if (!isErasure) setRetentionExpanded(false);
    wasErasureRef.current = isErasure;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isErasure]);

  useEffect(() => {
    if (!isErasure) return;
    const reasonLabel = ERASURE_REASON_OPTIONS.find((r) => r.value === erasureReason)?.label ?? "";
    form.setValue(
      "description",
      reasonLabel
        ? `Reason: ${reasonLabel}${erasureExtra.trim() ? `\n\nAdditional details: ${erasureExtra.trim()}` : ""}`
        : "",
      { shouldValidate: true }
    );
    if (erasureReason) setReasonSubmitError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isErasure, erasureReason, erasureExtra]);

  async function load() {
    const data = await DsrService.getByUser(userId).catch(() => []);
    setRequests(data);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [userId]);

  function closeDialog() {
    setShowDialog(false);
    form.reset(EMPTY_FORM);
    setErasureReason("");
    setErasureExtra("");
    setReasonSubmitError(false);
    setRetentionExpanded(false);
  }

  async function onSubmit(values: DsrRequestFormValues) {
    if (isErasure && !erasureReason) {
      setReasonSubmitError(true);
      toast.error("Please select a reason for your data removal request.");
      return;
    }
    setSubmitting(true);
    try {
      await DsrService.create({
        request_type: values.type as DsrType,
        subject: values.subject.trim(),
        description: values.description.trim(),
        employee_id: employeeId,
      });
      toast.success("Your request has been submitted. The DPO will respond within 30 days.");
      closeDialog();
      await load();
    } catch {
      toast.error("Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">My Data Requests</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Exercise your rights under the Digital Personal Data Protection Act 2023.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowDialog(true)}>
          <AddSquareBoldDuotone size={14} className="mr-1.5" />
          Raise a Request
        </Button>
      </div>

      {/* Rights info */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-3">
          <p className="text-xs text-primary font-medium mb-1">Your DPDPA Rights</p>
          <p className="text-xs text-muted-foreground">
            Under the Digital Personal Data Protection Act 2023, you have the right to access your data,
            request corrections, request erasure, port your data, nominate a representative, and raise
            grievances. All requests are processed within 30 days.
          </p>
        </CardContent>
      </Card>

      {/* Request list */}
      {requests.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<ClipboardListBoldDuotone size={28} />}
              title="No requests yet"
              description="Raise a request to access, correct, erase, or port your data — or to nominate a representative or file a grievance."
              cta={
                <Button size="sm" onClick={() => setShowDialog(true)}>
                  <AddSquareBoldDuotone size={14} className="mr-1.5" />
                  Raise a Request
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.subject}</span>
                      <Badge variant="outline" className="text-xs">
                        {TYPE_OPTIONS.find((t) => t.value === r.request_type)?.label ?? r.request_type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                    {r.resolution_note && (
                      <div className="mt-2 rounded-lg bg-success/5 border border-success/30 p-2">
                        <p className="text-xs text-success font-medium">DPO Response:</p>
                        <p className="text-xs mt-0.5">{r.resolution_note}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <StatusBadge tone={STATUS_TONES[r.status] ?? "neutral"} className="text-xs">
                      {STATUS_LABELS[r.status] ?? r.status}
                    </StatusBadge>
                    <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                    {r.sla_due_at && !["resolved", "closed", "rejected"].includes(r.status) && (
                      <p className="text-xs text-muted-foreground">
                        Due: {formatDate(r.sla_due_at)}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New request dialog
          Scroll fix: the previous attempt relied on CSS Grid's
          `grid-rows-[auto_1fr_auto]` + a `min-h-0 overflow-y-auto` middle
          row, sized only by the container's `max-height` (no explicit
          `height`) — that 1fr-track-with-only-max-height combination
          turned out not to reliably resolve to a scrollable, bounded
          track, so the dialog just grew past the viewport and clipped
          silently with no way to reach the rest of it.
          Switched to the simpler, unambiguous fix: `max-h-[90vh]
          overflow-y-auto` directly on DialogContent itself, so the WHOLE
          dialog (header, fields, footer) is one single scroll container
          with a hard cap — no grid/flex track-sizing edge cases involved,
          guaranteed to scroll once content exceeds 90vh. This is scoped
          to this one DialogContent instance via className, not to the
          shared dialog.tsx component, so no other dialog in the app is
          affected — and it applies to every request type, not just
          Erasure. The retention list keeps its own small nested scroll
          area; once that reaches its own limit, further scrolling bubbles
          up to this outer container as normal (standard browser scroll
          chaining), so the user is never trapped inside it. */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Raise a Data Request</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <div className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Request Type *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Select type of request…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TYPE_OPTIONS.map((t) => (
                          // Plain text only — SelectPrimitive.ItemText (inside
                          // SelectItem) is exactly what Radix clones into the
                          // trigger's SelectValue when this item is selected.
                          // A two-line label+description block here previously
                          // got cloned whole into the single-line h-9 trigger,
                          // breaking its vertical alignment. The description is
                          // shown separately below instead (see field.value).
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.value && (
                      <p className="text-xs text-muted-foreground">
                        {TYPE_OPTIONS.find((t) => t.value === field.value)?.desc}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isErasure ? (
                <>
                  {/* Compact retention notice — never claims all data will
                      definitely be deleted, and never invokes DPDPA as
                      mandating deletion; the request is reviewed against
                      whatever retention requirements actually apply. The
                      full purpose-by-purpose list (potentially long) is
                      informational only and collapsed by default so it
                      doesn't dominate the form — this is a plain
                      Collapsible (no form state), so it can't trigger the
                      useFormField-outside-<FormField> error. */}
                  <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 space-y-2">
                    <p className="text-sm font-medium text-warning-foreground">Before you submit</p>
                    <p className="text-xs text-warning-foreground">
                      Your request will be reviewed against applicable data-retention and legal
                      requirements. Some information may need to be retained where retention is
                      required.
                    </p>

                    {retentionItems.length > 0 && (
                      <Collapsible open={retentionExpanded} onOpenChange={setRetentionExpanded}>
                        <div className="rounded-md border border-warning/20 bg-background/60 p-2.5">
                          <p className="text-xs font-medium text-foreground">Retention information</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {retentionItems.length} processing purpose{retentionItems.length === 1 ? "" : "s"} have
                            defined retention periods
                          </p>
                          {/* CollapsibleTrigger renders a native <button> and
                              manages aria-expanded/aria-controls itself. */}
                          <CollapsibleTrigger asChild>
                            <button
                              type="button"
                              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
                            >
                              <AltArrowDownBoldDuotone
                                size={12}
                                className={cn("transition-transform", retentionExpanded && "rotate-180")}
                              />
                              {retentionExpanded ? "Hide retention details" : "View retention details"}
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            {/* Retention list keeps its OWN small internal
                                scroll (≈240px) — this is intentionally
                                separate from, and nested inside, the
                                dialog's outer scroll area above. Even with
                                many purposes listed here, the outer dialog
                                scroll still reaches Reason/Subject/
                                Additional details/Submit below it. */}
                            <ul className="text-xs text-muted-foreground space-y-2 pl-4 list-disc mt-2 max-h-60 overflow-y-auto pr-1">
                              {retentionItems.map((p) => (
                                <li key={p.id}>
                                  <span className="font-medium text-foreground block">{p.label}</span>
                                  {p.retention_period}
                                </li>
                              ))}
                            </ul>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    )}
                  </div>

                  {/* Reason is local state, not part of the zod-validated
                      form schema (see EMPTY_FORM/dsrRequestSchema) — it must
                      NOT use FormLabel/FormControl, which call useFormField()
                      and require a parent <FormField> (they'd throw
                      "useFormField should be used within <FormField>"
                      otherwise). Plain <Label> + no <FormControl> is the
                      correct, crash-free equivalent for a field the form
                      library isn't controlling. */}
                  <div className="space-y-2">
                    <Label className="text-sm" htmlFor="erasure-reason">Reason *</Label>
                    <Select value={erasureReason} onValueChange={setErasureReason}>
                      <SelectTrigger id="erasure-reason" className="text-sm">
                        <SelectValue placeholder="Select a reason…" />
                      </SelectTrigger>
                      <SelectContent>
                        {ERASURE_REASON_OPTIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {reasonSubmitError && (
                      <p className="text-[0.8rem] font-medium text-destructive">
                        Please select a reason.
                      </p>
                    )}
                  </div>

                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Subject *</FormLabel>
                        <FormControl>
                          <Input placeholder="Data erasure request" className="text-sm" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Also local state — same reasoning as Reason above. */}
                  <div className="space-y-2">
                    <Label className="text-sm" htmlFor="erasure-extra">Additional details (optional)</Label>
                    <Textarea
                      id="erasure-extra"
                      placeholder="Optional explanation…"
                      rows={3}
                      className="text-sm"
                      value={erasureExtra}
                      onChange={(e) => setErasureExtra(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Subject *</FormLabel>
                        <FormControl>
                          <Input placeholder="Brief subject of your request…" className="text-sm" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Description *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Describe your request in detail…"
                            rows={4}
                            className="text-sm"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  <DangerTriangleBoldDuotone size={12} className="inline mr-1" />
                  Your request will be reviewed by the Data Protection Officer and responded to within 30 days.
                  You will be notified when the status changes.
                </p>
              </div>
            </div>
          </Form>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={submitting || (isErasure && !erasureReason)}>
              {submitting ? "Submitting…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
