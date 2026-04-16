import type { Tables } from '@/integrations/supabase/types';
import { DataSection } from './DataSection';
import {
  UserBoldDuotone,
  PhoneBoldDuotone,
  CaseMinimalisticBoldDuotone,
  CardBoldDuotone,
  PassportBoldDuotone,
  HospitalBoldDuotone,
  DocumentTextBoldDuotone,
} from 'solar-icon-set';

type Employee = Tables<'employees'>;

interface EmployeeDataViewProps {
  employee: Employee;
}

export function EmployeeDataView({ employee }: EmployeeDataViewProps) {
  const e = employee;

  const personalFields = [
    { label: 'First Name', key: 'first_name', value: e.first_name },
    { label: 'Last Name', key: 'last_name', value: e.last_name },
    { label: 'Date of Birth', key: 'date_of_birth', value: e.date_of_birth },
    { label: 'Gender', key: 'gender', value: e.gender },
    { label: 'Blood Group', key: 'blood_group', value: e.blood_group },
    { label: 'Marital Status', key: 'marital_status', value: e.marital_status },
    { label: 'Nationality', key: 'nationality', value: e.nationality },
  ];

  const contactFields = [
    { label: 'Work Email', key: 'work_email', value: e.work_email },
    { label: 'Personal Email', key: 'personal_email', value: e.personal_email },
    { label: 'Phone Number', key: 'phone_number', value: e.phone_number },
    { label: 'Alternate Phone', key: 'alternate_phone', value: e.alternate_phone },
    { label: 'Current Address', key: 'current_address', value: e.current_address },
    { label: 'Permanent Address', key: 'permanent_address', value: e.permanent_address },
    { label: 'City', key: 'city', value: e.city },
    { label: 'State', key: 'state', value: e.state },
    { label: 'Pincode', key: 'pincode', value: e.pincode },
  ];

  const employmentFields = [
    { label: 'Employee ID', key: 'employee_id', value: e.employee_id },
    { label: 'Department', key: 'department', value: e.department },
    { label: 'Designation', key: 'designation', value: e.designation },
    { label: 'Date of Joining', key: 'date_of_joining', value: e.date_of_joining },
    { label: 'Employment Type', key: 'employment_type', value: e.employment_type },
    { label: 'Reporting Manager', key: 'reporting_manager', value: e.reporting_manager },
    { label: 'Work Location', key: 'work_location', value: e.work_location },
    { label: 'Status', key: 'employee_status', value: e.employee_status },
  ];

  const payrollFields = [
    { label: 'Bank Name', key: 'bank_name', value: e.bank_name },
    { label: 'Bank Account Number', key: 'bank_account_number', value: e.bank_account_number },
    { label: 'IFSC Code', key: 'ifsc_code', value: e.ifsc_code },
    { label: 'PAN Number', key: 'pan_number', value: e.pan_number },
    { label: 'CTC', key: 'ctc', value: e.ctc },
  ];

  const govtFields = [
    { label: 'Aadhaar Number', key: 'aadhaar_number', value: e.aadhaar_number },
    { label: 'UAN Number', key: 'uan_number', value: e.uan_number },
    { label: 'Passport Number', key: 'passport_number', value: e.passport_number },
    { label: 'Passport Expiry', key: 'passport_expiry', value: e.passport_expiry },
    { label: 'Driving License', key: 'driving_license', value: e.driving_license },
    { label: 'Voter ID', key: 'voter_id', value: e.voter_id },
  ];

  const emergencyFields = [
    { label: 'Contact Name', key: 'emergency_contact_name', value: e.emergency_contact_name },
    { label: 'Relation', key: 'emergency_contact_relation', value: e.emergency_contact_relation },
    { label: 'Contact Phone', key: 'emergency_contact_phone', value: e.emergency_contact_phone },
    { label: 'Contact Email', key: 'emergency_contact_email', value: e.emergency_contact_email },
  ];

  const metadataFields = [
    { label: 'Qualifications', key: 'qualifications', value: e.qualifications },
    { label: 'Certifications', key: 'certifications', value: e.certifications },
    { label: 'Languages', key: 'languages', value: e.languages },
    { label: 'Notes', key: 'notes', value: e.notes },
  ];

  return (
    <div className="space-y-4">
      <DataSection title="Personal Information" icon={<UserBoldDuotone size={20} />} fields={personalFields} />
      <DataSection title="Contact Information" icon={<PhoneBoldDuotone size={20} />} fields={contactFields} />
      <DataSection title="Employment Information" icon={<CaseMinimalisticBoldDuotone size={20} />} fields={employmentFields} />
      <DataSection title="Payroll & Banking" icon={<CardBoldDuotone size={20} />} fields={payrollFields} />
      <DataSection title="Government Identification" icon={<PassportBoldDuotone size={20} />} fields={govtFields} />
      <DataSection title="Emergency Contact" icon={<HospitalBoldDuotone size={20} />} fields={emergencyFields} />
      <DataSection title="Additional Information" icon={<DocumentTextBoldDuotone size={20} />} fields={metadataFields} defaultOpen={false} />
    </div>
  );
}
