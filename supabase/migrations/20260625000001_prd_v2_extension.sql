-- ============================================================
-- PRD v2 Extension Migration
-- Date: 2026-06-25
-- Purpose: Adds all Phase 1 & 2 tables from PRD-DPDPA-Portal-Extension.md
-- Non-breaking: does not alter existing tables/columns/policies
-- ============================================================

-- ── 1. Extend app_role enum with 'dpo' (safe — roles now stored as TEXT in employees.role) ──
-- This block is intentionally a no-op: the production schema uses employees.role TEXT
-- (not the app_role enum). We keep this block idempotent so it never blocks migration.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'dpo'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
    ) THEN
      ALTER TYPE app_role ADD VALUE 'dpo';
    END IF;
  END IF;
  -- If app_role type does not exist, roles are stored as employees.role TEXT — no action needed.
END $$;

-- ── 2. is_staff() helper ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dpo');
$$;

-- ── 3. data_requests (M2 — Data Subject Requests) ────────────────────────────
CREATE TABLE IF NOT EXISTS data_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid REFERENCES employees(id) ON DELETE SET NULL,
  raised_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_type    text NOT NULL CHECK (request_type IN (
                    'access','correction','erasure','portability','nomination','grievance'
                  )),
  status          text NOT NULL DEFAULT 'new' CHECK (status IN (
                    'new','in_review','action_required','resolved','closed','rejected'
                  )),
  priority        text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  subject         text NOT NULL DEFAULT '',
  description     text NOT NULL DEFAULT '',
  resolution_note text,
  sla_due_at      timestamptz,
  ai_summary      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY;

-- Principals see own requests; staff see all
CREATE POLICY "data_requests_select"
  ON data_requests FOR SELECT
  USING (raised_by = auth.uid() OR is_staff());

CREATE POLICY "data_requests_insert"
  ON data_requests FOR INSERT
  WITH CHECK (raised_by = auth.uid() OR is_staff());

CREATE POLICY "data_requests_update"
  ON data_requests FOR UPDATE
  USING (is_staff());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS data_requests_updated_at ON data_requests;
CREATE TRIGGER data_requests_updated_at
  BEFORE UPDATE ON data_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. data_request_messages (threaded notes) ────────────────────────────────
