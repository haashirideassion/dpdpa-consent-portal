# DPDPA Consent Portal — PRD v1.2 Upgrade Plan

## Codebase Snapshot (Current State)

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TanStack Router |
| Auth | Supabase Auth + Azure AD (Microsoft OAuth) |
| DB | Supabase (Postgres) + RLS |
| Roles | `admin` \| `employee` (single role per user) |
| Styling | Existing design system — **DO NOT CHANGE** |

---

## STEP 1 — Gap Analysis Tables

### A. HR Admin Login & Access Flow

| Feature | Current State | Required (PRD v1.2) | Gap | Priority |
|---|---|---|---|---|
| SSO (Azure AD) | ✅ Microsoft OAuth via Supabase | SAML / OAuth via Azure AD or Okta | Partially done — no Okta path, no SAML fallback | Medium |
| RBAC | Basic: `admin` \| `employee` only | Multi-role: `admin`, `hr_manager`, `dpo`, `employee` | Missing `hr_manager` and `dpo` roles, no granular permission gates | **High** |
| Multi-entity access restriction | ❌ None | Admin restricted to own org/entity | No org/entity scoping at all | **High** |
| Audit logging for login events | ❌ None | All login/logout events logged immutably | No audit_logs table or login event capture | **High** |
| Campaign preconditions | ❌ None | Campaign must have video + template before activation | No campaign system exists | **High** |
| Compliance metrics dashboard | Basic (total/consented/pending count) | Granular metrics: by dept, by purpose, video completion %, overdue | Missing breakdown by purpose, dept, video completion | **High** |
| Employee CSV bulk upload | ❌ None | HR uploads CSV to onboard employees | No upload flow or parser | **High** |
| Consent template editor | ❌ None | HR creates versioned consent templates | No template system | **High** |
| Send invite / re-consent trigger | ❌ None | HR triggers tokenized email invites | No campaign/invite system | **High** |
| DPO dashboard | ❌ None | DPO sees audit logs, DPR requests, breach reports | Entire DPO module missing | Medium |

---

### B. Employee Login & Consent Flow

| Feature | Current State | Required (PRD v1.2) | Gap | Priority |
|---|---|---|---|---|
| **Tokenized invite link** | ❌ None — direct SSO only | Secure token link via email, with expiry | Entirely missing | **High** |
| **Token expiry handling** | ❌ None | Token expires in 7 days, re-request flow | Missing | **High** |
| OTP fallback auth | ❌ None | OTP if SSO fails | Missing | Medium |
| **Mandatory Intro Video** | ❌ None | Non-skippable video before consent | Entire video module missing | **High** |
| **90% watch enforcement** | ❌ None | Cannot proceed until 90% watched | Missing gating logic | **High** |
| Language-based video | ❌ None | Video served by employee language pref | Missing | Medium |
| Captions support | ❌ None | VTT/SRT captions on player | Missing | Medium |
| Video resume/restart logic | ❌ None | Resume from last position on refresh | Missing | Medium |
| **Video audit metadata capture** | ❌ None | watch_time, completion_pct, captions_enabled logged | No video_events table | **High** |
| **Education module** | ❌ None | 7 DPDPA elements covered, mandatory before consent | Missing | **High** |
| Education module versioning | ❌ None | Version tracked per employee | Missing | **High** |
| Data review — categorized display | Partial (sections exist) | Grouped by: Personal, Contact, Employment, Financial, Govt ID | Sections exist but no sensitivity tier labeling beyond DPDPA badge | Medium |
| **Data masking for sensitive fields** | ❌ None | Aadhaar/PAN/Bank shown as `XXXX-XXXX-1234` | No masking logic at all | **High** |
| Source tagging per field | ❌ None | Each field shows data source (HRMS, Employee self) | Missing | Medium |
| Inline correction with approval | Save saves directly | Employee requests correction → HR approves | No approval workflow | Medium |
| **Granular purpose-based consent** | ❌ None — single checkbox | Per-purpose toggles: Payroll, Benefits, Compliance, Training, etc. | Entire granular consent model missing | **High** |
| **No pre-ticked checkboxes** | ❌ VIOLATION — checkbox starts unchecked but structure is monolithic | Each purpose toggle must start as OFF | Consent model redesign needed | **High** |
| Mandatory vs optional purposes | ❌ None | Mandatory purposes locked ON (cannot opt out) | Missing | **High** |
| Cross-border consent toggle | ❌ None | Separate toggle for data transfer outside India | Missing | **High** |
| Expandable purpose details | ❌ None | Each purpose has expandable "Why we need this" | Missing | Medium |
| **Explicit consent statement** | Single generic text | Per-purpose explicit text, non pre-ticked | Missing | **High** |
| **E-sign (typed name)** | ❌ None | Employee types name as digital signature | Missing | **High** |
| **Metadata capture on submit** | Partial (user_agent only, IP is null) | IP, device, browser, timestamps, video proof ref | IP capture missing, no video proof ref | **High** |
| **PDF certificate generation** | ❌ None | Downloadable consent certificate PDF | Missing | **High** |
| **My Consents dashboard** | ❌ None | Employee sees all consent history, current status | Missing | **High** |
| **Withdrawal flow** | ❌ None | Employee can withdraw specific consent with reason | Missing | **High** |
| Re-consent trigger | ❌ None | New consent version triggers re-consent campaign | Missing | **High** |

