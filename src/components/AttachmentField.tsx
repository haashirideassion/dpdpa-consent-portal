/**
 * AttachmentField
 *
 * Self-contained supporting-document chip rendered below a DataField.
 * Manages its own fetch, signed-URL generation, and upload state.
 *
 * Rendered as a compact rounded-full pill — matching the "Update" correction
 * pill's visual language in DataSection — rather than a full-width dashed
 * dropzone, so it sits inline with the field instead of breaking the
 * 3-column field grid every time a government-ID field appears.
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
  CheckCircleBoldDuotone,
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
  // Core logic takes a File directly so both the hidden "Replace" input and
  // the Dropzone (drag/drop or click-to-browse) can share the same path.
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

  // ── Don't render anything while loading the initial state ─────────────────
  if (loading) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
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
        // ── Attachment exists — a single document chip, same pill language
        // as the "Update" correction button so field-row chips read as one
        // family instead of a separate full-width block per field.
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/5 pl-2 pr-1 py-0.5">
          <CheckCircleBoldDuotone size={11} className="text-success shrink-0" />
          <span
            className="max-w-[110px] truncate text-[10px] font-medium text-foreground"
            title={attachment.file_name}
          >
            {attachment.file_name}
          </span>
          {signedUrl && (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title={`View ${label}`}
            >
              <DownloadMinimalisticBoldDuotone size={11} />
            </a>
          )}
          {canUpload && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              title={uploading ? "Uploading…" : `Replace ${label}`}
            >
              <RefreshBoldDuotone size={11} className={uploading ? "animate-spin" : ""} />
            </button>
          )}
        </span>
      ) : canUpload ? (
        // ── No attachment, upload allowed — same pill as the "Update" chip,
        // just in the primary/dashed tone reserved for pending actions.
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/15 transition-colors disabled:opacity-40"
        >
          <PaperclipBoldDuotone size={11} />
          {uploading ? "Uploading…" : `Attach ${label}`}
        </button>
      ) : (
        // ── No attachment, upload not allowed (post-consent employee) ──────
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground/60 italic">
          No document on file
        </span>
      )}
    </div>
  );
}
