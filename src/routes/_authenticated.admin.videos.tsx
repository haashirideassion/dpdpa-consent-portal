import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VideoService } from "@/services/video.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/videos")({
  component: AdminVideosPage,
});

function AdminVideosPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Upload Form State
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("v1.0");
  const [language, setLanguage] = useState("en");
  const [videoUrl, setVideoUrl] = useState("");
  const [captionUrl, setCaptionUrl] = useState("");
  const [duration, setDuration] = useState("60");
  const [resolution, setResolution] = useState("1080p");

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

  const handleUpload = async () => {
    if (!title || !videoUrl || !captionUrl || !duration) {
      alert("Please fill all required fields, including Video URL and Caption URL.");
      return;
    }

    setUploading(true);
    try {
      await VideoService.createVideoVersion({
        title,
        version,
        language,
        url: videoUrl,
        caption_url: captionUrl,
        duration_seconds: parseInt(duration, 10),
        resolution,
      });
      
      // Reset form
      setTitle("");
      setVideoUrl("");
      setCaptionUrl("");
      setDuration("60");
      setVersion("v1.0");
      
      await fetchVideos();
    } catch (err: any) {
      console.error(err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handlePublish = async (id: string, lang: string) => {
    try {
      await VideoService.publishVideo(id, lang);
      await fetchVideos();
    } catch (err: any) {
      alert(`Publish failed: ${err.message}`);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await VideoService.deactivateVideo(id);
      await fetchVideos();
    } catch (err: any) {
      alert(`Deactivate failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">DPDPA Intro Video Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload and manage compliance introduction videos per language. (US-HR-009)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload New Version</CardTitle>
          <CardDescription>
            Provide the hosted URLs for your MP4 video and VTT captions.
            Duration must be between 45 and 90 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Video Title</Label>
              <Input placeholder="e.g. DPDPA Intro 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Version</Label>
              <Input placeholder="v1.0" value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
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
            <div className="space-y-2">
              <Label>Resolution</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080p">1080p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Video MP4 URL</Label>
              <Input placeholder="https://..." value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Captions VTT URL (Required)</Label>
              <Input placeholder="https://..." value={captionUrl} onChange={(e) => setCaptionUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Duration (Seconds)</Label>
              <Input type="number" min={45} max={90} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="flex items-end md:col-span-2 mt-2">
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? "Saving..." : "Save Draft Version"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Video Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Language</TableHead>
                <TableHead>Title (Version)</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">Loading...</TableCell>
                </TableRow>
              ) : videos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No videos uploaded yet.</TableCell>
                </TableRow>
              ) : (
                videos.map((vid) => (
                  <TableRow key={vid.id}>
                    <TableCell className="font-medium uppercase">{vid.language}</TableCell>
                    <TableCell>
                      {vid.title} <span className="text-muted-foreground text-xs ml-1">({vid.version})</span>
                    </TableCell>
                    <TableCell>{vid.duration_seconds}s</TableCell>
                    <TableCell>
                      {vid.status === "active" && <Badge className="bg-green-500">Active</Badge>}
                      {vid.status === "draft" && <Badge variant="outline">Draft</Badge>}
                      {vid.status === "inactive" && <Badge variant="secondary">Inactive</Badge>}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={vid.url} target="_blank" rel="noreferrer">Preview</a>
                      </Button>
                      
                      {vid.status !== "active" && (
                        <Button size="sm" onClick={() => handlePublish(vid.id, vid.language)}>
                          Publish
                        </Button>
                      )}
                      
                      {vid.status === "active" && (
                        <Button size="sm" variant="destructive" onClick={() => handleDeactivate(vid.id)}>
                          Deactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
