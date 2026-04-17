import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DpdpaLegend } from '@/components/DpdpaLegend';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { isDpdpaField } from '@/lib/dpdpa';
import { DpdpaBadge } from '@/components/DpdpaBadge';
import { toast } from 'sonner';
import {
  AltArrowLeftBoldDuotone,
  CheckCircleBoldDuotone,
  ClockCircleBoldDuotone,
  PenBoldDuotone,
  FloppyDiskBoldDuotone,
  CloseCircleBoldDuotone,
  AltArrowDownBoldDuotone,
  AltArrowUpBoldDuotone,
} from 'solar-icon-set';
import type { Tables } from '@/integrations/supabase/types';

export const Route = createFileRoute('/_authenticated/admin/employees/$id')({
  head: () => ({
    meta: [
      { title: 'Employee Detail — Admin Dashboard' },
      { name: 'description', content: 'View detailed employee profile with DPDPA fields and consent history.' },
    ],
  }),
  component: EmployeeDetail,
});

type Employee = Tables<'employees'>;

const SECTIONS: { title: string; fields: { label: string; key: keyof Employee }[] }[] = [
  {
    title: 'Personal Information',
    fields: [
      { label: 'First Name', key: 'first_name' },
      { label: 'Last Name', key: 'last_name' },
      { label: 'Date of Birth', key: 'date_of_birth' },
      { label: 'Gender', key: 'gender' },
      { label: 'Blood Group', key: 'blood_group' },
      { label: 'Marital Status', key: 'marital_status' },
      { label: 'Nationality', key: 'nationality' },
    ],
  },
  {
    title: 'Contact Information',
    fields: [
      { label: 'Work Email', key: 'work_email' },
      { label: 'Personal Email', key: 'personal_email' },
      { label: 'Phone Number', key: 'phone_number' },
      { label: 'Alternate Phone', key: 'alternate_phone' },
      { label: 'Current Address', key: 'current_address' },
      { label: 'Permanent Address', key: 'permanent_address' },
      { label: 'City', key: 'city' },
      { label: 'State', key: 'state' },
      { label: 'Pincode', key: 'pincode' },
    ],
  },
  {
    title: 'Employment Information',
    fields: [
      { label: 'Employee ID', key: 'employee_id' },
      { label: 'Department', key: 'department' },
      { label: 'Designation', key: 'designation' },
      { label: 'Date of Joining', key: 'date_of_joining' },
      { label: 'Employment Type', key: 'employment_type' },
      { label: 'Reporting Manager', key: 'reporting_manager' },
      { label: 'Work Location', key: 'work_location' },
      { label: 'Status', key: 'employee_status' },
    ],
  },
  {
    title: 'Payroll & Banking',
    fields: [
      { label: 'Bank Name', key: 'bank_name' },
      { label: 'Bank Account Number', key: 'bank_account_number' },
      { label: 'IFSC Code', key: 'ifsc_code' },
      { label: 'PAN Number', key: 'pan_number' },
      { label: 'CTC', key: 'ctc' },
    ],
  },
  {
    title: 'Government Identification',
    fields: [
      { label: 'Aadhaar Number', key: 'aadhaar_number' },
      { label: 'UAN Number', key: 'uan_number' },
      { label: 'Passport Number', key: 'passport_number' },
      { label: 'Passport Expiry', key: 'passport_expiry' },
      { label: 'Driving License', key: 'driving_license' },
      { label: 'Voter ID', key: 'voter_id' },
    ],
  },
  {
    title: 'Emergency Contact',
    fields: [
      { label: 'Contact Name', key: 'emergency_contact_name' },
      { label: 'Relation', key: 'emergency_contact_relation' },
      { label: 'Contact Phone', key: 'emergency_contact_phone' },
      { label: 'Contact Email', key: 'emergency_contact_email' },
    ],
  },
  {
    title: 'Additional Information',
    fields: [
      { label: 'Qualifications', key: 'qualifications' },
      { label: 'Certifications', key: 'certifications' },
      { label: 'Languages', key: 'languages' },
      { label: 'Notes', key: 'notes' },
    ],
  },
];

