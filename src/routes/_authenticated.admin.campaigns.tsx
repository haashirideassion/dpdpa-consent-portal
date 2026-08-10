import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { FolderWithFilesBoldDuotone, PlayCircleBoldDuotone, AddCircleBoldDuotone } from "solar-icon-set";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { campaignSchema, type CampaignFormValues } from "@/lib/validation/campaign";

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
  const [templates, setTemplates] = useState<{id: string, name: string, version: string}[]>([]);
  const [videos, setVideos] = useState<{id: string, title: string, version: string}[]>([]);
  const [creating, setCreating] = useState(false);

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { name: "", template_id: "", video_version_id: "" },
  });

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

  const onSubmit = async (values: CampaignFormValues) => {
    if (!user) return;
    setCreating(true);

    const { error } = await supabase.from("campaigns").insert({
      name: values.name,
      template_id: values.template_id,
      video_version_id: values.video_version_id,
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
      toast.error("Failed to create campaign.");
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
            <Form {...form}>
              <div className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Q3 2026 Policy Update" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="template_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Consent Template</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select active template" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {templates.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name} ({t.version})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="video_version_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mandatory Intro Video</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select active video" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {videos.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.title} ({v.version})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Form>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={form.handleSubmit(onSubmit)} disabled={creating}>
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
            <EmptyState
              icon={<FolderWithFilesBoldDuotone size={32} />}
              title="No campaigns found"
              className="py-12"
            />
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
