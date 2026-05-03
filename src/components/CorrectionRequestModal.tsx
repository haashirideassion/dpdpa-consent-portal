import { useState, useRef } from "react";
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
import { toast } from "sonner";
import { CorrectionService } from "@/services/correction.service";
import { PaperclipBoldDuotone } from "solar-icon-set";

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
  const [newValue, setNewValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    if (!newValue.trim()) {
      toast.error("Please enter the corrected value.");
      return;
    }

    setSubmitting(true);
    try {
      // Check if there's already a pending request for this field
      const alreadyPending = await CorrectionService.hasPendingRequest(employeeId, fieldKey);
      if (alreadyPending) {
        toast.warning("You already have a pending correction request for this field. Please wait for HR to review it.");
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
        newValue: newValue.trim(),
        attachmentUrl,
      });

      toast.success("Correction request submitted! HR will review it shortly.");
      setNewValue("");
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
      setNewValue("");
      setFile(null);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Data Correction</DialogTitle>
          <DialogDescription>
            Your data is locked after consent. Submit a correction request and HR will review it.
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

          {/* New Value */}
          <div className="space-y-1.5">
            <Label htmlFor="new-value" className="text-xs">Corrected Value <span className="text-destructive">*</span></Label>
            <Textarea
              id="new-value"
              placeholder="Enter the correct value..."
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              rows={2}
              disabled={submitting}
            />
          </div>

          {/* Proof Upload */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Supporting Document <span className="text-muted-foreground">(optional — PDF / JPG / PNG, max 5 MB)</span>
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
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
