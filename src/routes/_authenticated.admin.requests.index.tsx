import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DsrService, type DataRequest, type DsrType, type DsrStatus } from "@/services/dsr.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  DocumentTextBoldDuotone,
  DangerTriangleBoldDuotone,
  EyeBoldDuotone,
  MinimalisticMagniferBoldDuotone,
  AddSquareBoldDuotone,
} from "solar-icon-set";

interface EmployeeSearchResult {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
}

/**
 * Admin-side "raise an erasure request on behalf of" — for an ex-employee
 * who resigned/left and can no longer sign in to raise it themself. Reuses
 * the exact same DsrService.create() / data_requests row every employee
 * self-service request uses; the only difference is that an admin is the
 * raiser (raised_by) and picks the target employee explicitly.
 */
function RaiseErasureRequestDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<EmployeeSearchResult[]>([]);
  const [selected, setSelected] = useState<EmployeeSearchResult | null>(null);
  const [description, setDescription] = useState("");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch(""); setResults([]); setSelected(null); setDescription("");
    }
  }, [open]);

  useEffect(() => {
    if (!search.trim() || selected) { setResults([]); return; }
    const handle = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("employees")
        .select("id, employee_code, first_name, last_name, email")
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_code.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(10);
      setResults((data as EmployeeSearchResult[] | null) ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [search, selected]);

  async function handleSubmit() {
    if (!selected) {
      toast.error("Select an employee first.");
      return;
    }
    setSubmitting(true);
    try {
      await DsrService.create({
        request_type: "erasure",
        subject: "Data Removal Request (raised by admin)",
        description: description.trim() || "Raised on behalf of an ex-employee who can no longer access the portal.",
        employee_id: selected.id,
      });
      toast.success("Erasure request created.");
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Failed to create request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Raise Erasure Request on Behalf of Employee</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            For an ex-employee (resigned/offboarded) who can no longer sign in to raise this
            themself. This creates the same erasure data request an employee would submit.
          </p>

          {selected ? (
            <div className="flex items-center justify-between rounded-lg border p-2 text-sm">
              <span>{selected.first_name} {selected.last_name} <span className="text-xs text-muted-foreground">({selected.employee_code})</span></span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Change</Button>
            </div>
          ) : (
            <>
              <Input
                placeholder="Search by name, employee code, or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-sm"
              />
              {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
              {results.length > 0 && (
                <div className="border rounded-lg divide-y max-h-48 overflow-auto">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40"
                      onClick={() => { setSelected(r); setResults([]); }}
                    >
                      {r.first_name} {r.last_name}{" "}
                      <span className="text-xs text-muted-foreground">({r.employee_code} · {r.email})</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <Textarea
            placeholder="Additional context (optional)…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!selected || submitting}>
            {submitting ? "Creating…" : "Create Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_authenticated/admin/requests/")({
  head: () => ({
    meta: [{ title: "Data Requests — DPDPA Portal" }],
  }),
  component: RequestsQueue,
});

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_review: "In Review",
  action_required: "Action Required",
  resolved: "Resolved",
  closed: "Closed",
  rejected: "Rejected",
};

const TYPE_LABELS: Record<string, string> = {
  access: "Access",
  correction: "Correction",
  erasure: "Erasure",
  portability: "Portability",
  nomination: "Nomination",
  grievance: "Grievance",
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

function isOverdue(r: DataRequest): boolean {
  if (!r.sla_due_at) return false;
  if (["resolved", "closed", "rejected"].includes(r.status)) return false;
  return new Date(r.sla_due_at) < new Date();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function RequestsQueue() {
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [showRaiseErasure, setShowRaiseErasure] = useState(false);

  function refresh() {
    DsrService.getAll()
      .then(setRequests)
      .catch(() => toast.error("Failed to load requests"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = requests.filter((r) => {
    const matchSearch =
      !search ||
      r.subject.toLowerCase().includes(search.toLowerCase()) ||
      (r.employee_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (r.employee_code ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    const matchType = filterType === "all" || r.request_type === filterType;
    return matchSearch && matchStatus && matchType;
  });

  const stats = {
    total: requests.length,
    new_: requests.filter((r) => r.status === "new").length,
    overdue: requests.filter(isOverdue).length,
    resolved: requests.filter((r) => ["resolved", "closed"].includes(r.status)).length,
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="py-5"><Skeleton className="h-8 w-12" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="py-4"><Skeleton className="h-48 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <DocumentTextBoldDuotone size={20} />
            Data Subject Requests
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage DPDPA data principal rights requests with SLA tracking.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowRaiseErasure(true)}>
          <AddSquareBoldDuotone size={14} className="mr-1.5" />
          Raise Erasure Request
        </Button>
      </div>

      <RaiseErasureRequestDialog
        open={showRaiseErasure}
        onOpenChange={setShowRaiseErasure}
        onCreated={refresh}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total },
          { label: "New", value: stats.new_, highlight: stats.new_ > 0 },
          { label: "Overdue", value: stats.overdue, danger: stats.overdue > 0 },
          { label: "Resolved", value: stats.resolved },
        ].map((s) => (
          <Card
            key={s.label}
            className={s.danger ? "border-destructive/25 bg-destructive/5" : s.highlight ? "border-warning/30 bg-warning/5" : ""}
          >
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-40">
              <MinimalisticMagniferBoldDuotone
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search by subject, employee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-sm w-36">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 text-sm w-36">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<DocumentTextBoldDuotone size={32} />}
              title={requests.length === 0 ? "No data requests yet." : "No requests match the current filters."}
              className="py-16"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA Due</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const overdue = isOverdue(r);
                  const slaDays = r.sla_due_at ? daysUntil(r.sla_due_at) : null;
                  return (
                    <TableRow key={r.id} className={overdue ? "bg-destructive/5" : ""}>
                      <TableCell className="font-medium max-w-48 truncate">
                        <div className="flex items-center gap-1.5">
                          {overdue && (
                            <DangerTriangleBoldDuotone size={14} className="text-destructive shrink-0" />
                          )}
                          <span className="truncate">{r.subject || "(no subject)"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {r.employee_name ?? "—"}
                        </div>
                        {r.employee_code && (
                          <div className="text-xs text-muted-foreground">{r.employee_code}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABELS[r.request_type] ?? r.request_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={PRIORITY_TONES[r.priority] ?? "neutral"} className="text-xs">
                          {r.priority}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={STATUS_TONES[r.status] ?? "neutral"} className="text-xs">
                          {STATUS_LABELS[r.status] ?? r.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        {r.sla_due_at ? (
                          <div>
                            <div className={`text-xs font-medium ${overdue ? "text-destructive" : slaDays !== null && slaDays <= 5 ? "text-warning-foreground" : ""}`}>
                              {overdue ? "Overdue" : slaDays !== null ? `${slaDays}d left` : ""}
                            </div>
                            <div className="text-xs text-muted-foreground">{formatDate(r.sla_due_at)}</div>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(r.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to="/admin/requests/$id" params={{ id: r.id }}>
                            <EyeBoldDuotone size={14} className="mr-1" />
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
