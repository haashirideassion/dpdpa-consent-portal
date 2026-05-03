-- ============================================================
-- FIX: "Database error saving new user" for Azure AD logins
-- ROOT CAUSE: employees table has NOT NULL columns without
--   defaults, so the trigger INSERT fails for new AD users.
-- SOLUTION: Make those columns nullable (HR fills them later)
--   and harden the trigger.
-- RUN THIS IN SUPABASE SQL EDITOR
-- ============================================================

-- ── 1. Check which columns block the INSERT ────────────────────
-- (Run this first to confirm, it shows NOT NULL columns)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'employees'
  AND is_nullable = 'NO'
ORDER BY ordinal_position;

-- ── 2. Make blocking columns nullable ─────────────────────────
-- These will be filled in by HR later via the admin dashboard
ALTER TABLE public.employees
  ALTER COLUMN work_email        DROP NOT NULL,
  ALTER COLUMN department        DROP NOT NULL,
  ALTER COLUMN designation       DROP NOT NULL,
  ALTER COLUMN date_of_joining   DROP NOT NULL,
  ALTER COLUMN employee_id       DROP NOT NULL,
  ALTER COLUMN updated_at        SET DEFAULT NOW();

-- ── 3. Harden the trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id UUID;
  v_first_name  TEXT;
  v_last_name   TEXT;
  v_display     TEXT;
BEGIN
  BEGIN -- inner exception-safe block

    -- Extract name from Azure AD / Google / email metadata
    v_display    := COALESCE(
                      NEW.raw_user_meta_data->>'full_name',
                      NEW.raw_user_meta_data->>'name',
                      NEW.raw_user_meta_data->>'display_name',
                      split_part(NEW.email, '@', 1)
                    );
    v_first_name := COALESCE(
                      NULLIF(NEW.raw_user_meta_data->>'given_name', ''),
                      NULLIF(split_part(v_display, ' ', 1), ''),
                      split_part(NEW.email, '@', 1)
                    );
    v_last_name  := COALESCE(
                      NULLIF(NEW.raw_user_meta_data->>'family_name', ''),
                      NULLIF(trim(substring(v_display FROM ' (.*)$')), ''),
                      ''
                    );

    -- Upsert profile
    INSERT INTO public.profiles (user_id, display_name, avatar_url)
    VALUES (NEW.id, v_display, NEW.raw_user_meta_data->>'avatar_url')
    ON CONFLICT (user_id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          avatar_url   = EXCLUDED.avatar_url;

    -- Check if employee already exists by email (HR pre-upload)
    SELECT id INTO v_employee_id
    FROM public.employees
    WHERE lower(email) = lower(NEW.email)
    LIMIT 1;

    IF v_employee_id IS NOT NULL THEN
      -- EXISTING: link user_id only, NEVER overwrite HR data
      UPDATE public.employees
        SET user_id = NEW.id
      WHERE id = v_employee_id;
    ELSE
      -- NEW AD user: create placeholder, HR fills details later
      INSERT INTO public.employees (
        employee_code,
        email,
        user_id,
        first_name,
        last_name,
        role
      ) VALUES (
        'EMP-' || upper(substr(NEW.id::text, 1, 8)),
        lower(NEW.email),
        NEW.id,
        v_first_name,
        v_last_name,
        'employee'
      )
      ON CONFLICT (email) DO NOTHING;

      -- Get the id (race-condition safe)
      SELECT id INTO v_employee_id
      FROM public.employees
      WHERE lower(email) = lower(NEW.email)
      LIMIT 1;

      IF v_employee_id IS NOT NULL THEN
        UPDATE public.employees
          SET user_id = NEW.id
        WHERE id = v_employee_id AND user_id IS NULL;
      END IF;
    END IF;

    -- Resolve employee_id for profile link
    IF v_employee_id IS NULL THEN
      SELECT id INTO v_employee_id
      FROM public.employees
      WHERE lower(email) = lower(NEW.email)
      LIMIT 1;
    END IF;

    -- Link profile → employee
    IF v_employee_id IS NOT NULL THEN
      UPDATE public.profiles
        SET employee_id = v_employee_id
      WHERE user_id = NEW.id;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- CRITICAL: Never fail auth — log warning and continue
    RAISE WARNING '[handle_new_user] Skipped for %: % (%)',
      NEW.email, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- Re-attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 4. One-time sync: link ALL existing AD users ───────────────
-- This fixes sathish and any other pre-existing AD users now
UPDATE public.employees e
SET user_id = au.id
FROM auth.users au
WHERE lower(e.email) = lower(au.email)
  AND e.user_id IS NULL;

-- Verify the fix — should show sathish@ideassion.com with a user_id
SELECT id, email, first_name, last_name, role, user_id
FROM public.employees
ORDER BY created_at DESC
LIMIT 20;
