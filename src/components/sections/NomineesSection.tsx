import { MultiEntrySection, type EntryField } from "@/components/MultiEntrySection";
import { EmployeeService } from "@/services/employee.service";
import { UserHeartRoundedBoldDuotone } from "solar-icon-set";
import type { SectionConsentStatus } from "@/lib/section-consent";

const FIELDS: EntryField[] = [
  { key: "full_name", label: "Nominee Full Name", required: true },
  {
    key: "relationship",
    label: "Relationship",
    type: "select",
    required: true,
    options: ["Spouse", "Child", "Parent", "Sibling", "Parent-in-Law", "Other"],
  },
  { key: "date_of_birth", label: "Date of Birth", type: "date" },
  { key: "mobile", label: "Mobile Number", type: "tel" },
  {
    key: "allocation_percentage",
    label: "Allocation % (must total 100 across nominees)",
    type: "number",
    required: true,
    placeholder: "e.g. 50",
  },
  { key: "address", label: "Address", type: "textarea", fullWidth: true },
  { key: "guardian_name", label: "Guardian Name (if nominee is minor)" },
  { key: "guardian_relationship", label: "Guardian Relationship" },
];

interface Props {
  employeeId: string;
  isAdmin?: boolean;
  hasConsented?: boolean;
  hideAdd?: boolean;
  viewOnly?: boolean;
  consentStatus?: SectionConsentStatus;
  consentArea?: React.ReactNode;
}

export function NomineesSection({ employeeId, isAdmin, hasConsented, hideAdd, viewOnly, consentStatus, consentArea }: Props) {
  return (
    <MultiEntrySection
      title="Insurance Nominees"
      icon={<UserHeartRoundedBoldDuotone size={18} />}
      employeeId={employeeId}
      isAdmin={isAdmin}
      hasConsented={hasConsented}
      hideAdd={hideAdd}
      viewOnly={viewOnly}
      consentStatus={consentStatus}
      consentArea={consentArea}
      sectionKey="employee_nominees"
      loader={EmployeeService.getNominees.bind(EmployeeService)}
      onAdd={EmployeeService.addNominee.bind(EmployeeService)}
      onUpdate={EmployeeService.updateNominee.bind(EmployeeService)}
      onDelete={EmployeeService.deleteNominee.bind(EmployeeService)}
      fields={FIELDS}
      emptyMessage="No nominees added. Nominee allocation must total 100%."
      renderCard={(entry) => (
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{entry.full_name}</p>
            <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
              {entry.allocation_percentage ?? 0}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {entry.relationship}
            {entry.date_of_birth ? ` • DOB: ${new Date(entry.date_of_birth).toLocaleDateString("en-IN")}` : ""}
          </p>
          {entry.guardian_name && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Guardian: {entry.guardian_name} ({entry.guardian_relationship})
            </p>
          )}
        </div>
      )}
    />
  );
}
