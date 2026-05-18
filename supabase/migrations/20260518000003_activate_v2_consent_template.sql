-- ─────────────────────────────────────────────────────────────────────────────
-- Activate v2.0 section-wise consent template
--
-- The v2.0 template (12 sections, 39 purposes) was seeded in migration
-- 20260518000001 with is_active = false pending this activation step.
--
-- This migration:
--   1. Deactivates all other templates
--   2. Activates the v2.0 template so GranularConsentForm and MyConsentsView
--      render section-grouped purpose cards per the DPDPA spec.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Deactivate all templates
UPDATE public.consent_templates
SET is_active = false
WHERE is_active = true;

-- Step 2: Activate v2.0
UPDATE public.consent_templates
SET is_active = true
WHERE version = 'v2.0';
