// Fields that are DPDPA-sensitive (protected personal data)
export const DPDPA_FIELDS: Set<string> = new Set([
  "aadhaar_number",
  "pan_number",
  "bank_account_number",
  "ifsc_code",
  "bank_name",
  "ctc",
  "phone_number",
  "alternate_phone",
  "personal_email",
  "work_email",
  "date_of_birth",
  "current_address",
  "permanent_address",
  "city",
  "state",
  "pincode",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_email",
  "emergency_contact_relation",
  "uan_number",
  "passport_number",
  "passport_expiry",
  "driving_license",
  "voter_id",
  "blood_group",
]);

export function isDpdpaField(fieldName: string): boolean {
  return DPDPA_FIELDS.has(fieldName);
}

// Fields that are confidential but not already covered by DPDPA_FIELDS above
// (health info and parent names) — folded into `isSensitiveField` below so
// there is exactly one place, not several drifting copies, that decides
// "does this field's raw value ever get persisted in an audit log or sent in
// a raw-value notification". See isSensitiveField's doc comment.
const EXTRA_SENSITIVE_FIELDS: Set<string> = new Set([
  "bank_name",
  "father_name",
  "mother_name",
  "disability_status",
  "chronic_conditions",
  "allergies",
]);

/**
 * Single source of truth for "is this field's value confidential enough
 * that its raw old/new value must never be written into audit_logs.metadata
 * or included in an email/in-app notification". A strict superset of
 * DPDPA_FIELDS (badge classification) plus EXTRA_SENSITIVE_FIELDS above.
 * Used by employee.service.ts (write side — decides what gets persisted)
 * and auditPresentation.ts (read side — decides what gets displayed) so
 * the two can't silently drift apart the way they previously did.
 */
export function isSensitiveField(fieldName: string): boolean {
  return isDpdpaField(fieldName) || EXTRA_SENSITIVE_FIELDS.has(fieldName);
}

/** Active template version. Update when a new template is activated in the DB. */
export const CONSENT_VERSION = "v2.0";

export const CONSENT_STATEMENT =
  "By typing my full name below and clicking Submit, I confirm that I have watched the introductory video and read the education module on DPDPA. I have reviewed my personal information in each section above. I have made an informed decision for each purpose, understanding the data used, the parties involved, the retention period, and the consequences of declining. My consent for each Optional and Conditional purpose is given freely and without coercion. I understand I can withdraw consent for any Optional or Conditional purpose at any time through the My Consents area, and that withdrawal will be as easy as giving consent. I understand my rights under DPDPA — to access, correct, erase, nominate, and raise grievances — and how to exercise them.";

export type MaskDirection = "prefix" | "suffix";

interface FieldMaskRule {
  /** Number of characters left unmasked. */
  visible: number;
  /** Which end of the value stays visible. */
  direction: MaskDirection;
}

/**
 * Presentation-layer masking policy: which fields get a partially-masked
 * value in the UI (with a reveal toggle for authorized viewers), and how.
 * This is display-only — it does not grant or deny access to the record;
 * that is decided by Supabase RLS before any of this data reaches the
 * client (see EmployeeDataView/DataField for how isOwner/isAdmin choose
 * between raw, masked, and revealed).
 */
export const MASKED_FIELDS: Record<string, FieldMaskRule> = {
  aadhaar_number: { visible: 4, direction: "suffix" },
  pan_number: { visible: 4, direction: "suffix" },
  bank_account_number: { visible: 4, direction: "suffix" },
  ifsc_code: { visible: 4, direction: "suffix" },
  uan_number: { visible: 4, direction: "suffix" },
  passport_number: { visible: 4, direction: "suffix" },
  driving_license: { visible: 4, direction: "suffix" },
  voter_id: { visible: 4, direction: "suffix" },
  date_of_birth: { visible: 4, direction: "suffix" },
  current_address: { visible: 6, direction: "suffix" },
  permanent_address: { visible: 6, direction: "suffix" },
  phone_number: { visible: 4, direction: "prefix" },
  alternate_phone: { visible: 4, direction: "prefix" },
  emergency_contact_phone: { visible: 4, direction: "prefix" },
  personal_email: { visible: 4, direction: "prefix" },
};

export function isMaskableField(fieldName: string): boolean {
  return Object.prototype.hasOwnProperty.call(MASKED_FIELDS, fieldName);
}

/**
 * Masks a raw string, leaving `visible` characters unmasked at the given
 * end. Handles null/empty/short/unexpected-format values safely: empty or
 * nullish input renders as "-"; a value no longer than `visible` is
 * returned as-is (nothing meaningful to hide).
 */
export function maskValue(value: string, visible = 4, direction: MaskDirection = "suffix") {
  if (!value) return "-";
  const len = value.length;
  if (len <= visible) return value;

  return direction === "prefix"
    ? value.slice(0, visible) + "*".repeat(len - visible)
    : "*".repeat(len - visible) + value.slice(-visible);
}

/**
 * Applies the field's mask rule (if any) to a value for display. Fields
 * with no rule in MASKED_FIELDS are returned unchanged — this function
 * decides *how* to mask, not *whether* the caller should be showing the
 * raw value in the first place (that's isOwner/isAdmin, in DataField).
 */
export function maskFieldValue(fieldKey: string, value: string | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  const rule = MASKED_FIELDS[fieldKey];
  if (!rule) return String(value);
  return maskValue(String(value), rule.visible, rule.direction);
}
