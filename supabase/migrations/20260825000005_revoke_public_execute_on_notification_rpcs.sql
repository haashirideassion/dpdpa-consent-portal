-- ============================================================
-- 20260825000005_revoke_public_execute_on_notification_rpcs.sql
--
-- SECURITY FIX: PostgreSQL grants EXECUTE on a newly created function to
-- PUBLIC by default. Every notification RPC added across
-- 20260825000001-20260825000004 explicitly granted EXECUTE TO authenticated
-- but never revoked the default PUBLIC grant — so every one of them was
-- (and, until this migration runs, remains) callable by completely
-- unauthenticated/anonymous requests, not just logged-in users. Confirmed
-- live: notify_hr_dpo_consent_granted() executed successfully over the
-- anon-keyed REST endpoint with no session at all.
--
-- This does not change WHO the functions treat as staff/recipients (that
-- logic is untouched), only closes the anonymous-access hole by revoking
-- the default PUBLIC grant and leaving only the intended
-- `authenticated`-role grant in place.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_staff_audience(TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_unread_notification_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_hr_dpo_consent_withdrawal(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_hr_dpo_consent_granted(UUID, BOOLEAN) FROM PUBLIC;

-- Re-affirm the intended grants (no-op if already present) so this
-- migration is self-sufficient even if run in isolation.
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_staff_audience(TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_hr_dpo_consent_withdrawal(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_hr_dpo_consent_granted(UUID, BOOLEAN) TO authenticated;
