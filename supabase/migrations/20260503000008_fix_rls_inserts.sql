-- ============================================================
-- 20260503000008_fix_rls_inserts.sql
-- Fixes RLS failures by ensuring user_id is automatically populated
-- during INSERTs on video_events and education_completions.
-- ============================================================

-- 1. Ensure user_id defaults to the current authenticated user
ALTER TABLE public.video_events ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.education_completions ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Retroactively fix any existing rows where user_id is NULL
-- (This fixes the broken rows shown in your screenshot)
UPDATE public.video_events ve
SET user_id = e.user_id
FROM public.employees e
WHERE ve.employee_id = e.id 
  AND ve.user_id IS NULL
  AND e.user_id IS NOT NULL;

UPDATE public.education_completions ec
SET user_id = e.user_id
FROM public.employees e
WHERE ec.employee_id = e.id 
  AND ec.user_id IS NULL
  AND e.user_id IS NOT NULL;
