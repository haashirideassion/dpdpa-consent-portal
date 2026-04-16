import { supabase } from '@/integrations/supabase/client';

export async function signInWithMicrosoft() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      scopes: 'email profile openid',
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getUserRole(userId: string): Promise<'admin' | 'employee' | null> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.role ?? null;
}

export async function getEmployeeForUser(userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('employee_id')
    .eq('user_id', userId)
    .maybeSingle();
  
  if (!profile?.employee_id) return null;
  
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', profile.employee_id)
    .maybeSingle();
  
  return employee;
}
