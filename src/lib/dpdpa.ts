// Fields that are DPDPA-sensitive (protected personal data)
export const DPDPA_FIELDS: Set<string> = new Set([
  'aadhaar_number',
  'pan_number',
  'bank_account_number',
  'ifsc_code',
  'bank_name',
  'ctc',
  'phone_number',
  'alternate_phone',
  'personal_email',
  'work_email',
  'date_of_birth',
  'current_address',
  'permanent_address',
  'city',
  'state',
  'pincode',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_email',
  'emergency_contact_relation',
  'uan_number',
  'passport_number',
  'passport_expiry',
  'driving_license',
  'voter_id',
  'blood_group',
]);

export function isDpdpaField(fieldName: string): boolean {
  return DPDPA_FIELDS.has(fieldName);
}

export const CONSENT_VERSION = 'v1.0';

export const CONSENT_STATEMENT = `I hereby acknowledge that I have reviewed all personal and employment-related information stored by the organization as displayed above. I understand that certain data fields are classified as "Protected Personal Data" under the Digital Personal Data Protection Act, 2023 (DPDPA).

I provide my explicit consent for the organization to store, process, and use my personal data as described, in accordance with the company's data privacy policy and applicable provisions of the DPDPA.

I understand that I may withdraw this consent at any time by contacting the HR/Compliance team, subject to applicable legal obligations.`;
