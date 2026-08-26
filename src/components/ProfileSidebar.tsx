import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressRing } from "@/components/ProgressRing";
import { ShieldCheckBoldDuotone, UserBoldDuotone, ArrowDownBoldDuotone } from "solar-icon-set";

// ── Profile completion calculator ─────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH — the only profile-completion calculation in the
// app. Exported so every screen that shows it (employee "My Data" header +
// sidebar, Admin employee detail sidebar, Admin "My Data") calls this exact
// function instead of each computing its own number. Do not duplicate this
// logic elsewhere — import calcProfileCompletion/calcProfileCompletionBreakdown.
//
// ── Which sections/fields count, and why (audit) ──────────────────────────
// Deliberately NOT every column in the employee schema. Included only the
// sections that represent core, universally-applicable identity/contact/
// employment/banking data — the same data EmployeeDataView renders as
// editable "profile" fields:
//   - Personal:   first/last name, DOB, gender, blood group, marital status,
//                 nationality, father's/mother's name.
//   - Contact:    work + personal email, phone, current + permanent address,
//                 city, state, pincode.
//   - Employment: department, designation, date of joining, employment
//                 type, work location.
//   - Financial:  bank name, bank account number, IFSC, PAN — the minimum
//                 set actually required to process payroll; NOT bank_branch/
//                 upi_id/pf_account/esic_number/ctc, which are situational
//                 (e.g. UPI isn't used by everyone; PF/ESIC don't apply to
//                 every employment type) rather than universally expected.
//
// Explicitly EXCLUDED, and why — counting these would falsely mark a
// genuinely complete profile as incomplete for employees to whom they don't
// apply, or would conflate "profile data" with "process completion":
//   - alternate_phone: a backup contact channel by definition, not core data.
//   - Government IDs (aadhaar/UAN/passport/driving licence/voter ID):
//     situational — most employees will never hold all five.
//   - Emergency contact: not every employee has provided one on day one;
//     never gated 100% in the original implementation either.
//   - Health information: the existing UI itself labels this section
//     "(optional, voluntary)" — never counted, and must stay that way.
//   - Additional details (qualifications/certifications/languages/notes):
//     supplementary, not identity/contact/employment/banking data.
//   - Video completion, education completion, consent status/submission:
//     these measure PROCESS completion, not PROFILE DATA completeness, and
//     must never be folded into this percentage.
const COMPLETION_SECTIONS: { label: string; fields: string[] }[] = [
  { label: "Personal", fields: ["first_name", "last_name", "gender", "date_of_birth", "blood_group", "marital_status", "nationality", "father_name", "mother_name"] },
  { label: "Contact", fields: ["work_email", "personal_email", "phone_number", "current_address", "permanent_address", "city", "state", "pincode"] },
  { label: "Employment", fields: ["department", "designation", "date_of_joining", "employment_type", "work_location"] },
  { label: "Financial", fields: ["bank_name", "bank_account_number", "ifsc_code", "pan_number"] },
];

export interface CompletionSection {
  label: string;
  percent: number;
  filled: number;
  total: number;
}

// Placeholder strings the UI itself uses to *display* an empty value
// (e.g. DataField/EmployeeDataView render "—" for a blank field). Defensive
// only — in the normal flow this function receives the raw employee record,
// not display strings — but a placeholder must never be misread as real data.
const EMPTY_PLACEHOLDERS = new Set(["—", "-", "n/a", "na"]);

/**
 * Type-aware "does this field have a real value" check — deliberately NOT a
 * bare truthiness check, which would misclassify legitimate values (e.g. a
 * numeric 0, or a boolean false where false is itself meaningful data) and
 * would also treat whitespace-only strings or display placeholders as filled.
 */
function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v);
  const s = String(v).trim();
  if (s === "") return false;
  if (EMPTY_PLACEHOLDERS.has(s.toLowerCase())) return false;
  return true;
}

export function calcProfileCompletionBreakdown(e: any): { overall: number; sections: CompletionSection[] } {
  const record = e ?? {};

  // bank_account_number/ifsc_code/pan_number are 3 of the 15 field-level-
  // encrypted PII fields (see src/lib/dpdpa.ts ENCRYPTED_FIELDS) — the
  // profile load no longer fetches their plaintext (or ciphertext), only a
  // `<key>_has_value` presence flag (see EmployeeService.getByUserId/getById
  // → fetchPiiPresence). "Filled" for these must read that flag instead of
  // the (now always-empty) raw key, or a genuinely complete profile would
  // show as incomplete.
  const isFieldFilled = (key: string) => {
    const presenceKey = `${key}_has_value`;
    if (presenceKey in record) return !!record[presenceKey];
    return isFilled(record[key]);
  };

  const sections = COMPLETION_SECTIONS.map(({ label, fields }) => {
    const filled = fields.filter((key) => isFieldFilled(key)).length;
    return { label, filled, total: fields.length, percent: Math.round((filled / fields.length) * 100) };
  });

  const totalFields = sections.reduce((sum, s) => sum + s.total, 0);
  const totalFilled = sections.reduce((sum, s) => sum + s.filled, 0);

  return {
    overall: totalFields === 0 ? 0 : Math.round((totalFilled / totalFields) * 100),
    sections,
  };
}