function EmployeeDetail() {
  const { id } = Route.useParams();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [consentLogs, setConsentLogs] = useState<Tables<'consent_logs'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Employee>>({});
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTIONS.map((s) => [s.title, true]))
  );

  useEffect(() => {
    async function fetchData() {
      const [empRes, logsRes] = await Promise.all([
        supabase.from('employees').select('*').eq('id', id).maybeSingle(),
        supabase.from('consent_logs').select('*').eq('employee_id', id).order('created_at', { ascending: false }),
      ]);
      setEmployee(empRes.data);
      setConsentLogs(logsRes.data ?? []);
      setLoading(false);
    }
    fetchData();
  }, [id]);

  function startEdit() {
    setDraft({ ...employee });
    setEditing(true);
  }

  function cancelEdit() {
    setDraft({});
    setEditing(false);
  }

  async function saveEdit() {
    if (!employee) return;
    setSaving(true);
    const { error } = await supabase.from('employees').update(draft).eq('id', employee.id);
    if (error) {
      toast.error('Failed to save: ' + error.message);
    } else {
      setEmployee({ ...employee, ...draft });
      setEditing(false);
      toast.success('Employee updated successfully');
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-lg font-semibold">Employee Not Found</h2>
        <Button variant="outline" asChild className="mt-4">
          <Link to="/admin/employees">Back to Employees</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/employees">
            <AltArrowLeftBoldDuotone size={18} />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {employee.first_name} {employee.last_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {employee.employee_id} • {employee.department} • {employee.designation}
          </p>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
              <CloseCircleBoldDuotone size={16} className="mr-1.5" />
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={saving}>
              <FloppyDiskBoldDuotone size={16} className="mr-1.5" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <PenBoldDuotone size={16} className="mr-1.5" />
            Edit
          </Button>
        )}
      </div>

      <DpdpaLegend />

      {/* Field sections */}
      {SECTIONS.map((section) => (
        <Card key={section.title} className="border border-border shadow-sm">
          <CardHeader
            className="cursor-pointer select-none flex flex-row items-center justify-between py-4 px-6"
            onClick={() => setOpenSections((s) => ({ ...s, [section.title]: !s[section.title] }))}
          >
            <CardTitle className="text-base font-semibold">{section.title}</CardTitle>
            <span className="text-muted-foreground">
              {openSections[section.title] ? <AltArrowUpBoldDuotone size={18} /> : <AltArrowDownBoldDuotone size={18} />}
            </span>
          </CardHeader>
          {openSections[section.title] && (
            <CardContent className="px-6 pb-6 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
                {section.fields.map((f) => {
                  const sensitive = isDpdpaField(f.key as string);
                  const value = editing
                    ? ((draft[f.key] as string) ?? '')
                    : ((employee[f.key] as string) ?? '');
                  return (
                    <div key={f.key} className="flex flex-col gap-1 py-1">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {f.label}
                        </Label>
                        {sensitive && <DpdpaBadge />}
                      </div>
                      {editing ? (
                        <Input
                          value={value}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                          className={`h-8 text-sm ${sensitive ? 'border-dpdpa' : ''}`}
                          placeholder={`Enter ${f.label.toLowerCase()}`}
                        />
                      ) : (
                        <span className={`text-sm font-medium ${sensitive ? 'text-dpdpa-foreground' : 'text-foreground'}`}>
                          {(employee[f.key] as string) || '—'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {/* Consent History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consent History</CardTitle>
        </CardHeader>
        <CardContent>
          {consentLogs.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <ClockCircleBoldDuotone size={16} />
              <span>No consent records found for this employee.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {consentLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 rounded-lg border p-3">
                  <CheckCircleBoldDuotone size={18} color="var(--success)" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="bg-success text-success-foreground text-xs">
                        {log.consent_status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Version: {log.consent_version}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(log.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
