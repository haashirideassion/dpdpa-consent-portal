import { z } from "zod";
import { requiredText } from "./common";

export const campaignSchema = z.object({
  name: requiredText("Campaign name", { max: 200 }),
  template_id: requiredText("Consent template"),
  video_version_id: requiredText("Intro video"),
});

export type CampaignFormValues = z.infer<typeof campaignSchema>;
