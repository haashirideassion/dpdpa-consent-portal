-- ============================================================
-- 20260821000010_harden_has_role_enumeration.sql
-- SECURITY FIX (P2 #13): has_role(_user_id, _role) takes an arbitrary
-- _user_id parameter and is directly callable via the Supabase RPC
-- endpoint (GRANT EXECUTE ... TO authenticated, no REVOKE), so any
-- authenticated user could enumerate whether ANY other user holds a
-- given role (e.g. probing who is admin/dpo).
--
-- Every existing internal caller (every RLS policy and every RPC in
-- this schema) always passes has_role(auth.uid(), ...) — i.e. _user_id
-- is always the caller's own id. Restricting the function to only
-- answer truthfully for _user_id = auth.uid(), or for a caller who is
-- already staff (admin/dpo), changes nothing for any of those call
-- sites and removes the enumeration oracle for everyone else.
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    -- Querying someone else's role: only staff may do this.
    IF NOT EXISTS (
      SELECT 1 FROM public.employees
      WHERE user_id = auth.uid() AND role IN ('admin', 'dpo')
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.employees
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;
