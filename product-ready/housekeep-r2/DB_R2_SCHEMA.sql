begin;

create table if not exists public.housekeep_product_versions (
  product_code text primary key,
  db_version text not null,
  adapter_version text not null,
  frontend_version text not null,
  worker_version text not null,
  standard_version text not null default 'DPRO_PRODUCT_READY_STANDARD_V1.0',
  updated_at timestamptz not null default now()
);

create table if not exists public.housekeep_owner_credentials (
  company_code text primary key references public.housekeep_companies(company_code) on delete cascade,
  algorithm text not null default 'PBKDF2-SHA256',
  salt_b64 text not null,
  iterations integer not null check (iterations >= 100000),
  hash_b64 text not null,
  is_demo_only boolean not null default false,
  is_active boolean not null default true,
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.housekeep_line_bindings (
  company_code text primary key references public.housekeep_companies(company_code) on delete cascade,
  liff_id text,
  channel_id text,
  binding_status text not null default 'deferred_until_contract' check (binding_status in ('deferred_until_contract','bound','disabled')),
  bound_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.housekeep_staff_sessions (
  id uuid primary key default gen_random_uuid(),
  company_code text not null references public.housekeep_companies(company_code) on delete cascade,
  staff_id uuid not null references public.housekeep_staff(id) on delete cascade,
  token_hash text not null unique,
  capabilities jsonb not null default '[]'::jsonb,
  issued_by text not null default 'owner',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists housekeep_staff_sessions_company_staff_idx on public.housekeep_staff_sessions(company_code, staff_id);
create index if not exists housekeep_staff_sessions_expiry_idx on public.housekeep_staff_sessions(expires_at) where revoked_at is null;

create table if not exists public.housekeep_calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  company_code text not null references public.housekeep_companies(company_code) on delete cascade,
  target_date date not null,
  exception_type text not null check (exception_type in ('temporary_closed','special_open')),
  open_time time,
  close_time time,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_code, target_date),
  check ((exception_type='temporary_closed' and open_time is null and close_time is null) or
         (exception_type='special_open' and open_time is not null and close_time is not null and open_time < close_time))
);

create table if not exists public.housekeep_demo_runs (
  id uuid primary key default gen_random_uuid(),
  company_code text not null references public.housekeep_companies(company_code) on delete cascade,
  action text not null,
  result text not null,
  requested_by text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.housekeep_product_versions enable row level security;
alter table public.housekeep_owner_credentials enable row level security;
alter table public.housekeep_line_bindings enable row level security;
alter table public.housekeep_staff_sessions enable row level security;
alter table public.housekeep_calendar_exceptions enable row level security;
alter table public.housekeep_demo_runs enable row level security;

revoke all on public.housekeep_product_versions from anon, authenticated;
revoke all on public.housekeep_owner_credentials from anon, authenticated;
revoke all on public.housekeep_line_bindings from anon, authenticated;
revoke all on public.housekeep_staff_sessions from anon, authenticated;
revoke all on public.housekeep_calendar_exceptions from anon, authenticated;
revoke all on public.housekeep_demo_runs from anon, authenticated;

insert into public.housekeep_product_versions(product_code, db_version, adapter_version, frontend_version, worker_version, standard_version)
values ('HOUSEKEEP','HOUSEKEEP-DB-PR2-20260824','HOUSEKEEP-PR2-GATEWAY-20260824','HOUSEKEEP-8-PR2-FRONTEND-20260824','HOUSEKEEP-8-PR2-GATEWAY-20260824','DPRO_PRODUCT_READY_STANDARD_V1.0')
on conflict (product_code) do update set
  db_version=excluded.db_version,
  adapter_version=excluded.adapter_version,
  frontend_version=excluded.frontend_version,
  worker_version=excluded.worker_version,
  standard_version=excluded.standard_version,
  updated_at=now();

insert into public.housekeep_owner_credentials(company_code, algorithm, salt_b64, iterations, hash_b64, is_demo_only, is_active)
select 'dpro_housekeep_demo','PBKDF2-SHA256','B6GaREGpBtnvwRsr0B+5iw==',210000,'ouZfXnphyzOcMfrf7+5NufshM6VRKfKWvuIeV/5ybgI=',true,true
where exists (select 1 from public.housekeep_companies where company_code='dpro_housekeep_demo' and is_demo=true)
on conflict (company_code) do update set
  algorithm=excluded.algorithm,
  salt_b64=excluded.salt_b64,
  iterations=excluded.iterations,
  hash_b64=excluded.hash_b64,
  is_demo_only=excluded.is_demo_only,
  is_active=excluded.is_active,
  rotated_at=now();

insert into public.housekeep_line_bindings(company_code, liff_id, channel_id, binding_status)
select company_code, null, null, 'deferred_until_contract'
from public.housekeep_companies
where company_code='dpro_housekeep_demo'
on conflict (company_code) do update set
  binding_status=case when public.housekeep_line_bindings.binding_status='bound' then 'bound' else 'deferred_until_contract' end,
  updated_at=now();

commit;
