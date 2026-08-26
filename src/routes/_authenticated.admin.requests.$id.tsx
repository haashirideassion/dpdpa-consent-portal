import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { DsrService, parseErasureRequestReason, type DataRequest, type DataRequestMessage, type DsrStatus, type DsrPriority } from "@/services/dsr.service";
import { ErasureAssessmentPanel } from "@/components/ErasureAssessmentPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AltArrowLeftBoldDuotone, DangerTriangleBoldDuotone, InfoCircleBoldDuotone } from "solar-icon-set";

export const Route = createFileRoute("/_authenticated/admin/requests/$id")({
  component: RequestDetail,
});

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_review: "In Review",
  action_required: "Action Required",
  resolved: "Resolved",
  closed: "Closed",
  rejected: "Rejected",
};

const STATUS_TRANSITIONS: Record<DsrStatus, DsrStatus[]> = {
  new: ["in_review", "rejected"],
  in_review: ["action_required", "resolved"],
  action_required: ["in_review", "resolved"],
  resolved: ["closed"],
  closed: [],
  rejected: [],
};

const PRIORITY_TONES: Record<string, StatusTone> = {
  low: "info",
  medium: "warning",
  high: "danger",
};

const STATUS_TONES: Record<string, StatusTone> = {
  new: "warning",
  in_review: "info",
  action_required: "warning",
  resolved: "success",
  closed: "neutral",
  rejected: "danger",
};

