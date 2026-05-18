// Employee type now uses 'any' to support both flat and normalized schemas
import { useState, useEffect, useCallback } from "react";
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
import { ConsentService } from "@/services/consent.service";
import type { ConsentSection, PurposeConsentStatus, ConsentTemplate } from "@/services/consent.service";
import { useAuth } from "@/hooks/use-auth";
import { EducationSection } from "./sections/EducationSection";
import { CertificationsSection } from "./sections/CertificationsSection";
import { EmploymentHistorySection } from "./sections/EmploymentHistorySection";
import { NomineesSection } from "./sections/NomineesSection";
import { DependentsSection } from "./sections/DependentsSection";
import { computeSectionConsentStatus, UI_SECTION_CONSENT_MAP } from "@/lib/section-consent";
import type { SectionConsentStatus } from "@/lib/section-consent";
import { SectionConsentArea } from "./SectionConsentArea";

type Employee = any;

interface EmployeeDataViewProps {
  employee: Employee;
  onEmployeeUpdated: (updated?: Employee) => void;
  hasConsented?: boolean;
  /**
   * When true the viewer has admin privileges — sensitive fields are shown
   * unmasked. Does NOT imply read-only mode; use `adminReview` for that.
   */
  isAdmin?: boolean;
  /**
   * When true the admin is reviewing *another* employee's profile (read-only:
   * no consent interactions, no edit/add/delete).
   * When false (default) the viewer is managing their own profile
   * (employee self-service or admin viewing their own data — fully interactive).
   */
  adminReview?: boolean;
  /** Active consent template — required for inline pre-consent checkboxes. */
  template?: ConsentTemplate | null;
  /** Shared toggle state for all purposes (lifted from GranularConsentForm). */
  toggles?: Record<string, boolean>;
  /** Callback to update a single toggle (lifted from GranularConsentForm). */
  onToggle?: (key: string, val: boolean) => void;
}

