import { z } from "zod";
import { requiredText, optionalText, numericField } from "./common";

export const riskStatusEnum = z.enum(["open", "mitigated", "accepted"]);

export const riskAssessmentSchema = z.object({
  title: requiredText("Title", { max: 200 }),
  description: optionalText({ max: 2000 }),
  likelihood: numericField("Likelihood", { min: 1, max: 5, integer: true }),
  impact: numericField("Impact", { min: 1, max: 5, integer: true }),
  mitigation: optionalText({ max: 2000 }),
  status: riskStatusEnum,
});

export type RiskAssessmentFormValues = z.infer<typeof riskAssessmentSchema>;
