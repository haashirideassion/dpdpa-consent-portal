import { useState } from "react";
import { ArrowDownBoldDuotone, ArrowUpBoldDuotone } from "solar-icon-set";
import {
  PenBoldDuotone,
  LockKeyholeMinimalisticBoldDuotone,
  ShieldKeyholeMinimalisticBoldDuotone,
  BuildingsBoldDuotone,
} from "solar-icon-set";
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
import { isDirectEditField, isAdminManagedField, adminManagedLabel } from "@/lib/employeeFieldPolicy";
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
   * When false, suppresses per-field "Request correction" buttons even
   * after consent. Use for sections employees are never allowed to
   * request a change on (e.g. the admin's own bulk-edit sections).
   * Defaults to true.
   */
  allowCorrection?: boolean;
  /**
   * Saves a single low-risk, employee-maintained field directly — no
   * correction request, no approval. Only offered for fields where
   * `isDirectEditField(key)` is true (e.g. phone, personal email, current/
   * permanent address, emergency contact).
   *
   * Every other field is resolved independently, per field key, into one
   * of the other two modification categories (see
   * `@/lib/employeeFieldPolicy`):
   *   - correction-required — the employee's own protected/confidential
   *     data; locked from direct edit but a "Request correction" pill
   *     opens the existing correction-request + HR/Admin approval flow.
   *   - admin-managed — organization-controlled fields the employee does
   *     not own at all (identity/system fields, HR/org assignments); no
   *     Edit, no "Request correction" either — just a compact read-only
   *     indicator ("Managed by HR/Admin" / "System managed").
   * The server enforces this same three-way classification independently
   * (see supabase/migrations/20260825000006_field_level_modification_approval.sql),
   * so this prop and the policy module are a UX convenience, not the
   * authorization boundary.
   */
  onDirectFieldSave?: (key: string, value: string) => Promise<void>;
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
  onDirectFieldSave,
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

  /**
   * Opens the correction modal. For one of the 15 encryption-scoped fields,
   * `f.value` is never the plaintext (see FieldDef.encrypted) — the modal's
   * "current value" / oldValue must be the real value, so it's decrypted
   * here first via decrypt_employee_field. This only ever runs for the
   * record owner (correction requests are self-service, employee-on-their-
   * own-data), matching the same auto-decrypt DataField performs for an
   * owner's read-only view — same authorization, same (unaudited-for-owner)
   * RPC.
   */
  async function openCorrectionModal(f: FieldDef) {
    if (f.encrypted && employeeId) {
      try {
        const { EncryptionService } = await import("@/services/encryption.service");
        const real = await EncryptionService.revealEmployeeField(employeeId, f.key);
        setCorrectionField({ ...f, value: real ?? "" });
        return;
      } catch {
        // Fall through and open with whatever value is available — the
        // employee can still see/edit the "new value" field even if the
        // "current value" prefill failed to load.
      }
    }
    setCorrectionField(f);
  }

  // Per-field direct-edit state — independent of the whole-section
  // editMode/draft above, which stays reserved for the admin self-edit flow.
  const [directEditKey, setDirectEditKey] = useState<string | null>(null);
  const [directDraft, setDirectDraft] = useState("");
  const [directSaving, setDirectSaving] = useState(false);

  function startDirectEdit(f: FieldDef) {
    setDirectEditKey(f.key);
    setDirectDraft(f.value ?? "");
  }

  function cancelDirectEdit() {
    setDirectEditKey(null);
    setDirectDraft("");
  }

  async function saveDirectField(f: FieldDef) {
    if (!onDirectFieldSave) return;
    setDirectSaving(true);
    try {
      await onDirectFieldSave(f.key, directDraft);
      setDirectEditKey(null);
      setDirectDraft("");
      toast.success(`${f.label} updated successfully.`);
    } catch {
      toast.error(`Failed to update ${f.label}. Please try again.`);
    } finally {
      setDirectSaving(false);
    }
  }

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

                // Direct-edit fields (low-risk, employee-maintained) get their
                // own inline per-field edit affordance instead of the
                // Locked + correction-request treatment, once consented and
                // for non-admin viewers — see isDirectEditField.
                const isDirectEditable =
                  hasConsented && !isAdmin && !!employeeId && !!onDirectFieldSave && isDirectEditField(f.key);
                const isEditingThisField = isDirectEditable && directEditKey === f.key;

                // Organization-controlled field (see isAdminManagedField) —
                // the employee gets neither Edit nor "Request correction"
                // for these, only a compact read-only indicator, regardless
                // of consent state (ownership of the field, not the consent
                // gate, is what decides this). Suppressed for admin/HR
                // viewers, who are the ones actually managing it.
                const isFieldAdminManaged = !isAdmin && isAdminManagedField(f.key);

                // "Request correction" is only offered for the employee's
                // own protected/confidential fields — never for direct-edit
                // fields (they already have their own Edit affordance) or
                // admin-managed fields (no employee-initiated change path
                // exists for those at all).
                const showCorrectionButton =
                  !isDirectEditable &&
                  !isFieldAdminManaged &&
                  hasConsented &&
                  !f.uncorrectable &&
                  !!employeeId &&
                  allowCorrection;

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
                      locked={(hasConsented && !isAdmin && !isDirectEditable) || f.locked || syncLocked}
                      fieldKey={f.key}
                      editMode={isEditingThisField || (!hasConsented && editMode)}
                      draft={isEditingThisField ? directDraft : syncLocked ? draft["permanent_address"] ?? "" : draft[f.key]}
                      onDraftChange={isEditingThisField ? (_key, val) => setDirectDraft(val) : handleDraftChange}
                      isAdmin={isAdmin}
                      isOwner={isOwner}
                      employeeId={employeeId}
                      encrypted={f.encrypted}
                      hasValue={f.hasValue}
                    />

                    {/* Action row — direct-edit pencil/Save, "Request
                        correction" pill, the admin-managed read-only
                        indicator, and document chip share one row so a
                        field never grows two separate full-width rows
                        underneath it. Exactly one of the three states
                        applies per field — the category is resolved
                        independently for each field key, never for the
                        section as a whole. */}
                    {(isDirectEditable ||
                      showCorrectionButton ||
                      isFieldAdminManaged ||
                      (requiresAttachment(f.key) && employeeId)) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {isDirectEditable && (
                          isEditingThisField ? (
                            <>
                              <button
                                type="button"
                                onClick={cancelDirectEdit}
                                disabled={directSaving}
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground border border-border rounded-full px-2 py-0.5 transition-colors hover:bg-muted"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveDirectField(f)}
                                disabled={directSaving}
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-full px-2 py-0.5 transition-colors"
                              >
                                {directSaving ? "Saving…" : "Save"}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startDirectEdit(f)}
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground border border-border bg-muted/40 hover:bg-muted rounded-full px-2 py-0.5 transition-colors"
                            >
                              <PenBoldDuotone size={10} />
                              Edit
                            </button>
                          )
                        )}

                        {showCorrectionButton && (
                          <button
                            type="button"
                            onClick={() => void openCorrectionModal(f)}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/15 rounded-full px-2 py-0.5 transition-colors"
                          >
                            <ShieldKeyholeMinimalisticBoldDuotone size={10} />
                            Request correction
                          </button>
                        )}

                        {isFieldAdminManaged && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground px-2 py-0.5">
                            <BuildingsBoldDuotone size={10} />
                            {adminManagedLabel(f.key)}
                          </span>
                        )}

                        {requiresAttachment(f.key) && employeeId && (
                          <AttachmentField
                            employeeId={employeeId}
                            fieldKey={f.key}
                            hasConsented={hasConsented}
                            isAdmin={isAdmin}
                          />
                        )}
                      </div>
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
