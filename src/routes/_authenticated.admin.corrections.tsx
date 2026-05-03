import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CorrectionService, type CorrectionRequest } from "@/services/correction.service";
import { Badge } from "@/components/ui/badge";
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
    meta: [{ title: "Corrections Queue — DPDPA Admin" }],
  }),
  component: CorrectionsQueue,
});

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
    } catch (err) {
      toast.error("Failed to load correction requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRequests(); }, []);

  async function handleApprove(req: CorrectionRequest) {
    setProcessing(req.id);
    try {
      await CorrectionService.approve(req.id);
      toast.success(`Correction approved — ${req.field_name} updated.`);
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
      toast.success("Correction request rejected.");
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
    if (status === "pending")  return <Badge variant="outline" className="border-amber-500 text-amber-600">Pending</Badge>;
    if (status === "approved") return <Badge variant="outline" className="border-green-500 text-green-600">Approved</Badge>;
    return <Badge variant="outline" className="border-red-500 text-red-600">Rejected</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Corrections Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review employee data correction requests submitted after consent.
          </p>
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
                <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 text-[10px]">
                  {requests.filter((r) => r.status === "pending").length}
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No {filter === "all" ? "" : filter} correction requests found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <div
              key={req.id}
              className="border border-border rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              {/* Info */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(req.status)}
                  <span className="text-sm font-semibold truncate">
                    {req.employee
                      ? `${req.employee.first_name} ${req.employee.last_name}`
                      : "Unknown Employee"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {req.employee?.employee_code}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{req.field_name}</span>
                  {" · "}
                  <span className="line-through">{req.old_value || "—"}</span>
                  {" → "}
                  <span className="text-primary font-medium">{req.new_value}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(req.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  {req.comments && ` · "${req.comments}"`}
                </p>
                {req.attachment_url && (
                  <a
                    href={req.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  >
                    <PaperclipBoldDuotone size={12} />
                    View Proof Document
                  </a>
                )}
              </div>

              {/* Actions — only for pending */}
              {req.status === "pending" && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-8 border-green-500 text-green-600 hover:bg-green-50"
                    disabled={processing === req.id}
                    onClick={() => handleApprove(req)}
                  >
                    <CheckCircleBoldDuotone size={14} />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs h-8 border-red-400 text-red-500 hover:bg-red-50"
                    disabled={processing === req.id}
                    onClick={() => { setRejectTarget(req); setRejectComment(""); }}
                  >
                    <CloseCircleBoldDuotone size={14} />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectComment(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Correction Request</DialogTitle>
            <DialogDescription>
              Please provide a reason. The employee will see this message.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            {rejectTarget && (
              <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                <strong>{rejectTarget.field_name}</strong>: {rejectTarget.old_value || "—"} → {rejectTarget.new_value}
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
            <Button variant="outline" size="sm" onClick={() => { setRejectTarget(null); setRejectComment(""); }}>
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
