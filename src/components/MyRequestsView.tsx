import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DsrService, type DataRequest, type DsrType } from "@/services/dsr.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { toast } from "sonner";
import { AddSquareBoldDuotone, DangerTriangleBoldDuotone, ClipboardListBoldDuotone } from "solar-icon-set";
import { dsrRequestSchema, type DsrRequestFormValues } from "@/lib/validation/dsr";

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

export function MyRequestsView({ employeeId, userId }: Props) {
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<DsrRequestFormValues>({
    resolver: zodResolver(dsrRequestSchema),
    defaultValues: EMPTY_FORM,
  });

  async function load() {
    const data = await DsrService.getByUser(userId).catch(() => []);
    setRequests(data);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [userId]);

  async function onSubmit(values: DsrRequestFormValues) {
    setSubmitting(true);
    try {
      await DsrService.create({
        request_type: values.type as DsrType,
        subject: values.subject.trim(),
        description: values.description.trim(),
        employee_id: employeeId,
      });
      toast.success("Your request has been submitted. The DPO will respond within 30 days.");
      setShowDialog(false);
      form.reset(EMPTY_FORM);
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

      {/* New request dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
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
                          <SelectItem key={t.value} value={t.value}>
                            <div>
                              <div className="font-medium">{t.label}</div>
                              <div className="text-xs text-muted-foreground">{t.desc}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
