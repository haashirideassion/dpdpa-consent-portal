import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  DsrService,
  ERASURE_CATEGORIES,
  ERASURE_CATEGORY_META,
  type DataRequest,
  type ErasureAssessment,
  type ErasureCategory,
  type ErasureDecision,
} from "@/services/dsr.service";
import { ConsentService } from "@/services/consent.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ShieldWarningBoldDuotone,
  CheckCircleBoldDuotone,
  InfoCircleBoldDuotone,
  ClipboardListBoldDuotone,
} from "solar-icon-set";

interface Props {
  request: DataRequest;
  onProcessed: () => void;
}

type Row = { decision: ErasureDecision; basis: string };

const DECISION_LABELS: Record<ErasureDecision, string> = {
  eligible: "Eligible for removal",
  retained: "Retained",
  anonymized: "Anonymized",
};

const DECISION_HINTS: Record<ErasureDecision, string> = {
  eligible: "Data can be removed based on this assessment.",
  retained: "Data must remain because an applicable retention requirement exists.",
  anonymized: "Identifying information can be removed while the required record is kept.",
};

const BASIS_PLACEHOLDERS: Record<ErasureDecision, string> = {
  eligible: "Optional basis / assessment note",
  retained: "Why must this information be retained?",
  anonymized: "Why is anonymization appropriate?",
};

function emptyRows(): Record<ErasureCategory, Row> {
  return Object.fromEntries(
    ERASURE_CATEGORIES.map((c) => [c.value, { decision: "retained" as ErasureDecision, basis: "" }])
  ) as Record<ErasureCategory, Row>;
}

/**
 * Admin-side "Retention Assessment" for an erasure (request_type = 'erasure')
 * data request. Every category is an ACTUAL table/field-group already
 * present in the schema (ERASURE_CATEGORY_META, kept in sync with
 * 20260827000001_erasure_request_workflow.sql) — nothing is invented.
 * There is deliberately no single "delete everything" action: each
 * category is assessed and processed on its own, and the actual data
 * modification only ever happens server-side via the
 * process_erasure_request() RPC — this component never writes to any
 * employee data table directly; assessErasure()/processErasure() are the
 * only write paths, both SECURITY DEFINER RPCs on the backend.
 */
