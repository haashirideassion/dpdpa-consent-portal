import { supabase } from "@/integrations/supabase/client";
import { config } from "@/lib/config";
import { AuditService } from "@/services/audit.service";

export const VideoService = {
  /**
   * Gets the active video version to be shown to employees.
   */
  async getActiveVideoVersion(language: string = "en") {
    // Query using is_active (original column). The status column is added by migration 20260502000002.
    // We check is_active as the primary gate since it is always present.
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
      .eq("reset_flag", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to check video completion:", error);
      return false;
    }
    
    const isDone = !!data?.completed;
    return isDone;
  },

  /**
   * Gets the last known progress for a video event, to resume playback.
   */
  async getVideoProgress(employeeId: string, videoVersionId: string) {
    const { data, error } = await supabase
      .from("video_events")
      .select("last_position_seconds, completed, reset_flag")
      .eq("employee_id", employeeId)
      .eq("video_version_id", videoVersionId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Failed to get video progress:", error);
      return { position: 0, completed: false };
    }

    // If reset_flag is true, force restart from 0
    if (data?.reset_flag) {
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
        reset_flag: progress.completed ? false : undefined, // Reset flag only when completed
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

  /**
   * Admin API: Uploads a new video version metadata as draft
   */
  async createVideoVersion(payload: {
    title: string;
    url: string;
    caption_url?: string;
    language: string;
    version: string;
    duration_seconds: number;
    resolution: string;
  }) {
    const { data, error } = await supabase
      .from("video_versions")
      .insert({ ...payload, caption_url: payload.caption_url || null, status: "draft", is_active: false })
      .select()
      .single();

    if (error) {
      await AuditService.log({
        action: "video.created",
        entityType: "Video_version",
        metadata: { language: payload.language, version: payload.version, change: "failed" },
        source: "web_portal",
        success: false,
        failureReason: error.message ?? "Video draft creation failed",
      });
      throw error;
    }

    await AuditService.log({
      action: "video.created",
      entityType: "Video_version",
      entityId: (data as any)?.id,
      metadata: { language: payload.language, version: payload.version },
      source: "web_portal",
      success: true,
    });
    return data;
  },

  /**
   * Admin API: Publishes a video (deactivates others for the same language)
   */
  async publishVideo(videoId: string, language: string) {
    // 1. Deactivate current active video for this language
    await supabase
      .from("video_versions")
      .update({ status: "inactive", is_active: false })
      .eq("language", language)
      .eq("status", "active");

    // 2. Publish new video
    const { data, error } = await supabase
      .from("video_versions")
      .update({ status: "active", is_active: true })
      .eq("id", videoId)
      .select()
      .single();

    if (error) {
      await AuditService.log({
        action: "video.published",
        entityType: "Video_version",
        entityId: videoId,
        metadata: { language },
        source: "web_portal",
        success: false,
        failureReason: error.message ?? "Video publish failed",
      });
      throw error;
    }

    await AuditService.log({
      action: "video.published",
      entityType: "Video_version",
      entityId: videoId,
      metadata: { language, version: (data as any)?.version },
      source: "web_portal",
      success: true,
    });
    return data;
  },

  /**
   * Admin API: Deactivates a video
   */
  async deactivateVideo(videoId: string) {
    const { data, error } = await supabase
      .from("video_versions")
      .update({ status: "inactive", is_active: false })
      .eq("id", videoId)
      .select()
      .single();

    if (error) {
      await AuditService.log({
        action: "video.deactivated",
        entityType: "Video_version",
        entityId: videoId,
        source: "web_portal",
        success: false,
        failureReason: error.message ?? "Video deactivation failed",
      });
      throw error;
    }

    await AuditService.log({
      action: "video.deactivated",
      entityType: "Video_version",
      entityId: videoId,
      metadata: { version: (data as any)?.version },
      source: "web_portal",
      success: true,
    });
    return data;
  },

  // ---------------------------------------------------------------------------
  // File Upload (Supabase Storage → dpdpa_videos bucket)
  // ---------------------------------------------------------------------------

  /**
   * Uploads an MP4 video file to Supabase Storage via XHR so that
   * onProgress receives real byte-transfer events (fetch has no upload progress).
   * Path: videos/{language}/{version}.mp4
   * Returns the public URL.
   */
  async uploadVideoFile(
    file: File,
    language: string,
    version: string,
    onProgress?: (pct: number) => void
  ): Promise<string> {
    const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500 MB
    if (file.size > MAX_VIDEO_SIZE) {
      throw new Error(`Video file exceeds the 500 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`);
    }

    const safeLang = language.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const safeVer  = version.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
    const storagePath = `videos/${safeLang}/${safeVer}.mp4`;

    // Get the current session JWT so XHR can authenticate
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error("Not authenticated. Please sign in again.");

    const supabaseUrl = config.supabase.url;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/dpdpa_videos/${storagePath}`;

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl, true);
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      xhr.setRequestHeader("Content-Type", "video/mp4");
      xhr.setRequestHeader("x-upsert", "true");

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let msg = `Upload failed (HTTP ${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body?.error) msg = body.error;
            else if (body?.message) msg = body.message;
          } catch {
            // ignore JSON parse errors
          }
          reject(new Error(msg));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload. Check your connection."));
      xhr.ontimeout = () => reject(new Error("Upload timed out. Check your connection and try again."));

      // Dynamic timeout: minimum 10 min + 30 s per MB at 33 KB/s floor
      xhr.timeout = Math.max(10 * 60_000, Math.ceil(file.size / (33 * 1024)) * 1000);

      xhr.send(file);
    });

    // Signal 100% only after server confirms completion
    onProgress?.(100);

    const { data: urlData } = supabase.storage
      .from("dpdpa_videos")
      .getPublicUrl(storagePath);

    return urlData.publicUrl;
  },

  /**
   * Uploads a VTT/SRT caption file to Supabase Storage.
   * Path: captions/{language}/{version}.vtt
   * Returns the public URL.
   */
  async uploadCaptionFile(file: File, language: string, version: string): Promise<string> {
    const safeLang = language.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const safeVer  = version.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
    const ext  = file.name.endsWith(".srt") ? "srt" : "vtt";
    const path = `captions/${safeLang}/${safeVer}.${ext}`;

    const { error } = await supabase.storage
      .from("dpdpa_videos")
      .upload(path, file, { upsert: true, contentType: "text/vtt" });

    if (error) throw new Error(`Caption upload failed: ${error.message}`);

    const { data: urlData } = supabase.storage
      .from("dpdpa_videos")
      .getPublicUrl(path);

    return urlData.publicUrl;
  },

  /**
   * Full upload flow: uploads both files then inserts the video_versions record as draft.
   * @param videoFile - MP4 file (≤ 500 MB)
   * @param captionFile - VTT or SRT file (mandatory)
   * @param meta - title, version, language, duration_seconds, resolution
   */
  async createVideoVersionFromFiles(
    videoFile: File,
    captionFile: File,
    meta: {
      title: string;
      version: string;
      language: string;
      duration_seconds: number;
      resolution: string;
    },
    onProgress?: (step: "video" | "caption" | "saving") => void
  ) {
    // Validate before touching storage
    if (videoFile.size > 500 * 1024 * 1024) {
      throw new Error("Video file exceeds the 500 MB limit.");
    }
    if (!["video/mp4"].includes(videoFile.type) && !videoFile.name.endsWith(".mp4")) {
      throw new Error("Only MP4 video files are accepted.");
    }
    if (!captionFile) {
      throw new Error("A caption file (.vtt or .srt) is mandatory for DPDPA compliance.");
    }
    onProgress?.("video");
    const videoUrl = await this.uploadVideoFile(videoFile, meta.language, meta.version);

    onProgress?.("caption");
    const captionUrl = await this.uploadCaptionFile(captionFile, meta.language, meta.version);

    onProgress?.("saving");
    return await this.createVideoVersion({
      ...meta,
      url: videoUrl,
      caption_url: captionUrl,
    });
  },
};

