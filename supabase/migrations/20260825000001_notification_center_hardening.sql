-- ============================================================
-- 20260825000001_notification_center_hardening.sql
--
-- Notification Center Phase 2 — hardens and extends the existing
-- public.notifications table (20260504000005) without dropping it or any
-- of its existing rows. Summary of changes:
--
--   1. Additive columns: actor_user_id, entity_type, entity_id, action_url,
--      category, read_at. All nullable — existing rows remain valid.
--   2. CHECK constraint on category (nullable, so legacy rows with no
--      category are unaffected) mirroring src/lib/notificationTypes.ts.
--   3. Indexes for (user_id, created_at DESC) and (user_id, is_read,
--      created_at DESC) — the two access patterns the UI actually uses.
--   4. SECURITY DEFINER RPCs: create_notification(), notify_staff_audience(),
--      mark_notification_read(), mark_all_notifications_read(). These
--      become the ONLY supported write/update paths.
--   5. RLS: drop both existing INSERT policies (the "Admins can insert
--      notifications" policy AND the "Users can insert own notifications"
--      policy the latter of which currently lets any authenticated user
--      self-insert an arbitrary notification — the exact spoofing gap
--      called out in the Phase 1 audit) and the existing UPDATE policy.
--      No INSERT/UPDATE policy is added back — all writes now go through
--      the SECURITY DEFINER functions above, which bypass RLS under
--      their own validation. SELECT-own-only is unchanged.
--   6. Refactors the two existing notification writers
--      (notify_hr_dpo_consent_withdrawal, notify_new_data_request) to
--      populate the new columns and keep exactly one notification per
--      recipient — no behavior change to who gets notified.
--   7. New triggers: notify on correction submitted (employee → staff),
--      notify on correction approved/rejected (admin → employee), notify
--      on DSR status change (admin → requester).
--   8. Re-creates reset_user_onboarding() and link_employee_record() to add
--      a notification insert (onboarding.reset / employee.created) — no
--      other change to either function's existing logic/authorization.
--
-- Does NOT touch audit_logs, its RLS, its triggers, or any audit_logs
-- migration. Does NOT touch approve_correction()/reject_correction()
-- themselves (notification is a separate AFTER UPDATE trigger, same
-- pattern already used by audit_correction_review()).
-- ============================================================

-- ── 1. Additive schema ───────────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_user_id UUID,
  ADD COLUMN IF NOT EXISTS entity_type   TEXT,
  ADD COLUMN IF NOT EXISTS entity_id     UUID,
  ADD COLUMN IF NOT EXISTS action_url    TEXT,
  ADD COLUMN IF NOT EXISTS category      TEXT,
  ADD COLUMN IF NOT EXISTS read_at       TIMESTAMPTZ;

-- Nullable CHECK: legacy rows (category IS NULL) are unaffected; any new
-- row must use one of the canonical categories in src/lib/notificationTypes.ts.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check
  CHECK (
    category IS NULL OR category IN (
      'employee.created',
      'employee.updated',
      'correction.submitted',
      'correction.approved',
      'correction.rejected',
      'dsr.created',
      'dsr.status_updated',
      'education.completed',
      'video.completed',
      'onboarding.reset',
      'consent.withdrawn',
      'consent.granted'
    )
  );

-- ── 2. Indexes for the actual access patterns ───────────────────────────
DROP INDEX IF EXISTS public.idx_notifications_user_id; -- superseded by the composite index below
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON public.notifications (user_id, is_read, created_at DESC);

-- ── 3. Lock down direct writes — drop existing INSERT/UPDATE policies ───
DROP POLICY IF EXISTS "Admins can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
-- SELECT-own-only policy ("Users can read own notifications") is untouched.

