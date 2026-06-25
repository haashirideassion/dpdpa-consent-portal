import { useState, useEffect } from "react";
import { DsrService, type DataRequest, type DsrType } from "@/services/dsr.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AddSquareBoldDuotone, DangerTriangleBoldDuotone } from "solar-icon-set";

interface Props {
  employeeId: string;
  userId: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Submitted",
  in_review: "In Review",
  action_required: "Action Required",
  resolved: "Resolved",
  closed: "Closed",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-yellow-100 text-yellow-700",
  in_review: "bg-blue-100 text-blue-700",
  action_required: "bg-orange-100 text-orange-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
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

export function MyRequestsView({ employeeId, userId }: Props) {
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ type: "" as DsrType | "", subject: "", description: "" });
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const data = await DsrService.getByUser(userId).catch(() => []);
    setRequests(data);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [userId]);

  async function handleSubmit() {
    if (!form.type || !form.subject.trim() || !form.description.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      await DsrService.create({
        request_type: form.type as DsrType,
        subject: form.subject.trim(),
        description: form.description.trim(),
        employee_id: employeeId,
      });
      toast.success("Your request has been submitted. The DPO will respond within 30 days.");
      setShowDialog(false);
      setForm({ type: "", subject: "", description: "" });
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
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You have not raised any data requests yet.
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
                      <div className="mt-2 rounded-lg bg-green-50 border border-green-200 p-2">
                        <p className="text-xs text-green-700 font-medium">DPO Response:</p>
                        <p className="text-xs mt-0.5">{r.resolution_note}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] ?? ""}`}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
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

      {/* New request dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Raise a Data Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Request Type *</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as DsrType }))}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select type of request…" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div>
                        <div className="font-medium">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.desc}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Subject *</Label>
              <Input
                placeholder="Brief subject of your request…"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Description *</Label>
              <Textarea
                placeholder="Describe your request in detail…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={4}
                className="text-sm"
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <DangerTriangleBoldDuotone size={12} className="inline mr-1" />
                Your request will be reviewed by the Data Protection Officer and responded to within 30 days.
                You will be notified when the status changes.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
