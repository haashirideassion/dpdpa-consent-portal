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

export type AppRole = "admin" | "hr_manager" | "dpo" | "employee";

interface AuthState {
  session: Session | null;
  user: User | null;
  /** Primary role — highest-privilege role the user holds */
  role: AppRole | null;
  /** All roles this user holds (a user may have multiple) */
  roles: AppRole[];
  employeeId: string | null;
  loading: boolean;
  initialized: boolean;
}

interface AuthContextType extends AuthState {
  /** Returns true if the user holds the specified role */
  hasRole: (r: AppRole) => boolean;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Priority order: highest privilege wins as the "primary" role
// Defined outside component so it is stable across renders
const ROLE_PRIORITY: AppRole[] = ["admin", "hr_manager", "dpo", "employee"];

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
    roles: [],
    employeeId: null,
    loading: true,
    initialized: false,
  });

  const fetchUserMeta = useCallback(async (userId: string) => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Auth Timeout")), 6000),
    );

    try {
      const metadataPromise = Promise.all([
        // Fetch ALL roles for this user (user may hold multiple)
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("employee_id").eq("user_id", userId).maybeSingle(),
      ]);

      const [rolesRes, profileRes] = await Promise.race([metadataPromise, timeoutPromise]);

      const allRoles = (rolesRes.data ?? []).map((r: { role: string }) => r.role as AppRole);

      // Primary role = highest-privilege role the user holds
      const primaryRole: AppRole | null =
        ROLE_PRIORITY.find((r) => allRoles.includes(r)) ?? null;

      return {
        role: primaryRole,
        roles: allRoles,
        employeeId: profileRes.data?.employee_id ?? null,
      };
    } catch (err) {
      console.warn("Auth: Profile link missing or DB slow", err);
      return { role: null, roles: [] as AppRole[], employeeId: null };
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
          roles: meta.roles,
          employeeId: meta.employeeId,
          loading: false,
          initialized: true,
        });
      } else {
        setState({
          session: null,
          user: null,
          role: null,
          roles: [],
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

  const hasRole = useCallback(
    (r: AppRole) => state.roles.includes(r),
    [state.roles],
  );

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
    <AuthContext.Provider value={{ ...state, hasRole, signOut, refreshSession }}>
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
