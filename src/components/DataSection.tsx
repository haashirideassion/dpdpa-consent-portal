import { useState } from "react";
import { ArrowDownBoldDuotone, ArrowUpBoldDuotone } from "solar-icon-set";
import { PenBoldDuotone, LockKeyholeMinimalisticBoldDuotone } from "solar-icon-set";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataField, type FieldDef } from "./DataField";
import { CorrectionRequestModal } from "./CorrectionRequestModal";
import { toast } from "sonner";

interface DataSectionProps {
  title: string;
  icon: React.ReactNode;
  fields: FieldDef[];
  defaultOpen?: boolean;
  onSave?: (updates: Record<string, string>) => Promise<void>;
  /** When true, data is locked — edit is replaced by correction request flow */
  hasConsented?: boolean;
  /** Required when hasConsented=true to submit a correction */
  employeeId?: string;
  /** When true, all locked fields become editable for the admin */
  isAdmin?: boolean;
  /** When true, indicates the user is viewing their own data */
  isOwner?: boolean;
}

export function DataSection({ title, icon, fields, defaultOpen = true, onSave, hasConsented = false, employeeId, isAdmin = false, isOwner = false }: DataSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Correction modal state
  const [correctionField, setCorrectionField] = useState<FieldDef | null>(null);

  function startEdit() {
    const initial: Record<string, string> = {};
    fields.forEach((f) => {
      initial[f.key] = f.value ?? "";
    });
    setDraft(initial);
    setEditMode(true);
    if (!open) setOpen(true);
  }

  function cancelEdit() {
    setDraft({});
    setEditMode(false);
  }

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
      setEditMode(false);
      setDraft({});
      toast.success(`${title} updated successfully`);
    } catch {
      toast.error(`Failed to save ${title}. Please try again.`);
    } finally {
      setSaving(false);
    }
  }

  // The header action button differs based on consent state
  function renderHeaderAction() {
    // Locked after consent — show "Request Correction" per field (triggered from DataField)
    if (hasConsented) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
          <LockKeyholeMinimalisticBoldDuotone size={13} />
          Locked
        </div>
      );
    }

    // Normal edit mode
    if (!onSave) return null;

    if (editMode) {
      return (
        <>
          <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving} className="h-7 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      );
    }

    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => { e.stopPropagation(); startEdit(); }}
        className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
      >
        <PenBoldDuotone size={13} />
        Edit
      </Button>
    );
  }

  return (
    <>
      <Card className="border border-border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-4 px-6">
          <div
            className="flex items-center gap-3 cursor-pointer select-none flex-1"
            onClick={() => !editMode && setOpen(!open)}
          >
            <span className="text-primary">{icon}</span>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
          </div>

          <div className="flex items-center gap-2">
            {renderHeaderAction()}
            {!editMode && (
              <span className="text-muted-foreground cursor-pointer" onClick={() => setOpen(!open)}>
                {open ? <ArrowUpBoldDuotone size={18} /> : <ArrowDownBoldDuotone size={18} />}
              </span>
            )}
          </div>
        </CardHeader>

        {open && (
          <CardContent className="px-6 pb-6 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
              {fields.map((f) => (
                <div key={f.key} className="relative flex flex-col gap-1 py-2">
                  <DataField
                    label={f.label}
                    value={f.value}
                    type={f.type}
                    options={f.options}
                    locked={hasConsented || f.locked}
                    fieldKey={f.key}
                    editMode={!hasConsented && editMode}
                    draft={draft[f.key]}
                    onDraftChange={(k, val) => setDraft((prev) => ({ ...prev, [k]: val }))}
                    isAdmin={isAdmin}
                    isOwner={isOwner}
                  />
                  {/* Always-visible correction pill — shown post-consent for correctable fields */}
                  {hasConsented && !f.uncorrectable && employeeId && (
                    <button
                      type="button"
                      onClick={() => setCorrectionField(f)}
                      className="self-start mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/15 rounded-full px-2 py-0.5 transition-colors"
                    >
                      Request Correction
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Correction Request Modal */}
      {correctionField && employeeId && (
        <CorrectionRequestModal
          open={!!correctionField}
          onClose={() => setCorrectionField(null)}
          employeeId={employeeId}
          fieldKey={correctionField.key}
          fieldLabel={correctionField.label}
          currentValue={correctionField.value ?? ""}
        />
      )}
    </>
  );
}
