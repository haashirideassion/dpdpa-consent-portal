import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/empty-state";
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
import { MinimalisticMagniferBoldDuotone, EyeBoldDuotone, AddSquareBoldDuotone, GlobalBoldDuotone } from "solar-icon-set";
import { CountryService, type Country } from "@/services/country.service";
import { FrameworkService, type RegulatoryFramework } from "@/services/framework.service";
import { JurisdictionService } from "@/services/jurisdiction.service";
import { EmployeeService } from "@/services/employee.service";
import { BulkImportEmployeesModal } from "@/components/BulkImportEmployeesModal";

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
  date_of_birth: string;
  gender: string;
  blood_group: string;
  marital_status: string;
  nationality: string;
  // Employment — stored in employee_employment_details, same table/columns
  // the CSV bulk importer and Employee Details view already use. Not part
  // of create_employee_with_details(); persisted via EmployeeService right
  // after the RPC succeeds (see handleSave).
  department: string;
  designation: string;
  employment_type: string;
  date_of_joining: string;
  work_location: string;
  work_email: string;
  personal_email: string;
  phone_number: string;
  alternate_phone: string;
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
  date_of_birth: "",
  gender: "",
  blood_group: "",
  marital_status: "",
  nationality: "",
  department: "",
  designation: "",
  employment_type: "",
  date_of_joining: "",
  work_location: "",
  work_email: "",
  personal_email: "",
  phone_number: "",
  alternate_phone: "",
  current_address: "",
  permanent_address: "",
  city: "",
  state: "",
  pincode: "",
};

