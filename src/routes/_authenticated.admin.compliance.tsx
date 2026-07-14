import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  ComplianceService,
  type ComplianceItem,
  type ComplianceStatus,
} from "@/services/compliance.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  ShieldCheckBoldDuotone,
  DownloadMinimalisticBoldDuotone,
  EyeBoldDuotone,
  InfoCircleBoldDuotone,
} from "solar-icon-set";
import { useAuth } from "@/hooks/use-auth";
import { downloadReportPdf } from "@/lib/reports/pdf";
import { buildComplianceChecklistReportDocument } from "@/lib/reports/complianceReport";
import {
  getRiskLevel,
  getStatusCounts,
  getCategoryBreakdown,
  getRecommendedActions,
  getNextBestAction,
} from "@/lib/compliance/scoreExplanation";

export const Route = createFileRoute("/_authenticated/admin/compliance")({
  head: () => ({ meta: [{ title: "Compliance Tracker — DPDPA Portal" }] }),
  component: CompliancePage,
});

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  compliant: "Compliant",
  at_risk: "At Risk",
};

const STATUS_COLORS: Record<ComplianceStatus, string> = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  compliant: "bg-green-100 text-green-700",
  at_risk: "bg-red-100 text-red-700",
};

const CATEGORY_ORDER = ["Consent", "Rights", "Governance", "Security", "Incidents", "Inventory"];

function groupByCategory(items: ComplianceItem[]): Record<string, ComplianceItem[]> {
  const map: Record<string, ComplianceItem[]> = {};
  for (const item of items) {
    if (!map[item.category]) map[item.category] = [];
    map[item.category].push(item);
  }
  return map;
}

function CompliancePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function load() {
    try {
      const data = await ComplianceService.getAll();
      setItems(data);
    } catch {
      toast.error("Failed to load compliance items");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleStatusChange(id: string, status: ComplianceStatus) {
    setUpdating(id);
    try {
      await ComplianceService.update(id, {
        status,
        last_reviewed_at: new Date().toISOString(),
      });
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status, last_reviewed_at: new Date().toISOString() } : i))
      );
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdating(null);
    }
  }

  async function handleExportPdf() {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      // Re-fetch rather than reusing local state, so the PDF always reflects
      // the latest status even if another reviewer updated an item moments ago.
      const latestItems = await ComplianceService.getAll();
      const latestScore = ComplianceService.computeScore(latestItems);
      const doc = buildComplianceChecklistReportDocument(latestItems, latestScore, user?.email ?? "Unknown");
      const filename = `compliance-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      await downloadReportPdf(doc, filename);
      toast.success("Compliance report downloaded");
    } catch {
      toast.error("Failed to generate PDF report");
    } finally {
      setExportingPdf(false);
    }
  }

  const score = ComplianceService.computeScore(items);
  const grouped = groupByCategory(items);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const statusCounts = getStatusCounts(items);
  const riskLevel = getRiskLevel(score);
  const categoryBreakdown = getCategoryBreakdown(items);
  const recommendedActions = getRecommendedActions(items);
  const nextBestAction = getNextBestAction(items);

  return (
    <>
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheckBoldDuotone size={20} />
            Compliance Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track DPDPA obligations and monitor your compliance posture.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-3xl font-bold">{score}%</p>
            <p className="text-xs text-muted-foreground">Compliance Score</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDetailsOpen(true)}>
            <EyeBoldDuotone size={16} />
            View Score Details
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={exportingPdf}
          >
            <DownloadMinimalisticBoldDuotone size={16} />
            {exportingPdf ? "Generating…" : "Export PDF"}
          </Button>
        </div>
      </div>

      {/* Score bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Compliance Score</span>
            <Badge
              variant="outline"
              className={
                score >= 80
                  ? "border-green-300 text-green-700"
                  : score >= 50
                  ? "border-yellow-300 text-yellow-700"
                  : "border-red-300 text-red-700"
              }
            >
              {score >= 80 ? "On Track" : score >= 50 ? "Needs Attention" : "At Risk"}
            </Badge>
          </div>
          <Progress value={score} className="h-2" />
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            {Object.entries(STATUS_LABELS).map(([status, label]) => {
              const count = items.filter((i) => i.status === status).length;
              return (
                <span key={status}>
                  <span className="font-medium">{count}</span> {label}
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Checklist by category */}
      {CATEGORY_ORDER.filter((cat) => grouped[cat]).map((category) => (
        <div key={category}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {category}
          </h2>
          <div className="space-y-2">
            {(grouped[category] ?? []).map((item) => (
              <Card
                key={item.id}
                className={item.status === "at_risk" ? "border-red-200" : ""}
              >
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{item.title}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            STATUS_COLORS[item.status]
                          }`}
                        >
                          {STATUS_LABELS[item.status]}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      )}
                      {item.due_date && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Due: {new Date(item.due_date).toLocaleDateString("en-IN")}
                        </p>
                      )}
                      {item.last_reviewed_at && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last reviewed: {new Date(item.last_reviewed_at).toLocaleDateString("en-IN")}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0">
                      <Select
                        value={item.status}
                        onValueChange={(v) => handleStatusChange(item.id, v as ComplianceStatus)}
                        disabled={updating === item.id}
                      >
                        <SelectTrigger className="h-7 text-xs w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([v, l]) => (
                            <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Any remaining categories not in CATEGORY_ORDER */}
      {Object.entries(grouped)
        .filter(([cat]) => !CATEGORY_ORDER.includes(cat))
        .map(([category, catItems]) => (
          <div key={category}>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
              {category}
            </h2>
            <div className="space-y-2">
              {catItems.map((item) => (
                <Card key={item.id}>
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-medium text-sm">{item.title}</span>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        )}
                      </div>
                      <Select
                        value={item.status}
                        onValueChange={(v) => handleStatusChange(item.id, v as ComplianceStatus)}
                      >
                        <SelectTrigger className="h-7 text-xs w-36">
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
          </div>
        ))}
    </div>

    {/* Score Details Drawer */}
    <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheckBoldDuotone size={18} />
            Compliance Score Details
          </SheetTitle>
          <SheetDescription>
            How your current score was calculated and what to do next.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 mt-2">
          {/* Score + Risk Level */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-3xl font-bold">{score}%</p>
                  <p className="text-xs text-muted-foreground">Compliance Score</p>
                </div>
                <Badge variant="outline" className={riskLevel.badgeClassName}>
                  {riskLevel.level}
                </Badge>
              </div>
              <Progress value={score} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {statusCounts.compliant} of {statusCounts.total} obligation
                {statusCounts.total === 1 ? "" : "s"} are fully compliant.
              </p>
            </CardContent>
          </Card>

          {/* Score Breakdown */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Score Breakdown
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Total Obligations", value: statusCounts.total },
                { label: "Completed", value: statusCounts.compliant },
                { label: "In Progress", value: statusCounts.in_progress },
                { label: "Not Started", value: statusCounts.not_started },
                { label: "At Risk", value: statusCounts.at_risk },
              ].map((row) => (
                <div key={row.label} className="bg-muted/40 rounded-lg py-2.5 px-3">
                  <p className="text-lg font-bold leading-none">{row.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-none">{row.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Category Breakdown */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Category Breakdown
            </h3>
            <div className="space-y-3">
              {categoryBreakdown.map((c) => (
                <div key={c.category}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{c.category}</span>
                    <span className="text-muted-foreground">
                      {c.completed} of {c.total} completed
                    </span>
                  </div>
                  <Progress value={c.pct} className="h-1.5" />
                </div>
              ))}
            </div>
          </div>

          {/* Why is my score calculated this way? */}
          <Alert>
            <InfoCircleBoldDuotone size={16} />
            <AlertTitle className="text-sm">Why is my score calculated this way?</AlertTitle>
            <AlertDescription className="text-xs">
              Compliance Score is calculated based on the completion status of DPDPA obligations
              configured in your organisation. Completing additional obligations will automatically
              update the score.
            </AlertDescription>
          </Alert>

          {/* Recommended Actions */}
          {recommendedActions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Recommended Actions
              </h3>
              <ul className="space-y-2">
                {recommendedActions.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={`mt-0.5 shrink-0 w-1.5 h-1.5 rounded-full ${
                        item.status === "at_risk" ? "bg-red-500" : "bg-amber-400"
                      }`}
                    />
                    <div>
                      <span className="font-medium">{item.title}</span>
                      <span className="text-muted-foreground"> — {item.category}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Best Action */}
          {nextBestAction && (
            <Alert className="border-primary/30 bg-primary/5">
              <ShieldCheckBoldDuotone size={16} />
              <AlertTitle className="text-sm">Next Recommended Action</AlertTitle>
              <AlertDescription className="text-xs">
                Complete <span className="font-medium">"{nextBestAction.item.title}"</span>
                {nextBestAction.item.description ? ` — ${nextBestAction.item.description}` : ""}
                {nextBestAction.estimatedImprovement > 0 && (
                  <span className="block mt-1 text-muted-foreground">
                    Estimated improvement: +{nextBestAction.estimatedImprovement}% compliance score.
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}
