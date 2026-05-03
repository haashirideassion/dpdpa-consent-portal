import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircleBoldDuotone, CloseCircleBoldDuotone, DocumentBoldDuotone } from "solar-icon-set";
import { format } from "date-fns";

interface ConsentRecord {
  id: string;
  template_version: string;
  purpose_key: string;
  consented: boolean;
  is_mandatory: boolean;
  created_at: string;
  template: { name: string };
  purpose: { label: string; description: string };
}

export function MyConsentsView({ employeeId }: { employeeId: string }) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ConsentRecord[]>([]);

  // DPR Request State
  const [dprOpen, setDprOpen] = useState(false);
  const [dprType, setDprType] = useState("");
  const [dprDesc, setDprDesc] = useState("");
  const [dprSubmitting, setDprSubmitting] = useState(false);

  useEffect(() => {
    async function fetchConsents() {
      // Fetch records with joined template and purpose names
      const { data, error } = await supabase
        .from("consent_purpose_records")
        .select(`
          id, template_version, purpose_key, consented, is_mandatory, created_at,
          template:consent_templates(name),
          purpose:consent_purposes(label, description)
        `)
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch my consents:", error);
      } else {
        // Because of the join structure, Supabase returns arrays or single objects for relationships.
        // We cast it safely based on how we wrote the query.
        setRecords(data as any as ConsentRecord[]);
      }
      setLoading(false);
    }
    
    fetchConsents();
  }, [employeeId]);

  const handleDprSubmit = async () => {
    if (!dprType || !employeeId) return;
    setDprSubmitting(true);
    
    const { error } = await supabase.from("dpr_requests").insert({
      employee_id: employeeId,
      request_type: dprType,
      description: dprDesc,
      status: "pending"
    });

    setDprSubmitting(false);
    if (!error) {
      setDprOpen(false);
      alert("Your request has been submitted successfully to the DPO.");
      setDprType("");
      setDprDesc("");
    } else {
      console.error("DPR submission error", error);
      alert("Failed to submit request. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <DocumentBoldDuotone size={48} className="text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium">No Consent History</p>
          <p className="text-sm text-muted-foreground">
            You have not submitted any DPDPA granular consent records yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by template version and timestamp (roughly) to show discrete submissions
  const grouped = records.reduce((acc, curr) => {
    const key = `${curr.template_version}_${new Date(curr.created_at).toISOString().split("T")[0]}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(curr);
    return acc;
  }, {} as Record<string, ConsentRecord[]>);

  return (
    <div className="space-y-8 mt-6 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Below is a history of all granular consent records you have provided.
        </p>
        
        <Dialog open={dprOpen} onOpenChange={setDprOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2 shrink-0 border-primary/20 text-primary hover:bg-primary/5">
              <CheckCircleBoldDuotone size={18} />
              Exercise My Rights
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit a DPDPA Request</DialogTitle>
              <DialogDescription>
                Exercise your rights under the Digital Personal Data Protection Act.
                This request will be routed to the Data Protection Officer (DPO).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Request Type</Label>
                <Select value={dprType} onValueChange={setDprType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a right to exercise" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="access">Right to Access Data</SelectItem>
                    <SelectItem value="correction">Right to Correction</SelectItem>
                    <SelectItem value="erasure">Right to Erasure (Deletion)</SelectItem>
                    <SelectItem value="portability">Right to Data Portability</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Details (Optional)</Label>
                <Textarea 
                  placeholder="Provide any specific details or context for your request..." 
                  value={dprDesc}
                  onChange={(e) => setDprDesc(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDprOpen(false)}>Cancel</Button>
              <Button onClick={handleDprSubmit} disabled={!dprType || dprSubmitting}>
                {dprSubmitting ? "Submitting..." : "Submit Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {Object.entries(grouped).map(([key, groupRecords]) => {
        const firstRecord = groupRecords[0];
        const submissionDate = new Date(firstRecord.created_at);
        const templateName = firstRecord.template?.name || "Standard DPDPA Consent";

        return (
          <Card key={key} className="overflow-hidden">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="text-lg">{templateName}</CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {firstRecord.template_version}
                    </Badge>
                    <span>Submitted on {format(submissionDate, "PPP 'at' p")}</span>
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-2" disabled>
                  <DocumentBoldDuotone size={16} /> Certificate PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {groupRecords.map((record) => (
                  <div key={record.id} className="flex items-start justify-between gap-4 p-4 hover:bg-muted/10 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">
                          {record.purpose?.label || record.purpose_key}
                        </p>
                        {record.is_mandatory && (
                          <Badge variant="secondary" className="text-[9px] uppercase leading-none py-0.5">
                            Mandatory
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-md">
                        {record.purpose?.description}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      {record.consented ? (
                        <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/20 gap-1.5 px-2 py-0.5">
                          <CheckCircleBoldDuotone size={14} /> Granted
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20 gap-1.5 px-2 py-0.5">
                          <CloseCircleBoldDuotone size={14} /> Declined
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
