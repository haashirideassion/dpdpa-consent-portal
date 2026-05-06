/**
 * MultiEntrySection
 * Generic reusable section for multi-record employee data categories.
 *
 * Locked state (hasConsented && !isAdmin):
 *   - Add/Edit/Delete buttons hidden
 *   - Header shows "Locked" + "Request Correction" (opens sheet for add-as-request)
 *   - Each record shows pencil → opens sheet pre-filled for edit-as-request
 *   - Sheet submit goes to correction_requests (original data unchanged)
 *
 * Unlocked state:
 *   - Standard add / edit / delete flow
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AddSquareBoldDuotone,
  PenBoldDuotone,
  TrashBinTrashBoldDuotone,
  LockKeyholeMinimalisticBoldDuotone,
} from "solar-icon-set";
import { toast } from "sonner";
import { CorrectionService } from "@/services/correction.service";

// ── Field config ──────────────────────────────────────────────────────────────
export interface EntryField {
  key: string;
  label: string;
  type?: "text" | "date" | "select" | "textarea" | "number";
  options?: string[];
  required?: boolean;
  fullWidth?: boolean;
  placeholder?: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface MultiEntrySectionProps {
  title: string;
  icon: React.ReactNode;
  employeeId: string;
  isAdmin?: boolean;
  hasConsented?: boolean;
  /** DB table name used as sectionKey for correction requests */
  sectionKey?: string;
  loader: (employeeId: string) => Promise<any[]>;
  onAdd: (employeeId: string, record: Record<string, any>) => Promise<void>;
  onUpdate: (id: string, record: Record<string, any>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  fields: EntryField[];
  renderCard: (entry: any, index: number) => React.ReactNode;
  emptyMessage?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MultiEntrySection({
  title,
  icon,
  employeeId,
  isAdmin = false,
  hasConsented = false,
  sectionKey,
  loader,
  onAdd,
  onUpdate,
  onDelete,
  fields,
  renderCard,
  emptyMessage,
}: MultiEntrySectionProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Correction mode — reuses the same sheet but submits to correction_requests
  const [correctionMode, setCorrectionMode] = useState(false);
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isLocked = hasConsented && !isAdmin;
  const canEdit = !isLocked;

  // ── Data loading ─────────────────────────────────────────────────────────────
  const fetchEntries = useCallback(async () => {
    try {
      const data = await loader(employeeId);
      setEntries(data);
    } catch (err) {
      console.error(`MultiEntrySection[${title}]: fetch failed`, err);
    } finally {
      setLoadingEntries(false);
    }
  }, [employeeId, loader, title]);

  useEffect(() => {
    if (employeeId) fetchEntries();
  }, [employeeId, fetchEntries]);

  // ── Sheet helpers ─────────────────────────────────────────────────────────────
  function closeSheet() {
    setSheetOpen(false);
    setCorrectionMode(false);
    setFieldErrors({});
  }

  function openAdd() {
    setEditTarget(null);
    setDraft({});
    setFieldErrors({});
    setCorrectionMode(false);
    setSheetOpen(true);
  }

  function openEdit(entry: any) {
    setEditTarget(entry);
    const initial: Record<string, any> = {};
    fields.forEach((f) => { initial[f.key] = entry[f.key] ?? ""; });
    setDraft(initial);
    setFieldErrors({});
    setCorrectionMode(false);
    setSheetOpen(true);
  }

  /** Open correction sheet for editing an existing record (pre-fills with record values) */
  function openCorrectionEdit(entry: any) {
    setEditTarget(entry);
    const initial: Record<string, any> = {};
    fields.forEach((f) => { initial[f.key] = entry[f.key] ?? ""; });
    setDraft(initial);
    setFieldErrors({});
    setCorrectionMode(true);
    setSheetOpen(true);
  }

  /** Open correction sheet for requesting to add a missing record (empty form) */
  function openCorrectionAdd() {
    setEditTarget(null);
    setDraft({});
    setFieldErrors({});
    setCorrectionMode(true);
    setSheetOpen(true);
  }

  // ── Validation ────────────────────────────────────────────────────────────────
  function validateDraft(): boolean {
    const hasAnyValue = Object.values(draft).some(
      (v) => v !== null && v !== undefined && String(v).trim() !== ""
    );
    if (!hasAnyValue) {
      closeSheet();
      return false;
    }

    const errors: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.required && (!draft[f.key] || String(draft[f.key]).trim() === "")) {
        errors[f.key] = `${f.label} is required`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error("Please fill in the required fields");
      return false;
    }

    return true;
  }

  // ── Normal save (unlocked) ───────────────────────────────────────────────────
  async function handleSave() {
    if (correctionMode) {
      await handleCorrectionSubmit();
      return;
    }

    if (!validateDraft()) return;

    setSaving(true);
    try {
      if (editTarget) {
        await onUpdate(editTarget.id, draft);
        toast.success(`${title} updated`);
      } else {
        await onAdd(employeeId, draft);
        toast.success(`${title} added`);
      }
      closeSheet();
      await fetchEntries();
    } catch {
      toast.error("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Correction submit (locked) ───────────────────────────────────────────────
  async function handleCorrectionSubmit() {
    if (!validateDraft()) return;

    if (!sectionKey) {
      toast.error("Cannot submit: section is not configured for corrections.");
      return;
    }

    setSubmittingCorrection(true);
    try {
      const alreadyPending = await CorrectionService.hasPendingSectionRecordCorrection(
        employeeId,
        sectionKey
      );
      if (alreadyPending) {
        toast.warning(
          "You already have a pending correction request for this section. Please wait for HR to review it."
        );
        return;
      }

      const oldValues: Record<string, any> = {};
      if (editTarget) {
        fields.forEach((f) => { oldValues[f.key] = editTarget[f.key] ?? ""; });
      }

      await CorrectionService.submitSectionRecordCorrection({
        employeeId,
        sectionKey,
        sectionLabel: title,
        type: editTarget ? "edit" : "add",
        recordId: editTarget?.id,
        oldValues,
        newValues: { ...draft },
      });

      toast.success("Correction request submitted. HR will review it shortly.");
      closeSheet();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to submit correction. Please try again.");
    } finally {
      setSubmittingCorrection(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      toast.success("Record deleted");
      setDeleteTarget(null);
      await fetchEntries();
    } catch {
      toast.error("Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  // ── Sheet title ───────────────────────────────────────────────────────────────
  function sheetTitle() {
    if (correctionMode) {
      return editTarget
        ? `Request Correction — ${title}`
        : `Request to Add — ${title}`;
    }
    return editTarget ? `Edit ${title}` : `Add ${title}`;
  }

  // ── Submit button label ───────────────────────────────────────────────────────
  function submitLabel() {
    if (correctionMode) {
      return submittingCorrection ? "Submitting…" : "Submit Correction Request";
    }
    if (saving) return "Saving…";
    return editTarget ? "Update" : "Add";
  }

  const isBusy = saving || submittingCorrection;

  return (
    <>
      <Card className="border border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-3.5 px-5">
          <div className="flex items-center gap-2.5">
            <span className="text-primary">{icon}</span>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            {entries.length > 0 && (
              <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium tabular-nums">
                {entries.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isLocked && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <LockKeyholeMinimalisticBoldDuotone size={11} />
                Locked
              </span>
            )}
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={openAdd}
                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
              >
                <AddSquareBoldDuotone size={13} />
                Add
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="px-5 pb-5 pt-0">
          {loadingEntries ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-1.5">
              <span className="text-3xl opacity-20">—</span>
              <p className="text-xs text-muted-foreground">
                {emptyMessage ?? `No ${title.toLowerCase()} added yet.`}
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={openAdd}
                  className="mt-1 text-xs text-primary font-medium hover:underline underline-offset-2"
                >
                  + Add {title.toLowerCase()}
                </button>
              )}
              {isLocked && sectionKey && (
                <button
                  type="button"
                  onClick={openCorrectionAdd}
                  className="mt-1 text-xs text-primary font-medium hover:underline underline-offset-2"
                >
                  + Request to add
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry, idx) => (
                <div
                  key={entry.id}
                  className="group rounded-lg border border-border bg-muted/20 px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  {/* Card content + unlocked action buttons */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">{renderCard(entry, idx)}</div>

                    {/* Edit / Delete — unlocked state, visible on hover */}
                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => openEdit(entry)}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                          title="Edit"
                        >
                          <PenBoldDuotone size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(entry)}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete"
                        >
                          <TrashBinTrashBoldDuotone size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Always-visible Request Correction pill — locked state only */}
                  {isLocked && sectionKey && (
                    <button
                      type="button"
                      onClick={() => openCorrectionEdit(entry)}
                      className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 rounded-full px-2 py-0.5 transition-colors"
                    >
                      Request Correction
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add / Edit / Correction Sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet(); else setSheetOpen(true); }}>
        <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-[520px]">
          <SheetHeader className="mb-4 shrink-0">
            <SheetTitle className="text-base font-semibold">{sheetTitle()}</SheetTitle>
            {correctionMode && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {editTarget
                  ? "Edit the values below and submit — your request will be reviewed by HR before any changes are applied."
                  : "Fill in the details of the record you’d like to add — HR will review and apply it."}
              </p>
            )}
          </SheetHeader>

          {/* Current record summary (correction-edit only) */}
          {correctionMode && editTarget && (
            <div className="mb-4 shrink-0 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-2 text-[11px] uppercase tracking-wide">
                Current record
              </p>
              {renderCard(editTarget, 0)}
            </div>
          )}

          <div className="grid grid-cols-1 content-start gap-x-3 gap-y-2.5 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className={field.fullWidth ? "sm:col-span-2" : ""}>
                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {field.label}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </label>
                <EntryInput
                  field={field}
                  value={draft[field.key] ?? ""}
                  onChange={(val) => {
                    setDraft((prev) => ({ ...prev, [field.key]: val }));
                    if (fieldErrors[field.key]) {
                      setFieldErrors((prev) => {
                        const n = { ...prev };
                        delete n[field.key];
                        return n;
                      });
                    }
                  }}
                  error={fieldErrors[field.key]}
                />
              </div>
            ))}
          </div>

          <SheetFooter className="mt-auto shrink-0 gap-2 border-t pt-3">
            <SheetClose asChild>
              <Button variant="outline" size="sm" disabled={isBusy}>
                Cancel
              </Button>
            </SheetClose>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isBusy}
            >
              {submitLabel()}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Input renderer ────────────────────────────────────────────────────────────
function EntryInput({
  field,
  value,
  onChange,
  error,
}: {
  field: EntryField;
  value: any;
  onChange: (val: any) => void;
  error?: string;
}) {
  const baseClass = `h-[30px] text-sm ${error ? "border-destructive ring-destructive/30 ring-1" : ""}`;

  if (field.type === "textarea") {
    return (
      <>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={`text-sm resize-none ${error ? "border-destructive" : ""}`}
          placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}`}
        />
        {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
      </>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className={`h-[30px] text-sm ${error ? "border-destructive" : ""}`}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
      </>
    );
  }

  return (
    <>
      <Input
        type={field.type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={baseClass}
        placeholder={field.placeholder ?? `Enter ${field.label.toLowerCase()}`}
      />
      {error && <p className="text-[10px] text-destructive mt-0.5">{error}</p>}
    </>
  );
}
