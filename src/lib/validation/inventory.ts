import { z } from "zod";
import { requiredText, optionalText } from "./common";

// data_categories/data_principal_types and cross_border-unrelated bookkeeping fields
// (linked_consent_purpose_id, owner_user_id, reviewed_at) are intentionally NOT part of
// this schema — they're either handled by separate raw-text state in the route (to avoid
// collapsing a trailing comma on every keystroke) or passed through unedited from the
// existing record, not entered via this form.
export const dataInventorySchema = z.object({
  activity_name: requiredText("Activity name", { max: 200 }),
  purpose: requiredText("Purpose", { max: 500 }),
  legal_basis: optionalText({ max: 200 }),
  retention_period: optionalText({ max: 200 }),
  storage_location: optionalText({ max: 200 }),
  recipients: optionalText({ max: 500 }),
  cross_border: z.boolean(),
});

export type DataInventoryFormValues = z.infer<typeof dataInventorySchema>;
