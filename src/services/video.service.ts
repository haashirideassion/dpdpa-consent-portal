import { supabase } from "@/integrations/supabase/client";

export const VideoService = {
  /**
   * Gets the active video version to be shown to employees.
   */
  async getActiveVideoVersion(language: string = "en") {
    const { data, error } = await supabase
      .from("video_versions")
      .select("*")
      .eq("is_active", true)
      .eq("language", language)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch active video version:", error);
      return null;
    }
    return data;
  },

  /**
   * Checks if the employee has completed the required video.
   */
  async hasCompletedVideo(employeeId: string, videoVersionId: string) {
    const { data, error } = await supabase
      .from("video_events")
      .select("completed")
      .eq("employee_id", employeeId)
      .eq("video_version_id", videoVersionId)
      .eq("completed", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to check video completion:", error);
      return false;
    }
    return !!data?.completed;
  },

  /**
   * Gets the last known progress for a video event, to resume playback.
   */
  async getVideoProgress(employeeId: string, videoVersionId: string) {
    const { data, error } = await supabase
      .from("video_events")
      .select("last_position_seconds, completed")
      .eq("employee_id", employeeId)
      .eq("video_version_id", videoVersionId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to get video progress:", error);
      return { position: 0, completed: false };
    }
    return {
      position: data?.last_position_seconds ?? 0,
      completed: data?.completed ?? false,
    };
  },

  /**
   * Updates or inserts a video event with current progress.
   */
  async updateProgress(
    employeeId: string,
    videoVersionId: string,
    progress: {
      watchTimeSeconds: number;
      completionPct: number;
      lastPositionSeconds: number;
      completed: boolean;
    }
  ) {
    try {
      // Upsert requires the id if we want to update an existing row, but we might not have it.
      // So we first try to find an existing event for this employee + video.
      const { data: existing } = await supabase
        .from("video_events")
        .select("id")
        .eq("employee_id", employeeId)
        .eq("video_version_id", videoVersionId)
        .limit(1)
        .maybeSingle();

      const payload = {
        employee_id: employeeId,
        video_version_id: videoVersionId,
        watch_time_seconds: progress.watchTimeSeconds,
        completion_pct: progress.completionPct,
        last_position_seconds: progress.lastPositionSeconds,
        completed: progress.completed,
        ...(progress.completed && { completed_at: new Date().toISOString() }),
        session_id: sessionStorage.getItem("dpdpa_session_id") || "unknown",
      };

      if (existing) {
        await supabase
          .from("video_events")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await supabase.from("video_events").insert(payload);
      }
    } catch (err) {
      console.error("Failed to update video progress:", err);
    }
  },
};