export function calcProfileCompletion(e: any): number {
  return calcProfileCompletionBreakdown(e).overall;
}

// ── Identity Row ──────────────────────────────────────────────────────────────
function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground leading-snug">{value}</span>
    </div>
  );
}

// ── ProfileSidebar ────────────────────────────────────────────────────────────
interface ProfileSidebarProps {
  employee: any;
  role?: "admin" | "employee";
}

export function ProfileSidebar({ employee, role = "employee" }: ProfileSidebarProps) {
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const firstName = employee?.first_name ?? "";
  const lastName = employee?.last_name ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "—";
  const initials =
    [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || "?";

  const { overall: completion, sections: completionSections } = calcProfileCompletionBreakdown(employee);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  const updatedAt = employee?.updated_at
    ? new Date(employee.updated_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <Card className="border border-border shadow-sm sticky top-6 rounded-2xl overflow-hidden">
      <div className="h-14 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" aria-hidden="true" />
      <CardContent className="pt-0 pb-5 px-5 flex flex-col items-center gap-0 -mt-8">

        {/* ── Avatar + camera upload ── */}
        <div className="relative mb-3">
          <Avatar className="h-20 w-20 ring-4 ring-card shadow-sm">
            {avatarSrc && <AvatarImage src={avatarSrc} alt={fullName} />}
            <AvatarFallback className="text-xl font-semibold bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-md transition-transform hover:scale-110 focus:outline-none"
            title="Upload profile photo"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
              <path d="M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" />
              <path
                fillRule="evenodd"
                d="M9.244 3.5a1 1 0 0 0-.894.553L7.382 6H5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-2.382l-.968-1.947A1 1 0 0 0 14.756 3.5H9.244ZM12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* ── Name + role badge + code ── */}
        <div className="w-full text-center space-y-1 mb-3">
          <h2 className="text-base font-semibold leading-tight text-foreground">{fullName}</h2>
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {role === "admin" ? <ShieldCheckBoldDuotone size={10} /> : <UserBoldDuotone size={10} />}
              {role === "admin" ? "Admin" : "Employee"}
            </span>
            {employee?.employee_code && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                {employee.employee_code}
              </span>
            )}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="w-full border-t border-border mb-3" />

        {/* ── Identity detail rows ── */}
        <div className="w-full space-y-2.5">
          {employee?.designation && (
            <IdentityRow label="Designation" value={employee.designation} />
          )}
          {employee?.department && (
            <IdentityRow label="Department" value={employee.department} />
          )}
          {employee?.work_location && (
            <IdentityRow label="Location" value={employee.work_location} />
          )}
          {employee?.employment_type && (
            <IdentityRow label="Employment" value={employee.employment_type} />
          )}
          {employee?.employee_status && (
            <IdentityRow label="Status" value={employee.employee_status} />
          )}
        </div>

        {/* ── Profile completion ring ──────────────────────────────────────
            p-4 (not p-3) + gap-3.5 so the ring, text, and arrow all get
            comfortable breathing room from the card edges and each other at
            every completion level (0–100%) — the ring's own SVG label is
            already centered (ProgressRing), so this is purely the outer
            spacing that was cramped. */}
        <div className="w-full mt-4 rounded-xl bg-muted/50 p-4">
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="w-full flex items-center gap-3.5 text-left"
            aria-expanded={showBreakdown}
          >
            <ProgressRing value={completion} size={48} strokeWidth={4} className="shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium leading-tight">
                Profile complete
              </span>
              {completion < 100 ? (
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                  Complete your profile for DPDPA compliance
                </p>
              ) : (
                <p className="text-[11px] text-success leading-relaxed mt-1 font-medium">
                  All set — profile complete
                </p>
              )}
            </div>
            <ArrowDownBoldDuotone
              size={13}
              className={`text-muted-foreground shrink-0 ml-1 transition-transform ${showBreakdown ? "rotate-180" : ""}`}
            />
          </button>

          {/* Section-by-section breakdown — explains *why* completion isn't 100%
              instead of leaving the number opaque. */}
          {showBreakdown && (
            <div className="mt-3.5 space-y-2 border-t border-border pt-3.5">
              {completionSections.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-20 shrink-0">{s.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.percent === 100 ? "bg-success" : "bg-primary"}`}
                      style={{ width: `${s.percent}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-9 text-right tabular-nums">
                    {s.percent}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Last updated — mt-3 (not mt-2) so it reads as a separate line
            below the completion card rather than crowding its bottom edge */}
        {updatedAt && (
          <p className="w-full text-[10px] text-muted-foreground mt-3 text-center">
            Last updated {updatedAt}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
