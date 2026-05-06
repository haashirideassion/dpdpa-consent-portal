import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheckBoldDuotone, UserBoldDuotone } from "solar-icon-set";

// ── Profile completion calculator ─────────────────────────────────────────────
function calcProfileCompletion(e: any): number {
  const fields = [
    e.first_name, e.last_name, e.gender, e.date_of_birth, e.blood_group,
    e.marital_status, e.nationality, e.work_email, e.personal_email,
    e.phone_number, e.current_address, e.city, e.state, e.pincode,
    e.department, e.designation, e.date_of_joining, e.employment_type,
    e.work_location,
  ];
  const filled = fields.filter((v) => v && String(v).trim() !== "").length;
  return Math.round((filled / fields.length) * 100);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const firstName = employee?.first_name ?? "";
  const lastName = employee?.last_name ?? "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "—";
  const initials =
    [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || "?";

  const completion = calcProfileCompletion(employee);

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
    <Card className="border border-border shadow-sm sticky top-6">
      <CardContent className="pt-5 pb-5 px-5 flex flex-col items-center gap-0">

        {/* ── Avatar + camera upload ── */}
        <div className="relative mb-3">
          <Avatar className="h-20 w-20 ring-2 ring-primary/20 ring-offset-2">
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

        {/* ── Profile completion bar ── */}
        <div className="w-full mt-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              Profile
            </span>
            <span className="text-[11px] font-semibold text-foreground">{completion}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${completion}%` }}
            />
          </div>
          {completion < 100 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Complete your profile for DPDPA compliance
            </p>
          )}
        </div>

        {/* ── Last updated ── */}
        {updatedAt && (
          <p className="w-full text-[10px] text-muted-foreground mt-2 text-center">
            Last updated {updatedAt}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
