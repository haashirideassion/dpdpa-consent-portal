/**
 * AttachmentField
 *
 * Self-contained supporting-document upload row rendered below a DataField.
 * Manages its own fetch, signed-URL generation, and upload state.
 *
 * ── Behaviour by context ───────────────────────────────────────────────────
 * Pre-consent  (hasConsented=false)  → employee can upload / replace directly.
 * Post-consent (hasConsented=true)   → employee sees current document (view only);
 *                                      replacement must go through a correction request.
 * Admin        (isAdmin=true)        → can always upload / replace (admin override).
 */

import { useState, useEffect, useRef } from "react";
import { AttachmentService, type EmployeeAttachment } from "@/services/attachment.service";
import { attachmentLabel } from "@/lib/attachmentConfig";
import { useAuth } from "@/hooks/use-auth";
import {
  DocumentTextBoldDuotone,
  DownloadMinimalisticBoldDuotone,
  RefreshBoldDuotone,
  PaperclipBoldDuotone,
} from "solar-icon-set";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

interface AttachmentFieldProps {
  employeeId: string;
  fieldKey: string;
  hasConsented: boolean;
  isAdmin: boolean;
}

/** e.g. 245000 → "245 KB", 2_400_000 → "2.4 MB". No fabricated units. */
function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentField({
  employeeId,
  fieldKey,
  hasConsented,
  isAdmin,
}: AttachmentFieldProps) {
  const { user } = useAuth();

  const [attachment, setAttachment] = useState<EmployeeAttachment | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Can the current viewer upload / replace a document?
  const canUpload = isAdmin || !hasConsented;
  const label = attachmentLabel(fieldKey);

  // ── Load current attachment + signed URL ──────────────────────────────────
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const att = await AttachmentService.getActive(employeeId, fieldKey);
        if (!alive) return;
        setAttachment(att);

        if (att) {
          const url = await AttachmentService.getSignedUrl(att.file_path);
          if (alive) setSignedUrl(url);
        }
      } catch (err) {
        console.error(`AttachmentField[${fieldKey}]:`, err);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [employeeId, fieldKey]);

  // ── Upload handler ────────────────────────────────────────────────────────
  // Core logic takes a File directly so both the hidden "Replace" input and
  // the empty-state drop target (drag/drop or click-to-browse) can share the
  // same path.
  async function processFile(file: File) {
    if (!user) return;

    const err = AttachmentService.validate(file);
    if (err) {
      toast.error(err);
      return;
    }

    setUploading(true);
    try {
      const result = await AttachmentService.upload(file, employeeId, fieldKey, user.id);
      setAttachment(result);

      const url = await AttachmentService.getSignedUrl(result.file_path);
      setSignedUrl(url);
      toast.success(`${label} uploaded.`);
    } catch (uploadErr: any) {
      toast.error(uploadErr?.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  // ── Don't render anything while loading the initial state ─────────────────
  if (loading) return null;

  return (
    <div className="mt-1.5">
      {/* Hidden file input shared across upload & replace controls */}
      {canUpload && (
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="sr-only"
          onChange={handleFile}
          disabled={uploading}
        />
      )}

      {attachment ? (
        // ── Attachment exists — compact document card ──────────────────────
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-2.5 py-2">
          <DocumentTextBoldDuotone size={18} className="shrink-0 text-muted-foreground" />

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-foreground truncate" title={label}>
              {label}
            </p>
            <p
              className="truncate text-[10.5px] text-muted-foreground"
              title={attachment.file_name}
            >
              {attachment.file_name}
              {attachment.file_size ? ` · ${formatFileSize(attachment.file_size)}` : ""}
            </p>
          </div>

          <StatusBadge tone="neutral" className="shrink-0">On file</StatusBadge>

          <div className="flex shrink-0 items-center gap-1">
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${label}`}
                title="View"
                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <DownloadMinimalisticBoldDuotone size={14} />
              </a>
            )}

            {canUpload && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label={`Replace ${label}`}
                title="Replace"
                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
              >
                <RefreshBoldDuotone size={14} className={uploading ? "animate-spin" : undefined} />
              </button>
            )}
          </div>
        </div>
      ) : canUpload ? (
        // ── No attachment, upload allowed — compact drop target ────────────
        <div
          role="button"
          tabIndex={0}
          aria-label={`Upload ${label}`}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={cn(
            "flex items-center gap-2.5 rounded-md border border-dashed border-border px-2.5 py-2 cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/40",
            uploading && "pointer-events-none opacity-60"
          )}
        >
          <PaperclipBoldDuotone size={16} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-foreground">
              {uploading ? "Uploading…" : `Upload ${label}`}
            </p>
            <p className="text-[10.5px] text-muted-foreground">PDF, JPG, PNG — max 5MB</p>
          </div>
        </div>
      ) : (
        // ── No attachment, upload not allowed (post-consent employee) ──────
        <div className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-2">
          <DocumentTextBoldDuotone size={16} className="shrink-0 text-muted-foreground/40" />
          <span className="text-[11px] text-muted-foreground/60 italic">No document on file</span>
        </div>
      )}
    </div>
  );
}
