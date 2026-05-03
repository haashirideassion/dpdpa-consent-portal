-- ============================================================
-- 20260503000009_correction_workflow.sql
-- US-HR-007: Full Data Correction Workflow
-- Adds missing columns, RLS, approve/reject RPCs.
-- Safe to run multiple times.
-- ============================================================

-- 1. Upgrade correction_requests table with missing columns
ALTER TABLE public.correction_requests
  ADD COLUMN IF NOT EXISTS table_name TEXT,
  ADD COLUMN IF NOT EXISTS comments   TEXT;

-- 2. Ensure status constraint is present
ALTER TABLE public.correction_requests
  DROP CONSTRAINT IF EXISTS correction_requests_status_check;
ALTER TABLE public.correction_requests
  ADD CONSTRAINT correction_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- 3. Drop & recreate RLS policies (safe replace)
DROP POLICY IF EXISTS "Correction Access"       ON public.correction_requests;
DROP POLICY IF EXISTS "correction_employee_own" ON public.correction_requests;
DROP POLICY IF EXISTS "correction_admin_all"    ON public.correction_requests;

-- Employees: can INSERT their own, can SELECT their own
CREATE POLICY "correction_employee_own" ON public.correction_requests
  FOR ALL
  USING (public.is_authorized_employee(employee_id));

-- Admins/HR: can read and update ALL requests
CREATE POLICY "correction_admin_all" ON public.correction_requests
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

-- 4. RPC: approve_correction(request_id uuid, p_comments text)
--    Dynamically updates the correct employee_* table then marks approved.
CREATE OR REPLACE FUNCTION public.approve_correction(
  p_request_id UUID,
  p_comments   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req        public.correction_requests%ROWTYPE;
  v_sql        TEXT;
  v_allowed    TEXT[] := ARRAY[
    'employee_personal_details',
    'employee_contact_details',
    'employee_employment_details',
    'employee_financial_details',
    'employee_govt_ids',
    'employee_emergency_contacts',
    'employee_additional_details',
    'employees'
  ];
BEGIN
  -- Only admin/hr_manager can approve
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'hr_manager')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Fetch the request
  SELECT * INTO v_req FROM public.correction_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is not pending');
  END IF;

  -- Safety: only allow whitelisted table names to prevent SQL injection
  IF v_req.table_name IS NOT NULL AND NOT (v_req.table_name = ANY(v_allowed)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid table name');
  END IF;

  -- Dynamically update the target table
  IF v_req.table_name IS NOT NULL AND v_req.table_name != 'employees' THEN
    v_sql := format(
      'UPDATE public.%I SET %I = $1, updated_at = now() WHERE employee_id = $2',
      v_req.table_name,
      v_req.field_name
    );
    EXECUTE v_sql USING v_req.new_value, v_req.employee_id;
  ELSIF v_req.table_name = 'employees' THEN
    v_sql := format(
      'UPDATE public.employees SET %I = $1, updated_at = now() WHERE id = $2',
      v_req.field_name
    );
    EXECUTE v_sql USING v_req.new_value, v_req.employee_id;
  END IF;

  -- Mark as approved
  UPDATE public.correction_requests SET
    status      = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    comments    = COALESCE(p_comments, comments)
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_correction(UUID, TEXT) TO authenticated;

-- 5. RPC: reject_correction(request_id uuid, p_comments text)
CREATE OR REPLACE FUNCTION public.reject_correction(
  p_request_id UUID,
  p_comments   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'hr_manager')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.correction_requests SET
    status      = 'rejected',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    comments    = p_comments
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or already processed');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_correction(UUID, TEXT) TO authenticated;

-- 6. Create storage bucket for correction proofs (idempotent via DO block)
-- NOTE: Run this manually via the Supabase Dashboard → Storage → Create bucket
-- Bucket name: correction-proofs  (private, 10MB limit, PDF/JPG/PNG only)
-- This SQL cannot create storage buckets directly.
