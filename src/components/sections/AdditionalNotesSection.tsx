import { MultiEntrySection, type EntryField } from "@/components/MultiEntrySection";
import { EmployeeService } from "@/services/employee.service";
import { DocumentTextBoldDuotone } from "solar-icon-set";
import type { SectionConsentStatus } from "@/lib/section-consent";

const FIELDS: EntryField[] = [
  { key: "languages", label: "Languages Known", placeholder: "e.g. English, Hindi, Tamil" },
  { key: "qualifications", label: "Additional Qualifications", placeholder: "e.g. Certified Scrum Master" },
  {
    key: "notes",
    label: "Additional Notes",
    type: "textarea",
    fullWidth: true,
    placeholder: "Any other relevant information about this employee",
  },
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

export function AdditionalNotesSection({ employeeId, isAdmin, hasConsented, allowUpdate, viewOnly, consentStatus, consentArea }: Props) {
  return (
    <MultiEntrySection
      title="Additional Notes"
      icon={<DocumentTextBoldDuotone size={18} />}
      employeeId={employeeId}
      isAdmin={isAdmin}
      hasConsented={hasConsented}
      allowUpdate={allowUpdate}
      viewOnly={viewOnly}
      consentStatus={consentStatus}
      consentArea={consentArea}
      sectionKey="employee_additional_details"
      loader={EmployeeService.getAdditionalNotes.bind(EmployeeService)}
      onAdd={EmployeeService.addAdditionalNotes.bind(EmployeeService)}
      onUpdate={EmployeeService.updateAdditionalNotes.bind(EmployeeService)}
      onDelete={EmployeeService.deleteAdditionalNotes.bind(EmployeeService)}
      fields={FIELDS}
      messages={{
        added: "Additional notes saved successfully.",
        updated: "Additional notes updated successfully.",
        deleted: "Additional notes deleted successfully.",
        saveError: "Unable to save additional notes.",
      }}
      emptyMessage="No additional notes available."
      emptyActionLabel="Add Additional Notes"
      renderCard={(entry) => (
        <div className="space-y-1.5">
          {entry.languages && (
            <p className="text-sm text-foreground">
              <span className="text-xs text-muted-foreground">Languages: </span>
              {entry.languages}
            </p>
          )}
          {entry.qualifications && (
            <p className="text-sm text-foreground">
              <span className="text-xs text-muted-foreground">Qualifications: </span>
              {entry.qualifications}
            </p>
          )}
          {entry.notes && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{entry.notes}</p>
          )}
        </div>
      )}
    />
  );
}
