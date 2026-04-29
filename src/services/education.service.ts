import { supabase } from "@/integrations/supabase/client";

export interface EducationSlide {
  id: string;
  title: string;
  content: string;
  icon: string;
}

export interface EducationModule {
  id: string;
  version: string;
  content_json: EducationSlide[];
}

export const EducationService = {
  /**
   * Gets the active education module content.
   */
  async getActiveModule(): Promise<EducationModule | null> {
    const { data, error } = await supabase
      .from("education_modules")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error("Failed to fetch education module:", error);
      return null;
    }

    return {
      id: data.id,
      version: data.version,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content_json: data.content_json as any as EducationSlide[],
    };
  },

  /**
   * Checks if the employee has completed the specific education module version.
   */
  async hasCompletedModule(employeeId: string, moduleVersion: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("education_completions")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("module_version", moduleVersion)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to check education completion:", error);
      return false;
    }
    return !!data;
  },

  /**
   * Records that the employee has completed (acknowledged) the education module.
   */
  async markCompleted(employeeId: string, userId: string, moduleVersion: string): Promise<void> {
    try {
      await supabase.from("education_completions").upsert(
        {
          employee_id: employeeId,
          user_id: userId,
          module_version: moduleVersion,
        },
        { onConflict: "employee_id, module_version" }
      );
    } catch (err) {
      console.error("Failed to mark education complete:", err);
    }
  },
};
