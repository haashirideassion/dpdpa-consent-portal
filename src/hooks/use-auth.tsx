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
      // Single source of truth: employees table holds both role and id
      const metadataPromise = supabase
        .from("employees")
        .select("id, role")
        .eq("user_id", userId)
        .maybeSingle();

      const employeeRes = await Promise.race([metadataPromise, timeoutPromise]);

      const empRole = (employeeRes.data?.role ?? "employee") as AppRole;

      // Build roles array — derive multi-role support from single role field
      // Admin implicitly holds all lower roles for permission checks
      const allRoles: AppRole[] = empRole === "admin"
        ? ["admin", "hr_manager", "dpo", "employee"]
        : empRole === "hr_manager"
        ? ["hr_manager", "employee"]
        : empRole === "dpo"
        ? ["dpo", "employee"]
        : ["employee"];

      return {
        role: empRole,
        roles: allRoles,
        employeeId: employeeRes.data?.id ?? null,
      };
    } catch (err) {
      console.warn("Auth: Employee record missing or DB slow", err);
      return { role: null, roles: [] as AppRole[], employeeId: null };
    }
  }, []);

  const lastTokenRef = React.useRef<string | null>(null);

  const updateState = useCallback(
    async (session: Session | null) => {
      const newToken = session?.access_token ?? null;
      
      // Prevent redundant state updates if session hasn't changed
      // (This avoids "refreshing" behavior on tab switch)
      if (newToken === lastTokenRef.current && state.initialized) {
        return;
      }
      
      lastTokenRef.current = newToken;

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
    [fetchUserMeta, state.initialized],
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
