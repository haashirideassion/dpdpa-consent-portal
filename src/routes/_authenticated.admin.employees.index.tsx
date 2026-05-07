import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MinimalisticMagniferBoldDuotone, EyeBoldDuotone, AddSquareBoldDuotone } from "solar-icon-set";

export const Route = createFileRoute("/_authenticated/admin/employees/")({
  head: () => ({
    meta: [
      { title: "Employees — Admin Dashboard" },
      { name: "description", content: "View and filter all employee records and consent status." },
    ],
  }),
  component: EmployeeList,
});

// ── Add New Employee form shape ───────────────────────────────────────────────
interface AddEmployeeForm {
  first_name: string;
  last_name: string;
  employee_code: string;
  work_email: string;
  phone_number: string;
  personal_email: string;
  alternate_phone: string;
  gender: string;
  date_of_birth: string;
  marital_status: string;
  nationality: string;
  blood_group: string;
  current_address: string;
  permanent_address: string;
  city: string;
  state: string;
  pincode: string;
}

const EMPTY_FORM: AddEmployeeForm = {
  first_name: "",
  last_name: "",
  employee_code: "",
  work_email: "",
  phone_number: "",
  personal_email: "",
  alternate_phone: "",
  gender: "",
  date_of_birth: "",
  marital_status: "",
  nationality: "",
  blood_group: "",
  current_address: "",
  permanent_address: "",
  city: "",
  state: "",
  pincode: "",
};

// ── Validation ─────────────────────────────────────────────────────────────────
function validateAddForm(form: AddEmployeeForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.first_name.trim()) errors.first_name = "First name is required";
  if (!form.last_name.trim()) errors.last_name = "Last name is required";
  if (!form.employee_code.trim()) errors.employee_code = "Employee code is required";
  if (!form.work_email.trim()) {
    errors.work_email = "Work email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.work_email)) {
    errors.work_email = "Enter a valid email address";
  }
  if (!form.phone_number.trim()) {
    errors.phone_number = "Phone number is required";
  } else if (!/^\+?[\d\s\-()]{7,15}$/.test(form.phone_number)) {
    errors.phone_number = "Enter a valid phone number";
  }
  if (form.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.personal_email)) {
    errors.personal_email = "Enter a valid email address";
  }
  if (form.alternate_phone && !/^\+?[\d\s\-()]{7,15}$/.test(form.alternate_phone)) {
    errors.alternate_phone = "Enter a valid phone number";
  }
  if (form.pincode && !/^\d{4,10}$/.test(form.pincode)) {
    errors.pincode = "Enter a valid pincode";
  }
  return errors;
}

