import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { MinimalisticMagniferBoldDuotone, ClipboardListBoldDuotone } from "solar-icon-set";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/consent")({
  head: () => ({ meta: [{ title: "Consent Register — DPDPA Portal" }] }),
  component: ConsentRegisterPage,
});

interface ConsentRow {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  purpose_key: string;
  purpose_label: string;
  status: "active" | "withdrawn" | "pending" | "declined";
  consent_version: string | null;
  last_updated: string | null;
}

function ConsentRegisterPage() {
  const [rows, setRows] = useState<ConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [purposes, setPurposes] = useState<{ key: string; label: string }[]>([]);
  const [selectedPurpose, setSelectedPurpose] = useState("all");

  useEffect(() => {
    async function load() {
      const db = supabase as any;
      const [empRes, deptRes, purposeRes, recordsRes, withdrawalsRes] = await Promise.all([
        // employees no longer has employee_id/department directly — normalized in
        // migration 20260430000002 into employee_code (on employees) and
        // employee_employment_details.department (joined separately below).
        supabase.from("employees").select("id, first_name, last_name, employee_code"),
        db.from("employee_employment_details").select("employee_id, department"),
        // consent_purposes.is_active added in migration 20260518000002
        db.from("consent_purposes")
          .select("purpose_key, label")
          .eq("is_active", true)
          .order("display_order", { ascending: true }),
        // consent_purpose_records is the per-purpose table (immutable, append-only)
        // consented=true → active, consented=false → declined
        db.from("consent_purpose_records")
          .select("employee_id, purpose_key, consented, template_version, created_at"),
        db.from("consent_withdrawals").select("employee_id, purpose_key, withdrawn_at"),
      ]);

      const queryErrors = [
        empRes.error && `employees: ${empRes.error.message}`,
        deptRes.error && `employee_employment_details: ${deptRes.error.message}`,
        purposeRes.error && `consent_purposes: ${purposeRes.error.message}`,
        recordsRes.error && `consent_purpose_records: ${recordsRes.error.message}`,
        withdrawalsRes.error && `consent_withdrawals: ${withdrawalsRes.error.message}`,
      ].filter(Boolean) as string[];

      if (queryErrors.length) {
        console.error("ConsentRegisterPage: query error(s)", queryErrors);
        toast.error(`Failed to load consent register (${queryErrors.join("; ")})`);
      }

      // employees select is cast to any[] because the generated Supabase types are
      // stale relative to the normalized schema (migration 20260430000002) and don't
      // know about employee_code — same pattern used in the dashboard's fetchDashboardData.
      const employees: any[] = empRes.data ?? [];
      const empDeptMap = new Map<string, string>(
        (deptRes.data ?? [])
          .filter((r: any) => r.employee_id && r.department)
          .map((r: any) => [r.employee_id, r.department])
      );
      const purposeList = (purposeRes.data ?? []).map((p: any) => ({
        key: p.purpose_key,
        label: p.label,
      }));
      const records = recordsRes.data ?? [];
      const withdrawals = withdrawalsRes.data ?? [];

      setPurposes(purposeList);

      // Build a map: employee_id → purpose_key → { status, version, date }
      // consent_purpose_records is append-only — take the LATEST row per employee+purpose
      const recordMap = new Map<string, Map<string, { status: string; version: string | null; date: string | null }>>();
      for (const r of records) {
        const empMap = recordMap.get(r.employee_id) ?? new Map();
        const existing = empMap.get(r.purpose_key);
        const isNewer = !existing || new Date(r.created_at) > new Date(existing.date ?? 0);
        if (isNewer) {
          empMap.set(r.purpose_key, {
            status: r.consented ? "active" : "declined",
            version: r.template_version ?? null,
            date: r.created_at ?? null,
          });
        }
        recordMap.set(r.employee_id, empMap);
      }

      // Overlay withdrawals (most recent withdrawal takes precedence)
      for (const w of withdrawals) {
        if (!recordMap.has(w.employee_id)) recordMap.set(w.employee_id, new Map());
        recordMap.get(w.employee_id)!.set(w.purpose_key, {
          status: "withdrawn",
          version: null,
          date: w.withdrawn_at ?? null,
        });
      }

      const result: ConsentRow[] = [];
      for (const emp of employees) {
        for (const p of purposeList) {
          const record = recordMap.get(emp.id)?.get(p.key);
          result.push({
            employee_id: emp.id,
            employee_name: `${(emp as any).first_name} ${(emp as any).last_name}`,
            employee_code: (emp as any).employee_code ?? "—",
            department: empDeptMap.get(emp.id) ?? "—",
            purpose_key: p.key,
            purpose_label: p.label,
            status: (record?.status as "active" | "withdrawn" | "pending") ?? "pending",
            consent_version: record?.version ?? null,
            last_updated: record?.date ?? null,
          });
        }
      }

      setRows(result);
    }

    load().finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => {
    const matchSearch =
      !search ||
      r.employee_name.toLowerCase().includes(search.toLowerCase()) ||
      r.employee_code.toLowerCase().includes(search.toLowerCase());
    const matchPurpose = selectedPurpose === "all" || r.purpose_key === selectedPurpose;
    return matchSearch && matchPurpose;
  });

  // Stats
  const total = rows.length;
  const active = rows.filter((r) => r.status === "active").length;
  const withdrawn = rows.filter((r) => r.status === "withdrawn").length;
  const pending = rows.filter((r) => r.status === "pending" || r.status === "declined").length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardListBoldDuotone size={20} />
          Consent Register
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Organisation-wide consent status per employee × purpose. Audit trail for every consent decision.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Records", value: total, color: "" },
          { label: "Active Consents", value: active, color: "text-success" },
          { label: "Withdrawn", value: withdrawn, color: "text-destructive" },
          { label: "Pending", value: pending, color: "text-warning-foreground" },
        ].map((s) => (
          <div key={s.label} className="stat-card items-center text-center">
            <p className={`stat-card-value ${s.color}`}>{s.value}</p>
            <p className="stat-card-label">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-40">
          <MinimalisticMagniferBoldDuotone
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search by employee name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <select
          value={selectedPurpose}
          onChange={(e) => setSelectedPurpose(e.target.value)}
          className="h-8 text-sm border rounded-md px-2 bg-background"
        >
          <option value="all">All Purposes</option>
          {purposes.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ClipboardListBoldDuotone size={32} />}
              title="No records match the current filters"
              description="Try adjusting your search or purpose filter."
              className="py-12"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 200).map((r, i) => (
                    <TableRow key={`${r.employee_id}-${r.purpose_key}-${i}`}>
                      <TableCell>
                        <div className="font-medium text-sm">{r.employee_name}</div>
                        <div className="text-xs text-muted-foreground">{r.employee_code}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.department}</TableCell>
                      <TableCell className="text-sm max-w-40 truncate">{r.purpose_label}</TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={
                            ({ active: "success", withdrawn: "danger", declined: "warning", pending: "warning" } as Record<string, StatusTone>)[r.status]
                          }
                        >
                          {r.status === "active" ? "Active" : r.status === "withdrawn" ? "Withdrawn" : r.status === "declined" ? "Declined" : "Pending"}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.consent_version ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.last_updated
                          ? new Date(r.last_updated).toLocaleDateString("en-IN")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length > 200 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Showing first 200 of {filtered.length} records.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
