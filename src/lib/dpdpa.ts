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

/** Active template version. Update when a new template is activated in the DB. */
export const CONSENT_VERSION = "v2.0";

export const CONSENT_STATEMENT =
  "By typing my full name below and clicking Submit, I confirm that I have watched the introductory video and read the education module on DPDPA. I have reviewed my personal information in each section above. I have made an informed decision for each purpose, understanding the data used, the parties involved, the retention period, and the consequences of declining. My consent for each Optional and Conditional purpose is given freely and without coercion. I understand I can withdraw consent for any Optional or Conditional purpose at any time through the My Consents area, and that withdrawal will be as easy as giving consent. I understand my rights under DPDPA — to access, correct, erase, nominate, and raise grievances — and how to exercise them.";

export function maskValue(value: string, visible = 4) {
  if (!value) return "-";
  const len = value.length;
  if (len <= visible) return value;

  return "X".repeat(len - visible) + value.slice(-visible);
}
