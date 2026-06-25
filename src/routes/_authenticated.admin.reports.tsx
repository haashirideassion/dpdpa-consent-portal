import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { GraphUpBoldDuotone } from "solar-icon-set";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({ meta: [{ title: "Reports & Analytics — DPDPA Portal" }] }),
  component: ReportsPage,
});

const DONUT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

interface ReportData {
  consentByDept: { dept: string; consented: number; pending: number }[];
  consentOverTime: { month: string; consents: number }[];
  requestsByType: { name: string; value: number }[];
  requestsByStatus: { name: string; value: number }[];
  correctionsByStatus: { name: string; value: number }[];
  topEmployees: { name: string; code: string; consented: boolean; corrections: number }[];
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function fetchReportData(): Promise<ReportData> {
  const [empRes, consentRes, requestsRes, correctionsRes] = await Promise.all([
    supabase.from("employees").select("id, first_name, last_name, employee_id, department"),
    db.from("consent_records").select("employee_id, status, created_at"),
    db.from("data_requests").select("request_type, status, created_at"),
    db.from("correction_requests").select("status, created_at"),
  ]);

  const employees = empRes.data ?? [];
  const consents = consentRes.data ?? [];
  const requests = requestsRes.data ?? [];
  const corrections = correctionsRes.data ?? [];

  const consentedSet = new Set(
    consents.filter((c: any) => c.status === "consented").map((c: any) => c.employee_id)
  );

  // Consent by dept
  const deptMap: Record<string, { consented: number; pending: number }> = {};
  for (const e of employees) {
    const dept = (e as any).department || "Unknown";
    if (!deptMap[dept]) deptMap[dept] = { consented: 0, pending: 0 };
    if (consentedSet.has(e.id)) deptMap[dept].consented++;
    else deptMap[dept].pending++;
  }
  const consentByDept = Object.entries(deptMap)
    .slice(0, 8)
    .map(([dept, v]) => ({
      dept: dept.length > 12 ? dept.slice(0, 12) + "…" : dept,
      ...v,
    }));

  // Consent over time (last 6 months)
  const trendMap: Record<string, number> = {};
  for (const c of consents) {
    const d = new Date(c.created_at);
    const key = `${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`;
    trendMap[key] = (trendMap[key] ?? 0) + 1;
  }
  const consentOverTime = Object.entries(trendMap)
    .slice(-6)
    .map(([month, consents]) => ({ month, consents }));

  // DSR by type
  const typeMap: Record<string, number> = {};
  for (const r of requests) {
    typeMap[r.request_type] = (typeMap[r.request_type] ?? 0) + 1;
  }
  const requestsByType = Object.entries(typeMap).map(([k, v]) => ({
    name: k.charAt(0).toUpperCase() + k.slice(1),
    value: v,
  }));

  // DSR by status
  const statusMap: Record<string, number> = {};
  for (const r of requests) {
    statusMap[r.status] = (statusMap[r.status] ?? 0) + 1;
  }
  const requestsByStatus = Object.entries(statusMap).map(([k, v]) => ({
    name: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    value: v,
  }));

  // Corrections by status
  const corrMap: Record<string, number> = {};
  for (const c of corrections as any[]) {
    corrMap[c.status] = (corrMap[c.status] ?? 0) + 1;
  }
  const correctionsByStatus = Object.entries(corrMap).map(([k, v]) => ({
    name: k.charAt(0).toUpperCase() + k.slice(1),
    value: v,
  }));

  // Top employees (first 20)
  const topEmployees = employees.slice(0, 20).map((e: any) => ({
    name: `${e.first_name} ${e.last_name}`,
    code: e.employee_id ?? "—",
    consented: consentedSet.has(e.id),
    corrections: corrections.length, // simplified
  }));

  return {
    consentByDept,
    consentOverTime,
    requestsByType,
    requestsByStatus,
    correctionsByStatus,
    topEmployees,
  };
}

function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState("consent");

  useEffect(() => {
    fetchReportData()
      .then(setData)
      .catch(() => toast.error("Failed to load reports"))
      .finally(() => setLoading(false));
  }, []);

  async function exportConsentCsv() {
    const { data: employees } = await supabase
      .from("employees")
      .select("first_name, last_name, employee_id, department, work_email");
    const { data: consents } = await db
      .from("consent_records")
      .select("employee_id, status, created_at");

    if (!employees) return;
    const consentMap = new Map(
      (consents ?? []).filter((c: any) => c.status === "consented").map((c: any) => [c.employee_id, c.created_at])
    );

    const rows: string[][] = [
      ["Employee Name", "Code", "Email", "Department", "Consent Status", "Consented At"],
      ...employees.map((e: any) => [
        `${e.first_name} ${e.last_name}`,
        e.employee_id ?? "",
        e.work_email ?? "",
        e.department ?? "",
        consentMap.has(e.id) ? "Consented" : "Pending",
        consentMap.get(e.id) ?? "",
      ]),
    ];
    downloadCsv("consent-report.csv", rows);
    toast.success("Consent report downloaded");
  }