---

## STEP 2 — Missing Features by Severity

### 🔴 Critical — DPDPA Compliance Blockers

1. Granular purpose-based consent (no pre-tick, per-purpose toggles)
2. Mandatory intro video with 90% watch gate
3. Education module (7 DPDPA elements) before consent
4. E-sign / typed name on consent submission
5. Consent metadata: IP address, video proof reference
6. Immutable audit trail (append-only log with action tracking)
7. Consent withdrawal flow
8. PDF consent certificate generation
9. Data masking for Aadhaar, PAN, Bank Account, CTC
10. Tokenized invite links with expiry

### 🟡 Important — Audit / UX / Completeness

1. Campaign system (create, send invites, track completion)
2. Consent template versioning
3. HR bulk employee upload (CSV)
4. My Consents dashboard for employees
5. Source tagging on data fields
6. Video audit metadata (watch_time, completion_pct)
7. Multi-role RBAC (`hr_manager`, `dpo`)
8. Login event audit logging
9. DPR request workflow (DPO module)

### 🟢 Enhancements (Post-MVP)

1. OTP fallback authentication
2. Language-based video serving
3. Captions/VTT support on video player
4. Video resume logic
5. Inline data correction with HR approval workflow
6. Cross-border consent toggle
7. SCIM provisioning
8. ITSM integration (ServiceNow)
9. HRMS sync (Darwinbox / Workday)

---

## STEP 3 — Phased Implementation Plan

### PHASE 1 — Auth, RBAC & Invite System (Week 1–2)

**Goal:** Secure entry points; tokenized invite links; extended roles

- Extend `app_role` enum: add `hr_manager`, `dpo`
- Create `consent_invites` table (token, employee_id, campaign_id, expires_at, used_at, language)
- Add Supabase Edge Function: `generate-invite-token` (signs JWT with 7-day expiry)
- New route `/invite/:token` — validates token, sets session context, redirects to consent flow
- RBAC guards: update `_authenticated.admin.tsx` to check `hr_manager | admin`, add `/dpo` route for `dpo` role
- Capture login events: hook into `onAuthStateChange` → insert into `audit_logs`

---

### PHASE 2 — Video Module (Week 2–3)

**Goal:** Non-skippable intro video with 90% gate and audit capture

- Create `video_versions` table: `(id, title, url, language, version, is_active, created_at)`
- Create `video_events` table: `(id, employee_id, video_version_id, watch_time_seconds, completion_pct, captions_enabled, completed_at, session_id)`
- New component: `<IntroVideoPlayer>` — wraps `<video>` element
  - Disable seeking forward (block `timeupdate` manipulation)
  - Track `currentTime` / `duration` → compute completion %
  - On 90% reached: mark complete, insert `video_events` row, unlock next step
  - On page reload: resume from last `currentTime` stored in `localStorage` (session-scoped)
