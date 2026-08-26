import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CorrectionService, resolveUiFieldKey, type CorrectionRequest } from "@/services/correction.service";
import { MaskedFieldValue } from "@/components/MaskedFieldValue";
import { DpdpaBadge } from "@/components/DpdpaBadge";
import { isSensitiveField, maskSensitiveValueForDisplay } from "@/lib/dpdpa";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircleBoldDuotone, CloseCircleBoldDuotone, PaperclipBoldDuotone } from "solar-icon-set";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/corrections")({
  head: () => ({
    meta: [{ title: "Updates Queue — DPDPA Admin" }],
  }),
  component: CorrectionsQueue,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

type SectionType = "field" | "section_edit" | "section_add" | "section_delete" | "section_legacy";

function getSectionType(req: CorrectionRequest): SectionType {
  if (req.field_name === "__section_edit__") return "section_edit";
  if (req.field_name === "__section_add__") return "section_add";
  if (req.field_name === "__section_delete__") return "section_delete";
  if (req.field_name === "__section__") return "section_legacy";
  return "field";
}

/** Parse the JSON stored in old_value / new_value for section records */
function parseSectionJson(raw: string | null): { section?: string; recordId?: string; values?: Record<string, any> } {
  try { return JSON.parse(raw ?? "{}"); } catch { return {}; }
}

/** Render a compact diff of old → new values for a section record correction */
function SectionRecordDiff({ req }: { req: CorrectionRequest }) {
  const old = parseSectionJson(req.old_value);
  const next = parseSectionJson(req.new_value);
  const sectionLabel = old.section ?? next.section ?? req.table_name ?? "Section";
  const oldVals = old.values ?? {};
  const newVals = next.values ?? {};

  const changedKeys = Object.keys(newVals).filter(
    (k) => String(newVals[k] ?? "").trim() !== "" && String(newVals[k]) !== String(oldVals[k] ?? "")
  );
  const unchangedKeys = Object.keys(newVals).filter(
    (k) => String(newVals[k] ?? "").trim() !== "" && String(newVals[k]) === String(oldVals[k] ?? "")
  );

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">
        <span className="font-medium text-foreground">{sectionLabel}</span>
        {old.recordId ? " · Edit existing record" : " · Add new record"}
        {changedKeys.length > 0 && (
          <span> · <span className="text-primary">{changedKeys.length} field{changedKeys.length !== 1 ? "s" : ""} changed</span></span>
        )}
      </p>
      {changedKeys.length > 0 && (
        <div className="space-y-0.5">
          {changedKeys.map((k) => (
            <p key={k} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground capitalize">{k.replace(/_/g, " ")}</span>
              {": "}
              {oldVals[k] ? (
                <>
                  <span className="line-through">
                    <MaskedFieldValue fieldKey={k} value={String(oldVals[k])} isAdmin employeeId={req.employee_id} />
                  </span>
                  {" → "}
                </>
              ) : null}
              <span className="text-primary font-medium">
                <MaskedFieldValue fieldKey={k} value={String(newVals[k])} isAdmin employeeId={req.employee_id} />
              </span>
            </p>
          ))}
        </div>
      )}
      {changedKeys.length === 0 && unchangedKeys.length > 0 && (
        <p className="text-xs text-muted-foreground italic">No changes detected vs original values.</p>
      )}
    </div>
  );
}

