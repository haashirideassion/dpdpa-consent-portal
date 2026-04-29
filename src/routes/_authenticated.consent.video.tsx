import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { VideoService } from "@/services/video.service";
import { IntroVideoPlayer } from "@/components/IntroVideoPlayer";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/consent/video")({
  head: () => ({
    meta: [
      { title: "Introduction Video — DPDPA Portal" },
      { name: "description", content: "Please watch this mandatory introduction video before proceeding." },
    ],
  }),
  component: ConsentVideoStep,
});

function ConsentVideoStep() {
  const { employeeId } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [videoData, setVideoData] = useState<{ id: string; url: string; position: number } | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    async function initVideo() {
      if (!employeeId) return;
      
      // Get active video version
      const activeVideo = await VideoService.getActiveVideoVersion();
      
      if (!activeVideo) {
         // No active video configured, skip this step
         navigate({ to: "/" });
         return;
      }

      // Check progress
      const progress = await VideoService.getVideoProgress(employeeId, activeVideo.id);
      
      if (progress.completed) {
         navigate({ to: "/" });
         return;
      }

      setVideoData({
        id: activeVideo.id,
        url: activeVideo.url,
        position: progress.position,
      });
      setLoading(false);
    }
    
    initVideo();
  }, [employeeId, navigate]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 space-y-4">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="w-full aspect-video rounded-xl" />
      </div>
    );
  }

  if (!videoData) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Introduction to Data Privacy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Please watch this mandatory video. You must watch at least 90% to proceed to the consent form.
        </p>
      </div>

      <IntroVideoPlayer
        videoVersionId={videoData.id}
        videoUrl={videoData.url}
        initialPosition={videoData.position}
        onCompleted={() => setIsCompleted(true)}
      />
      
      <div className="mt-8 flex justify-end">
         <Button 
           size="lg" 
           disabled={!isCompleted}
           onClick={() => navigate({ to: "/" })}
         >
           Continue to Consent Form
         </Button>
      </div>
    </div>
  );
}
