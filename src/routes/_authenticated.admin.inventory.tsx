import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InventoryService, type DataInventoryItem } from "@/services/inventory.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FolderOpenBoldDuotone, AddSquareBoldDuotone, DangerTriangleBoldDuotone } from "solar-icon-set";
import { dataInventorySchema, type DataInventoryFormValues } from "@/lib/validation/inventory";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  head: () => ({ meta: [{ title: "Data Inventory (RoPA) — DPDPA Portal" }] }),
  component: InventoryPage,
});

const EMPTY_FORM: DataInventoryFormValues = {
  activity_name: "",
  purpose: "",
  legal_basis: "",
  recipients: "",
  storage_location: "",
  retention_period: "",
  cross_border: false,
};

// Bookkeeping fields not entered via this form — either passed through unedited
// from the record being edited, or null for a new activity.
interface InventoryPassthrough {
  linked_consent_purpose_id: string | null;
  owner_user_id: string | null;
  reviewed_at: string | null;
}

const EMPTY_PASSTHROUGH: InventoryPassthrough = {
  linked_consent_purpose_id: null,
  owner_user_id: null,
  reviewed_at: null,
};

function InventoryPage() {
  const [items, setItems] = useState<DataInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<DataInventoryItem | null>(null);
  const [passthrough, setPassthrough] = useState<InventoryPassthrough>(EMPTY_PASSTHROUGH);
  const [saving, setSaving] = useState(false);
  // Raw text mirrors of the comma-separated fields — kept separate from the
  // RHF-managed fields so a trailing/typed comma isn't collapsed by the array
  // join/split round-trip on every keystroke.
  const [dataCategoriesText, setDataCategoriesText] = useState("");
  const [dataPrincipalTypesText, setDataPrincipalTypesText] = useState("");

  const form = useForm<DataInventoryFormValues>({
    resolver: zodResolver(dataInventorySchema),
    defaultValues: EMPTY_FORM,
  });

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
    form.reset(EMPTY_FORM);
    setPassthrough(EMPTY_PASSTHROUGH);
    setDataCategoriesText("");
    setDataPrincipalTypesText("");
    setShowDialog(true);
  }

  function openEdit(item: DataInventoryItem) {
    setEditing(item);
    form.reset({
      activity_name: item.activity_name,
      purpose: item.purpose,
      legal_basis: item.legal_basis ?? "",
      recipients: item.recipients ?? "",
      storage_location: item.storage_location ?? "",
      retention_period: item.retention_period ?? "",
      cross_border: item.cross_border,
    });
    setPassthrough({
      linked_consent_purpose_id: item.linked_consent_purpose_id,
      owner_user_id: item.owner_user_id,
      reviewed_at: item.reviewed_at,
    });
    setDataCategoriesText(item.data_categories.join(", "));
    setDataPrincipalTypesText(item.data_principal_types.join(", "));
    setShowDialog(true);
  }

  async function onSubmit(values: DataInventoryFormValues) {
    setSaving(true);
    try {
      const payload = {
        ...values,
        ...passthrough,
        data_categories: dataCategoriesText.split(",").map((s) => s.trim()).filter(Boolean),
        data_principal_types: dataPrincipalTypesText.split(",").map((s) => s.trim()).filter(Boolean),
        legal_basis: values.legal_basis || null,
        recipients: values.recipients || null,
        storage_location: values.storage_location || null,
        retention_period: values.retention_period || null,
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
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <DangerTriangleBoldDuotone size={16} className="text-warning-foreground shrink-0" />
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
            <EmptyState
              icon={<FolderOpenBoldDuotone size={32} />}
              title="No processing activities yet"
              description="Record what data you process, why, and how to build your RoPA."
              cta={
                <Button size="sm" onClick={openNew}>
                  <AddSquareBoldDuotone size={14} className="mr-1.5" />
                  Add Activity
                </Button>
              }
              className="py-16"
            />
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
                    <TableRow key={item.id} className={stale ? "bg-warning/5" : ""}>
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
          <Form {...form}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
              <FormField
                control={form.control}
                name="activity_name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="text-sm">Activity Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Employee Payroll Processing" className="text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="purpose"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel className="text-sm">Purpose *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Salary disbursement and tax compliance" className="text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-1.5">
                <Label className="text-sm">Data Categories (comma-separated)</Label>
                <Input
                  value={dataCategoriesText}
                  onChange={(e) => setDataCategoriesText(e.target.value)}
                  placeholder="Name, Email, PAN"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Data Principal Types</Label>
                <Input
                  value={dataPrincipalTypesText}
                  onChange={(e) => setDataPrincipalTypesText(e.target.value)}
                  placeholder="Employees, Contractors"
                  className="text-sm"
                />
              </div>
              <FormField
                control={form.control}
                name="legal_basis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Legal Basis</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Consent / Contractual Necessity / Legal Obligation"
                        className="text-sm"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="retention_period"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Retention Period</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 7 years post-employment" className="text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="storage_location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Storage Location</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Supabase (India region)" className="text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="recipients"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm">Recipients / Third Parties</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Payroll vendor, Auditors" className="text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cross_border"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <input
                        type="checkbox"
                        id="cross_border"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="h-4 w-4"
                      />
                    </FormControl>
                    <FormLabel className="text-sm">Cross-border transfer</FormLabel>
                  </FormItem>
                )}
              />
            </div>
          </Form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={saving}>
              {saving ? "Saving…" : editing ? "Update" : "Add Activity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
