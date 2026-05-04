import { supabase } from "@/integrations/supabase/client";

export type OnboardingScreen =
  | 'ADMIN_DASHBOARD'
  | 'SHOW_VIDEO'
  | 'SHOW_EDUCATION'
  | 'SHOW_EMPLOYEE_PORTAL'
  | 'NO_EMPLOYEE_RECORD'
  | 'NO_VIDEO_AVAILABLE';

export const OnboardingService = {
  /**
   * Evaluates the onboarding state via backend RPC.
   * This is the single source of truth for routing.
   */
  async getScreen(): Promise<{ screen: OnboardingScreen; role?: string }> {
    const { data, error } = await supabase.rpc('get_onboarding_screen');
    if (error) {
      console.error("Failed to get onboarding screen:", error);
      throw error;
    }
    return data as { screen: OnboardingScreen; role?: string };
  }
};
