-- Phase 1 audit foundation (additive, backward-compatible).
--
-- Context: the Audit Logs gap report identified that public.audit_logs cannot
-- currently record whether an action succeeded/failed, where it originated
-- (web UI vs. CSV import/export vs. RPC), the actor's role at the time of the
-- event, or a correlation id linking multiple rows from one logical operation
-- (e.g. a bulk CSV import).
--
-- This migration ONLY adds nullable/defaulted columns and supporting indexes.
-- It does not change any existing column, does not add a CHECK constraint on
-- `action` (kept as free text; a canonical allowlist is enforced at the
-- TypeScript layer instead, see src/lib/auditActions.ts), does not touch RLS,
-- and does not wire up any new call sites. Every existing INSERT (from
-- AuditService.log/logUserLogin, upsert_user_login_audit, reset_user_onboarding,
-- bootstrap_admin) continues to work unchanged because every new column is
-- nullable or has a safe default.

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id UUID,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

COMMENT ON COLUMN public.audit_logs.success IS
  'Whether the audited action succeeded. Defaults to true so existing insert call sites (which never set this) are unaffected. Set to false for logged failure/blocked-attempt events once those are wired up in a later phase.';
COMMENT ON COLUMN public.audit_logs.source IS
  'Origin of the action, e.g. web_portal, csv_import, csv_export, rpc. Nullable; populated only by call sites updated in a later phase.';
COMMENT ON COLUMN public.audit_logs.actor_role IS
  'Actor''s role (admin/employee/hr_manager/dpo) denormalized at insert time, so later role changes do not retroactively alter historical audit rows. Nullable; not yet populated by any existing call site.';
COMMENT ON COLUMN public.audit_logs.correlation_id IS
  'Optional id grouping multiple audit rows produced by one logical operation (e.g. all row-level events from a single CSV import). Nullable; not yet populated.';
COMMENT ON COLUMN public.audit_logs.failure_reason IS
  'Free-text detail when success = false (e.g. blocked self-escalation attempt, validation failure). Nullable.';

-- Supporting indexes for the filters these columns will eventually enable.
-- Partial indexes keep them small until the columns are actually populated.
CREATE INDEX IF NOT EXISTS idx_audit_logs_source
  ON public.audit_logs (source)
  WHERE source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_role
  ON public.audit_logs (actor_role)
  WHERE actor_role IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id
  ON public.audit_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_success_false
  ON public.audit_logs (success)
  WHERE success = false;

-- No RLS changes: audit_logs_insert ("actor_user_id = auth.uid()") and the
-- admin/dpo-only SELECT policy from 20260821000002_lock_down_audit_logs.sql
-- already cover these new columns automatically (Postgres RLS policies apply
-- at the row level, not per-column), so no policy needs to be touched here.
-- No UPDATE/DELETE policy is added — the table remains append-only.
