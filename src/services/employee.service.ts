import { supabase } from '@/integrations/supabase/client';

/**
 * EMPLOYEE SERVICE
 * Encapsulates all employee-related Supabase queries.
 * This separation of concerns makes it easier to test and maintain.
 */
export const EmployeeService = {
  /**
   * Fetches the employee profile associated with a user ID
   */
  async getByUserId(userId: string) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('employee_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.employee_id) return null;

    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('*')
      .eq('id', profile.employee_id)
      .maybeSingle();

    if (employeeError) throw employeeError;
    return employee;
  },

  /**
   * Logs a consent action
   */
  async logConsent(employeeId: string, status: boolean, version: string) {
    const { error } = await supabase.from('consent_logs').insert({
      employee_id: employeeId,
      consent_status: status,
      consent_version: version,
      timestamp: new Date().toISOString(),
    });

    if (error) throw error;
  }
};
