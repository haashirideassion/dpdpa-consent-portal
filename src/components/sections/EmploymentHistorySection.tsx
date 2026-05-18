import { MultiEntrySection, type EntryField } from "@/components/MultiEntrySection";
import { EmployeeService } from "@/services/employee.service";
import { Bag2BoldDuotone } from "solar-icon-set";
import type { SectionConsentStatus } from "@/lib/section-consent";

const FIELDS: EntryField[] = [
  { key: "employer_name", label: "Employer / Company Name", required: true },
  { key: "designation", label: "Designation / Title", required: true },
  { key: "start_date", label: "Start Date", type: "date" },
  { key: "end_date", label: "End Date", type: "date" },
  {
    key: "reason_for_leaving",
    label: "Reason for Leaving",
    type: "select",
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
  { key: "last_drawn_salary", label: "Last Drawn Salary (₹)", placeholder: "e.g. 800000" },
];

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
      emptyMessage="No previous employment added. Click Add to get started."
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
