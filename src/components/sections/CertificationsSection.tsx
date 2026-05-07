import { MultiEntrySection, type EntryField } from "@/components/MultiEntrySection";
import { EmployeeService } from "@/services/employee.service";
import { DiplomaBoldDuotone } from "solar-icon-set";

const COMMON_ISSUERS = [
  "AWS", "Microsoft", "Google", "PMI", "Scrum Alliance", "ISACA",
  "ISC2", "Salesforce", "Oracle", "Cisco", "CompTIA", "PeopleCert", "Other",
];

const FIELDS: EntryField[] = [
  { key: "name", label: "Certification Name", required: true, fullWidth: true },
  {
    key: "issuing_body",
    label: "Issuing Body",
    type: "select",
    options: COMMON_ISSUERS,
  },
  { key: "certification_id", label: "Certification ID / Number" },
  { key: "issue_date", label: "Issue Date", type: "date" },
  { key: "expiry_date", label: "Expiry Date", type: "date" },
  { key: "verification_url", label: "Verification URL", fullWidth: true, placeholder: "https://..." },
];

interface Props {
  employeeId: string;
  isAdmin?: boolean;
  hasConsented?: boolean;
}

export function CertificationsSection({ employeeId, isAdmin, hasConsented }: Props) {
  return (
    <MultiEntrySection
      title="Certifications"
      icon={<DiplomaBoldDuotone size={18} />}
      employeeId={employeeId}
      isAdmin={isAdmin}
      hasConsented={hasConsented}
      sectionKey="employee_certifications_v2"
      loader={EmployeeService.getCertifications.bind(EmployeeService)}
      onAdd={EmployeeService.addCertification.bind(EmployeeService)}
      onUpdate={EmployeeService.updateCertification.bind(EmployeeService)}
      onDelete={EmployeeService.deleteCertification.bind(EmployeeService)}
      fields={FIELDS}
      emptyMessage="No certifications added. Click Add to get started."
      renderCard={(entry) => {
        const isExpired = entry.expiry_date && new Date(entry.expiry_date) < new Date();
        const expiringSoon =
          !isExpired &&
          entry.expiry_date &&
          new Date(entry.expiry_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

        return (
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{entry.name}</p>
              {isExpired && (
                <span className="text-[10px] bg-destructive/10 text-destructive rounded-full px-2 py-0.5 font-medium">
                  Expired
                </span>
              )}
              {expiringSoon && (
                <span className="text-[10px] bg-warning/20 text-warning-foreground rounded-full px-2 py-0.5 font-medium">
                  Expiring soon
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{entry.issuing_body}</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {entry.issue_date && (
                <span className="text-xs text-muted-foreground">
                  Issued: {new Date(entry.issue_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                </span>
              )}
              {entry.expiry_date && (
                <span className={`text-xs ${isExpired ? "text-destructive" : "text-muted-foreground"}`}>
                  Expires: {new Date(entry.expiry_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                </span>
              )}
              {entry.certification_id && (
                <span className="text-xs font-mono text-muted-foreground">{entry.certification_id}</span>
              )}
              {entry.verification_url && (
                <a
                  href={entry.verification_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline underline-offset-2 hover:no-underline"
                >
                  Verify ↗
                </a>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}
