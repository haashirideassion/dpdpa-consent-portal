import { useState } from "react";
import { ArrowDownBoldDuotone, ArrowUpBoldDuotone } from "solar-icon-set";
import { PenBoldDuotone, LockKeyholeMinimalisticBoldDuotone } from "solar-icon-set";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DataField, type FieldDef } from "./DataField";
import { CorrectionRequestModal } from "./CorrectionRequestModal";
import { AttachmentField } from "./AttachmentField";
import { SectionConsentBadge } from "./SectionConsentBadge";
import { sectionConsentTone, type SectionConsentStatus } from "@/lib/section-consent";
import { TONE_CSS_VAR } from "@/components/StatusBadge";
import { requiresAttachment } from "@/lib/attachmentConfig";
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
  /**
   * When false, suppresses per-field "Update" buttons even after consent.
   * Use for sections employees are never allowed to update (e.g. Personal, Employment).
   * Defaults to true.
   */
  allowCorrection?: boolean;
  /** Aggregate consent status for this section — renders a status badge in the header. */
  consentStatus?: SectionConsentStatus;
  /** Inline consent area rendered at the bottom of the card content. */
  consentArea?: React.ReactNode;
}

export function DataSection({
  title,
  icon,
  fields,
  defaultOpen = true,
  onSave,
  hasConsented = false,
  employeeId,
  isAdmin = false,
  isOwner = false,
  allowCorrection = true,
  consentStatus,
  consentArea,
}: DataSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Address sync — copies current_address → permanent_address while checked
  const [addressSync, setAddressSync] = useState(false);

  // Correction modal state
  const [correctionField, setCorrectionField] = useState<FieldDef | null>(null);

  // Left accent color keyed to the section's aggregate consent status —
  // purely a visual cue, doesn't affect any consent logic. Reuses the same
  // status->tone mapping SectionConsentBadge renders with, so the card
  // border and its badge never disagree on what a status means.
  const accentVar = TONE_CSS_VAR[sectionConsentTone(consentStatus) ?? "neutral"];

  // Whether this section has both address fields (enables sync feature)
  const hasCurrentAddress = fields.some((f) => f.key === "current_address");
  const hasPermanentAddress = fields.some((f) => f.key === "permanent_address");
  const showAddressSync = hasCurrentAddress && hasPermanentAddress;

  function startEdit() {
    const initial: Record<string, string> = {};
    fields.forEach((f) => {
      initial[f.key] = f.value ?? "";
    });
    setDraft(initial);
    setAddressSync(false);
    setEditMode(true);
    if (!open) setOpen(true);
  }

  function cancelEdit() {
    setDraft({});
    setAddressSync(false);
    setEditMode(false);
  }

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
      setEditMode(false);
      setAddressSync(false);
      setDraft({});
      toast.success(`${title} updated successfully`);
    } catch {
      toast.error(`Failed to save ${title}. Please try again.`);
    } finally {
      setSaving(false);
    }
  }

  /** Draft change handler — propagates current_address to permanent_address when sync is on */
  function handleDraftChange(key: string, val: string) {
    setDraft((prev) => {
      const next = { ...prev, [key]: val };
      if (key === "current_address" && addressSync) {
        next["permanent_address"] = val;
      }
      return next;
    });
  }

  /** Toggle address sync — immediately copies current → permanent when enabled */
  function toggleAddressSync(checked: boolean) {
    setAddressSync(checked);
    if (checked) {
      setDraft((prev) => ({
        ...prev,
        permanent_address: prev["current_address"] ?? "",
      }));
    }
  }

  // The header action button differs based on consent state and role
  function renderHeaderAction() {
    // Locked after consent for non-admin employees — show "Locked" pill only
    if (hasConsented && !isAdmin) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-warning-foreground font-medium">
          <LockKeyholeMinimalisticBoldDuotone size={13} />
          Locked
        </div>
      );
    }

    // No onSave provided — section is read-only (no edit button)
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
      <Card
        className="border border-border shadow-sm rounded-2xl overflow-hidden"
        style={{ borderLeft: `3px solid ${accentVar}` }}
      >
        <CardHeader className="flex flex-row items-center justify-between py-3.5 px-5">
          <div
            className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0"
            onClick={() => !editMode && setOpen(!open)}
          >
            <span className="stat-card-icon shrink-0 !w-8 !h-8">{icon}</span>
            <CardTitle className="text-base font-semibold truncate">{title}</CardTitle>
            {consentStatus && <SectionConsentBadge status={consentStatus} />}
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
          <CardContent className="px-5 pb-5 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
              {fields.map((f) => {
                const isPermanentAddress = f.key === "permanent_address";
                // When address sync is on, permanent_address shows as locked read-only
                const syncLocked = isPermanentAddress && addressSync && editMode;

                return (
                  <div
                    key={f.key}
                    className="relative flex flex-col gap-1 py-2"
                  >
                    {/* Address sync checkbox — above the Permanent Address field, in edit mode only */}
                    {isPermanentAddress && editMode && showAddressSync && (
                      <div className="flex items-center gap-2 mb-1">
                        <Checkbox
                          id="address-sync"
                          checked={addressSync}
                          onCheckedChange={(checked) => toggleAddressSync(!!checked)}
                        />
                        <Label
                          htmlFor="address-sync"
                          className="text-[11px] text-muted-foreground cursor-pointer select-none"
                        >
                          Same as Current Address
                        </Label>
                      </div>
                    )}

                    <DataField
                      label={f.label}
                      value={syncLocked ? draft["permanent_address"] ?? f.value : f.value}
                      type={f.type}
                      options={f.options}
                      locked={(hasConsented && !isAdmin) || f.locked || syncLocked}
                      fieldKey={f.key}
                      editMode={!hasConsented && editMode}
                      draft={syncLocked ? draft["permanent_address"] ?? "" : draft[f.key]}
                      onDraftChange={handleDraftChange}
                      isAdmin={isAdmin}
                      isOwner={isOwner}
                    />

                    {/* Per-field update pill — shown post-consent only for correctable+allowed sections */}
                    {hasConsented && !f.uncorrectable && employeeId && allowCorrection && (
                      <button
                        type="button"
                        onClick={() => setCorrectionField(f)}
                        className="self-start mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/15 rounded-full px-2 py-0.5 transition-colors"
                      >
                        Update
                      </button>
                    )}

                    {/* Supporting document attachment row */}
                    {requiresAttachment(f.key) && employeeId && (
                      <AttachmentField
                        employeeId={employeeId}
                        fieldKey={f.key}
                        hasConsented={hasConsented}
                        isAdmin={isAdmin}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {consentArea}
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
