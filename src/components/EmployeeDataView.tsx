// Employee type now uses 'any' to support both flat and normalized schemas
import { DataSection } from "./DataSection";
import type { FieldDef } from "./DataField";
import { maskValue } from "@/lib/dpdpa";
import {
  UserBoldDuotone,
  CaseMinimalisticBoldDuotone,
  CardBoldDuotone,
  PassportBoldDuotone,
  HospitalBoldDuotone,
  DocumentTextBoldDuotone,
  HeartBoldDuotone,
} from "solar-icon-set";
import { EmployeeService } from "@/services/employee.service";
import { useAuth } from "@/hooks/use-auth";
import { EducationSection } from "./sections/EducationSection";
import { CertificationsSection } from "./sections/CertificationsSection";
import { EmploymentHistorySection } from "./sections/EmploymentHistorySection";
import { NomineesSection } from "./sections/NomineesSection";
import { DependentsSection } from "./sections/DependentsSection";

type Employee = any;

interface EmployeeDataViewProps {
  employee: Employee;
  onEmployeeUpdated: (updated?: Employee) => void;
  hasConsented?: boolean;
  isAdmin?: boolean;
}

export function EmployeeDataView({
  employee,
  onEmployeeUpdated,
  hasConsented = false,
  isAdmin = false,
}: EmployeeDataViewProps) {
  const e = employee;
  const { user } = useAuth();
  const isOwner = user?.id === e.user_id;

  async function saveSection(updates: Record<string, string>) {
    if (isAdmin) {
      const oldValues: Record<string, string> = {};
      for (const key of Object.keys(updates)) {
        oldValues[key] = e[key] ?? "";
      }
      await EmployeeService.adminOverride(e.id, updates, oldValues);
    } else {
      await EmployeeService.updateEmployee(e.id, updates);
    }
    onEmployeeUpdated({ ...e, ...updates, id: e.id });
  }

  // ── Personal & Contact (merged, with PRD additions) ────────────────────────
  const personalContactFields: FieldDef[] = [
    // Personal
    { label: "First Name", key: "first_name", value: e.first_name },
    { label: "Last Name", key: "last_name", value: e.last_name },
    { label: "Father's Name", key: "father_name", value: e.father_name },
    { label: "Mother's Name", key: "mother_name", value: e.mother_name },
    { label: "Date of Birth", key: "date_of_birth", value: e.date_of_birth, type: "date" },
    {
      label: "Gender",
      key: "gender",
      value: e.gender,
      type: "select",
      options: ["Male", "Female", "Non-binary", "Prefer not to say"],
    },
    {
      label: "Blood Group",
      key: "blood_group",
      value: e.blood_group,
      type: "select",
      options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
    },
    {
      label: "Marital Status",
      key: "marital_status",
      value: e.marital_status,
      type: "select",
      options: ["Single", "Married", "Divorced", "Widowed", "Separated"],
    },
    { label: "Nationality", key: "nationality", value: e.nationality },
    // Contact
    { label: "Work Email", key: "work_email", value: e.work_email, type: "email", locked: true, uncorrectable: true },
    { label: "Personal Email", key: "personal_email", value: e.personal_email, type: "email" },
    { label: "Phone Number", key: "phone_number", value: e.phone_number, type: "tel" },
    { label: "Alternate Phone", key: "alternate_phone", value: e.alternate_phone, type: "tel" },
    { label: "Current Address", key: "current_address", value: e.current_address, type: "textarea" },
    { label: "Permanent Address", key: "permanent_address", value: e.permanent_address, type: "textarea" },
    { label: "City", key: "city", value: e.city },
    { label: "State", key: "state", value: e.state },
    { label: "Pincode", key: "pincode", value: e.pincode },
  ];

  // ── Employment ─────────────────────────────────────────────────────────────
  const employmentFields: FieldDef[] = [
    { label: "Employee ID", key: "employee_code", value: e.employee_code, locked: true, uncorrectable: true },
    { label: "Department", key: "department", value: e.department, locked: true },
    { label: "Designation", key: "designation", value: e.designation, locked: true },
    { label: "Date of Joining", key: "date_of_joining", value: e.date_of_joining, type: "date", locked: true },
    {
      label: "Employment Type",
      key: "employment_type",
      value: e.employment_type,
      type: "select",
      options: ["Full-time", "Part-time", "Contract", "Intern", "Consultant"],
      locked: true,
    },
    { label: "Reporting Manager", key: "reporting_manager", value: e.reporting_manager, locked: true },
    { label: "Work Location", key: "work_location", value: e.work_location, locked: true },
    {
      label: "Status",
      key: "employee_status",
      value: e.employee_status,
      type: "select",
      options: ["Active", "Inactive", "On Leave", "Terminated"],
      locked: true,
    },
  ];

  // ── Payroll & Banking (with PRD additions) ─────────────────────────────────
  const payrollFields: FieldDef[] = [
    { label: "Bank Name", key: "bank_name", value: e.bank_name },
    { label: "Bank Branch", key: "bank_branch", value: e.bank_branch },
    { label: "Bank Account Number", key: "bank_account_number", value: isAdmin ? e.bank_account_number : maskValue(e.bank_account_number ?? "") },
    { label: "IFSC Code", key: "ifsc_code", value: isAdmin ? e.ifsc_code : maskValue(e.ifsc_code ?? "") },
    { label: "UPI ID", key: "upi_id", value: e.upi_id },
    { label: "PF Account Number", key: "pf_account", value: e.pf_account },
    { label: "ESIC Number", key: "esic_number", value: e.esic_number },
    { label: "PAN Number", key: "pan_number", value: isAdmin ? e.pan_number : maskValue(e.pan_number ?? "") },
    { label: "CTC", key: "ctc", value: isAdmin ? e.ctc : maskValue(e.ctc ?? "") },
  ];

  // ── Government IDs ─────────────────────────────────────────────────────────
  const govtFields: FieldDef[] = [
    { label: "Aadhaar Number", key: "aadhaar_number", value: isAdmin ? e.aadhaar_number : maskValue(e.aadhaar_number ?? "") },
    { label: "UAN Number", key: "uan_number", value: isAdmin ? e.uan_number : maskValue(e.uan_number ?? "") },
    { label: "Passport Number", key: "passport_number", value: isAdmin ? e.passport_number : maskValue(e.passport_number ?? "") },
    { label: "Passport Expiry", key: "passport_expiry", value: e.passport_expiry, type: "date" },
    { label: "Driving License", key: "driving_license", value: isAdmin ? e.driving_license : maskValue(e.driving_license ?? "") },
    { label: "Voter ID", key: "voter_id", value: isAdmin ? e.voter_id : maskValue(e.voter_id ?? "") },
  ];

  // ── Emergency Contact ──────────────────────────────────────────────────────
  const emergencyFields: FieldDef[] = [
    { label: "Contact Name", key: "emergency_contact_name", value: e.emergency_contact_name },
    { label: "Relation", key: "emergency_contact_relation", value: e.emergency_contact_relation },
    { label: "Contact Phone", key: "emergency_contact_phone", value: e.emergency_contact_phone, type: "tel" },
    { label: "Contact Email", key: "emergency_contact_email", value: e.emergency_contact_email, type: "email" },
  ];

  // ── Health Information (optional, voluntary) ───────────────────────────────
  const healthFields: FieldDef[] = [
    {
      label: "Disability Status",
      key: "disability_status",
      value: e.disability_status,
      type: "select",
      options: ["None", "Physical", "Visual", "Hearing", "Cognitive", "Other"],
    },
    {
      label: "Chronic Conditions",
      key: "chronic_conditions",
      value: e.chronic_conditions,
      type: "textarea",
    },
    {
      label: "Allergies (relevant for travel)",
      key: "allergies",
      value: e.allergies,
      type: "textarea",
    },
  ];

  /**
   * Flat sections that employees can NEVER directly edit.
   * Admins retain full edit capability via adminOverride.
   * No "Update" correction buttons shown (allowCorrection=false).
   */
  const readOnlySectionProps = {
    hasConsented,
    isAdmin,
    isOwner,
    employeeId: e.id as string,
    // Only admin can save these sections; employees cannot edit them at all
    onSave: isAdmin ? saveSection : undefined,
    allowCorrection: false,
  };

  /**
   * Multi-entry sections that employees CAN update after consent.
   * All changes (add/edit/delete) go through the update request (correction_requests)
   * approval workflow — employees NEVER directly modify production records post-consent.
   * Admins (isAdmin=true) bypass the lock and can edit directly.
   */
  const editableMultiProps = {
    employeeId: e.id as string,
    isAdmin,
    hasConsented,  // Use actual value; MultiEntrySection routes locked changes through approval flow
  };

  /**
   * Multi-entry sections that are purely read-only for employees
   * (Employment History). allowUpdate=false hides all action buttons.
   * Admins can still edit normally.
   */
  const lockedMultiProps = {
    employeeId: e.id as string,
    isAdmin,
    hasConsented,
    allowUpdate: false,
  };

  return (
    <div className="space-y-4">
      {/* ── Read-only flat sections (employees cannot edit) ── */}
      <DataSection
        title="Personal & Contact Information"
        icon={<UserBoldDuotone size={18} />}
        fields={personalContactFields}
        {...readOnlySectionProps}
      />
      <DataSection
        title="Employment Information"
        icon={<CaseMinimalisticBoldDuotone size={18} />}
        fields={employmentFields}
        {...readOnlySectionProps}
      />
      <DataSection
        title="Payroll & Banking"
        icon={<CardBoldDuotone size={18} />}
        fields={payrollFields}
        {...readOnlySectionProps}
      />
      <DataSection
        title="Government Identification"
        icon={<PassportBoldDuotone size={18} />}
        fields={govtFields}
        {...readOnlySectionProps}
      />
      <DataSection
        title="Emergency Contact"
        icon={<HospitalBoldDuotone size={18} />}
        fields={emergencyFields}
        {...readOnlySectionProps}
      />
      <DataSection
        title="Health Information (Optional)"
        icon={<HeartBoldDuotone size={18} />}
        fields={healthFields}
        defaultOpen={false}
        {...readOnlySectionProps}
      />

      {/* ── Editable multi-entry sections (employees can always edit directly) ── */}
      <EducationSection {...editableMultiProps} />
      <CertificationsSection {...editableMultiProps} />
      <DependentsSection {...editableMultiProps} />
      <NomineesSection {...editableMultiProps} />

      {/* ── Read-only multi-entry sections (employees cannot edit) ── */}
      <EmploymentHistorySection {...lockedMultiProps} />

      {/* ── Additional notes (read-only for employees) ── */}
      <DataSection
        title="Additional Notes"
        icon={<DocumentTextBoldDuotone size={18} />}
        fields={[
          { label: "Languages", key: "languages", value: e.languages },
          { label: "Notes", key: "notes", value: e.notes, type: "textarea" },
        ]}
        defaultOpen={false}
        {...readOnlySectionProps}
      />
    </div>
  );
}
