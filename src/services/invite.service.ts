import { supabase } from "@/integrations/supabase/client";

export type InviteValidationResult = {
  valid: true;
  employeeId: string;
  language: string;
} | {
  valid: false;
  reason: "not_found" | "expired" | "already_used";
}

/**
 * INVITE SERVICE
 * Validates tokenized invite links and marks them as used.
 */
export const InviteService = {
  /**
   * Validates an invite token.
   * Returns the employee context if valid, or a reason string if not.
   */
  async validateToken(token: string): Promise<InviteValidationResult> {
    const { data, error } = await supabase
      .from("consent_invites")
      .select("id, employee_id, language, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (error || !data) {
      return { valid: false, reason: "not_found" };
    }

    if (data.used_at) {
      return { valid: false, reason: "already_used" };
    }

    if (new Date(data.expires_at) < new Date()) {
      return { valid: false, reason: "expired" };
    }

    return {
      valid: true,
      employeeId: data.employee_id,
      language: data.language ?? "en",
    };
  },

  /**
   * Marks a token as used. Called after the employee has successfully
   * authenticated via SSO so the link cannot be reused.
   */
  async markTokenUsed(token: string): Promise<void> {
    await supabase
      .from("consent_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("token", token);
  },
};