export function EmployeeDataView({
  employee,
  onEmployeeUpdated: _onEmployeeUpdated,
  hasConsented = false,
  isAdmin = false,
  adminReview = false,
  template,
  toggles,
  onToggle,
}: EmployeeDataViewProps) {
  const e = employee;
  const { user } = useAuth();
  const isOwner = user?.id === e.user_id;

  // ── Section-level consent statuses ────────────────────────────────────────
  // Loaded once from purpose-level records and aggregated per UI section.
  const [sectionedStatuses, setSectionedStatuses] = useState<
    Array<{ section: ConsentSection; statuses: PurposeConsentStatus[] }>
  >([]);

  const refreshStatuses = useCallback(async () => {
    if (!e.id) return;
    const { sectionedStatuses: s } = await ConsentService.getConsentStatuses(e.id);
    setSectionedStatuses(s);
  }, [e.id]);

  useEffect(() => {
    refreshStatuses();
  }, [refreshStatuses, hasConsented]); // re-fetch when consent is submitted

  /** Returns the aggregate status for a UI section key. */
  function sectionStatus(key: string): SectionConsentStatus {
    return computeSectionConsentStatus(key, sectionedStatuses);
  }

  /** Returns ConsentSection objects mapped to the given UI section key. */
  function getConsentSections(uiKey: string): ConsentSection[] {
    if (!template) return [];
    const numbers = UI_SECTION_CONSENT_MAP[uiKey] ?? [];
    return template.sections.filter((s) => numbers.includes(s.section_number));
  }

  /** Returns PurposeConsentStatus objects mapped to the given UI section key. */
  function getPurposeStatuses(uiKey: string): PurposeConsentStatus[] {
    const numbers = UI_SECTION_CONSENT_MAP[uiKey] ?? [];
    return sectionedStatuses
      .filter((s) => numbers.includes(s.section.section_number))
      .flatMap((s) => s.statuses);
  }

  /** Builds the inline SectionConsentArea node for a given UI section key. */
  function consentAreaFor(uiKey: string): React.ReactNode | undefined {
    // Admin reviewing another employee → read-only consent status panel
    if (adminReview) {
      const statuses = getPurposeStatuses(uiKey);
      if (statuses.length === 0) return undefined;
      return (
        <SectionConsentArea
          hasConsented={true}
          purposeStatuses={statuses}
          employeeId={e.id}
          readOnly={true}
        />
      );
    }

    // Self-service view (employee or admin viewing own profile) → interactive
    if (!user) return undefined;

    if (!hasConsented) {
      if (!template || !toggles || !onToggle) return undefined;
      const sections = getConsentSections(uiKey);
      if (sections.length === 0) return undefined;
      return (
        <SectionConsentArea
          hasConsented={false}
          consentSections={sections}
          toggles={toggles}
          onToggle={onToggle}
        />
      );
    }

    const statuses = getPurposeStatuses(uiKey);
    if (statuses.length === 0) return undefined;
    const employeeName = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim();
    return (
      <SectionConsentArea
        hasConsented={true}
        purposeStatuses={statuses}
        employeeId={e.id}
        userId={user.id}
        employeeName={employeeName}
        onRefresh={refreshStatuses}
      />
    );
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
   * Flat sections — always read-only (no edit button shown for anyone).
   * Admin sees data unmasked but cannot edit for demo.
   * No "Update" correction buttons shown (allowCorrection=false).
   */
  const readOnlySectionProps = {
    hasConsented,
    isAdmin,
    isOwner,
    employeeId: e.id as string,
    onSave: undefined,
    allowCorrection: false,
  };

  /**
   * Multi-entry sections employees (and admin self-view) CAN update.
   * All changes go through the correction_requests approval workflow.
   * adminReview mode forces viewOnly so no edit/add/delete appears.
   */
  const editableMultiProps = {
    employeeId: e.id as string,
    isAdmin,
    hasConsented,
    hideAdd: adminReview,
    viewOnly: adminReview,
  };

  /**
   * Multi-entry sections that are purely read-only for the self-service user
   * (Employment History). allowUpdate=false hides correction buttons.
   * adminReview mode also forces viewOnly.
   */
  const lockedMultiProps = {
    employeeId: e.id as string,
    isAdmin,
    hasConsented,
    allowUpdate: false,
    viewOnly: adminReview,
  };

  return (
    <div className="space-y-4">
      {/* ── Read-only flat sections (employees cannot edit) ── */}
      <DataSection
        title="Personal & Contact Information"
        icon={<UserBoldDuotone size={18} />}
        fields={personalContactFields}
        consentStatus={sectionStatus("personalContact")}
        consentArea={consentAreaFor("personalContact")}
        {...readOnlySectionProps}
      />
      <DataSection
        title="Employment Information"
        icon={<CaseMinimalisticBoldDuotone size={18} />}
        fields={employmentFields}
        consentStatus={sectionStatus("employment")}
        {...readOnlySectionProps}
      />
      <DataSection
        title="Payroll & Banking"
        icon={<CardBoldDuotone size={18} />}
        fields={payrollFields}
        consentStatus={sectionStatus("payrollBanking")}
        consentArea={consentAreaFor("payrollBanking")}
        {...readOnlySectionProps}
      />
      <DataSection
        title="Government Identification"
        icon={<PassportBoldDuotone size={18} />}
        fields={govtFields}
        consentStatus={sectionStatus("governmentIds")}
        consentArea={consentAreaFor("governmentIds")}
        {...readOnlySectionProps}
      />
      <DataSection
        title="Emergency Contact"
        icon={<HospitalBoldDuotone size={18} />}
        fields={emergencyFields}
        consentStatus={sectionStatus("emergencyContact")}
        consentArea={consentAreaFor("emergencyContact")}
        {...readOnlySectionProps}
      />
      <DataSection
        title="Health Information (Optional)"
        icon={<HeartBoldDuotone size={18} />}
        fields={healthFields}
        defaultOpen={false}
        consentStatus={sectionStatus("health")}
        consentArea={consentAreaFor("health")}
        {...readOnlySectionProps}
      />

      {/* ── Editable multi-entry sections (employees can always edit directly) ── */}
      <EducationSection {...editableMultiProps} consentStatus={sectionStatus("education")} consentArea={consentAreaFor("education")} />
      <CertificationsSection {...editableMultiProps} consentStatus={sectionStatus("certifications")} consentArea={consentAreaFor("certifications")} />
      <DependentsSection {...editableMultiProps} consentStatus={sectionStatus("dependents")} consentArea={consentAreaFor("dependents")} />
      <NomineesSection {...editableMultiProps} consentStatus={sectionStatus("nominees")} consentArea={consentAreaFor("nominees")} />

      {/* ── Read-only multi-entry sections (employees cannot edit) ── */}
      <EmploymentHistorySection {...lockedMultiProps} consentStatus={sectionStatus("employmentHistory")} consentArea={consentAreaFor("employmentHistory")} />

      {/* ── Additional notes (read-only for employees) ── */}
      <DataSection
        title="Additional Notes"
        icon={<DocumentTextBoldDuotone size={18} />}
        fields={[
          { label: "Languages", key: "languages", value: e.languages },
          { label: "Notes", key: "notes", value: e.notes, type: "textarea" },
        ]}
        defaultOpen={false}
        consentStatus={sectionStatus("additionalNotes")}
        {...readOnlySectionProps}
      />
    </div>
  );
}
