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
  PaperclipBoldDuotone,
  DownloadMinimalisticBoldDuotone,
  RefreshBoldDuotone,
} from "solar-icon-set";
import { toast } from "sonner";

interface AttachmentFieldProps {
  employeeId: string;
  fieldKey: string;
  hasConsented: boolean;
  isAdmin: boolean;
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
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const err = AttachmentService.validate(file);
    if (err) {
      toast.error(err);
      if (fileRef.current) fileRef.current.value = "";
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
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ── Don't render anything while loading the initial state ─────────────────
  if (loading) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {/* Hidden file input shared across upload & replace buttons */}
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
        // ── Attachment exists ──────────────────────────────────────────────
        <>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <PaperclipBoldDuotone size={12} className="shrink-0" />
            <span
              className="truncate max-w-[160px]"
              title={attachment.file_name}
            >
              {attachment.file_name}
            </span>
          </span>

          {signedUrl && (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline underline-offset-2"
            >
              <DownloadMinimalisticBoldDuotone size={12} />
              View
            </a>
          )}

          {canUpload && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              title={`Replace ${label}`}
            >
              <RefreshBoldDuotone size={12} />
              {uploading ? "Uploading…" : "Replace"}
            </button>
          )}
        </>
      ) : canUpload ? (
        // ── No attachment, upload allowed ──────────────────────────────────
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary/50 rounded px-2 py-0.5 transition-colors disabled:opacity-40"
        >
          <PaperclipBoldDuotone size={12} />
          {uploading ? "Uploading…" : `Upload ${label}`}
        </button>
      ) : (
        // ── No attachment, upload not allowed (post-consent employee) ──────
        <span className="text-[10px] text-muted-foreground/50 italic">
          No document on file
        </span>
      )}
    </div>
  );
}
