// Fields that are DPDPA-sensitive (protected personal data)
export const DPDPA_FIELDS: Set<string> = new Set([
  "aadhaar_number",
  "pan_number",
  "bank_account_number",
  "ifsc_code",
  "bank_name",
  "bank_branch",
  "upi_id",
  "pf_account",
  "esic_number",
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
  "gender",
  "marital_status",
  "nationality",
  "father_name",
  "mother_name",
  "disability_status",
  "chronic_conditions",
  "allergies",
  // ── Multi-entry section fields (nominees/dependents/employment history) ──
  // These share the same key namespace as the flat fields above wherever the
  // underlying data is the same kind of thing (e.g. "date_of_birth"), and
  // introduce new keys only for fields with no flat-table equivalent.
  "last_drawn_salary",
  "address",
  "mobile",
  "guardian_name",
  "guardian_relationship",
]);

export function isDpdpaField(fieldName: string): boolean {
  return DPDPA_FIELDS.has(fieldName);
}

/**
 * The 15 fields management has designated for field-level (pgcrypto +
 * Supabase Vault) encryption at rest — see supabase/migrations/
 * 20260828000001-5. This is the SAME set used by the encryption RPCs'
 * server-side allowlists (encrypt_and_store_employee_field,
 * decrypt_employee_field, encrypt_correction_values,
 * approve_correction's v_encrypted_cols) — keep in sync with those if this
 * set ever changes; the DB-side allowlists are the actual security
 * boundary, this is only the client's read of "which fields should be
 * treated as decrypt-on-demand rather than already-present".
 */
export const ENCRYPTED_FIELDS: Set<string> = new Set([
  // Government IDs
  "aadhaar_number",
  "pan_number",
  "passport_number",
  "driving_license",
  "voter_id",
  "uan_number",
  // Financial
  "bank_account_number",
  "ifsc_code",
  "upi_id",
  "pf_account",
  "esic_number",
  "ctc",
  // Health
  "disability_status",
  "chronic_conditions",
  "allergies",
]);

export function isEncryptedField(fieldName: string): boolean {
  return ENCRYPTED_FIELDS.has(fieldName);
}

// Fields that are confidential but not already covered by DPDPA_FIELDS above
// — folded into `isSensitiveField` below so there is exactly one place, not
// several drifting copies, that decides "does this field's raw value ever
// get persisted in an audit log or sent in a raw-value notification". See
// isSensitiveField's doc comment. (father_name/mother_name/disability_status/
// chronic_conditions/allergies used to live only here — they are now also
// badged/maskable via DPDPA_FIELDS above, so this set only needs to carry
// fields that are sensitive but intentionally NOT part of the badge/masking
// UI treatment, e.g. bank_name.)
const EXTRA_SENSITIVE_FIELDS: Set<string> = new Set([
  "bank_name",
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
  // ── PRD financial fields (same treatment as bank_account_number) ─────────
  bank_branch: { visible: 4, direction: "suffix" },
  upi_id: { visible: 4, direction: "suffix" },
  pf_account: { visible: 4, direction: "suffix" },
  esic_number: { visible: 4, direction: "suffix" },
  // ── Contact fields previously badged but not masked ───────────────────────
  city: { visible: 2, direction: "suffix" },
  state: { visible: 2, direction: "suffix" },
  pincode: { visible: 2, direction: "suffix" },
  emergency_contact_name: { visible: 3, direction: "suffix" },
  emergency_contact_relation: { visible: 0, direction: "suffix" },
  emergency_contact_email: { visible: 4, direction: "prefix" },
  // ── Government field previously badged but not masked ─────────────────────
  passport_expiry: { visible: 4, direction: "suffix" },
  // ── Personal fields ────────────────────────────────────────────────────────
  blood_group: { visible: 0, direction: "suffix" },
  gender: { visible: 0, direction: "suffix" },
  marital_status: { visible: 0, direction: "suffix" },
  nationality: { visible: 0, direction: "suffix" },
  father_name: { visible: 3, direction: "suffix" },
  mother_name: { visible: 3, direction: "suffix" },
  // ── Health fields (special-category data — fully masked) ──────────────────
  disability_status: { visible: 0, direction: "suffix" },
  chronic_conditions: { visible: 0, direction: "suffix" },
  allergies: { visible: 0, direction: "suffix" },
  // ── Multi-entry section fields ────────────────────────────────────────────
  last_drawn_salary: { visible: 0, direction: "suffix" },
  address: { visible: 6, direction: "suffix" },
  mobile: { visible: 4, direction: "prefix" },
  guardian_name: { visible: 3, direction: "suffix" },
  guardian_relationship: { visible: 0, direction: "suffix" },
};

export function isMaskableField(fieldName: string): boolean {
  return Object.prototype.hasOwnProperty.call(MASKED_FIELDS, fieldName);
}

/**
 * Masks a raw string, leaving `visible` characters unmasked at the given
 * end. Handles null/empty/short/unexpected-format values safely: empty or
 * nullish input renders as "-"; a value no longer than `visible` is
 * returned as-is (nothing meaningful to hide).
 *
 * `visible <= 0` means "fully masked" — handled as its own case because
 * `value.slice(-0)` is NOT an empty string (negative zero coerces to plain
 * 0, so `slice(-0)` behaves like `slice(0)` and returns the whole string).
 * Without this branch, a `visible: 0` suffix rule would silently render the
 * full original value with stars merely prepended in front of it.
 */
export function maskValue(value: string, visible = 4, direction: MaskDirection = "suffix") {
  if (!value) return "-";
  const len = value.length;
  if (visible <= 0) return "*".repeat(len);
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

/**
 * Presentation-only helper for surfaces that display an *unverified*
 * confidential value outside DataField's owner/admin flow — currently the
 * correction-requests review queue (old_value/new_value can be any field
 * from FIELD_MAP, including financial/govt-ID/health data) and multi-entry
 * section cards (nominees/dependents/employment history).
 *
 * Unlike maskFieldValue, this is driven by isSensitiveField (the canonical
 * "must never appear raw without authorization" list) rather than only
 * MASKED_FIELDS, so it never silently shows a sensitive field's raw value
 * just because that field has no partial-mask rule (e.g. ctc, bank_name) —
 * those fall back to a flat "Confidential" label instead.
 */
export function maskSensitiveValueForDisplay(fieldKey: string, value: string | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  if (!isSensitiveField(fieldKey)) return String(value);
  if (isMaskableField(fieldKey)) return maskFieldValue(fieldKey, value);
  return "Confidential";
}
