import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  UsersGroupTwoRoundedBoldDuotone,
  CheckCircleBoldDuotone,
  ClockCircleBoldDuotone,
  ChartSquareBoldDuotone,
} from 'solar-icon-set';

export const Route = createFileRoute('/_authenticated/admin/')({
  head: () => ({
    meta: [
      { title: 'Admin Dashboard — DPDPA Consent Portal' },
      { name: 'description', content: 'Monitor employee DPDPA consent compliance across the organization.' },
    ],
  }),
  component: AdminDashboard,
});

interface DashboardStats {
  totalEmployees: number;
  totalConsented: number;
  pendingConsent: number;
  completionPercentage: number;
}

function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const [empRes, consentRes] = await Promise.all([
        supabase.from('employees').select('id', { count: 'exact' }),
        supabase.from('consent_logs').select('employee_id'),
      ]);

      const totalEmployees = empRes.count ?? 0;
      const uniqueConsented = new Set(consentRes.data?.map((c) => c.employee_id) ?? []).size;
      const pending = totalEmployees - uniqueConsented;
      const pct = totalEmployees > 0 ? Math.round((uniqueConsented / totalEmployees) * 100) : 0;

      setStats({
        totalEmployees,
        totalConsented: uniqueConsented,
        pendingConsent: pending,
        completionPercentage: pct,
      });
      setLoading(false);
    }
    fetchStats();
  }, []);

  if (loading || !stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="animate-pulse"><CardContent className="h-24" /></Card>
        ))}
      </div>
    );
  }

  const metricCards = [
    {
      label: 'Total Employees',
      value: stats.totalEmployees,
      icon: <UsersGroupTwoRoundedBoldDuotone size={22} />,
      color: 'text-primary',
    },
    {
      label: 'Consented',
      value: stats.totalConsented,
      icon: <CheckCircleBoldDuotone size={22} />,
      color: 'text-success',
    },
    {
      label: 'Pending',
      value: stats.pendingConsent,
      icon: <ClockCircleBoldDuotone size={22} />,
      color: 'text-warning-foreground',
    },
    {
      label: 'Completion',
      value: `${stats.completionPercentage}%`,
      icon: <ChartSquareBoldDuotone size={22} />,
      color: 'text-primary',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compliance Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of DPDPA consent status across the organization.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((m) => (
          <Card key={m.label}>
            <CardContent className="flex items-center gap-4 py-5">
              <div className={`${m.color}`}>{m.icon}</div>
              <div>
                <p className="text-2xl font-bold">{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consent Completion Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={stats.completionPercentage} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {stats.totalConsented} of {stats.totalEmployees} employees have provided consent
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