  async function exportDsrCsv() {
    const { data: requests } = await db
      .from("data_requests")
      .select("*, employees!data_requests_employee_id_fkey(first_name, last_name, employee_id)");

    if (!requests) return;
    const rows: string[][] = [
      ["Subject", "Type", "Status", "Priority", "Employee", "Raised On", "SLA Due"],
      ...requests.map((r: any) => [
        r.subject ?? "",
        r.request_type ?? "",
        r.status ?? "",
        r.priority ?? "",
        r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : "",
        r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN") : "",
        r.sla_due_at ? new Date(r.sla_due_at).toLocaleDateString("en-IN") : "",
      ]),
    ];
    downloadCsv("dsr-report.csv", rows);
    toast.success("DSR report downloaded");
  }

  async function exportBreachCsv() {
    const { data: breaches } = await db.from("breach_incidents").select("*");
    if (!breaches) return;
    const rows: string[][] = [
      ["Title", "Severity", "Status", "Discovered", "Affected Count", "Board Notified", "Principals Notified"],
      ...breaches.map((b: any) => [
        b.title ?? "",
        b.severity ?? "",
        b.status ?? "",
        b.discovered_at ? new Date(b.discovered_at).toLocaleDateString("en-IN") : "",
        String(b.affected_count ?? ""),
        b.board_notified_at ? new Date(b.board_notified_at).toLocaleDateString("en-IN") : "Pending",
        b.principals_notified_at ? new Date(b.principals_notified_at).toLocaleDateString("en-IN") : "Pending",
      ]),
    ];
    downloadCsv("breach-register.csv", rows);
    toast.success("Breach register downloaded");
  }

  async function exportRopaCsv() {
    const { data: items } = await db.from("data_inventory").select("*");
    if (!items) return;
    const rows: string[][] = [
      ["Activity", "Purpose", "Data Categories", "Legal Basis", "Retention", "Cross-Border", "Last Reviewed"],
      ...items.map((i: any) => [
        i.activity_name ?? "",
        i.purpose ?? "",
        (i.data_categories ?? []).join("; "),
        i.legal_basis ?? "",
        i.retention_period ?? "",
        i.cross_border ? "Yes" : "No",
        i.reviewed_at ? new Date(i.reviewed_at).toLocaleDateString("en-IN") : "Never",
      ]),
    ];
    downloadCsv("ropa-export.csv", rows);
    toast.success("RoPA exported");
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <GraphUpBoldDuotone size={20} />
          Reports & Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cross-module compliance reports with live data and CSV export.
        </p>
      </div>

      {/* Export shortcuts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Quick Exports</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportConsentCsv}>
            Consent Report (CSV)
          </Button>
          <Button variant="outline" size="sm" onClick={exportDsrCsv}>
            DSR / SLA Report (CSV)
          </Button>
          <Button variant="outline" size="sm" onClick={exportBreachCsv}>
            Breach Register (CSV)
          </Button>
          <Button variant="outline" size="sm" onClick={exportRopaCsv}>
            RoPA Export (CSV)
          </Button>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Consent by Dept */}
        {data.consentByDept.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Consent by Department</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.consentByDept} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="dept" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="consented" stackId="a" fill="#22c55e" name="Consented" radius={[0,0,0,0]} />
                  <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Consent trend */}
        {data.consentOverTime.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Consent Trend (6 months)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.consentOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="consents" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} name="Consents" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* DSR by type */}
        {data.requestsByType.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Data Requests by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={data.requestsByType}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""}
                    labelLine={false}
                  >
                    {data.requestsByType.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Corrections by status */}
        {data.correctionsByStatus.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Update Requests by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.correctionsByStatus} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[3, 3, 0, 0]} name="Requests" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Employee consent table */}
      {data.topEmployees.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Employee Consent Summary (first 20)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Code</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Consent</th>
                </tr>
              </thead>
              <tbody>
                {data.topEmployees.map((e, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2">{e.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.code}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant="outline"
                        className={e.consented ? "border-green-300 text-green-700" : "border-yellow-300 text-yellow-700"}
                      >
                        {e.consented ? "Consented" : "Pending"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
