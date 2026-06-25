# DPDPA Portal — PRD v2 Gap Analysis

**Date:** 2026-06-25  
**Analyst:** Claude Code  
**PRD:** PRD-DPDPA-Portal-Extension.md (v2, 2026-06-25)

---

## 1. Summary

| Status | Count |
|---|---|
| ✅ Already Implemented | 18 |
| ⚠️ Partially Implemented | 6 |
| ❌ Missing | 22 |

---

## 2. Role & Access Control

| Feature | Status | Notes |
|---|---|---|
| `admin` role | ✅ Implemented | `app_role` enum, has_role() fn |
| `employee` role | ✅ Implemented | RLS policies active |
| `hr_manager` role | ✅ Implemented | Sidebar access gated |
| **`dpo` role** | ❌ Missing | Need enum extension + policy updates |
| **`is_staff()` helper** | ❌ Missing | `admin OR dpo` helper function |

---

## 3. Module Gap Analysis

### M1 — Dashboard

| Feature | Status | Notes |
|---|---|---|
| Total Employees card | ✅ Implemented | Live from `employees` |
| Consented / Pending cards | ✅ Implemented | Live from `consent_logs` |
| Completion % card | ✅ Implemented | Computed |
| **Compliance Score** | ❌ Missing | Weighted blend formula needed |
| **Requests KPI cards** | ❌ Missing | Requires `data_requests` table |
| **Monthly Consent Trend** (recharts line) | ❌ Missing | recharts installed, not used |
| **Requests by Type** (recharts donut) | ❌ Missing | Requires `data_requests` |
| **Department Wise Completion** (recharts bar) | ❌ Missing | |
| **Latest Activities feed** | ❌ Missing | |
| **Recent Notifications panel** | ❌ Missing | `notifications` table exists |
| **AI Compliance Insights panel** | ❌ Missing | M9 dependency |

---

### M2 — Data Subject Requests (DSR)

| Feature | Status | Notes |
|---|---|---|
| `data_requests` table | ❌ Missing | Core table |
| `data_request_messages` table | ❌ Missing | Threading |
| Employee "My Requests" tab | ❌ Missing | New tab on employee portal |
| Employee "Raise a Request" form | ❌ Missing | |
| DPO request queue (`/admin/requests`) | ❌ Missing | Only basic `/admin/dpr` exists (read-only) |
| DPO request detail (`/admin/requests/$id`) | ❌ Missing | |
| SLA due date computation | ❌ Missing | |
| Overdue flag | ❌ Missing | |
| Status lifecycle (`new → closed`) | ❌ Missing | |
| Internal messages (DPO-only) | ❌ Missing | |
| RLS: principal sees own only | ❌ Missing | |

---

### M3 — Consent Management

| Feature | Status | Notes |
|---|---|---|
| `consent_purposes` register | ✅ Implemented | `consent_purposes` table in v2.0 migration |
| Per-purpose consent (employee) | ✅ Implemented | GranularConsentForm |
| Withdrawal (append-only) | ✅ Implemented | `consent_withdrawals` table |
| Consent history (employee) | ✅ Implemented | MyConsentsView |
| **DPO consent register view** | ❌ Missing | Org-wide status per employee × purpose |
| **Version drift view** | ❌ Missing | Who needs re-consent after version bump |
| **Withdrawal alerts (DPO)** | ❌ Missing | |

---

### M4 — Compliance Tracker

| Feature | Status | Notes |
|---|---|---|
| `compliance_items` table | ❌ Missing | |
| Compliance checklist UI | ❌ Missing | `/admin/compliance` route |
| DPDPA obligation seeds | ❌ Missing | |
| Contributes to Compliance Score | ❌ Missing | |

---

### M5 — Risk & Assessments

| Feature | Status | Notes |
|---|---|---|
| `risk_assessments` table | ❌ Missing | |
| Risk register UI | ❌ Missing | `/admin/risks` route |
| Risk matrix heatmap | ❌ Missing | recharts grid |
| Open high risks on dashboard | ❌ Missing | |

---

### M6 — Data Inventory (RoPA)

| Feature | Status | Notes |
|---|---|---|
| `data_inventory` table | ❌ Missing | |
| RoPA CRUD UI | ❌ Missing | `/admin/inventory` route |
| Pre-seeded from `employees` schema | ❌ Missing | |
| "Last reviewed > 12 months" flag | ❌ Missing | |

---

### M7 — Breach Management

| Feature | Status | Notes |
|---|---|---|
| `breach_incidents` table | ❌ Missing | |
| Breach log UI | ❌ Missing | `/admin/breaches` route |
| Notification checklist | ❌ Missing | Board + principals |
| Deadline countdown | ❌ Missing | |
| Overdue flag on dashboard | ❌ Missing | |

---

### M8 — Reports & Analytics

| Feature | Status | Notes |
|---|---|---|
| Reports page | ❌ Missing | `/admin/reports` route |
| Consent status report | ❌ Missing | |
| DSR / SLA performance report | ❌ Missing | |
| Breach register report | ❌ Missing | |
| RoPA export | ❌ Missing | |
| Compliance posture snapshot | ❌ Missing | |
| CSV export | ❌ Missing | |
| recharts on analytics | ❌ Missing | recharts installed but unused |

---

### M9 — AI Assistant

