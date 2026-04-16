

## Employee Data Consent Portal — Implementation Plan

### Overview
A DPDPA compliance portal where employees review their stored personal data, see highlighted sensitive fields, and submit auditable consent. Admins get a dashboard to monitor consent status across the workforce.

---

### 1. Database Schema & Seed Data
- **employees** table: personal info, contact, employment, payroll/banking, government IDs, emergency contacts
- **consent_logs** table: immutable append-only log (employee_id, consent_status, timestamp, consent_version, ip_address)
- **user_roles** table: role-based access (employee vs admin) using the secure `app_role` enum pattern
- **profiles** table: links Supabase auth users to employee records
- Seed ~50 realistic sample employees with Indian names, departments, Aadhaar/PAN numbers, bank details
- RLS policies: employees see only their own data, admins see all

### 2. Authentication — Azure AD SSO
- Configure Supabase Auth with Microsoft Azure AD as an OAuth provider
- You'll need to create an Azure AD App Registration and provide:
  - **Client ID** and **Client Secret**
  - **Redirect URI** pointing to your Supabase auth callback
- Login page with "Sign in with Microsoft" button
- After sign-in, map Azure AD user to employee record via email
- Role assignment: admin role granted via user_roles table

### 3. Employee Portal (authenticated employee view)

**Data Review Page** — structured, read-only view with collapsible sections:
- Personal Information (name, DOB, gender, photo)
- Contact Information (email, phone, address)
- Employment Information (department, role, joining date, reporting manager)
- Payroll & Banking (salary details, bank account, IFSC)
- Government Identification (Aadhaar, PAN, UAN, passport)
- Emergency Contacts
- Additional Metadata

**DPDPA Highlighting:**
- Sensitive fields (Aadhaar, PAN, bank details, phone, email, DOB, address, emergency contacts) get a distinct visual badge + shield icon
- Tooltip on each: "Protected Personal Data under DPDPA"
- Color-coded legend at top of page

**Consent Module:**
- Legal consent statement with version reference
- Mandatory checkbox: "I acknowledge and consent to the storage and processing of my personal data as described above"
- Submit button (disabled until checked)
- On submit: record consent log with timestamp, version, IP
- Post-submission: show confirmation with timestamp

### 4. Admin Dashboard

**Overview Metrics:**
- Total employees, consented count, pending count, completion percentage
- Visual progress bar/donut chart

**Employee List View:**
- Sortable, filterable table: Name, Employee ID, Department, Role, Consent Status, Last Consent Date
- Filters: consent status, department, search by name/ID, date range
- Pagination

**Employee Detail View:**
- Full employee profile (same sections as employee view)
- DPDPA field highlighting
- Consent history timeline (all consent log entries for that employee)

### 5. Design & UI
- **Color theme**: Light neutral backgrounds with blue accents — professional enterprise feel
- **Icons**: Solar Duotone icon set (via `solar-icon-set` package)
- **Layout**: Sidebar navigation for admin, clean single-column for employee view
- **Cards**: Rounded corners, subtle shadows, soft borders
- **Typography**: Clean sans-serif, good hierarchy
- **Responsive**: Works on desktop, tablet, and mobile
- **Accessibility**: High contrast, tooltips on all legal/highlighted elements

### 6. Routes Structure
- `/login` — Azure AD sign-in page
- `/` — Employee data review + consent (for employees)
- `/admin` — Admin dashboard with metrics
- `/admin/employees` — Employee list with filters
- `/admin/employees/$id` — Detailed employee view with consent history

### 7. Security
- Role-based access via `has_role()` security definer function
- Employee routes protected: can only see own data
- Admin routes protected: require admin role
- Consent logs are append-only (no update/delete)
- All API calls through server functions (not direct client queries for sensitive operations)