- New route: `/consent/video` — employee lands here after login if no video completion record
- Consent flow gate: check `video_events` for completion before rendering consent UI

---

### PHASE 3 — Education Module (Week 3)

**Goal:** DPDPA 7-element education before consent

- Create `education_modules` table: `(id, version, content_json, created_at)`
- Create `education_completions` table: `(id, employee_id, module_version, completed_at)`
- New component: `<EducationModule>` — step-through card UI (7 slides, one per DPDPA element):
  1. What is personal data?
  2. Your rights as a Data Principal
  3. How we collect your data
  4. Why we process it (purposes)
  5. Who we share it with
  6. How long we keep it
  7. How to withdraw consent
- Each slide has "Next" button; final slide has "I Understand" confirmation
- On completion: insert `education_completions` row
- Gate: consent UI only renders after education completion record exists

---

### PHASE 4 — Consent Engine Redesign (Week 3–4)

**Goal:** Replace single-checkbox with granular, purpose-based, DPDPA-compliant consent

#### New DB Tables

```sql
-- Consent Templates (versioned)
CREATE TABLE consent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,        -- e.g. 'v2.0'
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Consent Purposes (per template)
CREATE TABLE consent_purposes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES consent_templates(id),
  purpose_key TEXT NOT NULL,           -- 'payroll', 'benefits', 'compliance', 'training', 'cross_border'
  label TEXT NOT NULL,
  description TEXT NOT NULL,           -- Why we need this (expandable)
  is_mandatory BOOLEAN DEFAULT false,  -- If true: locked ON, cannot opt out
  legal_basis TEXT,                    -- DPDPA legal basis text
  display_order INT DEFAULT 0
);

-- Granular Consent Records (replaces simple consent_logs for new flow)
CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  template_id UUID REFERENCES consent_templates(id) NOT NULL,
  template_version TEXT NOT NULL,
  purpose_key TEXT NOT NULL,
  consented BOOLEAN NOT NULL,          -- true = granted, false = declined
  is_mandatory BOOLEAN DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  video_event_id UUID REFERENCES video_events(id),  -- proof of video watched
  esign_name TEXT,                     -- typed name as digital signature
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Consent Withdrawals
CREATE TABLE consent_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  purpose_key TEXT NOT NULL,
  reason TEXT,
  withdrawn_at TIMESTAMPTZ DEFAULT now()
);

-- Consent Certificates
CREATE TABLE consent_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) NOT NULL,
  template_version TEXT NOT NULL,
  certificate_url TEXT,                -- S3/Supabase Storage URL
  generated_at TIMESTAMPTZ DEFAULT now()
);
```

#### Frontend: Replace `<ConsentModule>`

- New `<GranularConsentForm>` component:
  - Renders one toggle card per `consent_purpose`
  - Mandatory purposes: toggle locked ON with legal basis shown
  - Optional purposes: toggle starts OFF (never pre-ticked)
  - Each purpose has expandable "Why we need this" panel
  - Cross-border toggle: separate section with DPDPA cross-border notice
- After all toggles: explicit statement + typed name e-sign field (required)
- Submit: validates e-sign not empty → inserts one `consent_records` row per purpose → generates certificate
- DPDPA validation: block submit if any mandatory purpose is unchecked (UI should prevent this but also validate server-side)

#### Metadata Capture on Submit

- IP address: call `https://api64.ipify.org?format=json` or use Supabase Edge Function to capture server-side IP from request headers
- Device/browser: `navigator.userAgent`
- `video_event_id`: reference the completed video event
- `esign_name`: typed name stored per consent record

#### PDF Certificate (Supabase Edge Function)

- Edge Function `generate-consent-certificate`:
  - Accepts `{ employee_id, template_version }`
  - Fetches employee + consent_records for this version
  - Generates PDF using `pdf-lib` or `puppeteer` (headless)
  - Uploads to Supabase Storage `/certificates/{employee_id}/{version}.pdf`
  - Inserts row in `consent_certificates`
  - Returns signed URL

---

### PHASE 5 — Data Review, Admin Dashboard & Audit (Week 4–5)

