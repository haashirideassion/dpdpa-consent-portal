-- ============================================================
-- DEFINITIVE handle_new_user() — Production Safe
-- Run this in Supabase SQL Editor
-- ============================================================

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
  BEGIN -- ← Inner block: any failure here CANNOT break auth login

    -- ── 1. Extract name from metadata (Microsoft / Google / Email) ────
    v_display    := COALESCE(
                      NEW.raw_user_meta_data->>'full_name',
                      NEW.raw_user_meta_data->>'name',
                      NEW.raw_user_meta_data->>'display_name',
                      split_part(NEW.email, '@', 1)
                    );
    v_first_name := COALESCE(
                      NULLIF(NEW.raw_user_meta_data->>'given_name',   ''),
                      NULLIF(split_part(v_display, ' ', 1), ''),
                      split_part(NEW.email, '@', 1)
                    );
    v_last_name  := COALESCE(
                      NULLIF(NEW.raw_user_meta_data->>'family_name',  ''),
                      NULLIF(trim(substring(v_display FROM ' (.*)$')), ''),
                      ''
                    );

    -- ── 2. Upsert profile ─────────────────────────────────────────────
    INSERT INTO public.profiles (user_id, display_name, avatar_url)
    VALUES (
      NEW.id,
      v_display,
      NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (user_id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          avatar_url   = EXCLUDED.avatar_url;

    -- ── 3. Find existing HR-uploaded employee (case-insensitive) ──────
    SELECT id INTO v_employee_id
    FROM public.employees
    WHERE lower(email) = lower(NEW.email)
    LIMIT 1;

    IF v_employee_id IS NOT NULL THEN
      -- ── EXISTING: link user_id only, preserve all HR data ──────────
      UPDATE public.employees
        SET user_id = NEW.id
      WHERE id = v_employee_id
        AND user_id IS NULL;

    ELSE
      -- ── NEW: insert placeholder; initialize_employee_details trigger
      --         will auto-create all employee_* rows ──────────────────
      INSERT INTO public.employees (
        employee_code, email, user_id, first_name, last_name
      )
      VALUES (
        'EMP-' || upper(substr(NEW.id::text, 1, 8)),
        NEW.email,
        NEW.id,
        v_first_name,
        v_last_name
      )
      ON CONFLICT (email) DO NOTHING;

      -- In race-condition case where conflict fired, still get the id
      SELECT id INTO v_employee_id
      FROM public.employees
      WHERE lower(email) = lower(NEW.email)
      LIMIT 1;

      -- Link user_id if the conflict row was a pre-existing record
      IF v_employee_id IS NOT NULL THEN
        UPDATE public.employees
          SET user_id = NEW.id
        WHERE id = v_employee_id AND user_id IS NULL;
      END IF;
    END IF;

    -- Re-fetch in case we went into ELSE branch above
    IF v_employee_id IS NULL THEN
      SELECT id INTO v_employee_id
      FROM public.employees
      WHERE lower(email) = lower(NEW.email)
      LIMIT 1;
    END IF;

    -- ── 4. Link profile → employee ────────────────────────────────────
    IF v_employee_id IS NOT NULL THEN
      UPDATE public.profiles
        SET employee_id = v_employee_id
      WHERE user_id = NEW.id;
    END IF;

    -- ── 5. Assign 'employee' role ─────────────────────────────────────
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'employee')
    ON CONFLICT (user_id, role) DO NOTHING;

  EXCEPTION WHEN OTHERS THEN
    -- Log but NEVER fail — auth must always succeed
    RAISE WARNING '[handle_new_user] Skipped for %: % (%)', NEW.email, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
END;
$$;

-- ── Re-attach trigger (safe to run multiple times) ────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
