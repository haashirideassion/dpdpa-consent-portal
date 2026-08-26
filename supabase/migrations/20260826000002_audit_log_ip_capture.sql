-- ============================================================
-- 20260826000002_audit_log_ip_capture.sql
-- Phase 4 follow-up: real client IP capture for the audit trail
-- (MoM #7 Data Retention & Audit / #10 Audit Trail).
--
-- PROBLEM: audit_logs.ip_address (TEXT, present since the very first
-- migration for this table — 20260429000001) has never actually been
-- populated. Every write path — the generic AuditService.log() browser
-- insert, the upsert_user_login_audit() RPC (20260505000002), and the
-- privileged create_employee_with_details()/bootstrap_admin()/
-- trigger-based correction & jurisdiction audit inserts
-- (20260821000013) — either omits the column or hardcodes NULL.
-- Nothing in the app has ever attempted to read it from the client,
-- because a client-supplied ip_address would be trivially spoofable
-- (`ip_address: "1.2.3.4"` in an insert payload) and therefore
-- worthless for an audit trail.
--
-- FIX: extend the existing enforce_audit_log_integrity() BEFORE INSERT
-- trigger — already the single chokepoint every audit_logs insert
-- passes through, from every path listed above — to overwrite
-- NEW.ip_address from the real HTTP request, exactly the same way it
-- already overwrites NEW.actor_role: never trust what the client sent,
-- always derive it server-side. No call site changes required.
--
-- SOURCE OF TRUTH: PostgREST (the API layer every Supabase REST/RPC
-- call runs through, including plain supabase-js `.insert()` calls and
-- `.rpc()` calls) exposes the full set of incoming HTTP headers for the
-- CURRENT request as the `request.headers` GUC (JSON) — a standard,
-- documented PostgREST/Supabase mechanism, not something introduced
-- here. It cannot be set or overridden by the client itself (it is
-- populated by PostgREST from the actual HTTP request it received, not
-- from any insert/RPC parameter). Supabase's public API sits behind a
-- CDN edge, so within it:
--   1. cf-connecting-ip — set exclusively by the edge from the real TCP
--      connection; a client cannot override it by sending its own
--      "CF-Connecting-IP" header.
--   2. true-client-ip — same guarantee, secondary CDN convention.
--   3. right-most entry of x-forwarded-for — the hop nearest the
--      origin (appended by trusted infra), used only if neither of the
--      above is present.
-- are tried in that order. If none are present — local/dev PostgREST
-- without a CDN in front of it, or a direct service-role/psql call with
-- no HTTP request at all — ip_address is left NULL. This is a real,
-- documented limitation of self-hosted/local Supabase; it is NOT
-- papered over with a fake sentinel like 0.0.0.0.
--
-- The extracted value is round-tripped through ::inet and back to TEXT,
-- which both validates it (a cast failure — garbage/spoofed header
-- content — is caught and treated as "no IP", never as an error that
-- would block the audit insert) and normalizes it. inet natively
-- supports IPv4 and IPv6, so both address families are handled by this
-- same code path without any extra branching.
--
-- ip_address stays TEXT (its existing type, unchanged) — no destructive
-- column type change. No RLS policy is created, dropped, or modified:
-- audit_logs SELECT remains admin/dpo-only (20260821000002), INSERT
-- remains actor_user_id = auth.uid() (20260429000001), and there is
-- still no UPDATE/DELETE policy for any role — the table stays
-- append-only and immutable. No historical migration file is edited.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_audit_log_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_privileged_actions CONSTANT TEXT[] := ARRAY[
    'bootstrap_admin',
    'employee.created',
    'correction.approved',
    'correction.rejected',
    'jurisdiction.assigned'
  ];
  v_headers  JSONB;
  v_raw_ip   TEXT;
  v_xff      TEXT;
  v_xff_arr  TEXT[];
BEGIN
  -- (a) actor_role — unchanged from 20260821000013.
  IF NEW.actor_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.employees WHERE user_id = NEW.actor_user_id;
    NEW.actor_role := v_role;
  ELSE
    NEW.actor_role := NULL;
  END IF;

  -- (b) privileged-action success gating — unchanged from 20260821000013.
  IF NEW.action = ANY (v_privileged_actions)
     AND NEW.success = true
     AND current_setting('app.audit_privileged_write', true) IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION
      'action "%" can only be recorded as successful by a trusted server-side operation', NEW.action
      USING ERRCODE = '42501';
  END IF;

  -- (c) ip_address — NEW. Never trusted from the client (same rule as
  -- actor_role above): whatever the insert/RPC payload claimed is
  -- discarded and always re-derived here from the real request headers
  -- PostgREST captured for this call. See file header for source order
  -- and validation.
  NEW.ip_address := NULL;

  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  IF v_headers IS NOT NULL THEN
    v_raw_ip := NULLIF(TRIM(v_headers ->> 'cf-connecting-ip'), '');

    IF v_raw_ip IS NULL THEN
      v_raw_ip := NULLIF(TRIM(v_headers ->> 'true-client-ip'), '');
    END IF;

    IF v_raw_ip IS NULL THEN
      v_xff := v_headers ->> 'x-forwarded-for';
      IF v_xff IS NOT NULL AND length(trim(v_xff)) > 0 THEN
        v_xff_arr := regexp_split_to_array(v_xff, '\s*,\s*');
        v_raw_ip := NULLIF(TRIM(v_xff_arr[array_upper(v_xff_arr, 1)]), '');
      END IF;
    END IF;

    IF v_raw_ip IS NOT NULL THEN
      BEGIN
        -- Validates + normalizes; supports IPv4 and IPv6 alike. An
        -- invalid/garbage value is silently treated as "no IP", not an
        -- error — it must never block the underlying audit insert.
        NEW.ip_address := (v_raw_ip::inet)::text;
      EXCEPTION WHEN OTHERS THEN
        NEW.ip_address := NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger itself is unchanged (still BEFORE INSERT, same function name) —
-- no DROP/CREATE TRIGGER needed, CREATE OR REPLACE FUNCTION above is
-- sufficient since trg_enforce_audit_log_integrity already points at it.
