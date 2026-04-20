import { useState } from "react";
import { AltArrowDownBoldDuotone, AltArrowUpBoldDuotone } from "solar-icon-set";
import { PenBoldDuotone } from "solar-icon-set";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataField, type FieldDef } from "./DataField";
import { toast } from "sonner";

interface DataSectionProps {
  title: string;
  icon: React.ReactNode;
  fields: FieldDef[];
  defaultOpen?: boolean;
  onSave?: (updates: Record<string, string>) => Promise<void>;
}

export function DataSection({ title, icon, fields, defaultOpen = true, onSave }: DataSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

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

  return (
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
          {editMode ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={cancelEdit}
                disabled={saving}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            onSave && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit();
                }}
                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
              >
                <PenBoldDuotone size={13} />
                Edit
              </Button>
            )
          )}
          {!editMode && (
            <span className="text-muted-foreground cursor-pointer" onClick={() => setOpen(!open)}>
              {open ? <AltArrowUpBoldDuotone size={18} /> : <AltArrowDownBoldDuotone size={18} />}
            </span>
          )}
        </div>
      </CardHeader>

      {open && (
        <CardContent className="px-6 pb-6 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1 divide-y sm:divide-y-0">
            {fields.map((f) => (
              <DataField
                key={f.key}
                label={f.label}
                value={f.value}
                type={f.type}
                options={f.options}
                locked={f.locked}
                fieldKey={f.key}
                editMode={editMode}
                draft={draft[f.key]}
                onDraftChange={(k, val) => setDraft((prev) => ({ ...prev, [k]: val }))}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
