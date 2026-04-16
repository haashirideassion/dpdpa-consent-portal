import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  role: 'admin' | 'employee' | null;
  employeeId: string | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    role: null,
    employeeId: null,
    loading: true,
  });

  const fetchUserMeta = useCallback(async (userId: string) => {
    const [roleRes, profileRes] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      supabase.from('profiles').select('employee_id').eq('user_id', userId).maybeSingle(),
    ]);
    return {
      role: (roleRes.data?.role as 'admin' | 'employee') ?? null,
      employeeId: profileRes.data?.employee_id ?? null,
    };
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const meta = await fetchUserMeta(session.user.id);
          setState({
            session,
            user: session.user,
            role: meta.role,
            employeeId: meta.employeeId,
            loading: false,
          });
        } else {
          setState({ session: null, user: null, role: null, employeeId: null, loading: false });
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const meta = await fetchUserMeta(session.user.id);
        setState({
          session,
          user: session.user,
          role: meta.role,
          employeeId: meta.employeeId,
          loading: false,
        });
      } else {
        setState({ session: null, user: null, role: null, employeeId: null, loading: false });
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserMeta]);

  return state;
}
