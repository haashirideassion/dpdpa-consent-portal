import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MinimalisticMagniferBoldDuotone, EyeBoldDuotone } from "solar-icon-set";

export const Route = createFileRoute("/_authenticated/admin/employees/")({
  head: () => ({
    meta: [
      { title: "Employees — Admin Dashboard" },
      { name: "description", content: "View and filter all employee records and consent status." },
    ],
  }),
  component: EmployeeList,
});

/** Shape returned after flattening the joined query */
interface EmployeeRow {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string | null;
  designation: string | null;
  consent_status: string;
  consent_signed_at: string | null;
}

function EmployeeList() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    async function loadEmployees() {
      /**
       * FIX 1 — Ambiguous FK: PostgREST found two FK constraints between
       *   employees ↔ consent_records (the old and new migration both created one).
       *   We disambiguate by naming the FK explicitly:
       *     consent_records!consent_records_employee_id_fkey(status,signed_at)
       *
       * FIX 2 — New normalized schema: employees master table no longer contains
       *   department/designation — those live in employee_employment_details.
       *   We JOIN that table too.
       */
      const { data, error } = await supabase
        .from("employees")
        .select(`
          id,
          employee_code,
          first_name,
          last_name,
          email,
          employee_employment_details ( department, designation ),
          consent_records!consent_records_employee_id_fkey ( status, signed_at )
        `)
        .order("employee_code");

      if (error) {
        console.error("Failed to fetch employees:", error);
        setLoading(false);
        return;
      }

      // Flatten the nested objects into a flat EmployeeRow
      const rows: EmployeeRow[] = (data ?? []).map((emp: any) => ({
        id: emp.id,
        employee_code: emp.employee_code,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emp.email,
        department: emp.employee_employment_details?.department ?? null,
        designation: emp.employee_employment_details?.designation ?? null,
        // PostgREST returns one-to-many as an ARRAY — must access [0]
        consent_status: (Array.isArray(emp.consent_records)
          ? emp.consent_records[0]?.status
          : emp.consent_records?.status) ?? "pending",
        consent_signed_at: (Array.isArray(emp.consent_records)
          ? emp.consent_records[0]?.signed_at
          : emp.consent_records?.signed_at) ?? null,
      }));

      setEmployees(rows);
      setLoading(false);
    }
    loadEmployees();
  }, []);

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department || "Unknown"))].sort(),
    [employees],
  );

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        `${e.first_name || ""} ${e.last_name || ""}`.toLowerCase().includes(q) ||
        (e.employee_code?.toLowerCase() || "").includes(q) ||
        (e.email?.toLowerCase() || "").includes(q);

      const matchDept = deptFilter === "all" || e.department === deptFilter;
      const matchStatus = statusFilter === "all" || statusFilter === e.consent_status;

      return matchSearch && matchDept && matchStatus;
    });
  }, [employees, search, deptFilter, statusFilter]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) throw new Error("File must contain headers and at least one row");

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));

      const rowsToInsert = lines
        .slice(1)
        .map((line) => {
          const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          const row: Record<string, string> = {};
          headers.forEach((h, i) => {
            if (h) {
              let val = values[i]?.trim() || "";
              if (val.startsWith('"') && val.endsWith('"')) {
                val = val.substring(1, val.length - 1);
              }
              row[h] = val;
            }
          });
          return row;
        })
        .filter((row) => Object.values(row).some((v) => v !== ""));

      // Use the RPC to safely handle mapping to the normalized tables
      const { error } = await supabase.rpc("bulk_import_employees", { payload: rowsToInsert });
      if (error) throw error;

      window.location.reload();
    } catch (err: any) {
      console.error("CSV Upload Error:", err);
      alert(`Failed to upload CSV: ${err.message || "Unknown error"}`);
    } finally {
      setUploading(false);
    }
  };

  // Count employees who have consented OR submitted
  const consentedCount = employees.filter(
    (e) => e.consent_status === "consented" || e.consent_status === "submitted"
  ).length;

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading employees…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="page-header">
          <h1>Employee Records</h1>
          <p>{employees.length} employees &bull; {consentedCount} consented</p>
        </div>
        <div>
          <Input
            type="file"
            accept=".csv"
            id="csv-upload"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => document.getElementById("csv-upload")?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "Bulk Import (CSV)"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <MinimalisticMagniferBoldDuotone
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search by name, ID or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Consent Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="consented">Consented</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="hidden sm:table-cell">Code</TableHead>
              <TableHead className="hidden md:table-cell">Department</TableHead>
              <TableHead className="hidden lg:table-cell">Designation</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead className="hidden sm:table-cell">Consented At</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">
                  <div>{emp.first_name} {emp.last_name}</div>
                  <div className="text-xs text-muted-foreground">{emp.email}</div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                  {emp.employee_code}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">
                  {emp.department ?? "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                  {emp.designation ?? "—"}
                </TableCell>
                <TableCell>
                  <ConsentBadge status={emp.consent_status} />
                </TableCell>
                <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                  {emp.consent_signed_at
                    ? new Date(emp.consent_signed_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </TableCell>
                <TableCell>
                  {/* Eye icon → navigates to the detailed employee view */}
                  <Button variant="ghost" size="icon" asChild title="View employee details">
                    <Link to="/admin/employees/$id" params={{ id: emp.id }}>
                      <EyeBoldDuotone size={16} />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-14">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <MinimalisticMagniferBoldDuotone size={32} className="text-muted-foreground/25" />
                    <p className="text-sm font-medium text-foreground">No employees found</p>
                    <p className="text-xs text-muted-foreground">
                      {search || deptFilter !== "all" || statusFilter !== "all"
                        ? "Try adjusting your filters or search query."
                        : "Import employees using the CSV upload button above."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ConsentBadge({ status }: { status: string }) {
  switch (status) {
    case "consented":
      return (
        <Badge variant="outline" className="badge-success text-xs font-medium">
          Consented
        </Badge>
      );
    case "submitted":
      return (
        <Badge variant="outline" className="badge-info text-xs font-medium">
          Submitted
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="badge-warning text-xs font-medium">
          Pending
        </Badge>
      );
  }
}