// ── Add Employee Modal ─────────────────────────────────────────────────────────
function AddEmployeeModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<AddEmployeeForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sameAddress, setSameAddress] = useState(false);

  function handleClose() {
    if (saving) return;
    setForm(EMPTY_FORM);
    setErrors({});
    setSameAddress(false);
    onClose();
  }

  function set(key: keyof AddEmployeeForm, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "current_address" && sameAddress) {
        next.permanent_address = value;
      }
      return next;
    });
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  }

  function toggleSameAddress(checked: boolean) {
    setSameAddress(checked);
    if (checked) {
      setForm((prev) => ({ ...prev, permanent_address: prev.current_address }));
    }
  }

  async function handleSave() {
    const validationErrors = validateAddForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setSaving(true);
    try {
      // Cast to `any` throughout — generated types are out of sync with the
      // live normalized schema (same pattern used across the codebase).

      // 1. Check for duplicate employee_code
      const { data: existingCode } = await (supabase as any)
        .from("employees")
        .select("id")
        .eq("employee_code", form.employee_code.trim())
        .maybeSingle();
      if (existingCode) {
        setErrors((prev) => ({ ...prev, employee_code: "This employee code is already in use" }));
        toast.error("Employee code already exists.");
        return;
      }

      // 2. Check for duplicate work email
      const { data: existingEmail } = await (supabase as any)
        .from("employees")
        .select("id")
        .eq("email", form.work_email.trim().toLowerCase())
        .maybeSingle();
      if (existingEmail) {
        setErrors((prev) => ({ ...prev, work_email: "This email is already registered" }));
        toast.error("Work email already exists.");
        return;
      }

      // 3. Insert master employee record
      const { data: newEmp, error: empError } = await (supabase as any)
        .from("employees")
        .insert({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          employee_code: form.employee_code.trim(),
          email: form.work_email.trim().toLowerCase(),
          role: "employee",
        })
        .select("id")
        .single();

      if (empError) throw empError;
      const empId = (newEmp as any).id;

      // 4. Insert personal details (optional fields)
      const hasPersonal = form.gender || form.date_of_birth || form.blood_group ||
        form.marital_status || form.nationality;
      if (hasPersonal) {
        await (supabase as any).from("employee_personal_details").insert({
          employee_id: empId,
          gender: form.gender || null,
          dob: form.date_of_birth || null,
          blood_group: form.blood_group || null,
          marital_status: form.marital_status || null,
          nationality: form.nationality || null,
        });
      }

      // 5. Insert contact details
      await (supabase as any).from("employee_contact_details").insert({
        employee_id: empId,
        work_email: form.work_email.trim().toLowerCase(),
        personal_email: form.personal_email.trim() || null,
        phone: form.phone_number.trim() || null,
        alternate_phone: form.alternate_phone.trim() || null,
        current_address: form.current_address.trim() || null,
        permanent_address: form.permanent_address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
      });

      toast.success(`Employee ${form.first_name} ${form.last_name} added successfully.`);
      handleClose();
      onCreated();
    } catch (err: any) {
      console.error("Add employee error:", err);
      toast.error(err?.message ?? "Failed to create employee. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function fieldClass(key: keyof AddEmployeeForm) {
    return errors[key] ? "border-destructive ring-destructive/20 ring-1" : "";
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Add New Employee</DialogTitle>
          <DialogDescription className="text-xs">
            Fill in the employee's details. Fields marked <span className="text-destructive">*</span> are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Personal Information */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Personal Information
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {/* First Name */}
              <div>
                <Label className="text-xs mb-1 block">
                  First Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => set("first_name", e.target.value)}
                  placeholder="e.g. Ravi"
                  className={`h-8 text-sm ${fieldClass("first_name")}`}
                />
                {errors.first_name && <p className="text-[10px] text-destructive mt-0.5">{errors.first_name}</p>}
              </div>

              {/* Last Name */}
              <div>
                <Label className="text-xs mb-1 block">
                  Last Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => set("last_name", e.target.value)}
                  placeholder="e.g. Sharma"
                  className={`h-8 text-sm ${fieldClass("last_name")}`}
                />
                {errors.last_name && <p className="text-[10px] text-destructive mt-0.5">{errors.last_name}</p>}
              </div>

              {/* Employee Code */}
              <div>
                <Label className="text-xs mb-1 block">
                  Employee Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.employee_code}
                  onChange={(e) => set("employee_code", e.target.value)}
                  placeholder="e.g. EMP-001"
                  className={`h-8 text-sm ${fieldClass("employee_code")}`}
                />
                {errors.employee_code && <p className="text-[10px] text-destructive mt-0.5">{errors.employee_code}</p>}
              </div>

              {/* Date of Birth */}
              <div>
                <Label className="text-xs mb-1 block">Date of Birth</Label>
                <Input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => set("date_of_birth", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              {/* Gender */}
              <div>
                <Label className="text-xs mb-1 block">Gender</Label>
                <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Male", "Female", "Non-binary", "Prefer not to say"].map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Blood Group */}
              <div>
                <Label className="text-xs mb-1 block">Blood Group</Label>
                <Select value={form.blood_group} onValueChange={(v) => set("blood_group", v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select blood group" />
                  </SelectTrigger>
                  <SelectContent>
                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                      <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Marital Status */}
              <div>
                <Label className="text-xs mb-1 block">Marital Status</Label>
                <Select value={form.marital_status} onValueChange={(v) => set("marital_status", v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {["Single", "Married", "Divorced", "Widowed", "Separated"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Nationality */}
              <div>
                <Label className="text-xs mb-1 block">Nationality</Label>
                <Input
                  value={form.nationality}
                  onChange={(e) => set("nationality", e.target.value)}
                  placeholder="e.g. Indian"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </section>

          {/* Contact Information */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Contact Information
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {/* Work Email */}
              <div>
                <Label className="text-xs mb-1 block">
                  Work Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="email"
                  value={form.work_email}
                  onChange={(e) => set("work_email", e.target.value)}
                  placeholder="ravi@company.com"
                  className={`h-8 text-sm ${fieldClass("work_email")}`}
                />
                {errors.work_email && <p className="text-[10px] text-destructive mt-0.5">{errors.work_email}</p>}
              </div>

              {/* Personal Email */}
              <div>
                <Label className="text-xs mb-1 block">Personal Email</Label>
                <Input
                  type="email"
                  value={form.personal_email}
                  onChange={(e) => set("personal_email", e.target.value)}
                  placeholder="ravi@gmail.com"
                  className={`h-8 text-sm ${fieldClass("personal_email")}`}
                />
                {errors.personal_email && <p className="text-[10px] text-destructive mt-0.5">{errors.personal_email}</p>}
              </div>

              {/* Phone Number */}
              <div>
                <Label className="text-xs mb-1 block">
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="tel"
                  value={form.phone_number}
                  onChange={(e) => set("phone_number", e.target.value)}
                  placeholder="+91 9876543210"
                  className={`h-8 text-sm ${fieldClass("phone_number")}`}
                />
                {errors.phone_number && <p className="text-[10px] text-destructive mt-0.5">{errors.phone_number}</p>}
              </div>

              {/* Alternate Phone */}
              <div>
                <Label className="text-xs mb-1 block">Alternate Phone</Label>
                <Input
                  type="tel"
                  value={form.alternate_phone}
                  onChange={(e) => set("alternate_phone", e.target.value)}
                  placeholder="+91 9876543210"
                  className={`h-8 text-sm ${fieldClass("alternate_phone")}`}
                />
                {errors.alternate_phone && <p className="text-[10px] text-destructive mt-0.5">{errors.alternate_phone}</p>}
              </div>
            </div>
          </section>

          {/* Address */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Address
            </p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1 block">Current Address</Label>
                <Textarea
                  value={form.current_address}
                  onChange={(e) => set("current_address", e.target.value)}
                  placeholder="Enter current address"
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Label className="text-xs">Permanent Address</Label>
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="same-addr"
                      checked={sameAddress}
                      onCheckedChange={(c) => toggleSameAddress(!!c)}
                    />
                    <label htmlFor="same-addr" className="text-[11px] text-muted-foreground cursor-pointer select-none">
                      Same as current
                    </label>
                  </div>
                </div>
                <Textarea
                  value={form.permanent_address}
                  onChange={(e) => set("permanent_address", e.target.value)}
                  placeholder="Enter permanent address"
                  rows={2}
                  disabled={sameAddress}
                  className="text-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
                <div>
                  <Label className="text-xs mb-1 block">City</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="e.g. Mumbai"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">State</Label>
                  <Input
                    value={form.state}
                    onChange={(e) => set("state", e.target.value)}
                    placeholder="e.g. Maharashtra"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Pincode</Label>
                  <Input
                    value={form.pincode}
                    onChange={(e) => set("pincode", e.target.value)}
                    placeholder="e.g. 400001"
                    className={`h-8 text-sm ${fieldClass("pincode")}`}
                  />
                  {errors.pincode && <p className="text-[10px] text-destructive mt-0.5">{errors.pincode}</p>}
                </div>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 pt-2 border-t mt-2">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Creating…" : "Add Employee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Employee row shape ────────────────────────────────────────────────────────
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
  const [addModalOpen, setAddModalOpen] = useState(false);
  const { user } = useAuth();

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

  useEffect(() => {
    loadEmployees();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="file"
            accept=".csv"
            id="csv-upload"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => document.getElementById("csv-upload")?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Bulk Import (CSV)"}
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setAddModalOpen(true)}
          >
            <AddSquareBoldDuotone size={13} />
            Add New Employee
          </Button>
        </div>
      </div>

      <AddEmployeeModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onCreated={() => {
          setLoading(true);
          loadEmployees();
        }}
      />

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

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-[28%] sm:w-[30%]">Employee</TableHead>
              <TableHead className="hidden w-[15%] sm:table-cell">Code</TableHead>
              <TableHead className="hidden w-[16%] md:table-cell">Department</TableHead>
              <TableHead className="hidden w-[16%] lg:table-cell">Designation</TableHead>
              <TableHead className="w-[12%]">Consent</TableHead>
              <TableHead className="hidden w-[11%] sm:table-cell">Consented At</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((emp) => (
              <TableRow key={emp.id} className="h-16">
                <TableCell className="py-3 font-medium">
                  <div className="truncate">{emp.first_name} {emp.last_name}</div>
                  <div className="truncate text-xs text-muted-foreground">{emp.email}</div>
                </TableCell>
                <TableCell className="hidden py-3 text-xs text-muted-foreground sm:table-cell">
                  {emp.employee_code}
                </TableCell>
                <TableCell className="hidden py-3 text-sm md:table-cell">
                  <span className="block truncate">{emp.department ?? "—"}</span>
                </TableCell>
                <TableCell className="hidden py-3 text-sm text-muted-foreground lg:table-cell">
                  <span className="block truncate">{emp.designation ?? "—"}</span>
                </TableCell>
                <TableCell className="py-3">
                  <ConsentBadge status={emp.consent_status} />
                </TableCell>
                <TableCell className="hidden py-3 text-xs text-muted-foreground sm:table-cell">
                  {emp.consent_signed_at
                    ? new Date(emp.consent_signed_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </TableCell>
                <TableCell className="py-3">
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
