import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VideoService } from "@/services/video.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  UploadMinimalisticBoldDuotone,
  PlayCircleBoldDuotone,
  CheckCircleBoldDuotone,
  CloseCircleBoldDuotone,
} from "solar-icon-set";

export const Route = createFileRoute("/_authenticated/admin/videos")({
  head: () => ({
    meta: [
      { title: "Video Management — DPDPA Admin" },
      {
        name: "description",
        content: "Upload and manage DPDPA compliance introduction videos.",
      },
    ],
  }),
  component: AdminVideosPage,
});

type UploadStep = "idle" | "video" | "caption" | "saving" | "done" | "error";

const STEP_LABELS: Record<UploadStep, string> = {
  idle: "Ready",
  video: "Uploading video…",
  caption: "Uploading captions…",
  saving: "Saving to database…",
  done: "Done!",
  error: "Upload failed",
};

function AdminVideosPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Upload form state ────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("v1.0");
  const [language, setLanguage] = useState("en");
  const [duration, setDuration] = useState("");
  const [resolution, setResolution] = useState("1080p");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [captionFile, setCaptionFile] = useState<File | null>(null);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Single source of truth for both the progress bar and the label percentage
  const [uploadPct, setUploadPct] = useState(0);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);

  // ── Preview dialog ───────────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchVideos = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("video_versions")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setVideos(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  // ── File change handler (auto-detect duration) ───────────────────────────
  const handleVideoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setVideoFile(null);
      setDuration("");
      setUploadError(null);
      return;
    }

    const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500 MB
    if (file.size > MAX_VIDEO_SIZE) {
      toast.error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum allowed size is 500 MB.`);
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      const detectedDuration = Math.floor(video.duration);
      URL.revokeObjectURL(video.src);
      
      setDuration(detectedDuration.toString());
      setVideoFile(file);
      setUploadError(null);
      toast.success(`Video duration detected: ${detectedDuration} seconds.`);
    };
    
    video.onerror = () => {
       toast.error("Failed to load video metadata. Ensure it's a valid MP4 file.");
       URL.revokeObjectURL(video.src);
       setVideoFile(null);
       setDuration("");
       if (videoInputRef.current) videoInputRef.current.value = "";
    };

    video.src = URL.createObjectURL(file);
  };

  // ── Upload handler ───────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!title || !videoFile || !duration) {
      toast.error("Please fill in all required fields and select a video file.");
      return;
    }

    const durationNum = parseInt(duration, 10);

    setUploadError(null);
    setUploadPct(0);
    setUploadStep("video");

    try {
      // Upload video — XHR reports real byte progress (0→90%)
      const videoUrl = await VideoService.uploadVideoFile(
        videoFile,
        language,
        version,
        (pct) => setUploadPct(Math.round(pct * 0.9))
      );

      // Upload caption file only if provided (optional)
      let captionUrl = "";
      if (captionFile) {
        setUploadStep("caption");
        setUploadPct(92);
        captionUrl = await VideoService.uploadCaptionFile(captionFile, language, version);
      }

      setUploadStep("saving");
      setUploadPct(96);
      await VideoService.createVideoVersion({
        title,
        version,
        language,
        duration_seconds: durationNum,
        resolution,
        url: videoUrl,
        caption_url: captionUrl,
      });

      setUploadStep("done");
      setUploadPct(100);
      toast.success("Video version saved as draft!");

      // Reset form
      setTitle("");
      setVersion("v1.0");
      setVideoFile(null);
      setCaptionFile(null);
      setDuration("");
      if (videoInputRef.current) videoInputRef.current.value = "";
      if (captionInputRef.current) captionInputRef.current.value = "";

      await fetchVideos();
      setTimeout(() => setUploadStep("idle"), 1500);
    } catch (err: any) {
      console.error(err);
      setUploadStep("error");
      setUploadError(err.message);
      toast.error(err.message ?? "Upload failed. Check console for details.");
    }
  };

  // ── Activate handler ─────────────────────────────────────────────────────
  const handleActivate = async (id: string, lang: string) => {
    try {
      await VideoService.publishVideo(id, lang);
      toast.success("Video activated successfully.");
      await fetchVideos();
    } catch (err: any) {
      toast.error(`Activation failed: ${err.message}`);
    }
  };

  // ── Deactivate handler ───────────────────────────────────────────────────
  const handleDeactivate = async (id: string) => {
    try {
      await VideoService.deactivateVideo(id);
      toast.success("Video deactivated.");
      await fetchVideos();
    } catch (err: any) {
      toast.error(`Deactivate failed: ${err.message}`);
    }
  };

  const isUploading = ["video", "caption", "saving"].includes(uploadStep);

  return (
    <div className="space-y-8">
      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="page-header">
        <h1>DPDPA Intro Video Management</h1>
        <p>Upload and manage compliance introduction videos per language. (US-HR-009)</p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — CREATE NEW VIDEO VERSION
      ═══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UploadMinimalisticBoldDuotone size={20} color="var(--primary)" />
            <CardTitle>Create New Video Version</CardTitle>
          </div>
          <CardDescription>
            Upload an MP4 file (H.264, max 500 MB, 720p–1080p). A captions file (.vtt or .srt) is optional but recommended for accessibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="vid-title">Video Title</Label>
              <Input
                id="vid-title"
                placeholder="e.g. DPDPA Intro 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isUploading}
              />
            </div>

            {/* Version */}
            <div className="space-y-2">
              <Label htmlFor="vid-version">Version</Label>
              <Input
                id="vid-version"
                placeholder="v1.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                disabled={isUploading}
              />
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage} disabled={isUploading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                  <SelectItem value="ta">Tamil</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Resolution */}
            <div className="space-y-2">
              <Label>Resolution</Label>
              <Select value={resolution} onValueChange={setResolution} disabled={isUploading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080p">1080p (Recommended)</SelectItem>
                  <SelectItem value="720p">720p (Minimum)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label htmlFor="vid-duration">Detected Duration</Label>
              <Input
                id="vid-duration"
                type="text"
                placeholder="Auto-detected on upload"
                value={duration ? `${duration} seconds` : ""}
                disabled
                readOnly
              />
            </div>
          </div>

          {/* ── File pickers ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Video file */}
            <div className="space-y-2">
              <Label htmlFor="vid-file">
                Video File{" "}
                <span className="text-muted-foreground font-normal">(.mp4, H.264, max 500 MB)</span>
              </Label>
              <div
                className={`
                  relative flex items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer
                  transition-colors
                  ${videoFile ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"}
                  ${isUploading ? "opacity-50 pointer-events-none" : ""}
                `}
                onClick={() => videoInputRef.current?.click()}
              >
                <input
                  ref={videoInputRef}
                  id="vid-file"
                  type="file"
                  accept="video/mp4,.mp4"
                  className="sr-only"
                  disabled={isUploading}
                  onChange={handleVideoFileChange}
                />
                <div className="text-center space-y-1">
                  {videoFile ? (
                    <>
                      <CheckCircleBoldDuotone size={24} color="var(--primary)" className="mx-auto" />
                      <p className="text-sm font-medium truncate max-w-[200px]">{videoFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </>
                  ) : (
                    <>
                      <UploadMinimalisticBoldDuotone size={24} className="mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to select MP4</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Caption file */}
            <div className="space-y-2">
              <Label htmlFor="cap-file">
                Captions File{" "}
                <span className="text-muted-foreground font-normal text-xs">(Optional — .vtt or .srt)</span>
              </Label>
              <div
                className={`
                  relative flex items-center justify-center border-2 border-dashed rounded-lg p-4 cursor-pointer
                  transition-colors
                  ${captionFile ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"}
                  ${isUploading ? "opacity-50 pointer-events-none" : ""}
                `}
                onClick={() => captionInputRef.current?.click()}
              >
                <input
                  ref={captionInputRef}
                  id="cap-file"
                  type="file"
                  accept=".vtt,.srt,text/vtt,text/plain"
                  className="sr-only"
                  disabled={isUploading}
                  onChange={(e) => setCaptionFile(e.target.files?.[0] ?? null)}
                />
                <div className="text-center space-y-1">
                  {captionFile ? (
                    <>
                      <CheckCircleBoldDuotone size={24} color="var(--primary)" className="mx-auto" />
                      <p className="text-sm font-medium truncate max-w-[200px]">{captionFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(captionFile.size / 1024).toFixed(1)} KB
                      </p>
                    </>
                  ) : (
                    <>
                      <UploadMinimalisticBoldDuotone size={24} className="mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Click to select VTT/SRT</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Upload progress ───────────────────────────────────────────── */}
          {uploadStep !== "idle" && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className={uploadStep === "error" ? "text-destructive" : "text-foreground"}>
                  {uploadStep === "video"
                    ? `Uploading video… ${uploadPct}%`
                    : STEP_LABELS[uploadStep]}
                </span>
                {uploadStep !== "error" && (
                  <span className="text-muted-foreground text-xs">{uploadPct}%</span>
                )}
              </div>
              {uploadStep !== "error" && (
                <Progress value={uploadPct} className="h-2" />
              )}
              {uploadStep === "error" && uploadError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <CloseCircleBoldDuotone size={13} />
                  {uploadError}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={handleUpload}
              disabled={isUploading || !videoFile || !title}
              className="gap-2"
            >
              <UploadMinimalisticBoldDuotone size={16} />
              {isUploading ? STEP_LABELS[uploadStep] : "Save Draft Version"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2 — VIDEO DIRECTORY
      ═══════════════════════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <PlayCircleBoldDuotone size={20} color="var(--primary)" />
            <CardTitle>Video Directory (All Versions)</CardTitle>
          </div>
          <CardDescription>
            Only one video can be active at a time per language. Activating a new version
            deactivates the current one automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Language</TableHead>
                <TableHead>Title (Version)</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Resolution</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : videos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8">
                    <EmptyState
                      icon={<PlayCircleBoldDuotone size={32} />}
                      title="No videos uploaded yet"
                      description="Use the form above to upload your first version."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                videos.map((vid) => (
                  <TableRow key={vid.id}>
                    <TableCell className="font-medium uppercase">{vid.language}</TableCell>
                    <TableCell>
                      {vid.title}
                      <span className="text-muted-foreground text-xs ml-1.5">({vid.version})</span>
                    </TableCell>
                    <TableCell>{vid.duration_seconds}s</TableCell>
                    <TableCell>{vid.resolution ?? "—"}</TableCell>
                    <TableCell>
                      {vid.is_active || vid.status === "active" ? (
                        <Badge className="bg-green-500 text-white">Active</Badge>
                      ) : vid.status === "draft" ? (
                        <Badge variant="outline">Draft</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Preview */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewUrl(vid.url ?? vid.video_url ?? null)}
                          disabled={!vid.url && !vid.video_url}
                        >
                          Preview
                        </Button>

                        {/* Activate */}
                        {!vid.is_active && vid.status !== "active" && (
                          <Button
                            size="sm"
                            onClick={() => handleActivate(vid.id, vid.language)}
                          >
                            Activate
                          </Button>
                        )}

                        {/* Deactivate */}
                        {(vid.is_active || vid.status === "active") && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeactivate(vid.id)}
                          >
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Preview Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Video Preview</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <video
              src={previewUrl}
              controls
              className="w-full rounded-lg aspect-video bg-black"
              preload="metadata"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
