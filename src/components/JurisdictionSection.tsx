import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlobalBoldDuotone } from "solar-icon-set";
import { toast } from "sonner";
import { CountryService, type Country } from "@/services/country.service";
import { FrameworkService, type RegulatoryFramework } from "@/services/framework.service";
import { JurisdictionService } from "@/services/jurisdiction.service";

/**
 * JurisdictionSection
 *
 * "Jurisdiction / Region" card for the Admin employee detail page
 * (introduced by migration 20260819000001, Region / Regulatory Framework
 * architecture — Phase 3). Read-only for everyone except admin/hr_manager
 * — jurisdiction assignment is an HR decision, not employee self-service
 * (enforced again server-side by RLS on employee_jurisdiction_details;
 * this component's `canManage` gate is the UI-side mirror of that rule).
 *
 * An employee with no employee_jurisdiction_details row (every existing
 * employee today) is displayed as "India / DPDPA applies by default" and
 * is NOT written to the database just by viewing this card — a row is
 * only ever created when HR explicitly picks a country and saves.
 */

const DEFAULT_COUNTRY_LABEL = "India";

interface JurisdictionSectionProps {
  employeeId: string;
  canManage: boolean;
  currentUserId?: string | null;
}

export function JurisdictionSection({ employeeId, canManage, currentUserId }: JurisdictionSectionProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [countries, setCountries] = useState<Country[]>([]);
  const [frameworks, setFrameworks] = useState<RegulatoryFramework[]>([]);

  const [assignedCountryId, setAssignedCountryId] = useState<string | null>(null);
  const [assignedFrameworkId, setAssignedFrameworkId] = useState<string | null>(null);
  const [hasAssignment, setHasAssignment] = useState(false);

  const [selectedCountryId, setSelectedCountryId] = useState<string>("");
  const [selectedFrameworkId, setSelectedFrameworkId] = useState<string>("");
  const [frameworksLoading, setFrameworksLoading] = useState(false);

  // ── Initial load: active countries + this employee's current assignment ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // Defensive reset when employeeId changes (component is reused across
      // employees on the admin detail page) — never carry a previous
      // employee's saved/selected jurisdiction or dirty state into the next
      // one while the new employee's data is still loading.
      setFrameworks([]);
      setAssignedCountryId(null);
      setAssignedFrameworkId(null);
      setHasAssignment(false);
      setSelectedCountryId("");
      setSelectedFrameworkId("");
      try {
        const [countryList, jurisdiction] = await Promise.all([
          CountryService.getActive(),
          JurisdictionService.getForEmployee(employeeId),
        ]);
        if (cancelled) return;
        setCountries(countryList);

        if (jurisdiction) {
          setHasAssignment(true);
          setAssignedCountryId(jurisdiction.country_id);
          setAssignedFrameworkId(jurisdiction.regulatory_framework_id);
          setSelectedCountryId(jurisdiction.country_id ?? "");
          setSelectedFrameworkId(jurisdiction.regulatory_framework_id ?? "");

          if (jurisdiction.country_id) {
            setFrameworksLoading(true);
            const fw = await FrameworkService.getForCountry(jurisdiction.country_id);
            if (!cancelled) setFrameworks(fw);
            setFrameworksLoading(false);
          }
        } else {
          setHasAssignment(false);
          setAssignedCountryId(null);
          setAssignedFrameworkId(null);
        }
      } catch (err) {
        console.error("JurisdictionSection: failed to load jurisdiction data", err);
        toast.error("Failed to load jurisdiction data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  // ── When HR/Admin picks a different country, resolve its frameworks ──
  async function handleCountryChange(countryId: string) {
    setSelectedCountryId(countryId);
    setSelectedFrameworkId("");
    setFrameworksLoading(true);
    try {
      const fw = await FrameworkService.getForCountry(countryId);
      setFrameworks(fw);
      // Exactly one active framework → auto-associate it.
      if (fw.length === 1) setSelectedFrameworkId(fw[0].id);
    } catch (err) {
      console.error("JurisdictionSection: failed to load frameworks for country", err);
      toast.error("Failed to load regulatory frameworks for this country.");
    } finally {
      setFrameworksLoading(false);
    }
  }

  // ── Dirty state: PERSISTED (assigned*) vs CURRENT UI SELECTION (selected*) ──
  // "A country is selected" is not the same as "there's something to save" —
  // Save must only be enabled when the current selection actually differs
  // from what's already persisted (handles: no-op re-select, save-then-idle,
  // change-then-revert-to-original all correctly resolving to "not dirty").
  // ?? "" normalizes the persisted null (no assignment yet) against the
  // selection state's "" empty-string baseline.
  const isDirty =
    selectedCountryId !== (assignedCountryId ?? "") ||
    selectedFrameworkId !== (assignedFrameworkId ?? "");

  const canSave =
    canManage &&
    !!selectedCountryId &&
    !!selectedFrameworkId &&
    !saving &&
    !frameworksLoading &&
    isDirty;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await JurisdictionService.assignForEmployee(
        employeeId,
        { countryId: selectedCountryId, regulatoryFrameworkId: selectedFrameworkId },
        currentUserId ?? undefined,
      );
      setHasAssignment(true);
      setAssignedCountryId(selectedCountryId);
      setAssignedFrameworkId(selectedFrameworkId);
      toast.success("Jurisdiction assigned.");
    } catch (err: any) {
      console.error("JurisdictionSection: failed to save jurisdiction", err);
      toast.error(err?.message ?? "Failed to save jurisdiction.");
    } finally {
      setSaving(false);
    }
  }

  const assignedCountryName = countries.find((c) => c.id === assignedCountryId)?.name ?? null;
  const assignedFrameworkName = frameworks.find((f) => f.id === assignedFrameworkId)?.name ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GlobalBoldDuotone size={17} />
          Jurisdiction / Region
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Managed by HR/Admin — determines the applicable privacy/consent framework for this employee.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : !canManage ? (
          // ── Read-only view (non-managing staff) ──────────────────────────
          hasAssignment ? (
            <div className="space-y-2">
              <ReadOnlyRow label="Country" value={assignedCountryName ?? "—"} />
              <ReadOnlyRow label="Applicable Framework" value={assignedFrameworkName ?? "—"} />
              <StatusBadge tone="success" className="text-xs">Active</StatusBadge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No jurisdiction explicitly assigned — <span className="font-medium text-foreground">India / DPDPA applies by default</span>.
            </p>
          )
        ) : (
          // ── Editable view (admin / hr_manager) ────────────────────────────
          <div className="space-y-4">
            {!hasAssignment && (
              <p className="text-xs text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
                No jurisdiction assigned yet — <span className="font-medium text-foreground">{DEFAULT_COUNTRY_LABEL} / DPDPA applies by default</span>. Assign one below to override.
              </p>
            )}

            <div>
              <p className="text-xs font-medium mb-1.5">Country</p>
              <Select value={selectedCountryId} onValueChange={handleCountryChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="text-xs font-medium mb-1.5">Applicable Framework</p>
              {frameworksLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : !selectedCountryId ? (
                <p className="text-sm text-muted-foreground">Select a country to see its applicable framework.</p>
              ) : frameworks.length === 0 ? (
                <p className="text-sm text-warning">
                  No regulatory framework configured for this jurisdiction.
                </p>
              ) : frameworks.length === 1 ? (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
                  {frameworks[0].name}
                </div>
              ) : (
                <Select value={selectedFrameworkId} onValueChange={setSelectedFrameworkId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select applicable framework" />
                  </SelectTrigger>
                  <SelectContent>
                    {frameworks.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                <StatusBadge tone="success" className="text-xs">Active</StatusBadge>
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={!canSave}>
                {saving ? "Saving…" : "Save Jurisdiction"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
