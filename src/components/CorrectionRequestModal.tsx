import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { CorrectionService } from "@/services/correction.service";
import { AttachmentService, type EmployeeAttachment } from "@/services/attachment.service";
import { requiresAttachment } from "@/lib/attachmentConfig";
import { PaperclipBoldDuotone, DownloadMinimalisticBoldDuotone } from "solar-icon-set";
import { correctionRequestSchema, type CorrectionRequestFormValues } from "@/lib/validation/correction";

interface CorrectionRequestModalProps {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  fieldKey: string;
  fieldLabel: string;
  currentValue: string;
}

export function CorrectionRequestModal({
  open,
  onClose,
  employeeId,
  fieldKey,
  fieldLabel,
  currentValue,
}: CorrectionRequestModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<CorrectionRequestFormValues>({
    resolver: zodResolver(correctionRequestSchema),
    defaultValues: { newValue: "" },
  });

  // Current document on file (loaded when the field supports attachments)
  const [currentAttachment, setCurrentAttachment] = useState<EmployeeAttachment | null>(null);
  const [currentAttachmentUrl, setCurrentAttachmentUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !requiresAttachment(fieldKey)) {
      setCurrentAttachment(null);
      setCurrentAttachmentUrl(null);
      return;
    }
    AttachmentService.getActive(employeeId, fieldKey).then(async (att) => {
      setCurrentAttachment(att);
      if (att) {
        const url = await AttachmentService.getSignedUrl(att.file_path);
        setCurrentAttachmentUrl(url);
      }
    });
  }, [open, employeeId, fieldKey]);

  async function onSubmit(values: CorrectionRequestFormValues) {
    setSubmitting(true);
    try {
      // Check if there's already a pending request for this field
      const alreadyPending = await CorrectionService.hasPendingRequest(employeeId, fieldKey);
      if (alreadyPending) {
        toast.warning("You already have a pending update request for this field. Please wait for HR to review it.");
        return;
      }

      let attachmentUrl: string | undefined;
      if (file) {
        attachmentUrl = await CorrectionService.uploadProof(employeeId, file);
      }

      await CorrectionService.submit({
        employeeId,
        fieldKey,
        fieldLabel,
        oldValue: currentValue ?? "",
        newValue: values.newValue.trim(),
        attachmentUrl,
      });

      toast.success("Update request submitted! HR will review it shortly.");
      form.reset({ newValue: "" });
      setFile(null);
      onClose();
    } catch (err: any) {
      console.error("Correction submit failed:", err);
      toast.error(err?.message ?? "Failed to submit correction. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (!submitting) {
      form.reset({ newValue: "" });
      setFile(null);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Data</DialogTitle>
          <DialogDescription>
            Your data is locked after consent. Submit an update request and HR will review it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Field being corrected */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Field</Label>
            <p className="text-sm font-medium">{fieldLabel}</p>
          </div>

          {/* Current Value */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Current Value</Label>
            <p className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">
              {currentValue || <span className="italic">Not provided</span>}
            </p>
          </div>

          {/* Current Document on File */}
          {currentAttachment && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Current Document on File</Label>
              <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
                <PaperclipBoldDuotone size={13} className="text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate flex-1">
                  {currentAttachment.file_name}
                </span>
                {currentAttachmentUrl && (
                  <a
                    href={currentAttachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline underline-offset-2"
                  >
                    <DownloadMinimalisticBoldDuotone size={12} />
                    View
                  </a>
                )}
              </div>
            </div>
          )}

          {/* New Value */}
          <Form {...form}>
            <FormField
              control={form.control}
              name="newValue"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs">Updated Value <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter the correct value..."
                      rows={2}
                      disabled={submitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>

          {/* Proof / Replacement Document Upload */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {requiresAttachment(fieldKey) ? "Replacement Document" : "Supporting Document"}{" "}
              <span className="text-muted-foreground">(optional — PDF / JPG / PNG, max 5 MB)</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs"
                onClick={() => fileRef.current?.click()}
                disabled={submitting}
                type="button"
              >
                <PaperclipBoldDuotone size={14} />
                {file ? file.name : "Attach document"}
              </Button>
              {file && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setFile(null)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={form.handleSubmit(onSubmit)} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
