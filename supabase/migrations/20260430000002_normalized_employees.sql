-- ============================================================
-- NORMALIZED EMPLOYEE SCHEMA & CORRECTION SYSTEM
-- ============================================================

-- 1. Create enum for Consent Status
CREATE TYPE public.consent_status AS ENUM ('pending', 'submitted', 'consented');

-- 2. Master Employees Table
-- We will rename the old one if it exists to avoid conflicts
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employees' AND table_schema = 'public') THEN
    ALTER TABLE public.employees RENAME TO employees_old;
  END IF;
END $$;

CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  employee_code TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Detail Tables (Normalized)

-- Personal Details
CREATE TABLE public.employee_personal_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  dob DATE,
  gender TEXT,
  blood_group TEXT,
  marital_status TEXT,
  nationality TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Contact Details
CREATE TABLE public.employee_contact_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  work_email TEXT,
  personal_email TEXT,
  phone TEXT,
  alternate_phone TEXT,
  current_address TEXT,
  permanent_address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Employment Details
CREATE TABLE public.employee_employment_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  department TEXT,
  designation TEXT,
  joining_date DATE,
  employment_type TEXT,
  manager TEXT,
  work_location TEXT,
  status TEXT DEFAULT 'Active',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Financial Details
CREATE TABLE public.employee_financial_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  bank_name TEXT,
  bank_account_number TEXT,
  ifsc TEXT,
  pan TEXT,
  ctc TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Govt IDs
CREATE TABLE public.employee_govt_ids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  aadhaar TEXT,
  uan TEXT,
  passport TEXT,
  passport_expiry DATE,
  driving_license TEXT,
  voter_id TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Emergency Contacts
CREATE TABLE public.employee_emergency_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  contact_name TEXT,
  relation TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Additional Details
CREATE TABLE public.employee_additional_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  qualifications TEXT,
  certifications TEXT,
  languages TEXT,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. Correction Requests (HR Approval Flow)
CREATE TABLE public.correction_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  attachment_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE
);

-- 5. Consent Records (Status-based)
-- Rename existing to avoid conflict
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'consent_records' AND table_schema = 'public') THEN
    ALTER TABLE public.consent_records RENAME TO consent_records_old;
  END IF;
END $$;

CREATE TABLE public.consent_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE UNIQUE,
  status public.consent_status NOT NULL DEFAULT 'pending',
  signed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Update Profiles table to link to new employees
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_employee_id_fkey;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;

-- 7. RLS POLICIES (Data Isolation)

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_personal_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_contact_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_employment_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_financial_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_govt_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_additional_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;

-- Policy helper: is_admin or is_own_record
CREATE OR REPLACE FUNCTION public.is_authorized_employee(target_employee_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT EXISTS (
      SELECT 1 FROM public.employees
      WHERE id = target_employee_id AND user_id = auth.uid()
    ) OR public.has_role(auth.uid(), 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Master Employees Policy
CREATE POLICY "Employee Isolation" ON public.employees
  FOR ALL USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Detail Tables Policies
CREATE POLICY "Detail Access" ON public.employee_personal_details FOR ALL USING (public.is_authorized_employee(employee_id));
CREATE POLICY "Detail Access" ON public.employee_contact_details FOR ALL USING (public.is_authorized_employee(employee_id));
CREATE POLICY "Detail Access" ON public.employee_employment_details FOR ALL USING (public.is_authorized_employee(employee_id));
CREATE POLICY "Detail Access" ON public.employee_financial_details FOR ALL USING (public.is_authorized_employee(employee_id));
CREATE POLICY "Detail Access" ON public.employee_govt_ids FOR ALL USING (public.is_authorized_employee(employee_id));
CREATE POLICY "Detail Access" ON public.employee_emergency_contacts FOR ALL USING (public.is_authorized_employee(employee_id));
CREATE POLICY "Detail Access" ON public.employee_additional_details FOR ALL USING (public.is_authorized_employee(employee_id));

-- Correction Requests Policy
CREATE POLICY "Correction Access" ON public.correction_requests
  FOR ALL USING (public.is_authorized_employee(employee_id));

-- Consent Records Policy
CREATE POLICY "Consent Access" ON public.consent_records
  FOR ALL USING (public.is_authorized_employee(employee_id));

-- 8. UPSERT TRIGGER (Initializes detail rows on employee creation)
CREATE OR REPLACE FUNCTION public.initialize_employee_details()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.employee_personal_details (employee_id) VALUES (NEW.id);
  INSERT INTO public.employee_contact_details (employee_id) VALUES (NEW.id);
  INSERT INTO public.employee_employment_details (employee_id) VALUES (NEW.id);
  INSERT INTO public.employee_financial_details (employee_id) VALUES (NEW.id);
  INSERT INTO public.employee_govt_ids (employee_id) VALUES (NEW.id);
  INSERT INTO public.employee_emergency_contacts (employee_id) VALUES (NEW.id);
  INSERT INTO public.employee_additional_details (employee_id) VALUES (NEW.id);
  INSERT INTO public.consent_records (employee_id, status) VALUES (NEW.id, 'pending');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_employee_created
  AFTER INSERT ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.initialize_employee_details();
