import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderWithFilesBoldDuotone, PlayCircleBoldDuotone, AddCircleBoldDuotone } from "solar-icon-set";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/campaigns")({
  head: () => ({
    meta: [{ title: "Campaigns — Admin" }],
  }),
  component: CampaignsAdminPage,
});

interface Campaign {
  id: string;
  name: string;
  status: string;
  launched_at: string | null;
  template: { name: string; version: string };
  video: { title: string; version: string };
}

function CampaignsAdminPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog state
  const [open, setOpen] = useState(false);
  const [newCampName, setNewCampName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [selectedVideo, setSelectedVideo] = useState("");
  const [templates, setTemplates] = useState<{id: string, name: string, version: string}[]>([]);
  const [videos, setVideos] = useState<{id: string, title: string, version: string}[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function fetchCampaigns() {
      const { data, error } = await supabase
        .from("campaigns")
        .select(`
          id, name, status, launched_at,
          template:consent_templates(name, version),
          video:video_versions(title, version)
        `)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setCampaigns(data as any as Campaign[]);
      }

      // Fetch options for the dialog
      const [tmplRes, vidRes] = await Promise.all([
        supabase.from("consent_templates").select("id, name, version").eq("is_active", true),
        supabase.from("video_versions").select("id, title, version").eq("is_active", true)
      ]);
      if (tmplRes.data) setTemplates(tmplRes.data);
      if (vidRes.data) setVideos(vidRes.data);

      setLoading(false);
    }
    fetchCampaigns();
  }, []);

  const handleCreateCampaign = async () => {
    if (!newCampName || !selectedTemplate || !selectedVideo || !user) return;
    setCreating(true);

    const { error } = await supabase.from("campaigns").insert({
      name: newCampName,
      template_id: selectedTemplate,
      video_version_id: selectedVideo,
      status: "active",
      launched_at: new Date().toISOString(),
      created_by: user.id
    });

    setCreating(false);
    if (!error) {
      setOpen(false);
      // Reload page to show new campaign
      window.location.reload();
    } else {
      console.error("Failed to create campaign", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Consent Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage rolling consent updates and trigger new invites.
          </p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shrink-0">
              <AddCircleBoldDuotone size={20} />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Campaign</DialogTitle>
              <DialogDescription>
                Launch a new consent collection drive. This will allow you to generate invites for employees.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input 
                  placeholder="e.g. Q3 2026 Policy Update" 
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Consent Template</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select active template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.version})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mandatory Intro Video</Label>
                <Select value={selectedVideo} onValueChange={setSelectedVideo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select active video" />
                  </SelectTrigger>
                  <SelectContent>
                    {videos.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.title} ({v.version})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateCampaign} disabled={creating || !newCampName || !selectedTemplate || !selectedVideo}>
                {creating ? "Launching..." : "Launch Campaign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderWithFilesBoldDuotone size={18} className="text-primary" />
            All Campaigns
          </CardTitle>
          <CardDescription>Active and historical consent collection drives.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No campaigns found.
            </div>
          ) : (
            <div className="divide-y">
              {campaigns.map((camp) => (
                <div key={camp.id} className="py-4 flex flex-col sm:flex-row gap-4 justify-between sm:items-center hover:bg-muted/10 transition-colors px-2 -mx-2 rounded-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base">{camp.name}</span>
                      {camp.status === "active" ? (
                        <Badge className="bg-success/15 text-success border-success/30">Active</Badge>
                      ) : camp.status === "draft" ? (
                        <Badge variant="outline">Draft</Badge>
                      ) : (
                        <Badge variant="secondary">Closed</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-2 flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">Template:</span> 
                        {camp.template?.name} ({camp.template?.version})
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground">Video:</span> 
                        {camp.video?.title} ({camp.video?.version})
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    {camp.launched_at ? (
                      <span className="text-xs text-muted-foreground">
                        Launched {format(new Date(camp.launched_at), "PP")}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not launched</span>
                    )}
                    <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
                      <PlayCircleBoldDuotone size={16} /> Manage
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