/** Render a section-add correction (all new values) */
function SectionAddDiff({ req }: { req: CorrectionRequest }) {
  const next = parseSectionJson(req.new_value);
  const sectionLabel = next.section ?? req.table_name ?? "Section";
  const vals = next.values ?? {};
  const filled = Object.entries(vals).filter(([, v]) => String(v ?? "").trim() !== "");

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">
        <span className="font-medium text-foreground">{sectionLabel}</span>
        {" · Add new record"}
      </p>
      <div className="space-y-0.5">
        {filled.map(([k, v]) => (
          <p key={k} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground capitalize">{k.replace(/_/g, " ")}</span>
            {": "}
            <span className="text-primary font-medium">
              <MaskedFieldValue fieldKey={k} value={String(v)} isAdmin employeeId={req.employee_id} />
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

/** Render a section-delete request — shows the record to be deleted */
function SectionDeleteDisplay({ req }: { req: CorrectionRequest }) {
  const old = parseSectionJson(req.old_value);
  const sectionLabel = old.section ?? req.table_name ?? "Section";
  const vals = old.values ?? {};
  const filled = Object.entries(vals).filter(([, v]) => String(v ?? "").trim() !== "");

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">
        <span className="font-medium text-foreground">{sectionLabel}</span>
        {" · "}
        <span className="text-destructive font-medium">Delete record</span>
      </p>
      <div className="space-y-0.5">
        {filled.map(([k, v]) => (
          <p key={k} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground capitalize">{k.replace(/_/g, " ")}</span>
            {": "}
            <span className="line-through text-muted-foreground/70">
              <MaskedFieldValue fieldKey={k} value={String(v)} isAdmin employeeId={req.employee_id} />
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function CorrectionsQueue() {
  const [requests, setRequests] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  // Reject dialog state
  const [rejectTarget, setRejectTarget] = useState<CorrectionRequest | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);

  async function fetchRequests() {
    try {
      const data = await CorrectionService.getAllRequests();
      setRequests(data);
    } catch {
      toast.error("Failed to load update requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRequests(); }, []);

  async function handleApprove(req: CorrectionRequest) {
    setProcessing(req.id);
    try {
      await CorrectionService.approve(req.id);
      const type = getSectionType(req);
      if (type === "section_edit" || type === "section_legacy") {
        const parsed = parseSectionJson(req.old_value);
        const label = parsed.section ?? req.table_name ?? "Section";
        toast.success(`${label} update approved — record updated.`);
      } else if (type === "section_add") {
        const parsed = parseSectionJson(req.new_value);
        const label = parsed.section ?? req.table_name ?? "Section";
        toast.success(`${label} update approved — new record added.`);
      } else if (type === "section_delete") {
        const parsed = parseSectionJson(req.old_value);
        const label = parsed.section ?? req.table_name ?? "Section";
        toast.success(`${label} delete approved — record removed.`);
      } else {
        toast.success(`Update approved — ${req.field_name} updated.`);
      }
      fetchRequests();
    } catch (err: any) {
      toast.error(err?.message ?? "Approval failed.");
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!rejectComment.trim()) {
      toast.error("A reason is required when rejecting a correction.");
      return;
    }
    setProcessing(rejectTarget.id);
    try {
      await CorrectionService.reject(rejectTarget.id, rejectComment.trim());
      toast.success("Update request rejected.");
      setRejectTarget(null);
      setRejectComment("");
      fetchRequests();
    } catch (err: any) {
      toast.error(err?.message ?? "Rejection failed.");
    } finally {
      setProcessing(null);
    }
  }

  const filtered = requests.filter((r) => filter === "all" || r.status === filter);

  const statusBadge = (status: string) => {
    if (status === "pending")  return <StatusBadge tone="warning" className="text-xs">Pending</StatusBadge>;
    if (status === "approved") return <StatusBadge tone="success" className="text-xs">Approved</StatusBadge>;
    return <StatusBadge tone="danger" className="text-xs">Rejected</StatusBadge>;
  };

  const typeBadge = (req: CorrectionRequest) => {
    const type = getSectionType(req);
    if (type === "section_edit") return <StatusBadge tone="info" className="text-[10px]">Section Edit</StatusBadge>;
    if (type === "section_add") return <StatusBadge tone="info" className="text-[10px]">Section Add</StatusBadge>;
    if (type === "section_delete") return <StatusBadge tone="danger" className="text-[10px]">Section Delete</StatusBadge>;
    if (type === "section_legacy") return <StatusBadge tone="neutral" className="text-[10px]">Section</StatusBadge>;
    return null;
  };

  /** Reject dialog preview text */
  function rejectPreviewText(req: CorrectionRequest): string {
    const type = getSectionType(req);
    if (type === "section_edit" || type === "section_add") {
      const parsed = parseSectionJson(type === "section_edit" ? req.old_value : req.new_value);
      return `${parsed.section ?? req.table_name ?? "Section"} update request`;
    }
    if (type === "section_delete") {
      const parsed = parseSectionJson(req.old_value);
      return `${parsed.section ?? req.table_name ?? "Section"} — delete record request`;
    }
    if (type === "section_legacy") {
      try { return `${JSON.parse(req.old_value ?? "{}").section ?? "Section"} — ${req.new_value}`; } catch { return req.new_value ?? ""; }
    }
    // Field-level correction: mask old/new values per the canonical
    // sensitivity policy — this is a plain-text preview (no reveal toggle),
    // so sensitive values stay masked here even for the admin who can
    // reveal them in the list view below.
    const uiKey = resolveUiFieldKey(req.table_name, req.field_name);
    const oldDisplay = maskSensitiveValueForDisplay(uiKey, req.old_value);
    const newDisplay = maskSensitiveValueForDisplay(uiKey, req.new_value);
    return `${req.field_name}: ${oldDisplay} → ${newDisplay}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h1>Updates Queue</h1>
          <p>Review employee data update requests submitted after consent.</p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="capitalize text-xs h-7"
              onClick={() => setFilter(f)}
            >
              {f}
              {f === "pending" && requests.filter((r) => r.status === "pending").length > 0 && (
                <span className="ml-1.5 bg-warning text-warning-foreground rounded-full px-1.5 text-[10px] font-semibold">
                  {requests.filter((r) => r.status === "pending").length}
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CheckCircleBoldDuotone size={36} />}
          title={filter === "pending" ? "No pending updates" : `No ${filter === "all" ? "" : filter} updates`}
          description={
            filter === "pending" ? "All update requests have been reviewed." : "No records match this filter."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => {
            const type = getSectionType(req);
            return (
              <div
                key={req.id}
                className="border border-border rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-4 shadow-sm bg-card"
              >
                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  {/* Employee + status badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {statusBadge(req.status)}
                    {typeBadge(req)}
                    <span className="text-sm font-semibold truncate">
                      {req.employee
                        ? `${req.employee.first_name} ${req.employee.last_name}`
                        : "Unknown Employee"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {req.employee?.employee_code}
                    </span>
                  </div>

                  {/* Content diff */}
                  {type === "section_edit"   && <SectionRecordDiff req={req} />}
                  {type === "section_add"    && <SectionAddDiff req={req} />}
                  {type === "section_delete" && <SectionDeleteDisplay req={req} />}
                  {type === "section_legacy" && (() => {
                    let sectionLabel = req.table_name ?? "Section";
                    let entryCount = 0;
                    try {
                      const parsed = JSON.parse(req.old_value ?? "{}");
                      sectionLabel = parsed.section ?? sectionLabel;
                      entryCount = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
                    } catch {}
                    return (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{sectionLabel}</span>
                        {" · "}{entryCount} current record{entryCount !== 1 ? "s" : ""}
                        {" · "}<span className="text-primary font-medium">{req.new_value}</span>
                      </p>
                    );
                  })()}
                  {type === "field" && (() => {
                    const uiKey = resolveUiFieldKey(req.table_name, req.field_name);
                    return (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{req.field_name}</span>
                        {isSensitiveField(uiKey) && (
                          <span className="ml-1.5 inline-block align-middle"><DpdpaBadge /></span>
                        )}
                        {" · "}
                        {req.old_value ? (
                          <>
                            <span className="line-through">
                              <MaskedFieldValue
                                fieldKey={uiKey}
                                value={req.old_value}
                                isAdmin
                                employeeId={req.employee_id}
                                hasValue={!!req.old_value}
                                onReveal={() => CorrectionService.decryptValue(req.id, "old")}
                              />
                            </span>
                            {" → "}
                          </>
                        ) : null}
                        <span className="text-primary font-medium">
                          <MaskedFieldValue
                            fieldKey={uiKey}
                            value={req.new_value}
                            isAdmin
                            employeeId={req.employee_id}
                            hasValue={!!req.new_value}
                            onReveal={() => CorrectionService.decryptValue(req.id, "new")}
                          />
                        </span>
                      </p>
                    );
                  })()}

                  {/* Meta */}
                  <p className="text-xs text-muted-foreground">
                    Submitted {new Date(req.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {req.comments && ` · "${req.comments}"`}
                  </p>

                  {req.attachment_url && (
                    <a
                      href={req.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <PaperclipBoldDuotone size={12} />
                      View Proof Document
                    </a>
                  )}

                  {/* Section updates are auto-applied on approval */}
                  {(type === "section_edit" || type === "section_add") && req.status === "pending" && (
                    <p className="text-[11px] text-muted-foreground bg-muted/60 rounded px-2 py-1 mt-1">
                      Approving will automatically apply this update to the employee record.
                    </p>
                  )}
                  {type === "section_delete" && req.status === "pending" && (
                    <p className="text-[11px] text-destructive/70 bg-destructive/5 rounded px-2 py-1 mt-1">
                      Approving will permanently delete this record from the employee profile.
                    </p>
                  )}
                </div>

                {/* Actions — pending only */}
                {req.status === "pending" && (
                  <div className="flex items-center gap-2 shrink-0 sm:pt-0.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-8 badge-success border"
                      disabled={processing === req.id}
                      onClick={() => handleApprove(req)}
                    >
                      <CheckCircleBoldDuotone size={14} />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs h-8 badge-danger border"
                      disabled={processing === req.id}
                      onClick={() => { setRejectTarget(req); setRejectComment(""); }}
                    >
                      <CloseCircleBoldDuotone size={14} />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectComment(""); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Update Request</DialogTitle>
            <DialogDescription>
              Please provide a reason. The employee will see this message.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            {rejectTarget && (
              <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                {rejectPreviewText(rejectTarget)}
              </p>
            )}
            <Textarea
              placeholder="Reason for rejection (required)…"
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setRejectTarget(null); setRejectComment(""); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectComment.trim() || processing === rejectTarget?.id}
            >
              {processing === rejectTarget?.id ? "Rejecting…" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