#### Data Masking

- In `DataField.tsx`: add masking logic for sensitive fields when NOT in edit mode:
  - `aadhaar_number`: `XXXX-XXXX-${last4}`
  - `pan_number`: `${first2}XXXXX${last3}`
  - `bank_account_number`: `XXXX${last4}`
  - `ctc`: mask entirely → show as `Confidential`

#### Source Tagging

- Add `data_sources` JSONB column to `employees` table (or separate table)
- Each field key maps to: `'hrms'` | `'employee'` | `'system'`
- `DataField` renders a small source badge

#### Audit Logs (Immutable)

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,       -- 'login', 'consent.granted', 'consent.withdrawn', 'video.completed', 'data.edited', 'dpr.created'
  entity_type TEXT,           -- 'employee', 'consent_record', etc.
  entity_id UUID,
  metadata JSONB,             -- flexible payload
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- NO UPDATE/DELETE RLS — append-only
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Append only" ON audit_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin/DPO read" ON audit_logs FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dpo'));
```

#### Campaign System

```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_id UUID REFERENCES consent_templates(id),
  video_version_id UUID REFERENCES video_versions(id),
  status TEXT DEFAULT 'draft',    -- 'draft', 'active', 'closed'
  created_by UUID REFERENCES auth.users(id),
  launched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- HR creates campaign → selects template + video → system validates both exist → activates
- On activate: generate invite tokens for all employees without valid consent for this template version

#### Admin Dashboard Enhancements

- Add metrics: completion by department, pending by campaign, video completion %
- Add consent purpose breakdown table (how many opted in/out per purpose)
- Add campaign list with status badges

#### My Consents (Employee)

- New tab in employee portal: "My Consents"
- Shows table of all `consent_records` grouped by `template_version`
- Shows current status per purpose (green = granted, red = withdrawn)
- "Withdraw" button per optional purpose → opens modal with reason field → inserts `consent_withdrawals` row + inserts `audit_logs` row

#### DPR Request Module (DPO)

```sql
CREATE TABLE dpr_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id),
  request_type TEXT NOT NULL,   -- 'access', 'correction', 'erasure', 'portability', 'nomination'
  description TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'rejected'
  assigned_to UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## STEP 4 — Technical Change Inventory

### New DB Tables (Migrations Required)

| Table | Purpose |
|---|---|
| `consent_invites` | Tokenized invite links |
| `video_versions` | Video metadata + versions |
| `video_events` | Per-employee video tracking |
| `education_modules` | DPDPA education content |
| `education_completions` | Per-employee education tracking |
| `consent_templates` | Versioned consent templates |
| `consent_purposes` | Per-template granular purposes |
| `consent_records` | Granular per-purpose consent (replaces consent_logs for new flow) |
| `consent_withdrawals` | Withdrawal history |
| `consent_certificates` | PDF certificate links |
| `campaigns` | HR campaign management |
| `audit_logs` | Immutable system-wide audit trail |
| `dpr_requests` | Data Principal Rights requests |

### Existing Tables — Modifications

| Table | Change |
|---|---|
| `employees` | Add `language_preference TEXT`, `data_sources JSONB` |
| `consent_logs` | Keep for backward-compat; new flow uses `consent_records` |
| `app_role` enum | Add `hr_manager`, `dpo` |

### New Frontend Files

| File | Purpose |
|---|---|
| `src/routes/invite.$token.tsx` | Tokenized invite entry route |
| `src/routes/_authenticated.consent.video.tsx` | Intro video step |
| `src/routes/_authenticated.consent.education.tsx` | Education module step |
| `src/routes/_authenticated.consent.review.tsx` | Data review step |
| `src/routes/_authenticated.consent.sign.tsx` | Granular consent + e-sign step |
| `src/routes/_authenticated.my-consents.tsx` | Employee consent history |
| `src/routes/_authenticated.admin.campaigns.tsx` | Campaign management |
| `src/routes/_authenticated.admin.audit.tsx` | Audit log viewer (DPO/Admin) |
| `src/routes/_authenticated.admin.dpr.tsx` | DPR request management |
| `src/components/IntroVideoPlayer.tsx` | Non-skippable video player |
| `src/components/EducationModule.tsx` | 7-slide DPDPA education |
| `src/components/GranularConsentForm.tsx` | Purpose-based consent UI |
| `src/components/ConsentWithdrawModal.tsx` | Withdrawal flow modal |
| `src/services/consent.service.ts` | Consent CRUD operations |
| `src/services/video.service.ts` | Video event tracking |
| `src/services/audit.service.ts` | Audit log insertion helper |
| `src/services/certificate.service.ts` | PDF certificate generation call |

### Modified Frontend Files

| File | Change |
|---|---|
| `src/components/DataField.tsx` | Add masking logic for sensitive fields; add source badge |
| `src/components/ConsentModule.tsx` | Replace with redirect to new granular flow |
| `src/routes/_authenticated.index.tsx` | Add consent flow gating (video → education → review → sign) |
| `src/routes/_authenticated.admin.tsx` | Extend nav with Campaigns, Audit, DPR links |
| `src/hooks/use-auth.tsx` | Extend to expose `hr_manager`, `dpo` roles |
| `src/lib/dpdpa.ts` | Add `CONSENT_PURPOSES` config array |

### New Supabase Edge Functions

| Function | Purpose |
|---|---|
| `generate-invite-token` | Creates signed token for employee invite |
| `validate-invite-token` | Validates token, returns employee context |
| `generate-consent-certificate` | Generates + uploads PDF certificate |
| `capture-ip-address` | Server-side IP capture for consent metadata |

---

## STEP 5 — Consent Flow State Machine

```
[Invite Email Link]
      ↓
