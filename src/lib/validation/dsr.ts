import { z } from "zod";
import { requiredText } from "./common";

// `type` is kept as a plain required string (not z.enum) rather than the DsrType union,
// matching the same pattern used for campaign.ts's template_id/video_version_id —
// it's a value selected from a fixed list of Select options, so the runtime "is one
// of the options" guarantee comes from the UI, not the schema; the schema only needs
// to catch "nothing selected yet".
export const dsrRequestSchema = z.object({
  type: requiredText("Request type"),
  subject: requiredText("Subject", { max: 200 }),
  description: requiredText("Description", { max: 4000 }),
});

export type DsrRequestFormValues = z.infer<typeof dsrRequestSchema>;
