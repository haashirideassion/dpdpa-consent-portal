-- ============================================================
-- 20260825000007_correction_notification_copy.sql
-- MoM #2, section 11 (Notifications): the MoM specifies exact,
-- generic (no sensitive-field-name, no old/new value) copy for the
-- three correction-workflow notifications. The trigger functions
-- introduced in 20260825000001_notification_center_hardening.sql
-- (notify_correction_submitted / notify_correction_review) already
-- fire at the right time, to the right audience, with no sensitive
-- values — this migration only updates their title/message text to
-- match the MoM's specified copy. No signature, trigger binding,
-- recipient-audience, or control-flow change.
-- ============================================================

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
      'Personal information change request',
      'An employee submitted a personal information change request for review.',
      'Correction',
      NEW.employee_id,
      '/admin/corrections'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

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
    v_title := 'Change request approved';
    v_message := 'Your requested personal information change has been approved.';
  ELSIF NEW.status = 'rejected' THEN
    v_category := 'correction.rejected';
    v_title := 'Change request rejected';
    v_message := 'Your requested personal information change was not approved.';
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
