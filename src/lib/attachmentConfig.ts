/**
 * attachmentConfig.ts
 *
 * Defines which employee data fields support supporting-document uploads
 * (Aadhaar card, PAN card, passport copy, etc.) and helpers to look them up.
 *
 * ── Architecture rule ────────────────────────────────────────────────────────
 * Before consent  → employee can upload directly; saves to employee_field_attachments
 * After consent   → upload disabled for employee (must go through correction request)
 * Admin           → can always upload/replace directly (admin override)
 */

export interface AttachmentFieldConfig {
  /** Human-readable label shown in the UI upload button / attachment row */
  label: string;
  /** Maps to employee_field_attachments.section_name */
  section: string;
}

/**
 * Master list of fields that support document attachments.
 * Keys must match FieldDef.key values used in DataSection / DataField.
 */
export const ATTACHMENT_FIELDS: Record<string, AttachmentFieldConfig> = {
  // ── Personal ──────────────────────────────────────────────────────────────
  // Name Proof is a single upload tied to the full legal name — attached to
  // first_name only so it doesn't render a duplicate control under Last Name.
  first_name:          { label: "Name Proof",                section: "personal" },
  date_of_birth:       { label: "Date of Birth Proof",       section: "personal" },

  // ── Government IDs ────────────────────────────────────────────────────────
  aadhaar_number:      { label: "Aadhaar Card",              section: "government_ids" },
  pan_number:          { label: "PAN Card",                  section: "government_ids" },
  passport_number:     { label: "Passport Copy",             section: "government_ids" },
  driving_license:     { label: "Driving License",           section: "government_ids" },
  voter_id:            { label: "Voter ID",                  section: "government_ids" },

  // ── Banking ───────────────────────────────────────────────────────────────
  bank_account_number: { label: "Bank Passbook / Statement", section: "banking" },
} as const;

/** Returns true when a field supports supporting-document attachments. */
export function requiresAttachment(fieldKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(ATTACHMENT_FIELDS, fieldKey);
}

/** Returns the human-readable document label for a field key. */
export function attachmentLabel(fieldKey: string): string {
  return ATTACHMENT_FIELDS[fieldKey]?.label ?? "Supporting Document";
}

/** Returns the section name used in employee_field_attachments.section_name. */
export function attachmentSection(fieldKey: string): string {
  return ATTACHMENT_FIELDS[fieldKey]?.section ?? "general";
}
