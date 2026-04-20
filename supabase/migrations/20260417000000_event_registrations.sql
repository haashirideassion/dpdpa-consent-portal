create table if not exists event_registrations (
  id uuid primary key default gen_random_uuid(),
  prefix text,
  first_name text not null,
  last_name text not null,
  is_cii_member boolean not null,
  organization_name text not null,
  email text not null,
  mobile text,
  mobile_number text not null,
  consent_marketing boolean default false,
  consent_data_processing boolean not null default false,
  consent_third_party boolean not null default false,
  consent_photo_video boolean not null default false,
  consent_survey_sharing boolean not null default false,
  consent_whatsapp_alerts boolean default false,
  consent_networking boolean default false,
  consent_rights_acknowledged boolean default false,
  status text not null default 'submitted' check (status in ('draft', 'submitted')),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table event_registrations enable row level security;

create policy "Anyone can insert event registrations"
  on event_registrations for insert
  with check (true);

create policy "Admins can view all event registrations"
  on event_registrations for select
  using (has_role(auth.uid(), 'admin'));
