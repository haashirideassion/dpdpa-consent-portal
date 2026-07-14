-- Fix: purpose_records_insert used `employee_id = (SELECT id FROM employees WHERE user_id = auth.uid())`.
-- A scalar `=` against a subquery raises/denies the check whenever the subquery returns 0 or >1 rows
-- (e.g. employees.user_id linkage missing or duplicated), silently blocking the insert of
-- consent_purpose_records even though the consent_records master upsert (which already used IN)
-- succeeds — causing "consent submitted" to show while the Admin Consent Register has no row to read.
DROP POLICY IF EXISTS "purpose_records_insert" ON public.consent_purpose_records;
CREATE POLICY "purpose_records_insert" ON public.consent_purpose_records
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
  );
