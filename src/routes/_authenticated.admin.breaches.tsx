import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BreachService, type BreachIncident, type BreachSeverity, type BreachStatus } from "@/services/breach.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { DangerTriangleBoldDuotone, AddSquareBoldDuotone, CheckCircleBoldDuotone } from "solar-icon-set";
import { breachIncidentSchema, type BreachIncidentFormValues } from "@/lib/validation/breach";

export const Route = createFileRoute("/_authenticated/admin/breaches")({
  head: () => ({ meta: [{ title: "Breach Management — DPDPA Portal" }] }),
  component: BreachesPage,
});

const SEVERITY_COLORS: Record<BreachSeverity, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<BreachStatus, string> = {
  reported: "bg-yellow-100 text-yellow-700",
  investigating: "bg-blue-100 text-blue-700",
  contained: "bg-purple-100 text-purple-700",
  notified: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<BreachStatus, string> = {
  reported: "Reported",
  investigating: "Investigating",
  contained: "Contained",
  notified: "Notified",
  closed: "Closed",
};

const EMPTY_FORM: BreachIncidentFormValues = {
  title: "",
  description: "",
  severity: "medium" as BreachSeverity,
  status: "reported" as BreachStatus,
  discovered_at: new Date().toISOString().slice(0, 16),
  affected_count: "",
  affected_data_categories: "",
  root_cause: "",
  remediation: "",
};

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function BreachesPage() {
  const [incidents, setIncidents] = useState<BreachIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showDetail, setShowDetail] = useState<BreachIncident | null>(null);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);

  const form = useForm<BreachIncidentFormValues>({
    resolver: zodResolver(breachIncidentSchema),
    defaultValues: EMPTY_FORM,
  });

  async function load(): Promise<BreachIncident[]> {
    try {
      const data = await BreachService.getAll();
      setIncidents(data);
      return data;
    } catch {
      toast.error("Failed to load breach incidents");
      return [];
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function onSubmit(values: BreachIncidentFormValues) {
    setSaving(true);
    try {
      await BreachService.create({
        title: values.title.trim(),
        description: values.description || null,
        severity: values.severity,
        status: values.status,
        discovered_at: new Date(values.discovered_at).toISOString(),
        affected_count: values.affected_count ? parseInt(values.affected_count) : null,
        affected_data_categories: values.affected_data_categories
          ? values.affected_data_categories.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        root_cause: values.root_cause || null,
        remediation: values.remediation || null,
        board_notified_at: null,
        principals_notified_at: null,
        owner_user_id: null,
      });
      toast.success("Breach incident logged.");
      setShowNew(false);
      form.reset(EMPTY_FORM);
      await load();
    } catch {
      toast.error("Failed to log breach.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusUpdate(incident: BreachIncident, newStatus: BreachStatus) {
    setUpdating(true);
    try {
      await BreachService.update(incident.id, { status: newStatus });
      toast.success("Status updated");
      setShowDetail(null);
      await load();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdating(false);
    }
  }

  async function handleBoardNotify(id: string) {
    setUpdating(true);
    try {
      await BreachService.recordBoardNotification(id);
      toast.success("Board notification recorded");
      const fresh = await load();
      setShowDetail(fresh.find((i) => i.id === id) ?? null);
    } catch {
      toast.error("Failed to record notification");
    } finally {
      setUpdating(false);
    }
  }

  async function handlePrincipalNotify(id: string) {
    setUpdating(true);
    try {
      await BreachService.recordPrincipalNotification(id);
      toast.success("Principal notification recorded");
      await load();
    } catch {
      toast.error("Failed to record notification");
    } finally {
      setUpdating(false);
    }
  }

  const openCount = incidents.filter((i) => !["notified", "closed"].includes(i.status)).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <DangerTriangleBoldDuotone size={20} />
            Breach Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Log and manage personal data breach incidents per DPDPA §8(6).
          </p>
        </div>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <AddSquareBoldDuotone size={14} className="mr-1.5" />
          Log Breach
        </Button>
      </div>

      {openCount > 0 && (
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <DangerTriangleBoldDuotone size={16} className="text-red-600 shrink-0" />
            <span>
              <strong>{openCount}</strong> open breach incident{openCount !== 1 ? "s" : ""} require action or notification.
            </span>
          </CardContent>
        </Card>
      )}

      {incidents.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No breach incidents logged. Log your first incident above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => (
            <Card
              key={incident.id}
              className={`cursor-pointer hover:border-primary/50 transition-colors ${
                !["notified", "closed"].includes(incident.status) ? "border-yellow-200" : ""
              }`}
              onClick={() => setShowDetail(incident)}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{incident.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[incident.severity]}`}>
                        {incident.severity}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[incident.status]}`}>
                        {STATUS_LABELS[incident.status]}
                      </span>
                    </div>
                    {incident.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {incident.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Discovered {daysAgo(incident.discovered_at)}d ago</span>
                      {incident.affected_count !== null && (
                        <span>{incident.affected_count} affected</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0 space-y-1">
                    <div>{incident.board_notified_at ? "✓ Board notified" : "Board pending"}</div>
                    <div>{incident.principals_notified_at ? "✓ Principals notified" : "Principals pending"}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New incident dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Breach Incident</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <div className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Title *</FormLabel>
                    <FormControl>
                      <Input placeholder="Brief title of the incident" className="text-sm" {...field} />
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
                    <FormLabel className="text-sm">Description</FormLabel>
                    <FormControl>
                      <Textarea rows={3} className="text-sm" placeholder="Describe what happened" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="severity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Severity</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {["low","medium","high","critical"].map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="discovered_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Discovered At</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" className="text-sm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="affected_data_categories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Affected Data Categories (comma-separated)</FormLabel>
                    <FormControl>
                      <Input placeholder="Email, PAN, Aadhaar" className="text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="affected_count"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Number of Affected Data Principals</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0" className="text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="root_cause"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Root Cause</FormLabel>
                    <FormControl>
                      <Textarea rows={2} className="text-sm" placeholder="Known or suspected cause" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="remediation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Remediation Steps</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        className="text-sm"
                        placeholder="Steps taken or planned to contain the breach"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={saving}>{saving ? "Logging…" : "Log Incident"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      {showDetail && (
        <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{showDetail.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 text-sm">
              <div className="flex gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SEVERITY_COLORS[showDetail.severity]}`}>
                  {showDetail.severity}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[showDetail.status]}`}>
                  {STATUS_LABELS[showDetail.status]}
                </span>
              </div>
              {showDetail.description && <p className="text-muted-foreground">{showDetail.description}</p>}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Discovered:</span>{" "}
                  {new Date(showDetail.discovered_at).toLocaleDateString("en-IN")}
                </div>
                {showDetail.affected_count !== null && (
                  <div>
                    <span className="text-muted-foreground">Affected:</span>{" "}
                    {showDetail.affected_count} principals
                  </div>
                )}
              </div>

              {showDetail.affected_data_categories.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Affected Data:</p>
                  <div className="flex flex-wrap gap-1">
                    {showDetail.affected_data_categories.map((c) => (
                      <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {showDetail.root_cause && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Root Cause:</p>
                  <p>{showDetail.root_cause}</p>
                </div>
              )}
              {showDetail.remediation && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Remediation:</p>
                  <p>{showDetail.remediation}</p>
                </div>
              )}

              <Separator />

              {/* Notification checklist */}
              <div>
                <p className="text-xs font-semibold mb-2">Notification Checklist</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Data Protection Board</span>
                    {showDetail.board_notified_at ? (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircleBoldDuotone size={12} />
                        {new Date(showDetail.board_notified_at).toLocaleDateString("en-IN")}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() => handleBoardNotify(showDetail.id)}
                        disabled={updating}
                      >
                        Mark Notified
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs">Affected Data Principals</span>
                    {showDetail.principals_notified_at ? (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircleBoldDuotone size={12} />
                        {new Date(showDetail.principals_notified_at).toLocaleDateString("en-IN")}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
                        onClick={() => handlePrincipalNotify(showDetail.id)}
                        disabled={updating}
                      >
                        Mark Notified
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Status update */}
              {!["closed"].includes(showDetail.status) && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold">Update Status</p>
                  <div className="flex gap-2 flex-wrap">
                    {(["reported","investigating","contained","notified","closed"] as BreachStatus[])
                      .filter((s) => s !== showDetail.status)
                      .map((s) => (
                        <Button
                          key={s}
                          variant="outline"
                          size="sm"
                          className="text-xs capitalize"
                          onClick={() => handleStatusUpdate(showDetail, s)}
                          disabled={updating}
                        >
                          {STATUS_LABELS[s]}
                        </Button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
