import { z } from "zod";
import { requiredText } from "./common";

// File attachment validation (accept type / 5MB size) is handled separately in the
// component, same as before — Zod here only covers the text field.
export const correctionRequestSchema = z.object({
  newValue: requiredText("Updated value", { max: 2000 }),
});

export type CorrectionRequestFormValues = z.infer<typeof correctionRequestSchema>;
