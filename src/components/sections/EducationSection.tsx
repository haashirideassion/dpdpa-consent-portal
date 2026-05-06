import { MultiEntrySection, type EntryField } from "@/components/MultiEntrySection";
import { EmployeeService } from "@/services/employee.service";
import { SquareAcademicCapBoldDuotone } from "solar-icon-set";

const FIELDS: EntryField[] = [
  {
    key: "qualification_type",
    label: "Qualification Type",
    type: "select",
    required: true,
    options: ["10th / SSC", "12th / HSC", "Diploma", "Graduation", "Post-Graduation", "Doctorate", "Other"],
  },
  { key: "specialisation", label: "Specialisation / Stream" },
  { key: "institution", label: "Institution / College", required: true },
  { key: "university", label: "University / Board" },
  { key: "year_of_passing", label: "Year of Passing", type: "number", placeholder: "e.g. 2018" },
  {
    key: "grade_type",
    label: "Grade Type",
    type: "select",
    options: ["Percentage", "CGPA", "Pass-Class"],
  },
  { key: "grade_value", label: "Grade / Score", placeholder: "e.g. 85% or 8.5 CGPA" },
  {
    key: "mode",
    label: "Mode of Study",
    type: "select",
    options: ["Regular", "Distance", "Online"],
  },
  { key: "roll_number", label: "Roll / Enrollment Number" },
];

interface Props {
  employeeId: string;
  isAdmin?: boolean;
  hasConsented?: boolean;
}

export function EducationSection({ employeeId, isAdmin, hasConsented }: Props) {
  return (
    <MultiEntrySection
      title="Educational Qualifications"
      icon={<SquareAcademicCapBoldDuotone size={18} />}
      employeeId={employeeId}
      isAdmin={isAdmin}
      hasConsented={hasConsented}
      sectionKey="employee_education"
      loader={EmployeeService.getEducation.bind(EmployeeService)}
      onAdd={EmployeeService.addEducation.bind(EmployeeService)}
      onUpdate={EmployeeService.updateEducation.bind(EmployeeService)}
      onDelete={EmployeeService.deleteEducation.bind(EmployeeService)}
      fields={FIELDS}
      emptyMessage="No educational qualifications added. Click Add to get started."
      renderCard={(entry) => (
        <div>
          <p className="text-sm font-semibold text-foreground">
            {entry.qualification_type || "Qualification"}
            {entry.specialisation ? ` — ${entry.specialisation}` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {[entry.institution, entry.university].filter(Boolean).join(", ")}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {entry.year_of_passing && (
              <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                {entry.year_of_passing}
              </span>
            )}
            {entry.grade_value && (
              <span className="text-xs text-muted-foreground">
                {entry.grade_type ? `${entry.grade_type}: ` : ""}{entry.grade_value}
              </span>
            )}
            {entry.mode && (
              <span className="text-xs text-muted-foreground">{entry.mode}</span>
            )}
          </div>
        </div>
      )}
    />
  );
}
