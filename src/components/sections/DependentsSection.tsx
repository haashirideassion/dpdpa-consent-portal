import { MultiEntrySection, type EntryField } from "@/components/MultiEntrySection";
import { MaskedFieldValue } from "@/components/MaskedFieldValue";
import { EmployeeService } from "@/services/employee.service";
import { UsersGroupTwoRoundedBoldDuotone } from "solar-icon-set";
import type { SectionConsentStatus } from "@/lib/section-consent";

const FIELDS: EntryField[] = [
  { key: "name", label: "Dependent Name", required: true },
  {
    key: "relationship",
    label: "Relationship",
    type: "select",
    required: true,
    options: ["Spouse", "Child", "Parent", "Sibling", "Parent-in-Law", "Other"],
  },
  { key: "date_of_birth", label: "Date of Birth", type: "date" },
  {
    key: "gender",
    label: "Gender",
    type: "select",
    options: ["Male", "Female", "Other"],
  },
];

interface Props {
  employeeId: string;
  isAdmin?: boolean;
  /** Owner (viewing their own profile) always sees raw values — no masking. */
  isOwner?: boolean;
  hasConsented?: boolean;
  hideAdd?: boolean;
  viewOnly?: boolean;
  consentStatus?: SectionConsentStatus;
  consentArea?: React.ReactNode;
}

export function DependentsSection({ employeeId, isAdmin, isOwner, hasConsented, hideAdd, viewOnly, consentStatus, consentArea }: Props) {
  return (
    <MultiEntrySection
      title="Dependents"
      icon={<UsersGroupTwoRoundedBoldDuotone size={18} />}
      employeeId={employeeId}
      isAdmin={isAdmin}
      hasConsented={hasConsented}
      hideAdd={hideAdd}
      viewOnly={viewOnly}
      consentStatus={consentStatus}
      consentArea={consentArea}
      sectionKey="employee_dependents"
      loader={EmployeeService.getDependents.bind(EmployeeService)}
      onAdd={EmployeeService.addDependent.bind(EmployeeService)}
      onUpdate={EmployeeService.updateDependent.bind(EmployeeService)}
      onDelete={EmployeeService.deleteDependent.bind(EmployeeService)}
      fields={FIELDS}
      emptyMessage="No dependents added. Click Add to get started."
      renderCard={(entry) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{entry.name}</p>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{entry.relationship}</span>
            {entry.gender && (
              <span className="text-xs text-muted-foreground">
                <MaskedFieldValue fieldKey="gender" value={entry.gender} isOwner={isOwner} isAdmin={isAdmin} employeeId={employeeId} />
              </span>
            )}
            {entry.date_of_birth && (
              <span className="text-xs text-muted-foreground">
                DOB:{" "}
                <MaskedFieldValue
                  fieldKey="date_of_birth"
                  value={new Date(entry.date_of_birth).toLocaleDateString("en-IN")}
                  isOwner={isOwner}
                  isAdmin={isAdmin}
                  employeeId={employeeId}
                />
              </span>
            )}
          </div>
        </div>
      )}
    />
  );
}
