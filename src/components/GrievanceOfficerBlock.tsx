import { ShieldCheckBoldDuotone, PhoneCallingBoldDuotone, LetterBoldDuotone } from "solar-icon-set";

/**
 * GrievanceOfficerBlock
 *
 * Per spec (Page 26): Always displayed at the bottom of the consent screen
 * and the My Consents area. Shows DPO contact details and escalation path.
 *
 * Props are optional — falls back to placeholder values which should be
 * replaced by the Legal/DPO team per legal entity.
 */
interface GrievanceOfficerBlockProps {
  dpoName?: string;
  dpoEmail?: string;
  dpoPhone?: string;
}

export function GrievanceOfficerBlock({
  dpoName  = "[DPO Name — configured per Legal Entity]",
  dpoEmail = "dpo@company.com",
  dpoPhone = "+91 XXX XXX XXXX",
}: GrievanceOfficerBlockProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 mt-2">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheckBoldDuotone size={16} className="text-primary/70 shrink-0" />
        <p className="text-xs font-semibold text-foreground/80">
          For any concerns about your data, contact our Data Protection Officer
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div className="space-y-1">
          <p>
            <span className="font-medium text-foreground/70">Name: </span>
            {dpoName}
          </p>
          <p className="flex items-center gap-1.5">
            <LetterBoldDuotone size={11} className="text-muted-foreground/60 shrink-0" />
            <a
              href={`mailto:${dpoEmail}`}
              className="hover:text-primary underline-offset-2 hover:underline"
            >
              {dpoEmail}
            </a>
          </p>
          <p className="flex items-center gap-1.5">
            <PhoneCallingBoldDuotone size={11} className="text-muted-foreground/60 shrink-0" />
            {dpoPhone}
          </p>
        </div>
        <div className="space-y-1">
          <p>
            <span className="font-medium text-foreground/70">Response time: </span>
            Acknowledgement within 7 days, resolution within 30 days
          </p>
          <p>
            <span className="font-medium text-foreground/70">Escalation: </span>
            Data Protection Board of India
          </p>
        </div>
      </div>
    </div>
  );
}
