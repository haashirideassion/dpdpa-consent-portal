/**
 * Section-level consent status utilities.
 *
 * Derives an aggregate consent state for each UI data section by looking
 * up the purpose-level statuses that belong to the corresponding consent
 * section(s) in the active v2.0 template.
 *
 * Status resolution order (most important first):
 *   withdrawn > pending > active > mandatory (all required) > not_applicable
 */

import type { PurposeConsentStatus, ConsentSection } from "@/services/consent.service";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SectionConsentStatus =
  | "active"          // All non-mandatory purposes are consented
  | "pending"         // At least one non-mandatory purpose has never been given
  | "withdrawn"       // At least one non-mandatory purpose was withdrawn
  | "mandatory"       // Section contains only mandatory purposes (no action needed)
  | "not_applicable"; // No consent purposes are mapped to this UI section

// ── UI Section → Consent Section numbers mapping ─────────────────────────────
// Each key corresponds to a section rendered in EmployeeDataView.
// Values are the section_number values from the consent_sections table.

export const UI_SECTION_CONSENT_MAP: Record<string, number[]> = {
  personalContact:    [1, 2],  // Personal Information + Contact Details
  employment:         [],       // Employment data — no consent purposes (admin-managed)
  payrollBanking:     [4],      // Banking Information
  governmentIds:      [3, 11],  // Government IDs + Passport and Visa
  emergencyContact:   [9],      // Emergency Contacts
  health:             [12],     // Health Information
  education:          [5],      // Educational Qualifications
  certifications:     [6],      // Certifications
  dependents:         [10],     // Dependents
  nominees:           [8],      // Insurance Nominee Details
  employmentHistory:  [7],      // Previous Employment
  additionalNotes:    [],       // Additional Notes — no consent purposes
};

// ── Computation ───────────────────────────────────────────────────────────────

export function computeSectionConsentStatus(
  uiSectionKey: string,
  sectionedStatuses: Array<{ section: ConsentSection; statuses: PurposeConsentStatus[] }>
): SectionConsentStatus {
  const consentSectionNumbers = UI_SECTION_CONSENT_MAP[uiSectionKey] ?? [];

  if (consentSectionNumbers.length === 0) return "not_applicable";

  // Gather all purpose-level statuses from the mapped consent section(s)
  const allStatuses = sectionedStatuses
    .filter((s) => consentSectionNumbers.includes(s.section.section_number))
    .flatMap((s) => s.statuses);

  if (allStatuses.length === 0) return "not_applicable";

  // Split into mandatory vs non-mandatory purposes
  const nonMandatory = allStatuses.filter(
    (s) => s.purpose.purpose_type !== "mandatory"
  );

  // Section contains only mandatory purposes → required by law, no action needed
  if (nonMandatory.length === 0) return "mandatory";

  // Check non-mandatory purposes for actionable states
  if (nonMandatory.some((s) => s.currentStatus === "withdrawn")) return "withdrawn";
  if (nonMandatory.some((s) => s.currentStatus === "pending"))   return "pending";
  return "active";
}