| Feature | Status | Notes |
|---|---|---|
| AI feature flag | ❌ Missing | Portal must work without AI |
| DSR triage suggestions | ❌ Missing | |
| Dashboard AI insights | ❌ Missing | |
| Compliance Q&A assistant | ❌ Missing | |
| Draft generation | ❌ Missing | |
| Server-side AI route | ❌ Missing | Never expose keys client-side |

---

### M10 — Notifications

| Feature | Status | Notes |
|---|---|---|
| `notifications` table | ✅ Implemented | Migration 20260504000005 |
| Bell icon dropdown | ✅ Implemented | NotificationDropdown component |
| **Trigger: new DSR** | ❌ Missing | Requires M2 |
| **Trigger: DSR overdue** | ❌ Missing | |
| **Trigger: consent withdrawn** | ⚠️ Partial | Withdrawal recorded but no notification created |
| **Trigger: breach logged** | ❌ Missing | |
| **Unread count badge** | ⚠️ Partial | Dropdown exists, badge unclear |
| **Mark all read** | ⚠️ Partial | May be partial |
| Email delivery | ❌ Missing | |

---

### M11 — Settings & Help

| Feature | Status | Notes |
|---|---|---|
| Settings page | ❌ Missing | `/admin/settings` |
| `app_settings` key-value table | ❌ Missing | |
| SLA targets per request type | ❌ Missing | |
| Compliance score weights | ❌ Missing | |
| Role management (grant DPO) | ❌ Missing | |
| AI feature toggle | ❌ Missing | |
| Help & Support page | ❌ Missing | `/admin/help` |
| DPDPA guidance / FAQ | ❌ Missing | |

---

### Cross-Cutting

| Feature | Status | Notes |
|---|---|---|
| `audit_logs` table | ✅ Implemented | Immutable, all admin actions |
| `audit_log` (global cross-module) | ⚠️ Partial | Existing covers consent/data; DSR/breach logs missing |
| RLS on all new tables | ❌ Missing | Needed for new tables |
| Navigation: new modules in sidebar | ❌ Missing | Only 5 links currently |
| Empty/loading/error states | ⚠️ Partial | Existing pages have these; new pages need them |
| No PII in URLs/logs | ✅ Implemented | Masking in audit logs |
| Seed data script | ❌ Missing | For demo |

---

## 4. Enhancement Gaps (Existing Features)

### Admin Dashboard
| Enhancement | Status |
|---|---|
| recharts (trend line, donut, bar) | ❌ Missing |
| Department-wise completion chart | ❌ Missing |
| Live KPIs from all modules | ❌ Missing |

### Employee List
| Enhancement | Status |
|---|---|
| Sorting columns | ❌ Missing |
| Pagination | ⚠️ Partial — client-side only |
| Completion % per employee | ❌ Missing |
| Consent % per employee | ❌ Missing |
| Attachment count column | ❌ Missing |
| Correction request count | ❌ Missing |
| Latest activity column | ❌ Missing |

### Employee Detail
| Enhancement | Status |
|---|---|
| Activity timeline | ❌ Missing |
| Section completion indicators | ❌ Missing |
| Profile completion % | ❌ Missing |
| Audit history on detail page | ❌ Missing |

### Consent Module
| Enhancement | Status |
|---|---|
| Version change indicator | ⚠️ Partial |
| Purpose detail info panel | ✅ Implemented |
| Consent timeline | ✅ Implemented (MyConsentsView) |
| Withdraw history | ✅ Implemented |

### Video Module
| Enhancement | Status |
|---|---|
| Upload progress bar | ✅ Implemented |
| Duration auto-detection | ✅ Implemented |
| Processing status | ✅ Implemented (draft/active/inactive) |
| Version history | ⚠️ Partial |
| Upload speed indicator | ❌ Missing |

### Bulk Import
| Enhancement | Status |
|---|---|
| CSV column mapping | ✅ Implemented |
| Date parsing (DD-MM-YYYY) | ✅ Implemented |
| Error reporting | ⚠️ Partial |
| Duplicate detection | ⚠️ Partial |
| Import preview | ⚠️ Partial |

### Audit Logs
| Enhancement | Status |
|---|---|
| Filter by action | ✅ Implemented |
| Filter by date | ✅ Implemented |
| Filter by email | ✅ Implemented |
| **CSV export** | ❌ Missing |
| Entity column | ✅ Implemented |

---

## 5. Delivery Phases (Implementation Order)

### Phase 1 — Core DPDPA Value (this sprint)
1. DPO role + `is_staff()` helper
2. New tables: `data_requests`, `data_request_messages`, `compliance_items`, `data_inventory`, `breach_incidents`, `risk_assessments`, `app_settings`
3. Dashboard upgrade (recharts + request KPIs + compliance score)
4. Admin sidebar navigation expansion
5. DSR module (M2) — admin queue + detail + employee raise
6. Compliance Tracker (M4)
7. Data Inventory / RoPA (M6)
8. Breach Management (M7)
9. Consent Management DPO view (M3)
10. Reports module (M8) — read views + CSV export
11. Risk & Assessments (M5)

### Phase 2 — Polish & AI
1. AI assistant (M9) — server-side, flag-gated
2. Settings & Help (M11)
3. Email notifications
4. Seed data script
