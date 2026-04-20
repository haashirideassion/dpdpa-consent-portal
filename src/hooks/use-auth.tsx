import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

interface AuthState {
  session: Session | null;
  user: User | null;
  role: "admin" | "employee" | null;
  employeeId: string | null;
  loading: boolean;
  initialized: boolean;
}

interface AuthContextType extends AuthState {
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * PRODUCTION-READY AUTH PROVIDER
 * This provider ensures that the authentication state is shared across the entire app.
 * It prevents multiple components from firing redundant metadata queries to Supabase.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    role: null,
    employeeId: null,
    loading: true,
    initialized: false,
  });

  const fetchUserMeta = useCallback(async (userId: string) => {
    // Safety timeout for database calls
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Auth Timeout")), 6000),
    );

    try {
      const metadataPromise = Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("profiles").select("employee_id").eq("user_id", userId).maybeSingle(),
      ]);

      const [roleRes, profileRes] = await Promise.race([metadataPromise, timeoutPromise]);

      return {
        role: (roleRes.data?.role as "admin" | "employee") ?? null,
        employeeId: profileRes.data?.employee_id ?? null,
      };
    } catch (err) {
      console.warn("Auth: Profile link missing or DB slow", err);
      return { role: null, employeeId: null };
    }
  }, []);

  const updateState = useCallback(
    async (session: Session | null) => {
      if (session?.user) {
        const meta = await fetchUserMeta(session.user.id);
        setState({
          session,
          user: session.user,
          role: meta.role,
          employeeId: meta.employeeId,
          loading: false,
          initialized: true,
        });
      } else {
        setState({
          session: null,
          user: null,
          role: null,
          employeeId: null,
          loading: false,
          initialized: true,
        });
      }
    },
    [fetchUserMeta],
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      updateState(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      updateState(session);
    });

    return () => subscription.unsubscribe();
  }, [updateState]);

  const signOut = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    await supabase.auth.signOut();
  }, []);

  const refreshSession = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await updateState(session);
  }, [updateState]);

  return (
    <AuthContext.Provider value={{ ...state, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth Hook
 * Access global auth state from any component
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
