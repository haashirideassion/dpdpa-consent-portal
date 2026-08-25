-- ============================================================
-- 20260821000008_secure_dashboard_rpcs.sql
-- SECURITY FIX (P2 #8): get_dashboard_stats(), get_consent_trend(),
-- and get_dsr_by_type() are SECURITY DEFINER RPCs granted to
-- `authenticated` with no internal role check, so any ordinary
-- employee could call them directly and receive org-wide
-- compliance/DSR/breach counts intended for the admin dashboard.
--
-- Fix: gate each with the existing is_staff() helper (admin OR dpo —
-- the same role model already used for data_requests/compliance_items/
-- breach_incidents/data_inventory/app_settings elsewhere in this
-- schema; not redefined or widened here). compute_sla_due_at() is
-- left as-is — it only returns a computed timestamp from non-PII
-- config, not compliance metrics.
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_employees   bigint;
  v_consented         bigint;
  v_pending_requests  bigint;
  v_in_review         bigint;
  v_resolved          bigint;
  v_overdue           bigint;
  v_open_breaches     bigint;
  v_compliance_pct    numeric;
  result              jsonb;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Access denied. Staff role required.';
  END IF;

  SELECT COUNT(*) INTO v_total_employees FROM employees;

  SELECT COUNT(DISTINCT employee_id) INTO v_consented
    FROM consent_records WHERE status = 'consented';

  SELECT COUNT(*) INTO v_pending_requests
    FROM data_requests WHERE status = 'new';

  SELECT COUNT(*) INTO v_in_review
    FROM data_requests WHERE status IN ('in_review','action_required');

  SELECT COUNT(*) INTO v_resolved
    FROM data_requests WHERE status IN ('resolved','closed');

  SELECT COUNT(*) INTO v_overdue
    FROM data_requests
   WHERE status NOT IN ('resolved','closed','rejected')
     AND sla_due_at < now();

  SELECT COUNT(*) INTO v_open_breaches
    FROM breach_incidents
   WHERE status NOT IN ('notified','closed');

  IF v_total_employees > 0 THEN
    v_compliance_pct := ROUND((v_consented::numeric / v_total_employees) * 100, 1);
  ELSE
    v_compliance_pct := 0;
  END IF;

  result := jsonb_build_object(
    'total_employees',  v_total_employees,
    'consented',        v_consented,
    'pending_consent',  v_total_employees - v_consented,
    'pending_requests', v_pending_requests,
    'in_review',        v_in_review,
    'resolved',         v_resolved,
    'overdue',          v_overdue,
    'open_breaches',    v_open_breaches,
    'compliance_pct',   v_compliance_pct
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO authenticated;

CREATE OR REPLACE FUNCTION get_consent_trend()
RETURNS TABLE(month text, consents bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Access denied. Staff role required.';
  END IF;

  RETURN QUERY
  SELECT
    TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
    COUNT(*) AS consents
  FROM consent_records
  WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
    AND status = 'consented'
  GROUP BY DATE_TRUNC('month', created_at)
  ORDER BY DATE_TRUNC('month', created_at);
END;
$$;

GRANT EXECUTE ON FUNCTION get_consent_trend() TO authenticated;

CREATE OR REPLACE FUNCTION get_dsr_by_type()
RETURNS TABLE(request_type text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Access denied. Staff role required.';
  END IF;

  RETURN QUERY
  SELECT request_type, COUNT(*) AS count
  FROM data_requests
  GROUP BY request_type
  ORDER BY count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dsr_by_type() TO authenticated;