export function ErasureAssessmentPanel({ request, onProcessed }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  // section_name -> [{ label, retention_period }] — the employee's actual,
  // already-configured consent_purposes.retention_period values, grouped
  // by consent_sections.section_name (see ERASURE_CATEGORY_META.sections).
  const [retentionBySection, setRetentionBySection] = useState<Record<string, { label: string; retention_period: string }[]>>({});
  const [employeeLinked, setEmployeeLinked] = useState(false);
  const [processedByName, setProcessedByName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<ErasureCategory, Row>>(emptyRows);
  const [savedRows, setSavedRows] = useState<Record<ErasureCategory, Row> | null>(null);

  const alreadyProcessed = !!request.erasure_processed_at;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const tasks: Promise<any>[] = [
        DsrService.getErasureAssessments(request.id).catch(() => [] as ErasureAssessment[]),
      ];

      if (request.employee_id) {
        // Reuses the exact same jurisdiction-aware active-template lookup
        // the employee's own "My Data & Consent" screen uses — never a
        // second retention source, never an invented number.
        tasks.push(
          ConsentService.getConsentStatuses(request.employee_id)
            .then((r) => r.sectionedStatuses)
            .catch(() => [] as Awaited<ReturnType<typeof ConsentService.getConsentStatuses>>["sectionedStatuses"])
        );
        tasks.push(
          (supabase as any)
            .from("employees")
            .select("user_id")
            .eq("id", request.employee_id)
            .maybeSingle()
            .then(({ data }: { data: { user_id: string | null } | null }) => !!data?.user_id)
            .catch(() => false)
        );
      } else {
        tasks.push(Promise.resolve([]));
        tasks.push(Promise.resolve(false));
      }

      if (request.erasure_processed_by) {
        tasks.push(
          (supabase as any)
            .from("employees")
            .select("first_name, last_name, email")
            .eq("user_id", request.erasure_processed_by)
            .maybeSingle()
            .then(({ data }: { data: { first_name: string; last_name: string; email: string } | null }) =>
              data ? `${data.first_name} ${data.last_name}` : null
            )
            .catch(() => null)
        );
      } else {
        tasks.push(Promise.resolve(null));
      }

      const [assessments, sectionedStatuses, linked, processedBy] = await Promise.all(tasks);
      if (cancelled) return;

      const bySection: Record<string, { label: string; retention_period: string }[]> = {};
      for (const { section, statuses } of sectionedStatuses ?? []) {
        for (const s of statuses) {
          if (s.purpose.retention_period) {
            (bySection[section.section_name] ??= []).push({
              label: s.purpose.label,
              retention_period: s.purpose.retention_period,
            });
          }
        }
      }
      setRetentionBySection(bySection);
      setEmployeeLinked(linked);
      setProcessedByName(processedBy);

      if ((assessments as ErasureAssessment[]).length > 0) {
        const loaded = emptyRows();
        for (const a of assessments as ErasureAssessment[]) {
          loaded[a.category] = { decision: a.decision, basis: a.basis ?? "" };
        }
        setRows(loaded);
        setSavedRows(loaded);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id]);

  function setDecision(category: ErasureCategory, decision: ErasureDecision) {
    setRows((prev) => ({ ...prev, [category]: { ...prev[category], decision } }));
  }

  function setBasis(category: ErasureCategory, basis: string) {
    setRows((prev) => ({ ...prev, [category]: { ...prev[category], basis } }));
  }

  // Live counts — recomputed from current in-memory state on every render,
  // never hardcoded.
  const counts = useMemo(() => {
    const values = Object.values(rows);
    return {
      total: values.length,
      eligible: values.filter((r) => r.decision === "eligible").length,
      retained: values.filter((r) => r.decision === "retained").length,
      anonymized: values.filter((r) => r.decision === "anonymized").length,
    };
  }, [rows]);

  // A category counts as reviewed once it's been actively moved off the
  // safe "retained" default, or — if left retained — given a basis. An
  // untouched category (still 'retained' with no basis) is what "assessment
  // incomplete" is meant to catch.
  const incompleteCategories = ERASURE_CATEGORIES.filter(
    (c) => rows[c.value].decision === "retained" && !rows[c.value].basis.trim()
  );
  const assessmentComplete = incompleteCategories.length === 0;

  const dirty = savedRows === null || ERASURE_CATEGORIES.some(
    (c) => rows[c.value].decision !== savedRows[c.value].decision || rows[c.value].basis !== savedRows[c.value].basis
  );

  const canProcess = !alreadyProcessed && assessmentComplete && savedRows !== null && !dirty;

  async function handleSaveAssessment() {
    setSaving(true);
    try {
      const payload = ERASURE_CATEGORIES.map((c) => ({
        category: c.value,
        decision: rows[c.value].decision,
        basis: rows[c.value].basis || undefined,
      }));
      await DsrService.assessErasure(request.id, payload);
      setSavedRows({ ...rows });
      toast.success("Retention assessment saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save retention assessment");
    } finally {
      setSaving(false);
    }
  }

  async function handleProcess() {
    setProcessing(true);
    try {
      await DsrService.processErasure(request.id);
      toast.success("Erasure request processed.");
      onProcessed();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to process erasure request");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Retention Assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={alreadyProcessed ? "border-success/30" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldWarningBoldDuotone size={16} className="text-muted-foreground" />
          Retention Assessment
        </CardTitle>
        <CardDescription className="text-xs">
          Review each data category based on applicable legal, statutory, contractual, audit,
          compliance, and business requirements. Data may be retained where retention is required
          or necessary for an applicable purpose — this is a manual, per-category decision; nothing
          is removed automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {alreadyProcessed ? (
          <ProcessedSummary request={request} rows={rows} processedByName={processedByName} employeeLinked={employeeLinked} />
        ) : (
          <AssessmentSummary
            counts={counts}
            complete={assessmentComplete}
            incompleteCount={incompleteCategories.length}
          />
        )}

        <div className="space-y-3">
          {ERASURE_CATEGORIES.map((cat) => {
            const meta = ERASURE_CATEGORY_META[cat.value];
            const retentionEntries = meta.sections.flatMap((s) => retentionBySection[s] ?? []);
            const row = rows[cat.value];
            return (
              <div key={cat.value} className="rounded-lg border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{cat.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.fields}</p>
                  </div>
                  {alreadyProcessed && (
                    <StatusBadge tone={row.decision === "retained" ? "neutral" : "success"} className="text-xs shrink-0">
                      {DECISION_LABELS[row.decision]}
                    </StatusBadge>
                  )}
                </div>

                <div className="text-xs">
                  <span className="text-muted-foreground">Retention / Basis: </span>
                  {retentionEntries.length > 0 ? (
                    <span className="text-foreground">
                      {retentionEntries.map((r) => r.retention_period).filter((v, i, a) => a.indexOf(v) === i).join("; ")}
                    </span>
                  ) : (
                    <span className="italic text-muted-foreground">Retention basis not specified</span>
                  )}
                </div>

                {!alreadyProcessed && (
                  <>
                    <RadioGroup
                      value={row.decision}
                      onValueChange={(v) => setDecision(cat.value, v as ErasureDecision)}
                      className="flex flex-wrap items-center gap-3 pt-1"
                    >
                      {(["eligible", "anonymized", "retained"] as ErasureDecision[]).map((d) => (
                        <div key={d} className="flex items-center gap-1.5" title={DECISION_HINTS[d]}>
                          <RadioGroupItem value={d} id={`${cat.value}-${d}`} />
                          <Label htmlFor={`${cat.value}-${d}`} className="text-xs font-normal cursor-pointer">
                            {DECISION_LABELS[d]}
                          </Label>
                          <InfoCircleBoldDuotone size={12} className="text-muted-foreground" />
                        </div>
                      ))}
                    </RadioGroup>
                    <Textarea
                      placeholder={BASIS_PLACEHOLDERS[row.decision]}
                      value={row.basis}
                      onChange={(e) => setBasis(cat.value, e.target.value)}
                      rows={2}
                      className="text-xs"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-2">
          {!alreadyProcessed && (
            <p className="text-xs text-muted-foreground">
              {assessmentComplete ? (
                <span className="inline-flex items-center gap-1 text-success-foreground">
                  <CheckCircleBoldDuotone size={13} /> Assessment complete
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-warning-foreground">
                  <ShieldWarningBoldDuotone size={13} /> Assessment incomplete — complete all applicable categories before processing.
                </span>
              )}
            </p>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {!alreadyProcessed && (
              <Button size="sm" variant="secondary" onClick={handleSaveAssessment} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save Assessment"}
              </Button>
            )}

            {!alreadyProcessed && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={!canProcess || processing} title={!canProcess ? "Complete and save the retention assessment before processing" : undefined}>
                    {processing ? "Processing…" : "Process Erasure"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Process Erasure Request?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3 text-sm text-foreground">
                        <p className="text-muted-foreground">Review the final assessment before continuing.</p>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-md border p-2">
                            <p className="text-lg font-semibold">{counts.eligible}</p>
                            <p className="text-xs text-muted-foreground">Eligible for removal</p>
                          </div>
                          <div className="rounded-md border p-2">
                            <p className="text-lg font-semibold">{counts.anonymized}</p>
                            <p className="text-xs text-muted-foreground">Anonymized</p>
                          </div>
                          <div className="rounded-md border p-2">
                            <p className="text-lg font-semibold">{counts.retained}</p>
                            <p className="text-xs text-muted-foreground">Retained</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Retained information may remain where required by applicable legal, statutory,
                          contractual, audit, compliance, or business requirements. This action updates the
                          employee's data according to the recorded assessment and cannot be undone or
                          repeated for this request.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleProcess}>Process Erasure</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClipboardListBoldDuotone size={12} />
          Audit recorded.{" "}
          <Link to="/admin/audit" className="text-primary underline">View Audit Log</Link>
        </div>
      </CardContent>
    </Card>
  );
}

function AssessmentSummary({
  counts,
  complete,
  incompleteCount,
}: {
  counts: { total: number; eligible: number; retained: number; anonymized: number };
  complete: boolean;
  incompleteCount: number;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs font-medium">{counts.total} Data Categories</p>
        {!complete && (
          <span className="text-xs text-warning-foreground">
            {incompleteCount} not yet reviewed
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-background border p-2">
          <p className="text-base font-semibold">{counts.eligible}</p>
          <p className="text-[11px] text-muted-foreground">Eligible for removal</p>
        </div>
        <div className="rounded-md bg-background border p-2">
          <p className="text-base font-semibold">{counts.anonymized}</p>
          <p className="text-[11px] text-muted-foreground">Anonymized</p>
        </div>
        <div className="rounded-md bg-background border p-2">
          <p className="text-base font-semibold">{counts.retained}</p>
          <p className="text-[11px] text-muted-foreground">Retained</p>
        </div>
      </div>
    </div>
  );
}

function ProcessedSummary({
  request,
  rows,
  processedByName,
  employeeLinked,
}: {
  request: DataRequest;
  rows: Record<ErasureCategory, Row>;
  processedByName: string | null;
  employeeLinked: boolean;
}) {
  const values = Object.values(rows);
  const removed = values.filter((r) => r.decision === "eligible").length;
  const anonymized = values.filter((r) => r.decision === "anonymized").length;
  const retained = values.filter((r) => r.decision === "retained").length;

  return (
    <div className="rounded-lg bg-success/10 border border-success/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircleBoldDuotone size={16} className="text-success shrink-0" />
        <p className="text-sm font-medium text-success-foreground">Erasure Processed</p>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
        <span>Processed by</span>
        <span className="text-foreground text-right">{processedByName ?? "—"}</span>
        <span>Processed at</span>
        <span className="text-foreground text-right">
          {request.erasure_processed_at ? new Date(request.erasure_processed_at).toLocaleString("en-IN") : "—"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center pt-1">
        <div className="rounded-md bg-background border p-2">
          <p className="text-base font-semibold">{removed}</p>
          <p className="text-[11px] text-muted-foreground">Removed</p>
        </div>
        <div className="rounded-md bg-background border p-2">
          <p className="text-base font-semibold">{anonymized}</p>
          <p className="text-[11px] text-muted-foreground">Anonymized</p>
        </div>
        <div className="rounded-md bg-background border p-2">
          <p className="text-base font-semibold">{retained}</p>
          <p className="text-[11px] text-muted-foreground">Retained</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground pt-1">
        {employeeLinked ? "Employee notification sent." : "Employee has no linked portal account — no notification was sent."}
      </p>
    </div>
  );
}
