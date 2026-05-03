import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PlayCircleBoldDuotone, PauseCircleBoldDuotone } from "solar-icon-set";
import { VideoService } from "@/services/video.service";
import { AuditService } from "@/services/audit.service";
import { useAuth } from "@/hooks/use-auth";

interface IntroVideoPlayerProps {
  videoVersionId: string;
  videoUrl: string;
  captionUrl?: string;
  initialPosition?: number;
  onCompleted?: () => void;
}

export function IntroVideoPlayer({
  videoVersionId,
  videoUrl,
  captionUrl,
  initialPosition = 0,
  onCompleted,
}: IntroVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { employeeId } = useAuth();
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [maxWatchedSeconds, setMaxWatchedSeconds] = useState(initialPosition);
  const [isCompleted, setIsCompleted] = useState(false);
  const [duration, setDuration] = useState(0);

  // Sync progress to DB periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPlaying || !videoRef.current || !employeeId) return;
      
      const currentTime = videoRef.current.currentTime;
      const currentPct = duration > 0 ? (currentTime / duration) * 100 : 0;
      
      VideoService.updateProgress(employeeId, videoVersionId, {
        watchTimeSeconds: Math.floor(currentTime),
        completionPct: Number(currentPct.toFixed(2)),
        lastPositionSeconds: Math.floor(currentTime),
        completed: isCompleted,
      });
      
    }, 5000); // Save every 5 seconds
    
    return () => clearInterval(interval);
  }, [isPlaying, employeeId, videoVersionId, duration, isCompleted]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    
    const currentTime = videoRef.current.currentTime;
    
    // Prevent seeking forward
    if (currentTime > maxWatchedSeconds + 1) { // 1 second buffer for normal playback updates
      videoRef.current.currentTime = maxWatchedSeconds;
      return;
    }
    
    setMaxWatchedSeconds(Math.max(currentTime, maxWatchedSeconds));
    
    if (duration > 0) {
      const pct = (currentTime / duration) * 100;
      setProgressPct(pct);
      
      // 90% gate
      if (pct >= 90 && !isCompleted) {
        setIsCompleted(true);
        if (employeeId) {
          VideoService.updateProgress(employeeId, videoVersionId, {
            watchTimeSeconds: Math.floor(currentTime),
            completionPct: Number(pct.toFixed(2)),
            lastPositionSeconds: Math.floor(currentTime),
            completed: true,
          }).then(() => {
             AuditService.log({
               action: "video.completed",
               entityType: "video_version",
               entityId: videoVersionId,
               metadata: { completion_pct: pct }
             });
             onCompleted();
          });
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      if (initialPosition > 0) {
        videoRef.current.currentTime = initialPosition;
        setMaxWatchedSeconds(initialPosition);
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeeking = () => {
     if (!videoRef.current) return;
     if (videoRef.current.currentTime > maxWatchedSeconds) {
         videoRef.current.currentTime = maxWatchedSeconds;
     }
  };

  return (
    <div className="relative rounded-xl overflow-hidden bg-black border border-border shadow-lg">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full aspect-video object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onSeeking={handleSeeking}
        playsInline
      >
        {captionUrl && (
          <track
            kind="captions"
            src={captionUrl}
            srcLang="en"
            label="Captions"
            default
          />
        )}
      </video>
      
      {/* Custom Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 p-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={togglePlay}
            className="text-white hover:text-primary transition-colors focus:outline-none"
          >
            {isPlaying ? (
              <PauseCircleBoldDuotone size={36} />
            ) : (
              <PlayCircleBoldDuotone size={36} />
            )}
          </button>
          
          <div className="flex-1">
            <Progress value={progressPct} className="h-2 bg-white/20" />
          </div>
          
          <div className="text-white text-xs font-medium tabular-nums">
            {Math.floor(progressPct)}%
          </div>
        </div>
      </div>
      
      {/* Initial Play Overlay */}
      {!isPlaying && progressPct === 0 && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer"
          onClick={togglePlay}
        >
          <div className="bg-primary/90 text-primary-foreground rounded-full p-4 shadow-xl transform transition-transform hover:scale-105">
            <PlayCircleBoldDuotone size={48} />
          </div>
        </div>
      )}
    </div>
  );
}
