import { z } from "zod";
import { requiredText, optionalText, numericField } from "./common";

export const breachSeverityEnum = z.enum(["low", "medium", "high", "critical"]);
export const breachStatusEnum = z.enum(["reported", "investigating", "contained", "notified", "closed"]);

export const breachIncidentSchema = z.object({
  title: requiredText("Title", { max: 200 }),
  description: optionalText({ max: 2000 }),
  severity: breachSeverityEnum,
  status: breachStatusEnum,
  discovered_at: requiredText("Discovered at"),
  affected_count: numericField("Number of affected data principals", {
    min: 0,
    integer: true,
    required: false,
  }),
  affected_data_categories: optionalText(),
  root_cause: optionalText({ max: 2000 }),
  remediation: optionalText({ max: 2000 }),
});

export type BreachIncidentFormValues = z.infer<typeof breachIncidentSchema>;