// Same enumeration EmployeeDataView.tsx / BulkImportEmployeesModal.tsx use
// for Employment Type — kept in sync manually since it isn't exported as a
// shared constant today. Department/Designation stay free text, matching
// their existing behavior everywhere else in the app.
const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Intern", "Consultant"];

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
  const { user } = useAuth();

  // ── Jurisdiction / Region (optional — HR/Admin controlled, Phase 3) ──────
  // Not part of the atomic create_employee_with_details RPC/payload: this is
  // a separate, best-effort insert into employee_jurisdiction_details after
  // the employee record exists, exactly as scoped. Leaving country
  // unselected is a valid choice — the employee simply has no jurisdiction
  // row yet, identical to every existing employee today, and keeps seeing
  // the default DPDPA experience.
  const [countries, setCountries] = useState<Country[]>([]);
  const [frameworks, setFrameworks] = useState<RegulatoryFramework[]>([]);
  const [jurisdictionCountryId, setJurisdictionCountryId] = useState("");
  const [jurisdictionFrameworkId, setJurisdictionFrameworkId] = useState("");
  const [frameworksLoading, setFrameworksLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    CountryService.getActive()
      .then(setCountries)
      .catch((err) => console.error("AddEmployeeModal: failed to load countries", err));
  }, [open]);

  async function handleJurisdictionCountryChange(countryId: string) {
    setJurisdictionCountryId(countryId);
    setJurisdictionFrameworkId("");
    setFrameworksLoading(true);
    try {
      const fw = await FrameworkService.getForCountry(countryId);
      setFrameworks(fw);
      if (fw.length === 1) setJurisdictionFrameworkId(fw[0].id);
    } catch (err) {
      console.error("AddEmployeeModal: failed to load frameworks for country", err);
      toast.error("Failed to load regulatory frameworks for this country.");
    } finally {
      setFrameworksLoading(false);
    }
  }

  function handleClose() {
    if (saving) return;
    setForm(EMPTY_FORM);
    setErrors({});
    setSameAddress(false);
    setJurisdictionCountryId("");
    setJurisdictionFrameworkId("");
    setFrameworks([]);
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

      // 3. Create the employee master record AND every linked single-entry
      // detail table row (personal, contact, employment, financial, govt ids,
      // emergency contact, additional, health, consent) in one atomic DB
      // transaction via RPC. This does not depend on any AFTER INSERT
      // trigger having run — if any child insert fails, the whole thing
      // (including the employees row) rolls back, so we can never end up
      // with an employee that has missing child records.
      const rpcPayload = {
        p_first_name: form.first_name.trim(),
        p_last_name: form.last_name.trim(),
        p_employee_code: form.employee_code.trim(),
        p_work_email: form.work_email.trim().toLowerCase(),
        p_personal_email: form.personal_email.trim() || null,
        p_phone: form.phone_number.trim() || null,
        p_alternate_phone: form.alternate_phone.trim() || null,
        p_gender: form.gender || null,
        p_dob: form.date_of_birth || null,
        p_marital_status: form.marital_status || null,
        p_nationality: form.nationality || null,
        p_blood_group: form.blood_group || null,
        p_current_address: form.current_address.trim() || null,
        p_permanent_address: form.permanent_address.trim() || null,
        p_city: form.city.trim() || null,
        p_state: form.state.trim() || null,
        p_pincode: form.pincode.trim() || null,
      };
      // Temporary diagnostic — remove once the persistence issue is confirmed
      // resolved against the live database. Grouped to mirror the target
      // tables so a NULL column can be traced back to a specific form field.
      console.log("create_employee_with_details payload", {
        employees: {
          first_name: rpcPayload.p_first_name,
          last_name: rpcPayload.p_last_name,
          employee_code: rpcPayload.p_employee_code,
          email: rpcPayload.p_work_email,
        },
        employee_personal_details: {
          gender: rpcPayload.p_gender,
          dob: rpcPayload.p_dob,
          blood_group: rpcPayload.p_blood_group,
          marital_status: rpcPayload.p_marital_status,
          nationality: rpcPayload.p_nationality,
        },
        employee_contact_details: {
          work_email: rpcPayload.p_work_email,
          personal_email: rpcPayload.p_personal_email,
          phone: rpcPayload.p_phone,
          alternate_phone: rpcPayload.p_alternate_phone,
          current_address: rpcPayload.p_current_address,
          permanent_address: rpcPayload.p_permanent_address,
          city: rpcPayload.p_city,
          state: rpcPayload.p_state,
          pincode: rpcPayload.p_pincode,
        },
      });

      const { data: newEmployeeId, error: createError } = await (supabase as any).rpc(
        "create_employee_with_details",
        rpcPayload,
      );
      if (createError) throw createError;

      // 4. Employment details (department, designation, employment type,
      // date of joining, work location). Not part of the RPC's payload —
      // routed through the existing EmployeeService translation layer
      // (employee_employment_details), the same path the CSV bulk importer
      // uses. Best-effort: the employee record already exists at this
      // point, so a failure here is surfaced as a warning, not a failed
      // employee creation.
      const employmentUpdates: Record<string, string> = {};
      if (form.department.trim()) employmentUpdates.department = form.department.trim();
      if (form.designation.trim()) employmentUpdates.designation = form.designation.trim();
      if (form.employment_type) employmentUpdates.employment_type = form.employment_type;
      if (form.date_of_joining) employmentUpdates.date_of_joining = form.date_of_joining;
      if (form.work_location.trim()) employmentUpdates.work_location = form.work_location.trim();
      if (newEmployeeId && Object.keys(employmentUpdates).length > 0) {
        try {
          await EmployeeService.updateEmployee(newEmployeeId, employmentUpdates);
        } catch (employmentErr) {
          console.error("Add employee: employment details failed to save", employmentErr);
          toast.warning(
            "Employee created, but employment details failed to save. Edit them from the employee's detail page.",
          );
        }
      }

      // 5. Jurisdiction assignment (optional, best-effort — Phase 3).
      // Does not touch create_employee_with_details or its transaction:
      // employee creation has already fully succeeded by this point, so a
      // failure here is surfaced as a warning, not a failed employee
      // creation. Leaving the country unselected is a valid HR choice —
      // it simply means this employee has no jurisdiction row yet, same
      // as every existing employee today.
      if (newEmployeeId && jurisdictionCountryId) {
        try {
          await JurisdictionService.assignForEmployee(
            newEmployeeId,
            { countryId: jurisdictionCountryId, regulatoryFrameworkId: jurisdictionFrameworkId || null },
            user?.id,
          );
        } catch (jurisdictionErr) {
          console.error("Add employee: jurisdiction assignment failed", jurisdictionErr);
          toast.warning(
            "Employee created, but jurisdiction assignment failed. Assign it from the employee's detail page.",
          );
        }
      }

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

          {/* Employment Information */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Employment Information
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {/* Department — free text, matches Employee Details */}
              <div>
                <Label className="text-xs mb-1 block">Department</Label>
                <Input
                  value={form.department}
                  onChange={(e) => set("department", e.target.value)}
                  placeholder="e.g. Engineering"
                  className="h-8 text-sm"
                />
              </div>

              {/* Designation — free text, matches Employee Details */}
              <div>
                <Label className="text-xs mb-1 block">Designation</Label>
                <Input
                  value={form.designation}
                  onChange={(e) => set("designation", e.target.value)}
                  placeholder="e.g. Software Engineer"
                  className="h-8 text-sm"
                />
              </div>

              {/* Employment Type */}
              <div>
                <Label className="text-xs mb-1 block">Employment Type</Label>
                <Select value={form.employment_type} onValueChange={(v) => set("employment_type", v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date of Joining */}
              <div>
                <Label className="text-xs mb-1 block">Date of Joining</Label>
                <Input
                  type="date"
                  value={form.date_of_joining}
                  onChange={(e) => set("date_of_joining", e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              {/* Work Location — free text, matches Employee Details */}
              <div>
                <Label className="text-xs mb-1 block">Work Location</Label>
                <Input
                  value={form.work_location}
                  onChange={(e) => set("work_location", e.target.value)}
                  placeholder="e.g. Bengaluru"
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

          {/* Jurisdiction / Region — optional, HR/Admin-controlled (Phase 3) */}
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-1.5">
              <GlobalBoldDuotone size={12} />
              Jurisdiction / Region
            </p>
            <p className="text-[11px] text-muted-foreground mb-3">
              Optional. Leave unset to keep the default — India / DPDPA applies automatically until HR assigns a jurisdiction.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <Label className="text-xs mb-1 block">Country</Label>
                <Select value={jurisdictionCountryId} onValueChange={handleJurisdictionCountryChange}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Default (India / DPDPA)" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Applicable Framework</Label>
                {!jurisdictionCountryId ? (
                  <div className="h-8 flex items-center text-xs text-muted-foreground">Select a country first</div>
                ) : frameworksLoading ? (
                  <div className="h-8 flex items-center text-xs text-muted-foreground">Loading…</div>
                ) : frameworks.length === 0 ? (
                  <div className="h-8 flex items-center text-xs text-warning">No regulatory framework configured for this jurisdiction.</div>
                ) : frameworks.length === 1 ? (
                  <div className="h-8 flex items-center rounded-md border border-border bg-muted/30 px-3 text-xs font-medium truncate">
                    {frameworks[0].name}
                  </div>
                ) : (
                  <Select value={jurisdictionFrameworkId} onValueChange={setJurisdictionFrameworkId}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select framework" />
                    </SelectTrigger>
                    <SelectContent>
                      {frameworks.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
  correction_count: number;
}

type SortKey = "name" | "code" | "department" | "consent" | "corrections";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

function EmployeeList() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  async function loadEmployees() {
    const [empRes, corrRes] = await Promise.all([
      supabase
        .from("employees")
        .select(`
          id,
          employee_code,
          first_name,
          last_name,
          email,
          employee_employment_details ( department, designation ),
          consent_records!consent_records_employee_id_fkey ( status, signed_at )
        `),
      db
        .from("correction_requests")
        .select("employee_id, status"),
    ]);

    if (empRes.error) {
      console.error("Failed to fetch employees:", empRes.error);
      setLoading(false);
      return;
    }

    // Build correction count map
    const corrMap: Record<string, number> = {};
    for (const r of (corrRes.data ?? []) as any[]) {
      if (r.status === "pending") {
        corrMap[r.employee_id] = (corrMap[r.employee_id] ?? 0) + 1;
      }
    }

    const rows: EmployeeRow[] = (empRes.data ?? []).map((emp: any) => ({
      id: emp.id,
      employee_code: emp.employee_code,
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email,
      department: emp.employee_employment_details?.department ?? null,
      designation: emp.employee_employment_details?.designation ?? null,
      consent_status: (Array.isArray(emp.consent_records)
        ? emp.consent_records[0]?.status
        : emp.consent_records?.status) ?? "pending",
      consent_signed_at: (Array.isArray(emp.consent_records)
        ? emp.consent_records[0]?.signed_at
        : emp.consent_records?.signed_at) ?? null,
      correction_count: corrMap[emp.id] ?? 0,
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
    const base = employees.filter((e) => {
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

    // Sort
    return [...base].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
          break;
        case "code":
          cmp = (a.employee_code ?? "").localeCompare(b.employee_code ?? "");
          break;
        case "department":
          cmp = (a.department ?? "").localeCompare(b.department ?? "");
          break;
        case "consent":
          cmp = (a.consent_status ?? "").localeCompare(b.consent_status ?? "");
          break;
        case "corrections":
          cmp = b.correction_count - a.correction_count;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [employees, search, deptFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setImportModalOpen(true)}
          >
            Bulk Import (CSV)
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

      <BulkImportEmployeesModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={() => {
          // NOT setLoading(true) here — the root cause of the "modal
          // unexpectedly reopens" bug: EmployeeList has an early-return
          // loading skeleton (`if (loading) return ...`) that unmounts
          // this whole subtree, including the still-open
          // BulkImportEmployeesModal. When loadEmployees() finishes and
          // flips loading back to false, the modal remounts fresh — with
          // its `open` prop (importModalOpen) untouched at `true` — so it
          // pops back open even after the admin has moved on. A silent
          // background refresh (no skeleton) keeps the modal's own
          // open/close state authoritative.
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
              <TableHead className="w-[28%] sm:w-[30%] cursor-pointer select-none" onClick={() => handleSort("name")}>
                Employee {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className="hidden w-[12%] sm:table-cell cursor-pointer select-none" onClick={() => handleSort("code")}>
                Code {sortKey === "code" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className="hidden w-[14%] md:table-cell cursor-pointer select-none" onClick={() => handleSort("department")}>
                Department {sortKey === "department" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className="hidden w-[14%] lg:table-cell">Designation</TableHead>
              <TableHead className="w-[12%] cursor-pointer select-none" onClick={() => handleSort("consent")}>
                Consent {sortKey === "consent" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className="hidden w-[10%] sm:table-cell">Consented At</TableHead>
              <TableHead className="hidden w-[8%] md:table-cell cursor-pointer select-none" onClick={() => handleSort("corrections")} title="Pending correction requests">
                Fixes {sortKey === "corrections" ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.map((emp) => (
              <TableRow key={emp.id} className="h-16">
                <TableCell className="py-3 font-medium">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="text-[11px] font-semibold bg-admin-accent/10 text-admin-accent">
                        {[emp.first_name?.[0], emp.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate">{emp.first_name} {emp.last_name}</div>
                      <div className="truncate text-xs text-muted-foreground">{emp.email}</div>
                    </div>
                  </div>
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
                <TableCell className="hidden py-3 md:table-cell">
                  {emp.correction_count > 0 ? (
                    <StatusBadge tone="warning" className="text-xs">
                      {emp.correction_count}
                    </StatusBadge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="py-3">
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
                <TableCell colSpan={8} className="py-14">
                  <EmptyState
                    icon={<MinimalisticMagniferBoldDuotone size={32} />}
                    title="No employees found"
                    description={
                      search || deptFilter !== "all" || statusFilter !== "all"
                        ? "Try adjusting your filters or search query."
                        : "Import employees using the CSV upload button above."
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .map((p, idx, arr) => (
                <>
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span key={`ellipsis-${p}`} className="px-1">…</span>
                  )}
                  <Button
                    key={p}
                    variant={p === page ? "default" : "outline"}
                    size="sm"
                    className="h-7 w-7 text-xs p-0"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                </>
              ))}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsentBadge({ status }: { status: string }) {
  switch (status) {
    case "consented":
      return <StatusBadge tone="success" className="text-xs">Consented</StatusBadge>;
    case "submitted":
      return <StatusBadge tone="info" className="text-xs">Submitted</StatusBadge>;
    default:
      return <StatusBadge tone="warning" className="text-xs">Pending</StatusBadge>;
  }
}
