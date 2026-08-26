# RLS Regression Test — Cross-Employee Access to Sensitive Data (MoM #9)

## Purpose

Confirms that Employee A cannot retrieve Employee B's Aadhaar/govt-ID, bank/financial,
or contact data through the Supabase REST API, and that Employee A can still read
their own record — i.e. that Row Level Security, not client-side UI masking, remains
the actual access-control boundary. This is a manual/staging test: no automated DB
test framework (pgTAP, etc.) exists in this repo yet, so this document is the
executable procedure until one is added.

Relevant policies: `supabase/migrations/20260503000002_fix_rls_recursion.sql`
(`employees_self_read`, `employees_admin_read`, and the equivalent per-detail-table
policies on `employee_govt_ids`, `employee_financial_details`,
`employee_contact_details`, etc.).

## Prerequisites

- A Supabase staging project (never run against production data for this).
- Two employee accounts already onboarded, "Employee A" and "Employee B", each with
  a row in `employees` linked via `user_id` to a real `auth.users` row, plus rows in
  `employee_govt_ids`, `employee_financial_details`, `employee_contact_details` for
  each.
- The project's `anon` key and URL (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in
  `.env`).
- A valid access token (JWT) for Employee A, obtained by signing in as Employee A
  (e.g. via the app's login flow, or `supabase.auth.signInWithPassword` in a scratch
  script) — call it `$EMP_A_JWT`. Note Employee B's `employees.id` — call it
  `$EMP_B_ID`.

## Test 1 — Employee A cannot read Employee B's sensitive rows

Run each of the following with `curl`, using Employee A's JWT:

```bash
curl -s "$SUPABASE_URL/rest/v1/employee_govt_ids?employee_id=eq.$EMP_B_ID&select=aadhaar,pan_number" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $EMP_A_JWT"

curl -s "$SUPABASE_URL/rest/v1/employee_financial_details?employee_id=eq.$EMP_B_ID&select=bank_account_number,ifsc" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $EMP_A_JWT"

curl -s "$SUPABASE_URL/rest/v1/employee_contact_details?employee_id=eq.$EMP_B_ID&select=phone,personal_email" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $EMP_A_JWT"

curl -s "$SUPABASE_URL/rest/v1/employees?id=eq.$EMP_B_ID&select=*" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $EMP_A_JWT"
```

**Expected result:** every call returns `200 OK` with an **empty JSON array `[]`**
(RLS silently filters the row out — it does not return a 403). If any call returns
Employee B's data, RLS has regressed and this must be fixed before anything else in
this task ships.

## Test 2 — Employee A can still read their own permitted record

Repeat the same four calls with `employee_id=eq.$EMP_A_ID` (Employee A's own
`employees.id`).

**Expected result:** each call returns Employee A's own row(s) with real values —
confirming Test 1's empty result is RLS scoping to owner, not a broken/over-restrictive
policy that blocks everyone.

## Test 3 — Admin can read both

Repeat Test 1's four calls using a JWT for a user whose `employees.role = 'admin'`.

**Expected result:** all four calls return the corresponding row for Employee B —
confirming admin access still works as intended and nothing in this change narrowed
it.

## Pass/fail criteria

- Test 1: **0 rows** returned for every table, every field, for Employee A against
  Employee B.
- Test 2: Employee A's own row returned correctly for every table.
- Test 3: Admin's request returns Employee B's row correctly for every table.

If Test 1 ever returns non-empty rows, treat it as a P0 regression — this task
(#9 Data Masking) does not touch RLS, so a failure here means something outside this
change (a new migration, a service-role key leak, a widened policy) has broken the
actual security boundary; UI masking cannot compensate for that.
