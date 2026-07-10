// Regression check for: "Add New Employee" saves successfully but Employee
// Details page shows blank fields immediately after creation.
//
// Flow: create employee (master + personal + contact detail tables) exactly
// like the Add Employee dialog does, then re-fetch it the way the Employee
// Details page does (EmployeeService.getById) and assert every field entered
// at creation time comes back non-null.
//
// Requires an authenticated admin session (RLS: employees_admin_insert /
// detail_tables_access_policy both require get_my_employee_role() = 'admin').
// Run with: node test_add_employee_regression.js
// Env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, plus TEST_ADMIN_EMAIL /
// TEST_ADMIN_PASSWORD for an existing admin account to sign in as.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const suffix = process.env.TEST_RUN_ID || String(Date.now());

const form = {
  first_name: 'Regression',
  last_name: `Test${suffix}`,
  employee_code: `EMP-REG-${suffix}`,
  work_email: `regression.test.${suffix}@company.com`,
  personal_email: `regression.personal.${suffix}@example.com`,
  phone_number: '9876543210',
  alternate_phone: '9123456780',
  gender: 'female',
  date_of_birth: '1990-05-15',
  marital_status: 'single',
  nationality: 'Indian',
  blood_group: 'O+',
  current_address: '123 Regression Street',
  permanent_address: '456 Permanent Avenue',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
};

async function run() {
  if (process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD) {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: process.env.TEST_ADMIN_EMAIL,
      password: process.env.TEST_ADMIN_PASSWORD,
    });
    if (authError) throw authError;
  }

  // 1. Create employee + every single-entry detail row atomically —
  // mirrors handleSave() in _authenticated.admin.employees.index.tsx
  const { data: empId, error: createError } = await supabase.rpc(
    'create_employee_with_details',
    {
      p_first_name: form.first_name,
      p_last_name: form.last_name,
      p_employee_code: form.employee_code,
      p_work_email: form.work_email,
      p_personal_email: form.personal_email,
      p_phone: form.phone_number,
      p_alternate_phone: form.alternate_phone,
      p_gender: form.gender,
      p_dob: form.date_of_birth,
      p_marital_status: form.marital_status,
      p_nationality: form.nationality,
      p_blood_group: form.blood_group,
      p_current_address: form.current_address,
      p_permanent_address: form.permanent_address,
      p_city: form.city,
      p_state: form.state,
      p_pincode: form.pincode,
    },
  );
  if (createError) throw createError;

  // 2. Assert every single-entry child table has exactly one linked row
  const singleEntryTables = [
    'employee_personal_details',
    'employee_contact_details',
    'employee_employment_details',
    'employee_financial_details',
    'employee_govt_ids',
    'employee_emergency_contacts',
    'employee_additional_details',
    'employee_health_info',
    'consent_records',
  ];
  const rowCountFailures = [];
  for (const table of singleEntryTables) {
    const { data: rows, error } = await supabase
      .from(table)
      .select('employee_id')
      .eq('employee_id', empId);
    if (error) throw error;
    if (!rows || rows.length !== 1) {
      rowCountFailures.push(`${table}: expected 1 linked row, found ${rows ? rows.length : 0}`);
    }
  }

  // 3. Re-fetch exactly like the Employee Details page does
  const { data: employee, error: fetchError } = await supabase
    .from('employees')
    .select(`
      *,
      employee_personal_details (*),
      employee_contact_details (*)
    `)
    .eq('id', empId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const DB_TO_UI = { dob: 'date_of_birth', phone: 'phone_number' };
  function aliasToUi(obj) {
    if (!obj) return {};
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[DB_TO_UI[k] ?? k] = v;
    return out;
  }
  const flattened = {
    ...employee,
    ...aliasToUi(employee.employee_personal_details),
    ...aliasToUi(employee.employee_contact_details),
  };

  const expected = {
    first_name: form.first_name,
    last_name: form.last_name,
    date_of_birth: form.date_of_birth,
    gender: form.gender,
    blood_group: form.blood_group,
    nationality: form.nationality,
    work_email: form.work_email,
    personal_email: form.personal_email,
    phone_number: form.phone_number,
    alternate_phone: form.alternate_phone,
    current_address: form.current_address,
    permanent_address: form.permanent_address,
    city: form.city,
    state: form.state,
    pincode: form.pincode,
  };

  const failures = [];
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = flattened[key];
    if (actual === null || actual === undefined || String(actual) !== String(expectedValue)) {
      failures.push(`${key}: expected "${expectedValue}", got "${actual}"`);
    }
  }

  // Cleanup regardless of pass/fail
  await supabase.from('employees').delete().eq('id', empId);

  const allFailures = [...rowCountFailures, ...failures];
  if (allFailures.length) {
    console.error('REGRESSION FAILED:');
    allFailures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('PASS: every single-entry child table has exactly one linked row, and all fields entered at creation were returned by Employee Details fetch.');
}

run().catch((err) => {
  console.error('Regression script error:', err);
  process.exit(1);
});
