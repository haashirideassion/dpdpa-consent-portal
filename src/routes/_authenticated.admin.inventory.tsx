import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { InventoryService, type DataInventoryItem } from "@/services/inventory.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FolderOpenBoldDuotone, AddSquareBoldDuotone, DangerTriangleBoldDuotone } from "solar-icon-set";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  head: () => ({ meta: [{ title: "Data Inventory (RoPA) — DPDPA Portal" }] }),
  component: InventoryPage,
});

const EMPTY_FORM: Omit<DataInventoryItem, "id" | "created_at" | "updated_at"> = {
  activity_name: "",
  purpose: "",
  data_categories: [],
  data_principal_types: [],
  legal_basis: "",
  recipients: "",
  storage_location: "",
  retention_period: "",
  cross_border: false,
  linked_consent_purpose_id: null,
  owner_user_id: null,
  reviewed_at: null,
};

function InventoryPage() {
  const [items, setItems] = useState<DataInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<DataInventoryItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await InventoryService.getAll();
      setItems(data);
    } catch {
      toast.error("Failed to load data inventory");
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  }

  function openEdit(item: DataInventoryItem) {
    setEditing(item);
    setForm({
      activity_name: item.activity_name,
      purpose: item.purpose,
      data_categories: item.data_categories,
      data_principal_types: item.data_principal_types,
      legal_basis: item.legal_basis ?? "",
      recipients: item.recipients ?? "",
      storage_location: item.storage_location ?? "",
      retention_period: item.retention_period ?? "",
      cross_border: item.cross_border,
      linked_consent_purpose_id: item.linked_consent_purpose_id,
      owner_user_id: item.owner_user_id,
      reviewed_at: item.reviewed_at,
    });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.activity_name.trim() || !form.purpose.trim()) {
      toast.error("Activity name and purpose are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        data_categories: form.data_categories,
        data_principal_types: form.data_principal_types,
        legal_basis: form.legal_basis || null,
        recipients: form.recipients || null,
        storage_location: form.storage_location || null,
        retention_period: form.retention_period || null,
      };
      if (editing) {
        await InventoryService.update(editing.id, payload);
        toast.success("Activity updated");
      } else {
        await InventoryService.create(payload);
        toast.success("Activity added to RoPA");
      }
      setShowDialog(false);
      await load();
    } catch {
      toast.error("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkReviewed(id: string) {
    try {
      await InventoryService.markReviewed(id);
      toast.success("Marked as reviewed");
      await load();
    } catch {
      toast.error("Failed to mark as reviewed");
    }
  }

  const staleCount = items.filter((i) => InventoryService.isStale(i)).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FolderOpenBoldDuotone size={20} />
            Data Inventory (RoPA)
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Record of Processing Activities — what data we process, why, and how.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <AddSquareBoldDuotone size={14} className="mr-1.5" />
          Add Activity
        </Button>
      </div>

      {staleCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/30">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <DangerTriangleBoldDuotone size={16} className="text-yellow-600 shrink-0" />
            <span>
              <strong>{staleCount}</strong> processing{" "}
              {staleCount === 1 ? "activity has" : "activities have"} not been reviewed in over 12 months.
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No processing activities yet. Add the first one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Data Categories</TableHead>
                  <TableHead>Legal Basis</TableHead>
                  <TableHead>Retention</TableHead>
                  <TableHead>Cross-Border</TableHead>
                  <TableHead>Last Reviewed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const stale = InventoryService.isStale(item);
                  return (
                    <TableRow key={item.id} className={stale ? "bg-yellow-50/30" : ""}>
                      <TableCell className="font-medium text-sm max-w-36 truncate">
                        {item.activity_name}
                      </TableCell>
                      <TableCell className="text-sm max-w-40 truncate text-muted-foreground">
                        {item.purpose}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-40">
                          {item.data_categories.slice(0, 2).map((c) => (
                            <Badge key={c} variant="outline" className="text-xs py-0">{c}</Badge>
                          ))}
                          {item.data_categories.length > 2 && (
                            <Badge variant="outline" className="text-xs py-0">
                              +{item.data_categories.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-32 truncate">
                        {item.legal_basis ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.retention_period ?? "—"}
                      </TableCell>
                      <TableCell>
                        {item.cross_border ? (
                          <Badge variant="outline" className="text-xs border-orange-300 text-orange-700">Yes</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {stale ? (
                          <span className="text-xs text-yellow-600 flex items-center gap-1">
                            <DangerTriangleBoldDuotone size={12} />
                            {item.reviewed_at
                              ? new Date(item.reviewed_at).toLocaleDateString("en-IN")
                              : "Never"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {item.reviewed_at
                              ? new Date(item.reviewed_at).toLocaleDateString("en-IN")
                              : "Never"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleMarkReviewed(item.id)}
                          >
                            Review
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => openEdit(item)}
                          >
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Processing Activity" : "Add Processing Activity"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">Activity Name *</Label>
              <Input
                value={form.activity_name}
                onChange={(e) => setForm((f) => ({ ...f, activity_name: e.target.value }))}
                placeholder="e.g. Employee Payroll Processing"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">Purpose *</Label>
              <Input
                value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                placeholder="e.g. Salary disbursement and tax compliance"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Data Categories (comma-separated)</Label>
              <Input
                value={form.data_categories.join(", ")}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    data_categories: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }))
                }
                placeholder="Name, Email, PAN"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Data Principal Types</Label>
              <Input
                value={form.data_principal_types.join(", ")}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    data_principal_types: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  }))
                }
                placeholder="Employees, Contractors"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Legal Basis</Label>
              <Input
                value={form.legal_basis ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, legal_basis: e.target.value }))}
                placeholder="Consent / Contractual Necessity / Legal Obligation"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Retention Period</Label>
              <Input
                value={form.retention_period ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, retention_period: e.target.value }))}
                placeholder="e.g. 7 years post-employment"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Storage Location</Label>
              <Input
                value={form.storage_location ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, storage_location: e.target.value }))}
                placeholder="e.g. Supabase (India region)"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Recipients / Third Parties</Label>
              <Input
                value={form.recipients ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, recipients: e.target.value }))}
                placeholder="e.g. Payroll vendor, Auditors"
                className="text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cross_border"
                checked={form.cross_border}
                onChange={(e) => setForm((f) => ({ ...f, cross_border: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label htmlFor="cross_border" className="text-sm">
                Cross-border transfer
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing ? "Update" : "Add Activity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