CREATE TABLE IF NOT EXISTS data_request_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL REFERENCES data_requests(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body        text NOT NULL DEFAULT '',
  is_internal boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_request_messages ENABLE ROW LEVEL SECURITY;

-- Principals see non-internal messages on their own requests; staff see all
CREATE POLICY "drm_select"
  ON data_request_messages FOR SELECT
  USING (
    is_staff()
    OR (
      is_internal = false
      AND request_id IN (
        SELECT id FROM data_requests WHERE raised_by = auth.uid()
      )
    )
  );

CREATE POLICY "drm_insert"
  ON data_request_messages FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- ── 5. compliance_items (M4 — Compliance Tracker) ────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,
  category        text NOT NULL DEFAULT 'general',
  owner_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'not_started' CHECK (status IN (
                    'not_started','in_progress','compliant','at_risk'
                  )),
  due_date        date,
  evidence_url    text,
  last_reviewed_at timestamptz,
  display_order   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_items_read"
  ON compliance_items FOR SELECT
  USING (is_staff());

CREATE POLICY "compliance_items_write"
  ON compliance_items FOR ALL
  USING (is_staff());

DROP TRIGGER IF EXISTS compliance_items_updated_at ON compliance_items;
CREATE TRIGGER compliance_items_updated_at
  BEFORE UPDATE ON compliance_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed core DPDPA compliance obligations
INSERT INTO compliance_items (title, description, category, status, display_order) VALUES
  ('Consent Notice Published', 'Publish a clear, accessible consent notice explaining data collection purposes, retention, and rights.', 'Consent', 'not_started', 1),
  ('Consent Mechanism Active', 'Implement granular per-purpose consent collection for all data principals.', 'Consent', 'compliant', 2),
  ('DPO Appointed', 'Designate and register a Data Protection Officer as required under DPDPA 2023.', 'Governance', 'not_started', 3),
  ('Grievance Mechanism in Place', 'Establish and publish grievance redressal process and officer contact.', 'Rights', 'not_started', 4),
  ('Breach Response Process', 'Document and test personal data breach detection, containment, and notification process.', 'Incidents', 'not_started', 5),
  ('RoPA Maintained', 'Maintain an up-to-date Record of Processing Activities (RoPA) covering all data categories.', 'Inventory', 'not_started', 6),
  ('Data Retention Policy', 'Define and enforce retention schedules for each data category. Auto-purge or anonymize on expiry.', 'Governance', 'not_started', 7),
  ('Children''s Data Handling', 'Implement age verification and parental consent for processing data of minors (< 18 years).', 'Consent', 'not_started', 8),
  ('Third-Party Processor Agreements', 'Execute data processing agreements with all third-party processors per DPDPA requirements.', 'Governance', 'not_started', 9),
  ('Data Principal Rights Enabled', 'Ensure data principals can exercise Access, Correction, Erasure, Portability, and Nomination rights.', 'Rights', 'compliant', 10),
  ('Cross-Border Transfer Safeguards', 'Document and apply safeguards for cross-border data transfers to permitted countries only.', 'Governance', 'not_started', 11),
  ('Security Safeguards Implemented', 'Implement technical and organisational measures (encryption, access control, audit logging).', 'Security', 'in_progress', 12)
ON CONFLICT DO NOTHING;

-- ── 6. risk_assessments (M5 — DPIA / Risk Register) ─────────────────────────
CREATE TABLE IF NOT EXISTS risk_assessments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  description           text,
  processing_activity_id uuid,          -- linked to data_inventory (nullable)
  likelihood            integer NOT NULL DEFAULT 1 CHECK (likelihood BETWEEN 1 AND 5),
  impact                integer NOT NULL DEFAULT 1 CHECK (impact BETWEEN 1 AND 5),
  risk_score            integer GENERATED ALWAYS AS (likelihood * impact) STORED,
  mitigation            text,
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigated','accepted')),
  owner_user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risk_assessments_access"
  ON risk_assessments FOR ALL
  USING (is_staff());

DROP TRIGGER IF EXISTS risk_assessments_updated_at ON risk_assessments;
CREATE TRIGGER risk_assessments_updated_at
  BEFORE UPDATE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 7. data_inventory (M6 — Record of Processing Activities) ─────────────────
CREATE TABLE IF NOT EXISTS data_inventory (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_name             text NOT NULL,
  purpose                   text NOT NULL,
  data_categories           text[] NOT NULL DEFAULT '{}',
  data_principal_types      text[] NOT NULL DEFAULT '{}',
  legal_basis               text,
  recipients                text,
  storage_location          text,
  retention_period          text,
  cross_border              boolean NOT NULL DEFAULT false,
  linked_consent_purpose_id uuid,
  owner_user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_inventory_access"
  ON data_inventory FOR ALL
  USING (is_staff());

DROP TRIGGER IF EXISTS data_inventory_updated_at ON data_inventory;
CREATE TRIGGER data_inventory_updated_at
  BEFORE UPDATE ON data_inventory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed RoPA entries from employees schema field groups
INSERT INTO data_inventory (activity_name, purpose, data_categories, data_principal_types, legal_basis, storage_location, retention_period, cross_border) VALUES
  ('Employee Personal Data', 'HR administration, payroll, compliance', ARRAY['Name', 'Date of Birth', 'Gender', 'Blood Group', 'Marital Status', 'Nationality'], ARRAY['Employees'], 'Consent + Legitimate Interest', 'Supabase (India region)', '7 years post-employment', false),
  ('Employee Contact Information', 'Communication, emergency contact, HR administration', ARRAY['Work Email', 'Personal Email', 'Phone Numbers', 'Address'], ARRAY['Employees'], 'Consent + Legitimate Interest', 'Supabase (India region)', '7 years post-employment', false),
  ('Employment Details', 'Payroll, performance management, reporting', ARRAY['Department', 'Designation', 'Joining Date', 'Employment Type', 'Work Location'], ARRAY['Employees'], 'Contractual Necessity', 'Supabase (India region)', '7 years post-employment', false),
  ('Financial / Payroll Data', 'Salary disbursement, tax compliance', ARRAY['Bank Account', 'IFSC', 'PAN', 'CTC', 'PF Account', 'ESIC Number'], ARRAY['Employees'], 'Contractual Necessity + Legal Obligation', 'Supabase (India region)', '7 years post-employment', false),
  ('Government Identification', 'KYC, legal compliance, identity verification', ARRAY['Aadhaar Number', 'UAN', 'Passport', 'Driving License', 'Voter ID'], ARRAY['Employees'], 'Legal Obligation + Consent', 'Supabase (India region)', '7 years post-employment', false),
  ('Emergency Contact Information', 'Emergency notification, employee welfare', ARRAY['Contact Name', 'Relationship', 'Phone', 'Email'], ARRAY['Employees'], 'Consent', 'Supabase (India region)', 'Duration of employment + 1 year', false),
  ('Video Onboarding Data', 'DPDPA education compliance tracking', ARRAY['Video Watch Progress', 'Completion Timestamp'], ARRAY['Employees'], 'Legal Obligation (DPDPA compliance)', 'Supabase (India region)', '3 years', false),
  ('Consent Records', 'Audit trail of data principal consent decisions', ARRAY['Consent Status', 'Consent Version', 'IP Address', 'User Agent'], ARRAY['Employees'], 'Legal Obligation (DPDPA §6)', 'Supabase (India region)', 'Indefinite (audit trail)', false)
ON CONFLICT DO NOTHING;

-- ── 8. breach_incidents (M7 — Breach Management) ────────────────────────────
CREATE TABLE IF NOT EXISTS breach_incidents (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                     text NOT NULL,
  description               text,
  severity                  text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status                    text NOT NULL DEFAULT 'reported' CHECK (status IN (
                              'reported','investigating','contained','notified','closed'
                            )),
  discovered_at             timestamptz NOT NULL DEFAULT now(),
  affected_count            integer,
  affected_data_categories  text[] NOT NULL DEFAULT '{}',
  root_cause                text,
  remediation               text,
  board_notified_at         timestamptz,
  principals_notified_at    timestamptz,
  owner_user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE breach_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "breach_incidents_access"
  ON breach_incidents FOR ALL
  USING (is_staff());

DROP TRIGGER IF EXISTS breach_incidents_updated_at ON breach_incidents;
CREATE TRIGGER breach_incidents_updated_at
  BEFORE UPDATE ON breach_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 9. app_settings (M11 — configurable settings) ────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_read"
  ON app_settings FOR SELECT
  USING (is_staff());

CREATE POLICY "app_settings_write"
  ON app_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- Seed default settings
INSERT INTO app_settings (key, value) VALUES
  ('sla_days', '{"access": 30, "correction": 30, "erasure": 30, "portability": 30, "nomination": 30, "grievance": 15}'::jsonb),
  ('compliance_score_weights', '{"consent_completion": 0.35, "dsr_sla": 0.25, "breach_overdue": 0.20, "ropa_reviewed": 0.20}'::jsonb),
  ('ai_enabled', 'false'::jsonb),
  ('org_name', '"IDEASSION"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── 10. Notification triggers for new entities ───────────────────────────────
-- Create notification when a new data_request is inserted
CREATE OR REPLACE FUNCTION notify_new_data_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  staff_ids uuid[];
BEGIN
  -- Notify all admin/dpo users (roles stored in employees.role TEXT, not user_roles)
  SELECT array_agg(e.user_id)
    INTO staff_ids
    FROM employees e
   WHERE e.role IN ('admin', 'dpo')
     AND e.user_id IS NOT NULL;

  IF staff_ids IS NOT NULL THEN
    -- notifications table columns: id, user_id, type, title, message, is_read, created_at
    INSERT INTO notifications (user_id, type, title, message)
    SELECT unnest(staff_ids),
           'dsr_new',
           'New Data Request: ' || NEW.request_type,
           COALESCE(NEW.subject, 'A new data subject request has been submitted.');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_data_request ON data_requests;
CREATE TRIGGER on_new_data_request
  AFTER INSERT ON data_requests
  FOR EACH ROW EXECUTE FUNCTION notify_new_data_request();

-- ── 11. RPC: get_dashboard_stats ──────────────────────────────────────────────
-- Returns all dashboard KPIs in a single round-trip
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
  v_sla_days          integer := 30;
  result              jsonb;
BEGIN
  SELECT COUNT(*) INTO v_total_employees FROM employees;

  -- consent_records.status uses 'consented' (not 'active') per consent_status enum
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

  -- Simple compliance score: % consented
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

-- ── 12. RPC: get_consent_trend ────────────────────────────────────────────────
-- Returns monthly consent counts for the last 6 months
CREATE OR REPLACE FUNCTION get_consent_trend()
RETURNS TABLE(month text, consents bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
    COUNT(*) AS consents
  FROM consent_records
  WHERE created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
    AND status = 'consented'
  GROUP BY DATE_TRUNC('month', created_at)
  ORDER BY DATE_TRUNC('month', created_at);
$$;

GRANT EXECUTE ON FUNCTION get_consent_trend() TO authenticated;

-- ── 13. RPC: get_dsr_by_type ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_dsr_by_type()
RETURNS TABLE(request_type text, count bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT request_type, COUNT(*) AS count
  FROM data_requests
  GROUP BY request_type
  ORDER BY count DESC;
$$;

GRANT EXECUTE ON FUNCTION get_dsr_by_type() TO authenticated;

-- ── 14. RPC: compute_sla_due_at ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION compute_sla_due_at(p_request_type text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sla_setting jsonb;
  days_val    integer;
BEGIN
  SELECT value INTO sla_setting FROM app_settings WHERE key = 'sla_days';
  days_val := COALESCE((sla_setting ->> p_request_type)::integer, 30);
  RETURN now() + (days_val || ' days')::interval;
END;
$$;

GRANT EXECUTE ON FUNCTION compute_sla_due_at(text) TO authenticated;
