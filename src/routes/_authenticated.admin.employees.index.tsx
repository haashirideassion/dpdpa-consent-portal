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
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/admin/employees/")({
  head: () => ({
    meta: [
      { title: "Employees — Admin Dashboard" },
      { name: "description", content: "View and filter all employee records and consent status." },
    ],
  }),
  component: EmployeeList,
});

type Employee = Tables<"employees">;
type ConsentLog = Tables<"consent_logs">;

function EmployeeList() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [consents, setConsents] = useState<ConsentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    async function fetch() {
      const [empRes, consentRes] = await Promise.all([
        supabase.from("employees").select("*").order("employee_id"),
        supabase.from("consent_logs").select("*").order("created_at", { ascending: false }),
      ]);
      setEmployees(empRes.data ?? []);
      setConsents(consentRes.data ?? []);
      setLoading(false);
    }
    fetch();
  }, []);

  const consentMap = useMemo(() => {
    const map = new Map<string, ConsentLog>();
    for (const c of consents) {
      if (!map.has(c.employee_id)) map.set(c.employee_id, c);
    }
    return map;
  }, [consents]);

  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department))].sort(),
    [employees],
  );

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        `${e.first_name || ""} ${e.last_name || ""}`.toLowerCase().includes(q) ||
        (e.employee_id?.toLowerCase() || "").includes(q);
      const matchDept = deptFilter === "all" || e.department === deptFilter;
      const hasConsent = consentMap.has(e.id);
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "consented" && hasConsent) ||
        (statusFilter === "pending" && !hasConsent);
      return matchSearch && matchDept && matchStatus;
    });
  }, [employees, search, deptFilter, statusFilter, consentMap]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);

    try {
      const text = await file.text();
      // Improved CSV parser to handle Windows/Unix line endings
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
      if (lines.length < 2) throw new Error("File must contain headers and at least one row");
      
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
      
      const rowsToInsert = lines.slice(1).map(line => {
        // Use a regex to split by comma but ignore commas inside quotes
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
          if (h) {
            let val = values[i]?.trim() || "";
            // Remove surrounding quotes if they exist
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.substring(1, val.length - 1);
            }
            row[h] = val;
          }
        });
        return row;
      }).filter(row => Object.values(row).some(v => v !== "")); // Skip completely empty rows

      const { error } = await supabase.from("employees").insert(rowsToInsert as any);
      if (error) throw error;
      
      // Reload page to show new employees
      window.location.reload();
    } catch (err: any) {
      console.error("CSV Upload Error:", err);
      alert(`Failed to upload CSV: ${err.message || "Unknown error"}`);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading employees...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Employee Records</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {employees.length} employees • {consentMap.size} consented
          </p>
        </div>
        <div>
          <Input 
            type="file" 
            accept=".csv" 
            id="csv-upload" 
            className="hidden" 
            onChange={handleFileUpload} 
          />
          <Button variant="outline" className="gap-2" onClick={() => document.getElementById('csv-upload')?.click()} disabled={uploading}>
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
            placeholder="Search by name or ID..."
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
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="hidden sm:table-cell">ID</TableHead>
              <TableHead className="hidden md:table-cell">Department</TableHead>
              <TableHead className="hidden lg:table-cell">Designation</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead className="hidden sm:table-cell">Last Consent</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((emp) => {
              const consent = consentMap.get(emp.id);
              return (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">
                    {emp.first_name} {emp.last_name}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                    {emp.employee_id}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{emp.department}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {emp.designation}
                  </TableCell>
                  <TableCell>
                    {consent ? (
                      <Badge
                        variant="default"
                        className="bg-success text-success-foreground text-xs"
                      >
                        Consented
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-warning-foreground border-warning text-xs"
                      >
                        Pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                    {consent ? new Date(consent.created_at).toLocaleDateString("en-IN") : "—"}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" asChild>
                      <Link to="/admin/employees/$id" params={{ id: emp.id }}>
                        <EyeBoldDuotone size={16} />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No employees match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
