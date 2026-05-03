-- ============================================================
-- FINAL FIX: New employee AD login + trigger hardening
-- Run this ENTIRE block in Supabase SQL Editor
-- ============================================================

-- ── PART 1: Drop NOT NULL on ALL columns that block INSERT ───
-- These columns don't exist in the normalized master table
-- but are blocking if they do exist. IF NOT EXISTS is safe.
DO $$
DECLARE
  col TEXT;
  cols TEXT[] := ARRAY[
    'work_email', 'department', 'designation',
    'date_of_joining', 'employee_id', 'employee_status',
    'employment_type', 'reporting_manager', 'work_location'
  ];
BEGIN
  FOREACH col IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'employees'
        AND column_name = col
        AND is_nullable = 'NO'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.employees ALTER COLUMN %I DROP NOT NULL', col
      );
      RAISE NOTICE 'Dropped NOT NULL on employees.%', col;
    END IF;
  END LOOP;
END;
$$;

-- Set DEFAULT on updated_at if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.employees
      ALTER COLUMN updated_at SET DEFAULT NOW();
  END IF;
END;
$$;

-- ── PART 2: Bulletproof handle_new_user trigger ───────────────
-- Double exception handler: inner catches logic errors,
-- outer ensures auth NEVER fails under any circumstance.
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
  -- OUTER handler: last resort, auth must never fail
  BEGIN

    -- INNER handler: catches business logic errors
    BEGIN
      v_display := COALESCE(
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
      v_last_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'family_name', ''),
        NULLIF(trim(substring(v_display FROM ' (.*)$')), ''),
        ''
      );

      -- Upsert profile (safe)
      INSERT INTO public.profiles (user_id, display_name, avatar_url)
      VALUES (NEW.id, v_display, NEW.raw_user_meta_data->>'avatar_url')
      ON CONFLICT (user_id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            avatar_url   = EXCLUDED.avatar_url;

      -- Find existing HR employee by email
      SELECT id INTO v_employee_id
      FROM public.employees
      WHERE lower(email) = lower(NEW.email)
      LIMIT 1;

      IF v_employee_id IS NOT NULL THEN
        -- Existing: link user_id only, keep all HR data
        UPDATE public.employees
          SET user_id = NEW.id
        WHERE id = v_employee_id;
      ELSE
        -- New AD user: create placeholder employee record
        INSERT INTO public.employees (
          employee_code, email, user_id, first_name, last_name, role
        ) VALUES (
          'EMP-' || upper(substr(NEW.id::text, 1, 8)),
          lower(NEW.email),
          NEW.id,
          v_first_name,
          v_last_name,
          'employee'
        )
        ON CONFLICT (email) DO NOTHING;

        -- Get id (handles race condition)
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
      RAISE WARNING '[handle_new_user inner] user=% err=% state=%',
        NEW.email, SQLERRM, SQLSTATE;
    END; -- inner

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user outer] user=% err=% state=%',
      NEW.email, SQLERRM, SQLSTATE;
  END; -- outer

  RETURN NEW; -- ALWAYS return NEW — auth must succeed
END;
$$;

-- ── PART 3: Re-attach trigger ─────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── PART 4: Verify trigger is attached ───────────────────────
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users'
  AND trigger_schema = 'auth';
