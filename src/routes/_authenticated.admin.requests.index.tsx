import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { DsrService, type DataRequest, type DsrType, type DsrStatus } from "@/services/dsr.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
} from "solar-icon-set";

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

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-yellow-100 text-yellow-700",
  in_review: "bg-blue-100 text-blue-700",
  action_required: "bg-orange-100 text-orange-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
  rejected: "bg-red-100 text-red-700",
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

  useEffect(() => {
    DsrService.getAll()
      .then(setRequests)
      .catch(() => toast.error("Failed to load requests"))
      .finally(() => setLoading(false));
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
      </div>

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
            className={s.danger ? "border-red-200 bg-red-50/30" : s.highlight ? "border-yellow-200 bg-yellow-50/30" : ""}
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
            <div className="py-16 text-center text-sm text-muted-foreground">
              {requests.length === 0 ? "No data requests yet." : "No requests match the current filters."}
            </div>
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
                    <TableRow key={r.id} className={overdue ? "bg-red-50/30" : ""}>
                      <TableCell className="font-medium max-w-48 truncate">
                        <div className="flex items-center gap-1.5">
                          {overdue && (
                            <DangerTriangleBoldDuotone size={14} className="text-red-500 shrink-0" />
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
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[r.priority] ?? ""}`}>
                          {r.priority}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] ?? ""}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.sla_due_at ? (
                          <div>
                            <div className={`text-xs font-medium ${overdue ? "text-red-600" : slaDays !== null && slaDays <= 5 ? "text-yellow-600" : ""}`}>
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
