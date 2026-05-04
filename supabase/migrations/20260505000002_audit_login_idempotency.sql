-- ============================================================
-- 20260505000002_audit_login_idempotency.sql
-- Idempotent login audit logs per auth session.
-- ============================================================

-- 1) Enforce one USER_LOGIN record per user+session_id
CREATE UNIQUE INDEX IF NOT EXISTS unique_login_per_session
ON public.audit_logs (actor_user_id, action, (metadata->>'session_id'))
WHERE action = 'USER_LOGIN';

-- 2) Backend helper for idempotent USER_LOGIN writes
CREATE OR REPLACE FUNCTION public.upsert_user_login_audit(
  p_session_id TEXT,
  p_provider TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR length(trim(p_session_id)) = 0 THEN
    RAISE EXCEPTION 'session_id is required for USER_LOGIN audit';
  END IF;

  INSERT INTO public.audit_logs (
    actor_user_id,
    user_email,
    action,
    entity_type,
    metadata,
    ip_address
  )
  VALUES (
    auth.uid(),
    p_email,
    'USER_LOGIN',
    'auth',
    jsonb_build_object(
      'session_id', p_session_id,
      'provider', COALESCE(p_provider, 'azure'),
      'email', p_email
    ),
    NULL
  )
  ON CONFLICT (actor_user_id, action, (metadata->>'session_id')) WHERE action = 'USER_LOGIN'
  DO UPDATE SET
    user_email = EXCLUDED.user_email,
    metadata = EXCLUDED.metadata;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_login_audit(TEXT, TEXT, TEXT) TO authenticated;
