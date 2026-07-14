import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RiskService, type RiskAssessment, type RiskStatus } from "@/services/risk.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { DangerTriangleBoldDuotone, AddSquareBoldDuotone } from "solar-icon-set";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import { riskAssessmentSchema, type RiskAssessmentFormValues } from "@/lib/validation/risk";

export const Route = createFileRoute("/_authenticated/admin/risks")({
  head: () => ({ meta: [{ title: "Risk & Assessments — DPDPA Portal" }] }),
  component: RisksPage,
});

const STATUS_LABELS: Record<RiskStatus, string> = {
  open: "Open",
  mitigated: "Mitigated",
  accepted: "Accepted",
};

const STATUS_COLORS: Record<RiskStatus, string> = {
  open: "bg-red-100 text-red-700",
  mitigated: "bg-green-100 text-green-700",
  accepted: "bg-blue-100 text-blue-700",
};

const EMPTY_FORM: RiskAssessmentFormValues = {
  title: "",
  description: "",
  likelihood: "3",
  impact: "3",
  mitigation: "",
  status: "open" as RiskStatus,
};

function RiskHeatmapDot({ cx, cy, payload }: any) {
  const color =
    payload.risk_score >= 20
      ? "#ef4444"
      : payload.risk_score >= 12
      ? "#f97316"
      : payload.risk_score >= 6
      ? "#eab308"
      : "#22c55e";
  return <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.8} />;
}

function RisksPage() {
  const [risks, setRisks] = useState<RiskAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<RiskAssessmentFormValues>({
    resolver: zodResolver(riskAssessmentSchema),
    defaultValues: EMPTY_FORM,
  });

  async function load() {
    try {
      const data = await RiskService.getAll();
      setRisks(data);
    } catch {
      toast.error("Failed to load risk assessments");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function onSubmit(values: RiskAssessmentFormValues) {
    setSaving(true);
    try {
      await RiskService.create({
        title: values.title.trim(),
        description: values.description || null,
        processing_activity_id: null,
        likelihood: parseInt(values.likelihood),
        impact: parseInt(values.impact),
        mitigation: values.mitigation || null,
        status: values.status,
        owner_user_id: null,
        reviewed_at: null,
      });
      toast.success("Risk assessment added.");
      setShowDialog(false);
      form.reset(EMPTY_FORM);
      await load();
    } catch {
      toast.error("Failed to save risk.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: RiskStatus) {
    try {
      await RiskService.update(id, { status });
      setRisks((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update");
    }
  }

  const high = risks.filter((r) => r.status === "open" && r.risk_score >= 12).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const scatterData = risks.map((r) => ({
    x: r.likelihood,
    y: r.impact,
    risk_score: r.risk_score,
    title: r.title,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <DangerTriangleBoldDuotone size={20} />
            Risk & Assessments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            DPIA risk register — identify, assess, and mitigate data protection risks.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowDialog(true)}>
          <AddSquareBoldDuotone size={14} className="mr-1.5" />
          Add Risk
        </Button>
      </div>

      {high > 0 && (
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <DangerTriangleBoldDuotone size={16} className="text-red-600 shrink-0" />
            <span>
              <strong>{high}</strong> high-risk assessment{high !== 1 ? "s" : ""} require immediate attention.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk Matrix */}
        {risks.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Risk Matrix (Likelihood × Impact)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0.5, 5.5]}
                    ticks={[1,2,3,4,5]}
                    label={{ value: "Likelihood", position: "insideBottom", offset: -5, fontSize: 11 }}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[0.5, 5.5]}
                    ticks={[1,2,3,4,5]}
                    label={{ value: "Impact", angle: -90, position: "insideLeft", fontSize: 11 }}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(v: any, name: string) => [v, name]}
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-background border rounded p-2 text-xs shadow">
                          <p className="font-medium">{d?.title}</p>
                          <p>Score: {d?.risk_score}</p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} shape={<RiskHeatmapDot />} />
                </ScatterChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Low (1–5)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" /> Medium (6–11)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> High (12–19)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Critical (20+)</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Risk Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                { label: "Total", value: risks.length },
                { label: "Open", value: risks.filter((r) => r.status === "open").length },
                { label: "Mitigated", value: risks.filter((r) => r.status === "mitigated").length },
                { label: "High / Critical", value: risks.filter((r) => r.risk_score >= 12).length },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-muted/40 py-3">
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk list */}
      {risks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No risk assessments yet. Add your first risk above.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {risks.map((r) => (
            <Card key={r.id} className={r.status === "open" && r.risk_score >= 12 ? "border-red-200" : ""}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{r.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RiskService.riskColor(r.risk_score)}`}>
                        Score {r.risk_score} · {RiskService.riskLevel(r.risk_score)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status]}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{r.description}</p>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      Likelihood: {r.likelihood} · Impact: {r.impact}
                    </div>
                    {r.mitigation && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Mitigation: {r.mitigation}
                      </p>
                    )}
                  </div>
                  <Select
                    value={r.status}
                    onValueChange={(v) => handleStatusChange(r.id, v as RiskStatus)}
                  >
                    <SelectTrigger className="h-7 text-xs w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Risk Assessment</DialogTitle>
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
                      <Input
                        placeholder="e.g. Unauthorised access to employee PAN data"
                        className="text-sm"
                        {...field}
                      />
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
                      <Textarea rows={2} className="text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="likelihood"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Likelihood (1–5)</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[1,2,3,4,5].map((n) => (
                            <SelectItem key={n} value={String(n)}>{n} — {["Very Low","Low","Medium","High","Very High"][n-1]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="impact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">Impact (1–5)</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[1,2,3,4,5].map((n) => (
                            <SelectItem key={n} value={String(n)}>{n} — {["Negligible","Minor","Moderate","Major","Severe"][n-1]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="text-sm font-medium">
                Risk Score: {parseInt(form.watch("likelihood")) * parseInt(form.watch("impact"))} (
                {RiskService.riskLevel(parseInt(form.watch("likelihood")) * parseInt(form.watch("impact")))})
              </div>
              <FormField
                control={form.control}
                name="mitigation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Mitigation Plan</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        className="text-sm"
                        placeholder="Describe controls or actions to mitigate this risk"
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
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={saving}>{saving ? "Saving…" : "Add Risk"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
