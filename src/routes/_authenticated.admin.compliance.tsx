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
import { toast } from "sonner";
import { ShieldCheckBoldDuotone } from "solar-icon-set";

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
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

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

  return (
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
        <div className="text-right">
          <p className="text-3xl font-bold">{score}%</p>
          <p className="text-xs text-muted-foreground">Compliance Score</p>
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
  );
}
