-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: consent_purpose_records & consent_purposes enhancements
-- Adds FK linkage, timestamps, audit metadata, and per-purpose versioning
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. consent_purpose_records: add purpose_id FK ────────────────────────────
ALTER TABLE public.consent_purpose_records
  ADD COLUMN IF NOT EXISTS purpose_id UUID REFERENCES public.consent_purposes(id) ON DELETE SET NULL;

-- Backfill purpose_id from purpose_key + template_id
UPDATE public.consent_purpose_records cpr
SET purpose_id = cp.id
FROM public.consent_purposes cp
WHERE cp.purpose_key = cpr.purpose_key
  AND cp.template_id = cpr.template_id
  AND cpr.purpose_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_consent_purpose_records_purpose_id
  ON public.consent_purpose_records(purpose_id);

-- ── 2. consent_purpose_records: add timestamps ───────────────────────────────
-- granted_at: populated when consented = true
ALTER TABLE public.consent_purpose_records
  ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ;

UPDATE public.consent_purpose_records
SET granted_at = created_at
WHERE consented = true AND granted_at IS NULL;

-- declined_at: populated when consented = false
ALTER TABLE public.consent_purpose_records
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;

UPDATE public.consent_purpose_records
SET declined_at = created_at
WHERE consented = false AND declined_at IS NULL;

-- ── 3. consent_purpose_records: add audit_metadata JSONB ─────────────────────
ALTER TABLE public.consent_purpose_records
  ADD COLUMN IF NOT EXISTS audit_metadata JSONB;

-- ── 4. consent_purposes: per-purpose version + is_active ─────────────────────
ALTER TABLE public.consent_purposes
  ADD COLUMN IF NOT EXISTS purpose_version TEXT NOT NULL DEFAULT '1.0';

ALTER TABLE public.consent_purposes
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Index for active purposes per template
CREATE INDEX IF NOT EXISTS idx_consent_purposes_template_active
  ON public.consent_purposes(template_id, is_active)
  WHERE is_active = true;

-- ── 5. Trigger: auto-set granted_at / declined_at on INSERT ──────────────────
CREATE OR REPLACE FUNCTION public.set_consent_purpose_timestamps()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.consented = true THEN
    NEW.granted_at := COALESCE(NEW.granted_at, NOW());
  ELSE
    NEW.declined_at := COALESCE(NEW.declined_at, NOW());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consent_purpose_timestamps ON public.consent_purpose_records;
CREATE TRIGGER trg_consent_purpose_timestamps
  BEFORE INSERT ON public.consent_purpose_records
  FOR EACH ROW EXECUTE FUNCTION public.set_consent_purpose_timestamps();

-- ── 6. RLS: no UPDATE/DELETE on consent_purpose_records (immutable) ──────────
-- Ensure only INSERT is permitted for authenticated users on their own records
DO $$
BEGIN
  -- Drop any accidental update/delete policies that may exist
  DROP POLICY IF EXISTS "consent_purpose_records_update" ON public.consent_purpose_records;
  DROP POLICY IF EXISTS "consent_purpose_records_delete" ON public.consent_purpose_records;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
