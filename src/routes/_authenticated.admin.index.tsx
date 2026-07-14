import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UsersGroupTwoRoundedBoldDuotone,
  CheckCircleBoldDuotone,
  ClockCircleBoldDuotone,
  ChartSquareBoldDuotone,
  DocumentTextBoldDuotone,
  DangerTriangleBoldDuotone,
  ShieldCheckBoldDuotone,
  BellBoldDuotone,
  DownloadMinimalisticBoldDuotone,
} from "solar-icon-set";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { downloadReportPdf } from "@/lib/reports/pdf";
import { buildComplianceReportDocument } from "@/lib/reports/complianceReport";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Dashboard — DPDPA Compliance Portal" },
      { name: "description", content: "Compliance overview and KPIs for the DPDPA portal." },
    ],
  }),
  component: AdminDashboard,
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface ActivityRow {
  id: string;
  action: string;
  user_email: string | null;
  created_at: string;
}

export interface DeptRow {
  dept: string;
  total: number;
  consented: number;
}

interface PendingEmployee {
  name: string;
  code: string;
  daysSince: number;
}

export interface DashboardData {
  totalEmployees: number;
  consented: number;
  pendingConsent: number;
  consentPct: number;
  todayConsents: number;
  pendingRequests: number;
  inReview: number;
  resolved: number;
  overdue: number;
  openBreaches: number;
  compliancePct: number;
  consentTrend: { month: string; consents: number }[];
  dsrByType: { name: string; value: number }[];
  deptBreakdown: DeptRow[];
  pendingEmployees: PendingEmployee[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ACTIVITY_PAGE_SIZE = 10;
const DONUT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const CONSENT_DONUT = ["#22c55e", "#f59e0b"];

const TYPE_LABELS: Record<string, string> = {
  access: "Access",
  correction: "Correction",
  erasure: "Erasure",
  portability: "Portability",
  nomination: "Nomination",
  grievance: "Grievance",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getActionBadge(action: string): { bg: string; text: string } {
  const a = action.toUpperCase();
  if (a.includes("LOGIN") || a.includes("LOGOUT"))
    return { bg: "bg-blue-100", text: "text-blue-700" };
  if (a.includes("CONSENT"))
    return { bg: "bg-green-100", text: "text-green-700" };
  if (a.includes("REQUEST") || a.includes("DSR"))
    return { bg: "bg-violet-100", text: "text-violet-700" };
  if (a.includes("BREACH") || a.includes("INCIDENT"))
    return { bg: "bg-red-100", text: "text-red-700" };
  if (a.includes("CORRECTION") || a.includes("UPDATE") || a.includes("EDIT"))
    return { bg: "bg-amber-100", text: "text-amber-700" };
  if (a.includes("CREATE") || a.includes("ADD") || a.includes("IMPORT") || a.includes("VIDEO"))
    return { bg: "bg-indigo-100", text: "text-indigo-700" };
  return { bg: "bg-muted", text: "text-muted-foreground" };
}

function getAvatarStyle(email: string | null): string {
  if (!email) return "bg-muted text-muted-foreground";
  const palette = [
    "bg-violet-100 text-violet-700",
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-cyan-100 text-cyan-700",
    "bg-orange-100 text-orange-700",
  ];
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash += email.charCodeAt(i);
  return palette[hash % palette.length];
}

function getInitials(email: string | null): string {
  if (!email) return "?";
  const local = email.split("@")[0];
  const parts = local.split(/[._\-+]/);
  if (parts.length >= 2 && parts[0] && parts[1])
    return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

// ── Data Fetching ──────────────────────────────────────────────────────────────

async function loadActivityPage(page: number): Promise<{ data: ActivityRow[]; total: number }> {
  const from = (page - 1) * ACTIVITY_PAGE_SIZE;
  const to = from + ACTIVITY_PAGE_SIZE - 1;
  const { data, error, count } = await db
    .from("audit_logs")
    .select("id, action, user_email, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return {
    data: (data ?? []).map((r: any) => ({
      id: r.id,
      action: r.action,
      user_email: r.user_email,
      created_at: r.created_at,
    })),
    total: count ?? 0,
  };
}

async function fetchDashboardData(): Promise<DashboardData> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sixMonthsAgo = new Date(Date.now() - 183 * 86400000).toISOString();

  // employees table only has: id, user_id, employee_code, first_name, last_name, email, role, created_at
  // department lives in employee_employment_details — fetched separately
  const [empRes, consentRes, deptRes, requestsRes, breachRes, trendRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id, first_name, last_name, employee_code, created_at"),
    // consent_records: master status table — one row per employee, status = 'consented'|'pending'|'submitted'
    db.from("consent_records").select("employee_id, status, signed_at, created_at"),
    // department is a separate normalized table
    (supabase as any)
      .from("employee_employment_details")
      .select("employee_id, department"),
    db.from("data_requests").select("status, request_type, sla_due_at"),
    db
      .from("breach_incidents")
      .select("status")
      .not("status", "in", '("notified","closed")'),
    // Monthly trend: only rows where employee actually consented, using signed_at (consent timestamp)
    db
      .from("consent_records")
      .select("signed_at")
      .eq("status", "consented")
      .not("signed_at", "is", null)
      .gte("signed_at", sixMonthsAgo),
  ]);

  const employees: any[] = empRes.data ?? [];
  const consentRows: any[] = consentRes.data ?? [];
  const deptDetailRows: any[] = deptRes.data ?? [];

  // Maps for O(1) lookups
  const consentMap = new Map<string, string>(
    consentRows.map((r: any) => [r.employee_id, r.status])
  );
  // employee_id → department (from employment_details join)
  const empDeptMap = new Map<string, string>(
    deptDetailRows
      .filter((r: any) => r.employee_id && r.department)
      .map((r: any) => [r.employee_id, r.department])
  );

  const totalEmployees = employees.length;
  const consentedSet = new Set(
    consentRows.filter((r: any) => r.status === "consented").map((r: any) => r.employee_id)
  );
  const uniqueConsented = consentedSet.size;

  // DEFENSIVE: never negative, never NaN, never > 100%
  const pendingConsent = Math.max(0, totalEmployees - uniqueConsented);
  const consentPct =
    totalEmployees > 0 ? Math.min(100, Math.round((uniqueConsented / totalEmployees) * 100)) : 0;

  // Today's consents — prefer signed_at, fall back to created_at
  const todayConsents = consentRows.filter((r: any) => {
    if (r.status !== "consented") return false;
    const ts = r.signed_at ?? r.created_at;
    return ts && new Date(ts) >= todayStart;
  }).length;

  // Department breakdown — join employees with employment_details
  const deptAccum: Record<string, { total: number; consented: number }> = {};
  for (const emp of employees) {
    const dept = empDeptMap.get(emp.id) ?? "Unknown";
    if (!deptAccum[dept]) deptAccum[dept] = { total: 0, consented: 0 };
    deptAccum[dept].total++;
    if (consentedSet.has(emp.id)) deptAccum[dept].consented++;
  }
  const deptBreakdown: DeptRow[] = Object.entries(deptAccum)
    .map(([dept, { total, consented }]) => ({ dept, total, consented }))
    .sort((a, b) => b.total - a.total);

  // Top 5 pending employees, most recently added first (highest priority for follow-up)
  const pendingEmployees: PendingEmployee[] = employees
    .filter((e: any) => !consentedSet.has(e.id))
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((e: any) => ({
      name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "—",
      code: e.employee_code ?? "—",
      daysSince: Math.max(
        0,
        Math.floor((Date.now() - new Date(e.created_at).getTime()) / 86400000)
      ),
    }));

  const requests: any[] = requestsRes.data ?? [];
  const now = new Date();
  const pendingRequests = requests.filter((r: any) => r.status === "new").length;
  const inReview = requests.filter((r: any) =>
    ["in_review", "action_required"].includes(r.status)
  ).length;
  const resolved = requests.filter((r: any) =>
    ["resolved", "closed"].includes(r.status)
  ).length;
  const overdue = requests.filter(
    (r: any) =>
      !["resolved", "closed", "rejected"].includes(r.status) &&
      r.sla_due_at &&
      new Date(r.sla_due_at) < now
  ).length;

  const openBreaches = breachRes.data?.length ?? 0;

  // Monthly consent trend — keyed by "Mon YYYY", uses signed_at for accuracy
  const trendRows: any[] = trendRes.data ?? [];
  const trendAccum: Record<string, number> = {};
  for (const r of trendRows) {
    const ts = r.signed_at;
    if (!ts) continue;
    const d = new Date(ts);
    if (isNaN(d.getTime())) continue;
    const key = d.toLocaleString("default", { month: "short" }) + " " + d.getFullYear();
    trendAccum[key] = (trendAccum[key] ?? 0) + 1;
  }
  // Fill in the last 6 months so the chart always has a baseline even with sparse data
  const consentTrend: { month: string; consents: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.toLocaleString("default", { month: "short" }) + " " + d.getFullYear();
    consentTrend.push({ month: key, consents: trendAccum[key] ?? 0 });
  }

  // DSR by type
  const typeAccum: Record<string, number> = {};
  for (const r of requests) {
    if (r.request_type) typeAccum[r.request_type] = (typeAccum[r.request_type] ?? 0) + 1;
  }
  const dsrByType = Object.entries(typeAccum).map(([key, value]) => ({
    name: TYPE_LABELS[key] ?? key,
    value,
  }));

  return {
    totalEmployees,
    consented: uniqueConsented,
    pendingConsent,
    consentPct,
    todayConsents,
    pendingRequests,
    inReview,
    resolved,
    overdue,
    openBreaches,
    compliancePct: consentPct,
    consentTrend,
    dsrByType,
    deptBreakdown,
    pendingEmployees,
  };
}

// ── Sub-Components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: string;
  highlight?: "warning" | "danger" | "success";
}) {
  const border =
    highlight === "danger"
      ? "border-red-200 bg-red-50/40"
      : highlight === "warning"
      ? "border-yellow-200 bg-yellow-50/40"
      : highlight === "success"
      ? "border-green-200 bg-green-50/40"
      : "";
  return (
    <Card className={border}>
      <CardContent className="flex items-start gap-3 py-5">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
          {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="py-5">
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-4">
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="divide-y divide-border/50">
      {Array.from({ length: ACTIVITY_PAGE_SIZE }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1">
          <Skeleton className="w-7 h-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-2.5 w-36" />
          </div>
          <Skeleton className="h-2.5 w-10 shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Activity pagination state
  const [activityPage, setActivityPage] = useState(1);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  useEffect(() => {
    fetchDashboardData()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    loadActivityPage(activityPage)
      .then((result) => {
        if (!cancelled) {
          setActivityRows(result.data);
          setActivityTotal(result.total);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activityPage, activityRefreshKey]);

  async function handleExportPdf() {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      // Re-fetch rather than reusing local state, so the PDF always reflects
      // the latest numbers even if data changed since the dashboard first loaded.
      const latestData = await fetchDashboardData();
      const doc = buildComplianceReportDocument(latestData, user?.email ?? "Unknown");
      const filename = `compliance-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      await downloadReportPdf(doc, filename);
      toast.success("Compliance report downloaded");
    } catch {
      toast.error("Failed to generate PDF report");
    } finally {
      setExportingPdf(false);
    }
  }

  if (loading) return <DashboardSkeleton />;
  if (!data) return null;

  const totalPages = Math.max(1, Math.ceil(activityTotal / ACTIVITY_PAGE_SIZE));
  const activityFrom = activityTotal === 0 ? 0 : (activityPage - 1) * ACTIVITY_PAGE_SIZE + 1;
  const activityTo = Math.min(activityPage * ACTIVITY_PAGE_SIZE, activityTotal);

  // Per-dept bar chart data (real numbers, not approximation)
  const deptCompletion = data.deptBreakdown.slice(0, 6).map(({ dept, total, consented }) => ({
    dept: dept.length > 12 ? dept.slice(0, 12) + "…" : dept,
    pct: total > 0 ? Math.round((consented / total) * 100) : 0,
  }));

  const consentDonut = [
    { name: "Consented", value: data.consented },
    { name: "Pending", value: data.pendingConsent },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Compliance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live overview of DPDPA compliance across the organization.
          </p>
        </div>
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

      {/* KPI Cards — Consent */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Consent
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Employees"
            value={data.totalEmployees}
            icon={<UsersGroupTwoRoundedBoldDuotone size={20} />}
          />
          <StatCard
            label="Consented"
            value={data.consented}
            icon={<CheckCircleBoldDuotone size={20} />}
            highlight="success"
          />
          <StatCard
            label="Pending Consent"
            value={data.pendingConsent}
            icon={<ClockCircleBoldDuotone size={20} />}
            highlight={data.pendingConsent > 0 ? "warning" : undefined}
          />
          <StatCard
            label="Completion"
            value={`${data.consentPct}%`}
            icon={<ChartSquareBoldDuotone size={20} />}
            highlight={
              data.consentPct >= 80 ? "success" : data.consentPct >= 50 ? "warning" : "danger"
            }
          />
        </div>
      </div>

      {/* KPI Cards — Requests */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Data Requests
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="New Requests"
            value={data.pendingRequests}
            icon={<DocumentTextBoldDuotone size={20} />}
            highlight={data.pendingRequests > 0 ? "warning" : undefined}
          />
          <StatCard
            label="In Review"
            value={data.inReview}
            icon={<ClockCircleBoldDuotone size={20} />}
          />
          <StatCard
            label="Resolved"
            value={data.resolved}
            icon={<CheckCircleBoldDuotone size={20} />}
          />
          <StatCard
            label="Overdue"
            value={data.overdue}
            icon={<DangerTriangleBoldDuotone size={20} />}
            highlight={data.overdue > 0 ? "danger" : undefined}
          />
        </div>
      </div>

      {/* Compliance Score + Breaches */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheckBoldDuotone size={16} />
              Compliance Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-4xl font-bold">{data.compliancePct}%</span>
              <Badge
                variant="outline"
                className={
                  data.compliancePct >= 80
                    ? "border-green-300 text-green-700"
                    : data.compliancePct >= 50
                    ? "border-yellow-300 text-yellow-700"
                    : "border-red-300 text-red-700"
                }
              >
                {data.compliancePct >= 80
                  ? "On Track"
                  : data.compliancePct >= 50
                  ? "Needs Attention"
                  : "At Risk"}
              </Badge>
            </div>
            <Progress value={data.compliancePct} className="h-2" />
            <p className="text-xs text-muted-foreground mt-2">
              Based on consent completion ({data.consented}/{data.totalEmployees} employees)
            </p>
          </CardContent>
        </Card>

        <Card className={data.openBreaches > 0 ? "border-red-200 bg-red-50/30" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DangerTriangleBoldDuotone size={16} />
              Open Breach Incidents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">{data.openBreaches}</span>
              {data.openBreaches > 0 && (
                <Badge variant="destructive">Requires Action</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {data.openBreaches === 0
                ? "No active breach incidents."
                : `${data.openBreaches} incident${data.openBreaches > 1 ? "s" : ""} requiring notification or closure.`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly Consent Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {data.consentTrend.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                No consent records yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={data.consentTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="consents"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name="Consents"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Data Requests by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {data.dsrByType.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                No data requests yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={data.dsrByType}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) =>
                      percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                    }
                    labelLine={false}
                  >
                    {data.dsrByType.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Department Consent Completion — now shows real per-dept % */}
      {deptCompletion.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Department Consent Completion</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={deptCompletion}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar
                  dataKey="pct"
                  fill="hsl(var(--primary))"
                  radius={[3, 3, 0, 0]}
                  name="Completion"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Activity + Consent Progress — Equal Height ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">

        {/* Recent Activity */}
        <Card className="flex flex-col" style={{ height: 540 }}>
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BellBoldDuotone size={16} />
                Recent Activity
              </span>
              <div className="flex items-center gap-1">
                {activityTotal > 0 && (
                  <span className="text-[10px] font-normal text-muted-foreground/50 mr-1 tabular-nums">
                    {activityTotal} total
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setActivityRefreshKey((k) => k + 1)}
                  disabled={activityLoading}
                  title="Refresh"
                  aria-label="Refresh activity"
                >
                  <span
                    className={`text-sm leading-none ${activityLoading ? "animate-spin inline-block" : ""}`}
                  >
                    ↻
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  asChild
                >
                  <Link to="/admin/audit">View All</Link>
                </Button>
              </div>
            </CardTitle>
          </CardHeader>

          {/* Scrollable activity list */}
          <CardContent className="flex-1 min-h-0 flex flex-col px-4 py-0 pb-0">
            <div className="flex-1 overflow-y-auto min-h-0 pr-0.5">
              {activityLoading ? (
                <ActivitySkeleton />
              ) : activityRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-10">
                  <BellBoldDuotone size={28} className="text-muted-foreground/20" />
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">No recent activities.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Employee actions will appear here automatically.
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {activityRows.map((a) => {
                    const badge = getActionBadge(a.action);
                    const avatarStyle = getAvatarStyle(a.user_email);
                    const initials = getInitials(a.user_email);
                    const username = a.user_email ? a.user_email.split("@")[0] : null;
                    const domain = a.user_email ? a.user_email.split("@")[1] : null;
                    return (
                      <li
                        key={a.id}
                        className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1 hover:bg-muted/40 rounded-md px-1.5 -mx-1.5 transition-colors cursor-default"
                      >
                        {/* Avatar */}
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 select-none ${avatarStyle}`}
                        >
                          {initials}
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${badge.bg} ${badge.text}`}
                          >
                            {a.action.replace(/_/g, " ")}
                          </span>
                          {username && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {username}
                              {domain && (
                                <span className="text-muted-foreground/40">@{domain}</span>
                              )}
                            </p>
                          )}
                        </div>
                        {/* Timestamp */}
                        <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                          {timeAgo(a.created_at)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Pagination footer */}
            <div
              className={`shrink-0 border-t border-border/50 flex items-center justify-between gap-2 py-2.5 ${
                activityTotal <= ACTIVITY_PAGE_SIZE ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {activityTotal > 0
                  ? `${activityFrom}–${activityTo} of ${activityTotal}`
                  : "No records"}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0 text-xs"
                  disabled={activityPage === 1 || activityLoading}
                  onClick={() => setActivityPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  ‹
                </Button>
                <span className="text-[11px] text-muted-foreground tabular-nums w-12 text-center">
                  {activityPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 w-6 p-0 text-xs"
                  disabled={activityPage >= totalPages || activityLoading}
                  onClick={() => setActivityPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  ›
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Consent Completion Progress */}
        <Card className="flex flex-col" style={{ height: 540 }}>
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-sm">Consent Completion Progress</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 px-4 pb-4">

            {/* Progress bar */}
            <div>
              <Progress value={data.consentPct} className="h-2.5" />
              <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                <span>{data.consented} consented</span>
                <span>{data.pendingConsent} pending</span>
              </div>
            </div>

            {/* KPI mini grid */}
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { label: "Total", value: data.totalEmployees },
                { label: "Consented", value: data.consented },
                { label: "Pending", value: data.pendingConsent },
                { label: "Rate", value: `${data.consentPct}%` },
                { label: "Today", value: data.todayConsents },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="bg-muted/40 rounded-lg py-2.5 text-center"
                >
                  <p className="text-sm font-bold tabular-nums leading-none">{kpi.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-1.5 leading-none">
                    {kpi.label}
                  </p>
                </div>
              ))}
            </div>

            {/* Mini donut + legend */}
            <div className="flex items-center gap-4">
              <div className="w-[96px] h-[96px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={consentDonut}
                      cx="50%"
                      cy="50%"
                      innerRadius={26}
                      outerRadius={42}
                      paddingAngle={4}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                    >
                      {consentDonut.map((_, i) => (
                        <Cell key={i} fill={CONSENT_DONUT[i]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, name: string) => [v, name]}
                      contentStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                  <span className="text-muted-foreground flex-1">Consented</span>
                  <span className="font-semibold tabular-nums">{data.consented}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-muted-foreground flex-1">Pending</span>
                  <span className="font-semibold tabular-nums">{data.pendingConsent}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary/40 shrink-0" />
                  <span className="text-muted-foreground flex-1">Completion</span>
                  <span className="font-semibold tabular-nums">{data.consentPct}%</span>
                </div>
              </div>
            </div>

            {/* Department breakdown */}
            {data.deptBreakdown.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                  By Department
                </p>
                <div className="space-y-2">
                  {data.deptBreakdown.map(({ dept, total, consented }) => {
                    const pct = total > 0 ? Math.round((consented / total) * 100) : 0;
                    return (
                      <div key={dept} className="flex items-center gap-2 text-xs">
                        <span
                          className="text-muted-foreground shrink-0 truncate"
                          style={{ width: 88 }}
                          title={dept}
                        >
                          {dept}
                        </span>
                        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-muted-foreground shrink-0 text-right" style={{ width: 36 }}>
                          {consented}/{total}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pending employees — awaiting consent */}
            {data.pendingEmployees.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                  Awaiting Consent
                </p>
                <ul className="space-y-2">
                  {data.pendingEmployees.map((emp, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0 select-none uppercase"
                      >
                        {emp.name[0] ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-muted-foreground truncate block">{emp.name}</span>
                        {emp.code !== "—" && (
                          <span className="text-[10px] text-muted-foreground/50">{emp.code}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
                        {emp.daysSince}d ago
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
