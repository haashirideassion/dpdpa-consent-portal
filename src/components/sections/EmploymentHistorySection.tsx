import { MultiEntrySection, type EntryField } from "@/components/MultiEntrySection";
import { EmployeeService } from "@/services/employee.service";
import { Bag2BoldDuotone } from "solar-icon-set";
import type { SectionConsentStatus } from "@/lib/section-consent";

const FIELDS: EntryField[] = [
  { key: "employer_name", label: "Employer / Company Name", required: true, placeholder: "e.g. Acme Corporation" },
  { key: "designation", label: "Designation / Title", required: true, placeholder: "e.g. Software Engineer" },
  { key: "start_date", label: "Start Date", type: "date", required: true },
  { key: "end_date", label: "End Date", type: "date" },
  {
    key: "reason_for_leaving",
    label: "Reason for Leaving",
    type: "select",
    placeholder: "Select reason",
    options: [
      "Better Opportunity",
      "Career Growth",
      "Relocation",
      "Higher Education",
      "Layoff / Restructuring",
      "Contract End",
      "Personal Reasons",
      "Other",
    ],
  },
  { key: "last_drawn_salary", label: "Last Drawn Salary (₹)", type: "number", placeholder: "₹800,000" },
];

function validateEmploymentDraft(draft: Record<string, any>): Record<string, string> {
  const errors: Record<string, string> = {};

  if (draft.start_date && draft.end_date) {
    const start = new Date(draft.start_date);
    const end = new Date(draft.end_date);
    if (end <= start) {
      errors.end_date = "End date must be after the start date";
    }
  }

  if (draft.last_drawn_salary !== undefined && draft.last_drawn_salary !== null && String(draft.last_drawn_salary).trim() !== "") {
    const salary = Number(draft.last_drawn_salary);
    if (!Number.isFinite(salary) || salary <= 0) {
      errors.last_drawn_salary = "Salary must be a positive number";
    }
  }

  return errors;
}

interface Props {
  employeeId: string;
  isAdmin?: boolean;
  hasConsented?: boolean;
  allowUpdate?: boolean;
  viewOnly?: boolean;
  consentStatus?: SectionConsentStatus;
  consentArea?: React.ReactNode;
}

export function EmploymentHistorySection({ employeeId, isAdmin, hasConsented, allowUpdate, viewOnly, consentStatus, consentArea }: Props) {
  return (
    <MultiEntrySection
      title="Previous Employment"
      icon={<Bag2BoldDuotone size={18} />}
      employeeId={employeeId}
      isAdmin={isAdmin}
      hasConsented={hasConsented}
      allowUpdate={allowUpdate}
      viewOnly={viewOnly}
      consentStatus={consentStatus}
      consentArea={consentArea}
      sectionKey="employee_employment_history"
      loader={EmployeeService.getEmploymentHistory.bind(EmployeeService)}
      onAdd={EmployeeService.addEmploymentHistory.bind(EmployeeService)}
      onUpdate={EmployeeService.updateEmploymentHistory.bind(EmployeeService)}
      onDelete={EmployeeService.deleteEmploymentHistory.bind(EmployeeService)}
      fields={FIELDS}
      validate={validateEmploymentDraft}
      submitLabels={{ add: "Add", edit: "Save Changes" }}
      messages={{
        added: "Employment added successfully.",
        updated: "Employment updated successfully.",
        deleted: "Employment deleted successfully.",
        saveError: "Unable to save employment.",
      }}
      emptyMessage="No previous employment added."
      emptyActionLabel="Add Previous Employment"
      renderCard={(entry) => {
        const startYear = entry.start_date
          ? new Date(entry.start_date).getFullYear()
          : null;
        const endYear = entry.end_date
          ? new Date(entry.end_date).getFullYear()
          : "Present";

        return (
          <div>
            <p className="text-sm font-semibold text-foreground">{entry.employer_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{entry.designation}</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {startYear && (
                <span className="text-xs text-muted-foreground">
                  {startYear} – {endYear}
                </span>
              )}
              {entry.reason_for_leaving && (
                <span className="text-xs bg-muted rounded-full px-2 py-0.5 text-muted-foreground">
                  {entry.reason_for_leaving}
                </span>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}
