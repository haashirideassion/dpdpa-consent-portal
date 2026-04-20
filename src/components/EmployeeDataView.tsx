import type { Tables } from "@/integrations/supabase/types";
import { DataSection } from "./DataSection";
import type { FieldDef } from "./DataField";
import {
  UserBoldDuotone,
  PhoneBoldDuotone,
  CaseMinimalisticBoldDuotone,
  CardBoldDuotone,
  PassportBoldDuotone,
  HospitalBoldDuotone,
  DocumentTextBoldDuotone,
} from "solar-icon-set";
import { EmployeeService } from "@/services/employee.service";

type Employee = Tables<"employees">;

interface EmployeeDataViewProps {
  employee: Employee;
  onEmployeeUpdated: (updated: Employee) => void;
}

export function EmployeeDataView({ employee, onEmployeeUpdated }: EmployeeDataViewProps) {
  const e = employee;

  async function saveSection(updates: Record<string, string>) {
    await EmployeeService.updateEmployee(e.id, updates);
    onEmployeeUpdated({ ...e, ...updates });
  }

  const personalFields: FieldDef[] = [
    { label: "First Name", key: "first_name", value: e.first_name },
    { label: "Last Name", key: "last_name", value: e.last_name },
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
  ];

  const contactFields: FieldDef[] = [
    { label: "Work Email", key: "work_email", value: e.work_email, type: "email", locked: true },
    { label: "Personal Email", key: "personal_email", value: e.personal_email, type: "email" },
    { label: "Phone Number", key: "phone_number", value: e.phone_number, type: "tel" },
    { label: "Alternate Phone", key: "alternate_phone", value: e.alternate_phone, type: "tel" },
    {
      label: "Current Address",
      key: "current_address",
      value: e.current_address,
      type: "textarea",
    },
    {
      label: "Permanent Address",
      key: "permanent_address",
      value: e.permanent_address,
      type: "textarea",
    },
    { label: "City", key: "city", value: e.city },
    { label: "State", key: "state", value: e.state },
    { label: "Pincode", key: "pincode", value: e.pincode },
  ];

  const employmentFields: FieldDef[] = [
    { label: "Employee ID", key: "employee_id", value: e.employee_id, locked: true },
    { label: "Department", key: "department", value: e.department, locked: true },
    { label: "Designation", key: "designation", value: e.designation, locked: true },
    {
      label: "Date of Joining",
      key: "date_of_joining",
      value: e.date_of_joining,
      type: "date",
      locked: true,
    },
    {
      label: "Employment Type",
      key: "employment_type",
      value: e.employment_type,
      type: "select",
      options: ["Full-time", "Part-time", "Contract", "Intern", "Consultant"],
      locked: true,
    },
    {
      label: "Reporting Manager",
      key: "reporting_manager",
      value: e.reporting_manager,
      locked: true,
    },
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

  const payrollFields: FieldDef[] = [
    { label: "Bank Name", key: "bank_name", value: e.bank_name },
    {
      label: "Bank Account Number",
      key: "bank_account_number",
      value: e.bank_account_number,
    },
    { label: "IFSC Code", key: "ifsc_code", value: e.ifsc_code },
    { label: "PAN Number", key: "pan_number", value: e.pan_number },
    { label: "CTC", key: "ctc", value: e.ctc },
  ];

  const govtFields: FieldDef[] = [
    { label: "Aadhaar Number", key: "aadhaar_number", value: e.aadhaar_number },
    { label: "UAN Number", key: "uan_number", value: e.uan_number },
    { label: "Passport Number", key: "passport_number", value: e.passport_number },
    {
      label: "Passport Expiry",
      key: "passport_expiry",
      value: e.passport_expiry,
      type: "date",
    },
    { label: "Driving License", key: "driving_license", value: e.driving_license },
    { label: "Voter ID", key: "voter_id", value: e.voter_id },
  ];

  const emergencyFields: FieldDef[] = [
    {
      label: "Contact Name",
      key: "emergency_contact_name",
      value: e.emergency_contact_name,
    },
    {
      label: "Relation",
      key: "emergency_contact_relation",
      value: e.emergency_contact_relation,
    },
    {
      label: "Contact Phone",
      key: "emergency_contact_phone",
      value: e.emergency_contact_phone,
      type: "tel",
    },
    {
      label: "Contact Email",
      key: "emergency_contact_email",
      value: e.emergency_contact_email,
      type: "email",
    },
  ];

  const metadataFields: FieldDef[] = [
    {
      label: "Qualifications",
      key: "qualifications",
      value: e.qualifications,
      type: "textarea",
    },
    {
      label: "Certifications",
      key: "certifications",
      value: e.certifications,
      type: "textarea",
    },
    { label: "Languages", key: "languages", value: e.languages },
    { label: "Notes", key: "notes", value: e.notes, type: "textarea" },
  ];

  return (
    <div className="space-y-4">
      <DataSection
        title="Personal Information"
        icon={<UserBoldDuotone size={20} />}
        fields={personalFields}
        onSave={saveSection}
      />
      <DataSection
        title="Contact Information"
        icon={<PhoneBoldDuotone size={20} />}
        fields={contactFields}
        onSave={saveSection}
      />
      <DataSection
        title="Employment Information"
        icon={<CaseMinimalisticBoldDuotone size={20} />}
        fields={employmentFields}
        onSave={saveSection}
      />
      <DataSection
        title="Payroll & Banking"
        icon={<CardBoldDuotone size={20} />}
        fields={payrollFields}
        onSave={saveSection}
      />
      <DataSection
        title="Government Identification"
        icon={<PassportBoldDuotone size={20} />}
        fields={govtFields}
        onSave={saveSection}
      />
      <DataSection
        title="Emergency Contact"
        icon={<HospitalBoldDuotone size={20} />}
        fields={emergencyFields}
        onSave={saveSection}
      />
      <DataSection
        title="Additional Information"
        icon={<DocumentTextBoldDuotone size={20} />}
        fields={metadataFields}
        defaultOpen={false}
        onSave={saveSection}
      />
    </div>
  );
}
