import { config } from "@/lib/config";
import { supabase } from "@/integrations/supabase/client";

export async function signInWithMicrosoft() {
  // We use Supabase v2's signInWithOAuth method to initiate the OAuth flow
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure", // 'azure' is the provider name for Microsoft Entra ID / Azure AD
    options: {
      // redirectTo handles where the user goes after successful authentication at Microsoft
      redirectTo: config.app.baseUrl,
      // We request scopes for user info
      scopes: "email profile openid",
      // Force Microsoft to show the "Pick an account" screen every time
      queryParams: {
        prompt: "select_account",
      },
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export async function getUserRole(userId: string): Promise<"admin" | "employee" | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role ?? null;
}

export async function getEmployeeForUser(userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("employee_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile?.employee_id) return null;

  const { data: employee } = await supabase
    .from("employees")
    .select("*")
    .eq("id", profile.employee_id)
    .maybeSingle();

  return employee;
}