const TYPE_LABELS: Record<string, string> = {
  access: "Access to Information (§11)",
  correction: "Correction & Erasure (§12)",
  erasure: "Erasure (§12)",
  portability: "Data Portability",
  nomination: "Nomination (§14)",
  grievance: "Grievance Redressal (§13)",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function isOverdue(r: DataRequest): boolean {
  if (!r.sla_due_at || ["resolved", "closed", "rejected"].includes(r.status)) return false;
  return new Date(r.sla_due_at) < new Date();
}

function RequestDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState<DataRequest | null>(null);
  const [messages, setMessages] = useState<DataRequestMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgBody, setMsgBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [newStatus, setNewStatus] = useState<DsrStatus | "">("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function load() {
    const [req, msgs] = await Promise.all([
      DsrService.getById(id),
      DsrService.getMessages(id),
    ]);
    setRequest(req);
    setMessages(msgs);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [id]);

  async function handleStatusUpdate() {
    if (!newStatus || !request) return;
    setUpdatingStatus(true);
    try {
      // Audit event is now written server-side by DsrService.updateStatus
      // itself (see Audit Logs gap report — logging only from this route
      // meant any other caller silently produced no audit row).
      await DsrService.updateStatus(id, newStatus as DsrStatus, resolutionNote || undefined);
      toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
      setNewStatus("");
      setResolutionNote("");
      await load();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSendMessage() {
    if (!msgBody.trim()) return;
    setSendingMsg(true);
    try {
      await DsrService.addMessage(id, msgBody.trim(), isInternal);
      setMsgBody("");
      setIsInternal(false);
      await load();
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSendingMsg(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        Request not found.{" "}
        <Link to="/admin/requests" className="text-primary underline">Back to queue</Link>
      </div>
    );
  }

  const overdue = isOverdue(request);
  const transitions = STATUS_TRANSITIONS[request.status] ?? [];
  const isErasure = request.request_type === "erasure";
  const { reasonLabel } = isErasure ? parseErasureRequestReason(request.description) : { reasonLabel: null };

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        to="/admin/requests"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <AltArrowLeftBoldDuotone size={14} />
        Back to queue
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {overdue && <DangerTriangleBoldDuotone size={18} className="text-destructive" />}
            {isErasure ? "Erasure Request" : (request.subject || "(no subject)")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {TYPE_LABELS[request.request_type] ?? request.request_type}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge tone={STATUS_TONES[request.status] ?? "neutral"}>
            {STATUS_LABELS[request.status] ?? request.status.replace("_", " ")}
          </StatusBadge>
          <StatusBadge tone={PRIORITY_TONES[request.priority] ?? "neutral"}>
            {request.priority} priority
          </StatusBadge>
          {overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
        </div>
      </div>

      {isErasure && (
        <Card>
          <CardContent className="py-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Employee</p>
                <p className="font-medium">{request.employee_name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Employee Code</p>
                <p className="font-medium">{request.employee_code ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Request Reason</p>
                <p className="font-medium">{reasonLabel ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="font-medium">{formatDate(request.created_at)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2">
              <InfoCircleBoldDuotone size={14} className="text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                An erasure request does not automatically remove all information. Data required for
                legal, statutory, contractual, audit, compliance, or other applicable retention
                requirements may need to be retained.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: details + messages */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Request Details</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{request.description || "No description provided."}</p>
              {request.ai_summary && (
                <div className="mt-3 rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <p className="text-xs font-semibold text-primary mb-1">AI Summary (suggested)</p>
                  <p className="text-sm">{request.ai_summary}</p>
                </div>
              )}
              {request.resolution_note && (
                <div className="mt-3 rounded-lg bg-success/5 border border-success/20 p-3">
                  <p className="text-xs font-semibold text-success mb-1">Resolution Note</p>
                  <p className="text-sm">{request.resolution_note}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Retention Assessment — erasure requests only */}
          {request.request_type === "erasure" && (
            <ErasureAssessmentPanel request={request} onProcessed={load} />
          )}

          {/* Messages / thread */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Messages & Updates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg p-3 ${
                      m.is_internal
                        ? "bg-warning/5 border border-warning/25"
                        : "bg-muted/40 border border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">
                        {m.author_id ? m.author_id.slice(0, 8) + "…" : "System"}
                        {m.is_internal && (
                          <span className="ml-2 text-warning-foreground text-[10px] font-semibold uppercase">
                            Internal
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(m.created_at)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))
              )}

              <Separator />

              {/* Add message */}
              <div className="space-y-2">
                <Textarea
                  placeholder="Add a message or update…"
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="internal"
                      checked={isInternal}
                      onCheckedChange={(v) => setIsInternal(!!v)}
                    />
                    <Label htmlFor="internal" className="text-xs">
                      Internal note (DPO only)
                    </Label>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSendMessage}
                    disabled={sendingMsg || !msgBody.trim()}
                  >
                    {sendingMsg ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: metadata + status actions */}
        <div className="space-y-4">
          {/* Metadata */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Request Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Raised by</span>
                <span>{request.raised_by?.slice(0, 8) ?? "—"}…</span>
              </div>
              {request.employee_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee</span>
                  <span>{request.employee_name}</span>
                </div>
              )}
              {request.employee_code && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Code</span>
                  <span>{request.employee_code}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Raised on</span>
                <span>{formatDate(request.created_at)}</span>
              </div>
              {request.sla_due_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SLA Due</span>
                  <span className={overdue ? "text-destructive font-medium" : ""}>
                    {formatDate(request.sla_due_at)}
                    {overdue && " ⚠ Overdue"}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status update */}
          {transitions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Update Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as DsrStatus)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Choose next status…" />
                  </SelectTrigger>
                  <SelectContent>
                    {transitions.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(newStatus === "resolved" || newStatus === "closed" || newStatus === "rejected") && (
                  <Textarea
                    placeholder="Resolution note (shown to data principal)…"
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                )}
                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleStatusUpdate}
                  disabled={!newStatus || updatingStatus}
                >
                  {updatingStatus ? "Updating…" : "Update Status"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Priority update */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={request.priority}
                onValueChange={async (v) => {
                  try {
                    await DsrService.updatePriority(id, v as DsrPriority);
                    await load();
                    toast.success("Priority updated");
                  } catch {
                    toast.error("Failed to update priority");
                  }
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
