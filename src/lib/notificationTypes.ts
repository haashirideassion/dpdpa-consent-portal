/**
 * Canonical allowlist of public.notifications.category values.
 *
 * This is the single source of truth for which notification categories are
 * actually written to the notifications table — mirrors the role
 * `src/lib/auditActions.ts` plays for audit_logs. Only events that are
 * actually wired are listed here; do not add an aspirational category
 * without also wiring a real writer.
 *
 * The DB enforces the same allowlist via a CHECK constraint on
 * notifications.category (see the notification-hardening migration) and via
 * the `create_notification()` / `notify_staff_audience()` SECURITY DEFINER
 * RPCs, which reject any category not in that constraint. This file and the
 * migration's CHECK constraint must be kept in sync.
 *
 * Notifications are a separate, user-facing concern from audit_logs — see
 * each category's doc comment for the audit action (if any) it pairs with.
 * A notification never carries the sensitive values the paired audit event
 * might (old/new field values, financial/govt-ID/health data, etc.) — see
 * the writer call sites for the privacy rule in each case.
 */
export const NOTIFICATION_CATEGORIES = [
  /** Admin → employee. Fired once, from link_employee_record()/
   *  map_user_to_employee(), the moment a pre-created employee record is
   *  linked to their auth user (i.e. their first login) — not at row
   *  creation time, since no user_id exists yet then. Covers both normal
   *  and CSV-bulk-imported employees identically (single hook). */
  "employee.created",
  /** Admin → employee. Fired from EmployeeService.adminOverride() per
   *  update batch — pre-existing notification, refactored onto
   *  create_notification(). Pairs with audit action "admin.override". */
  "employee.updated",
  /** Employee → admin/hr_manager/dpo. Fired from a DB trigger on
   *  correction_requests INSERT. Pairs with audit action
   *  "correction.submitted". */
  "correction.submitted",
  /** Admin → employee. Fired from a DB trigger on correction_requests
   *  UPDATE when status transitions to 'approved'. Pairs with audit action
   *  "correction.approved". */
  "correction.approved",
  /** Admin → employee. Fired from a DB trigger on correction_requests
   *  UPDATE when status transitions to 'rejected'. Pairs with audit action
   *  "correction.rejected". */
  "correction.rejected",
  /** Employee → admin/dpo. Pre-existing — fired from the notify_new_data_request
   *  trigger on data_requests INSERT. Pairs with audit action "dsr.created". */
  "dsr.created",
  /** Admin → the employee who raised the request. Fired from a DB trigger
   *  on data_requests UPDATE when status changes. Pairs with audit action
   *  "dsr.status_updated". */
  "dsr.status_updated",
  /** Employee → admin/hr_manager/dpo. Fired from the education completion
   *  route after a successful EducationService.markCompleted(). Pairs with
   *  audit action "education.completed". */
  "education.completed",
  /** Employee → admin/hr_manager/dpo. Fired from IntroVideoPlayer after a
   *  successful VideoService.updateProgress(..., completed: true). Pairs
   *  with audit action "video.completed". */
  "video.completed",
  /** Admin → employee. Fired from reset_user_onboarding(). Pairs with audit
   *  action "reset_onboarding". */
  "onboarding.reset",
  /** Employee (self) → self, acknowledgement. Pre-existing — fired from
   *  ConsentService.withdrawConsent(), refactored onto create_notification().
   *  Pairs with audit action "consent.withdrawn". */
  "consent.withdrawn",
  /** Employee (self) → self, acknowledgement. Pre-existing — fired from
   *  ConsentService.reGrantConsent(), refactored onto create_notification().
   *  Pairs with audit action "consent.granted". */
  "consent.granted",
  /** Admin/DPO → the employee who raised the request. Fired directly
   *  (INSERT into notifications) from the process_erasure_request() RPC,
   *  once, when an erasure request has actually been processed. A
   *  high-level summary only — never field values or raw PII. Pairs with
   *  audit action "dsr.erasure_processed". */
  "dsr.erasure_processed",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Human-readable label per category, used for grouping/analytics in the UI. */
export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  "employee.created": "Welcome",
  "employee.updated": "Profile Update",
  "correction.submitted": "Correction Request",
  "correction.approved": "Correction Approved",
  "correction.rejected": "Correction Rejected",
  "dsr.created": "Data Request",
  "dsr.status_updated": "Data Request Update",
  "education.completed": "Education",
  "video.completed": "Onboarding Video",
  "onboarding.reset": "Onboarding Reset",
  "consent.withdrawn": "Consent Withdrawn",
  "consent.granted": "Consent Granted",
  "dsr.erasure_processed": "Data Removal Processed",
};