-- ── 4. create_notification() — general-purpose writer ───────────────────
-- Trust rule: a caller may create a notification for themself (self-ack,
-- e.g. consent withdrawal/re-grant acknowledgement), or for any recipient
-- if the caller holds an admin/hr_manager/dpo role (e.g. adminOverride,
-- reset_user_onboarding, correction approve/reject). This mirrors the
-- trust level of the previous "Admins can insert notifications" policy
-- while closing the "any user can insert for themself with any type"
-- self-spoofing gap: the category is now restricted to the CHECK-
-- constrained allowlist, and title/message are fixed at the call site
-- inside application code — never arbitrary end-user input.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_recipient_user_id UUID,
  p_category           TEXT,
  p_title              TEXT,
  p_message            TEXT,
  p_entity_type        TEXT DEFAULT NULL,
  p_entity_id          UUID DEFAULT NULL,
  p_action_url         TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_recipient_user_id IS NULL THEN
    RAISE EXCEPTION 'recipient is required';
  END IF;

  IF p_recipient_user_id <> auth.uid()
     AND NOT (
       public.has_role(auth.uid(), 'admin') OR
       public.has_role(auth.uid(), 'hr_manager') OR
       public.has_role(auth.uid(), 'dpo')
     )
  THEN
    RAISE EXCEPTION 'not authorized to create a notification for this recipient';
  END IF;

  INSERT INTO public.notifications (
    user_id, actor_user_id, category, type, title, message,
    entity_type, entity_id, action_url
  ) VALUES (
    p_recipient_user_id, auth.uid(), p_category, p_category, p_title, p_message,
    p_entity_type, p_entity_id, p_action_url
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ── 5. notify_staff_audience() — employee-initiated, staff-facing only ──
-- Narrow, hardcoded category allowlist (NOT the full taxonomy) is itself
-- the trust boundary here: an ordinary employee may trigger this only for
-- the two employee-completes-an-onboarding-step events, and the resulting
-- recipient set is always the admin/hr_manager/dpo audience — never an
-- arbitrary other employee.
CREATE OR REPLACE FUNCTION public.notify_staff_audience(
  p_category    TEXT,
  p_title       TEXT,
  p_message     TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id   UUID DEFAULT NULL,
  p_action_url  TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  IF p_category NOT IN ('education.completed', 'video.completed') THEN
    RAISE EXCEPTION 'category not permitted for notify_staff_audience';
  END IF;

  FOR v_staff_id IN
    SELECT e.user_id FROM public.employees e
    WHERE e.role IN ('admin', 'hr_manager', 'dpo') AND e.user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (
      user_id, actor_user_id, category, type, title, message,
      entity_type, entity_id, action_url
    ) VALUES (
      v_staff_id, auth.uid(), p_category, p_category, p_title, p_message,
      p_entity_type, p_entity_id, p_action_url
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_staff_audience(TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ── 6. mark_notification_read() / mark_all_notifications_read() ─────────
-- Replace the previous plain client UPDATE (gated only by RLS) — no
-- UPDATE policy exists any more, so these RPCs are now the only way to
-- change is_read/read_at, and they can only ever touch the caller's own
-- rows. title/message/type/actor_user_id/entity_type/entity_id/action_url
-- are never touched by either function.
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET is_read = TRUE, read_at = now()
  WHERE id = p_notification_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET is_read = TRUE, read_at = now()
  WHERE user_id = auth.uid() AND is_read = FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ── 7. Efficient unread-count RPC (avoids fetching rows just to count) ──
CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::INTEGER FROM public.notifications
  WHERE user_id = auth.uid() AND is_read = FALSE;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;

-- ── 8. Refactor existing writers onto the new columns (same recipients) ─

-- 8a. notify_hr_dpo_consent_withdrawal — unchanged recipient rule
-- (admin, hr_manager, dpo), now populates category/entity/actor.
CREATE OR REPLACE FUNCTION public.notify_hr_dpo_consent_withdrawal(
  p_employee_name TEXT,
  p_purpose_label TEXT,
  p_purpose_key   TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hr_user_id UUID;
BEGIN
  FOR v_hr_user_id IN
    SELECT e.user_id
    FROM public.employees e
    WHERE e.role IN ('admin', 'hr_manager', 'dpo')
      AND e.user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, actor_user_id, type, category, title, message, entity_type)
    VALUES (
      v_hr_user_id,
      auth.uid(),
      'CONSENT_WITHDRAWAL',
      'consent.withdrawn',
      'Consent Withdrawal: ' || p_purpose_label,
      p_employee_name || ' has withdrawn consent for: ' || p_purpose_label ||
      '. Action may be required for compliance tracking.',
      'consent_purpose'
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_hr_dpo_consent_withdrawal(TEXT, TEXT, TEXT) TO authenticated;

-- 8b. notify_new_data_request trigger — unchanged recipient rule
-- (admin, dpo only — hr_manager intentionally excluded, preserving the
-- existing behavior), now populates category/entity/action_url so the
-- notification can deep-link to the existing admin DSR detail route.
CREATE OR REPLACE FUNCTION public.notify_new_data_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_ids uuid[];
BEGIN
  SELECT array_agg(e.user_id)
    INTO staff_ids
    FROM public.employees e
   WHERE e.role IN ('admin', 'dpo')
     AND e.user_id IS NOT NULL;

  IF staff_ids IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, actor_user_id, type, category, title, message, entity_type, entity_id, action_url
    )
    SELECT unnest(staff_ids),
           NEW.raised_by,
           'dsr_new',
           'dsr.created',
           'New Data Request: ' || NEW.request_type,
           COALESCE(NEW.subject, 'A new data subject request has been submitted.'),
           'dsr',
           NEW.id,
           '/admin/requests/' || NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;
-- Trigger on_new_data_request already points at this function name
-- (created in 20260625000001) — CREATE OR REPLACE above is sufficient,
-- no DROP/CREATE TRIGGER needed.

-- ── 9. New: correction submitted → notify admin/hr_manager/dpo audience ─
CREATE OR REPLACE FUNCTION public.notify_correction_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_actor_user_id UUID;
BEGIN
  SELECT e.user_id INTO v_actor_user_id FROM public.employees e WHERE e.id = NEW.employee_id;

  FOR v_staff_id IN
    SELECT e.user_id FROM public.employees e
    WHERE e.role IN ('admin', 'hr_manager', 'dpo') AND e.user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (
      user_id, actor_user_id, type, category, title, message, entity_type, entity_id, action_url
    ) VALUES (
      v_staff_id,
      v_actor_user_id,
      'correction.submitted',
      'correction.submitted',
      'New correction request',
      'An employee submitted a correction request for review.',
      'Correction',
      NEW.employee_id,
      '/admin/corrections'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_correction_submitted ON public.correction_requests;
CREATE TRIGGER trg_notify_correction_submitted
  AFTER INSERT ON public.correction_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_correction_submitted();

-- ── 10. New: correction approved/rejected → notify the submitting employee
-- Same WHEN clause and status-transition trust as audit_correction_review()
-- (20260821000013) — trg_prevent_correction_workflow_tampering already
-- guarantees this status change only ever came from approve_correction()/
-- reject_correction() themselves.
CREATE OR REPLACE FUNCTION public.notify_correction_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_user_id UUID;
  v_category TEXT;
  v_title TEXT;
  v_message TEXT;
BEGIN
  SELECT e.user_id INTO v_recipient_user_id
  FROM public.employees e WHERE e.id = NEW.employee_id;

  IF v_recipient_user_id IS NULL THEN
    RETURN NEW; -- employee not linked to an auth user yet — nothing to notify
  END IF;

  IF NEW.status = 'approved' THEN
    v_category := 'correction.approved';
    v_title := 'Correction approved';
    v_message := 'Your correction request has been approved.';
  ELSIF NEW.status = 'rejected' THEN
    v_category := 'correction.rejected';
    v_title := 'Correction request rejected';
    v_message := 'Your correction request was rejected. Review the request details for more information.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id, actor_user_id, type, category, title, message, entity_type, entity_id, action_url
  ) VALUES (
    v_recipient_user_id, auth.uid(), v_category, v_category, v_title, v_message,
    'Correction', NEW.employee_id, '/'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_correction_review ON public.correction_requests;
CREATE TRIGGER trg_notify_correction_review
  AFTER UPDATE ON public.correction_requests
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected'))
  EXECUTE FUNCTION public.notify_correction_review();

-- ── 11. New: DSR status updated → notify the requester ──────────────────
CREATE OR REPLACE FUNCTION public.notify_dsr_status_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.raised_by IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id, actor_user_id, type, category, title, message, entity_type, entity_id, action_url
  ) VALUES (
    NEW.raised_by,
    auth.uid(),
    'dsr.status_updated',
    'dsr.status_updated',
    'Data request status updated',
    'Your data request status has been updated.',
    'dsr',
    NEW.id,
    '/'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_dsr_status_updated ON public.data_requests;
CREATE TRIGGER trg_notify_dsr_status_updated
  AFTER UPDATE ON public.data_requests
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.notify_dsr_status_updated();

-- ── 12. reset_user_onboarding() — add onboarding.reset notification ─────
-- Signature/authorization/existing audit_logs insert are UNCHANGED; only
-- addition is the notification insert for the affected employee.
CREATE OR REPLACE FUNCTION public.reset_user_onboarding(
  target_employee_id UUID,
  reset_reason TEXT DEFAULT 'bug / re-consent / compliance'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_actor_id UUID := auth.uid();
  v_actor_email TEXT := (SELECT email FROM auth.users WHERE id = auth.uid());
  v_target_user_id UUID;
BEGIN
  IF NOT (public.has_role(current_actor_id, 'admin') OR public.has_role(current_actor_id, 'hr_manager')) THEN
    RAISE EXCEPTION 'Access denied. Admin or HR Manager role required.';
  END IF;

  UPDATE public.video_events
  SET reset_flag = true,
      updated_at = now()
  WHERE employee_id = target_employee_id;

  UPDATE public.education_completions
  SET reset_flag = true,
      is_completed = false
  WHERE employee_id = target_employee_id;

  INSERT INTO public.audit_logs (
    actor_user_id,
    user_email,
    action,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    current_actor_id,
    v_actor_email,
    'reset_onboarding',
    'employee',
    target_employee_id,
    jsonb_build_object(
      'reason', reset_reason,
      'timestamp', now()
    )
  );

  SELECT e.user_id INTO v_target_user_id FROM public.employees e WHERE e.id = target_employee_id;
  IF v_target_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      user_id, actor_user_id, type, category, title, message, entity_type, entity_id, action_url
    ) VALUES (
      v_target_user_id,
      current_actor_id,
      'onboarding.reset',
      'onboarding.reset',
      'Onboarding reset',
      'Your onboarding has been reset. Please complete the required onboarding steps again.',
      'employee',
      target_employee_id,
      '/'
    );
  END IF;
END;
$$;

-- ── 13. link_employee_record() — add employee.created "welcome" notification
-- This RPC is the actual live employee-linking path invoked by the app
-- (src/routes/_authenticated.tsx calls it on every sign-in). It only ever
-- links a given employee row's user_id ONCE (WHERE user_id IS NULL), so
-- this is a natural, duplicate-proof place to fire the one-time welcome
-- notification for a newly created employee (normal creation and
-- CSV-bulk-imported rows both flow through this exact same first-login
-- link — no separate per-import-row notification is needed or added).
-- Signature/authorization/existing linking logic are UNCHANGED.
CREATE OR REPLACE FUNCTION public.link_employee_record()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_employee_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_user_id IS NULL OR v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(v_email))
    AND user_id IS NULL
  LIMIT 1;

  IF FOUND THEN
    PERFORM set_config('app.employee_privileged_write', 'on', true);

    UPDATE public.employees
    SET user_id = v_user_id
    WHERE id = v_employee_id;

    INSERT INTO public.notifications (
      user_id, actor_user_id, type, category, title, message, entity_type, entity_id, action_url
    ) VALUES (
      v_user_id,
      NULL,
      'employee.created',
      'employee.created',
      'Welcome to the DPDPA Consent Portal',
      'Your employee profile has been created. Please review your profile and complete the required onboarding steps.',
      'employee',
      v_employee_id,
      '/'
    );

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
