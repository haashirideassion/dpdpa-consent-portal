import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const payload = [
        {
            "employee_code": "EMP-1001",
            "first_name": "John",
            "last_name": "Doe",
            "email": "john.doe@company.com",
            "date_of_joining": "2023-01-15",
            "department": "Engineering",
            "designation": "Senior Developer",
            "employment_type": "Full-time",
            "work_location": "Bangalore"
        }
  ];
  
  const { data, error } = await supabase.rpc('bulk_import_employees', { payload });
  console.log('Result:', data);
  console.log('Error:', error);
}
test();
