import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EmployeeDataView } from '@/components/EmployeeDataView';
import { DpdpaLegend } from '@/components/DpdpaLegend';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AltArrowLeftBoldDuotone,
  CheckCircleBoldDuotone,
  ClockCircleBoldDuotone,
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

function EmployeeDetail() {
  const { id } = Route.useParams();
  const [employee, setEmployee] = useState<Tables<'employees'> | null>(null);
  const [consentLogs, setConsentLogs] = useState<Tables<'consent_logs'>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const [empRes, logsRes] = await Promise.all([
        supabase.from('employees').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('consent_logs')
          .select('*')
          .eq('employee_id', id)
          .order('created_at', { ascending: false }),
      ]);
      setEmployee(empRes.data);
      setConsentLogs(logsRes.data ?? []);
      setLoading(false);
    }
    fetch();
  }, [id]);

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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/employees">
            <AltArrowLeftBoldDuotone size={18} />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {employee.first_name} {employee.last_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {employee.employee_id} • {employee.department} • {employee.designation}
          </p>
        </div>
      </div>

      <DpdpaLegend />

      <EmployeeDataView employee={employee} />

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
                <div
                  key={log.id}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <CheckCircleBoldDuotone size={18} color="var(--success)" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default" className="bg-success text-success-foreground text-xs">
                        {log.consent_status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Version: {log.consent_version}
                      </span>
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