[/invite/:token] — validate token, set session
      ↓
[SSO Login] — Azure AD
      ↓ (if no video_events.completed_at for employee)
[/consent/video] — IntroVideoPlayer (90% gate)
      ↓ (if no education_completions for current module version)
[/consent/education] — EducationModule (7 slides)
      ↓
[/consent/review] — EmployeeDataView (read-only with masking + source tags)
      ↓
[/consent/sign] — GranularConsentForm + e-sign
      ↓ (on submit)
[generate-consent-certificate Edge Fn]
      ↓
[/my-consents] — Certificate download available
```

### Edge Cases

| Case | Handling |
|---|---|
| Token expired | Show "Link expired" page with "Request new link" CTA |
| Token already used | Check `used_at`, show "Already submitted" if consent exists |
| Video dropped mid-way | Resume from `localStorage` position on reload |
| Video <90% completed | "Continue Watching" — next button stays disabled |
| Education not completed | Redirect back to `/consent/education` |
| Mandatory purpose declined | Block submission, show inline error |
| E-sign name empty | Block submission, show inline error |
| Certificate generation fails | Show retry button; consent still recorded |
| Employee has no profile link | Show "Contact HR" page, log to audit |

---

## Verification Plan

### Automated
- Supabase migration dry-run (`supabase db push --dry-run`)
- TypeScript compilation: `tsc --noEmit`

### Manual QA Flow
1. HR creates campaign → selects template + video → activates
2. System generates invite token → employee receives link
3. Employee clicks link → validates → SSO login
4. Video player loads → cannot skip → 90% reached → unlocks next
5. Education module → 7 slides → "I Understand"
6. Data review → sensitive fields masked
7. Granular consent → mandatory locked ON → optional starts OFF → expand details
8. E-sign typed name → Submit
9. PDF certificate generated → downloadable
10. Admin dashboard shows updated completion metrics
11. Audit log shows all steps with timestamps
12. Employee withdrawal → reason modal → consent_withdrawals record created

> [!IMPORTANT]
> The consent flow is a **strict linear gate**: video → education → review → sign. No step can be skipped. This is a DPDPA compliance requirement.

> [!WARNING]
> The existing `consent_logs` table should be **preserved** for backward compatibility. The new `consent_records` table handles all new granular consent. The admin dashboard must query both tables during the transition.

> [!NOTE]
> No UI theme, styling, fonts, or design tokens are changed at any point. All new components follow the existing shadcn/ui + solar-icon-set + CSS variable pattern.
