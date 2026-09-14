-- Framique baseline schema (reconstructed from the generated type contract).
-- Enums, tables, keys, indexes, updated_at triggers, grants and RLS.

-- ============================ enums ============================
do $$ begin create type public.address_type as enum ('shipping', 'billing'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ai_channel as enum ('widget', 'admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ai_conversation_status as enum ('open', 'needs_agent', 'resolved', 'closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ai_message_role as enum ('customer', 'bot', 'agent'); exception when duplicate_object then null; end $$;
do $$ begin create type public.api_key_env as enum ('test', 'live'); exception when duplicate_object then null; end $$;
do $$ begin create type public.approval_status as enum ('pending', 'approved', 'rejected', 'expired', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.billing_plan as enum ('launch', 'growth', 'business', 'enterprise'); exception when duplicate_object then null; end $$;
do $$ begin create type public.catalog_status as enum ('draft', 'active', 'archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.charge_intent_status as enum ('initiated', 'pending', 'paid', 'failed', 'expired', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.cod_recon_status as enum ('pending', 'matched', 'variance', 'cleared'); exception when duplicate_object then null; end $$;
do $$ begin create type public.consent_channel as enum ('email', 'sms', 'push'); exception when duplicate_object then null; end $$;
do $$ begin create type public.consent_purpose as enum ('marketing', 'cart_recovery', 'stock_alerts'); exception when duplicate_object then null; end $$;
do $$ begin create type public.coupon_status as enum ('draft', 'active', 'paused', 'expired'); exception when duplicate_object then null; end $$;
do $$ begin create type public.coupon_type as enum ('fixed', 'percent', 'bogo', 'free_shipping'); exception when duplicate_object then null; end $$;
do $$ begin create type public.export_job_status as enum ('queued', 'generating', 'signing', 'ready_for_download', 'downloaded', 'expired', 'fail_retry'); exception when duplicate_object then null; end $$;
do $$ begin create type public.export_object_type as enum ('orders', 'products', 'customers', 'product_events', 'analytics_raw'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fraud_blacklist_kind as enum ('phone', 'email'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fraud_case_status as enum ('open', 'evidence_requested', 'approved', 'rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.invoice_status as enum ('open', 'paid', 'past_due', 'void'); exception when duplicate_object then null; end $$;
do $$ begin create type public.kyc_state as enum ('pending', 'submitted', 'verified', 'rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.kyc_status as enum ('pending', 'verified', 'rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.market_install_status as enum ('installed', 'trial', 'paused', 'rolled_back'); exception when duplicate_object then null; end $$;
do $$ begin create type public.market_kind as enum ('theme', 'widget'); exception when duplicate_object then null; end $$;
do $$ begin create type public.market_listing_status as enum ('draft', 'review', 'active', 'paused', 'archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.merchant_role as enum ('owner', 'admin', 'staff', 'viewer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.merchant_status as enum ('active', 'suspended', 'pending'); exception when duplicate_object then null; end $$;
do $$ begin create type public.notification_severity as enum ('info', 'warning', 'critical'); exception when duplicate_object then null; end $$;
do $$ begin create type public.order_status as enum ('pending', 'payment_pending', 'confirmed', 'paid', 'fulfilled', 'cancelled', 'refunded', 'packed', 'shipped', 'delivered', 'refund_requested'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_method as enum ('cod', 'bkash', 'nagad', 'rocket'); exception when duplicate_object then null; end $$;
do $$ begin create type public.pos_order_status as enum ('local_pending', 'synced', 'paid', 'delivered', 'voided'); exception when duplicate_object then null; end $$;
do $$ begin create type public.pos_origin as enum ('offline', 'online'); exception when duplicate_object then null; end $$;
do $$ begin create type public.pos_payment_method as enum ('cash', 'card', 'cod'); exception when duplicate_object then null; end $$;
do $$ begin create type public.pos_session_status as enum ('open', 'closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.product_kind as enum ('physical', 'digital', 'service', 'subscription'); exception when duplicate_object then null; end $$;
do $$ begin create type public.product_status as enum ('draft', 'active', 'archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.review_status as enum ('pending', 'published', 'rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.settlement_file_status as enum ('received', 'parsed', 'matched', 'posted', 'rejected', 'variance_hold'); exception when duplicate_object then null; end $$;
do $$ begin create type public.shipment_status as enum ('created', 'pickup_scheduled', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_attempt', 'returned'); exception when duplicate_object then null; end $$;
do $$ begin create type public.staff_mfa_status as enum ('none', 'enrolled', 'enforced'); exception when duplicate_object then null; end $$;
do $$ begin create type public.staff_status as enum ('invited', 'active', 'suspended', 'removed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.subscription_status as enum ('trial', 'active', 'past_due', 'paused', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.sync_status as enum ('pending', 'synced', 'failed'); exception when duplicate_object then null; end $$;

-- ======================= shared utilities =======================
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.is_platform_admin(_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = _user_id)
$$;

create or replace function public.is_merchant_member(_merchant_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merchant_members m
    where m.merchant_id = _merchant_id and m.user_id = _user_id and m.status = 'active'
  )
$$;

create or replace function public.is_merchant_admin(_merchant_id uuid, _user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merchant_members m
    where m.merchant_id = _merchant_id and m.user_id = _user_id
      and m.status = 'active' and m.role in ('owner','admin')
  )
$$;

grant execute on function public.is_platform_admin(uuid) to authenticated, service_role;
grant execute on function public.is_merchant_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_merchant_admin(uuid, uuid) to authenticated, service_role;

-- ============================ tables ============================
create table if not exists public.auth_events (
  created_at timestamptz default now() not null,
  detail jsonb default '{}'::jsonb not null,
  email_hash text,
  event text not null,
  id uuid default gen_random_uuid() not null,
  ip_hash text,
  outcome text not null,
  user_agent text,
  user_id uuid,
  primary key (id)
);
create index if not exists auth_events_created_idx on public.auth_events (created_at desc);
grant select, insert, update, delete on public.auth_events to authenticated;
grant all on public.auth_events to service_role;
alter table public.auth_events enable row level security;
create policy "auth_events_self" on public.auth_events for all to authenticated
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());

create table if not exists public.auth_sessions (
  aal text,
  created_at timestamptz default now() not null,
  device text,
  id uuid default gen_random_uuid() not null,
  ip_hash text,
  last_seen_at timestamptz default now() not null,
  revoked_at timestamptz,
  session_id uuid not null,
  user_id uuid not null,
  primary key (id)
);
create index if not exists auth_sessions_created_idx on public.auth_sessions (created_at desc);
grant select, insert, update, delete on public.auth_sessions to authenticated;
grant all on public.auth_sessions to service_role;
alter table public.auth_sessions enable row level security;
create policy "auth_sessions_self" on public.auth_sessions for all to authenticated
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());

create table if not exists public.fx_rates (
  base_currency text not null,
  created_at timestamptz default now() not null,
  effective_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  quote_currency text not null,
  rate_ppm bigint not null,
  source text not null,
  primary key (id)
);
create index if not exists fx_rates_created_idx on public.fx_rates (created_at desc);
grant select, insert, update, delete on public.fx_rates to authenticated;
grant all on public.fx_rates to service_role;
alter table public.fx_rates enable row level security;
create policy "fx_rates_platform_only" on public.fx_rates for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.merchants (
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  id uuid default gen_random_uuid() not null,
  kyc_status public.kyc_status default 'pending'::public.kyc_status not null,
  name text not null,
  slug text not null,
  status public.merchant_status default 'active'::public.merchant_status not null,
  updated_at timestamptz default now() not null,
  vat_registration_no text,
  primary key (id)
);
create index if not exists merchants_created_idx on public.merchants (created_at desc);
create trigger merchants_set_updated_at before update on public.merchants for each row execute function public.set_updated_at();
create unique index if not exists merchants_slug_uq on public.merchants (slug);
grant select, insert, update, delete on public.merchants to authenticated;
grant all on public.merchants to service_role;
alter table public.merchants enable row level security;
create policy "merchants_read" on public.merchants for select to authenticated
  using (public.is_merchant_member(id) or public.is_platform_admin());
create policy "merchants_manage" on public.merchants for all to authenticated
  using (public.is_merchant_admin(id) or public.is_platform_admin())
  with check (public.is_merchant_admin(id) or public.is_platform_admin());

create table if not exists public.ops_backup_runs (
  artifact_ref text,
  checks jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  created_by uuid,
  finished_at timestamptz,
  id uuid default gen_random_uuid() not null,
  kind text not null,
  notes text,
  rows_verified bigint default 0 not null,
  scope text default '' not null,
  started_at timestamptz default now() not null,
  status text default '' not null,
  primary key (id)
);
create index if not exists ops_backup_runs_created_idx on public.ops_backup_runs (created_at desc);
grant select, insert, update, delete on public.ops_backup_runs to authenticated;
grant all on public.ops_backup_runs to service_role;
alter table public.ops_backup_runs enable row level security;
create policy "ops_backup_runs_platform_only" on public.ops_backup_runs for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.ops_incidents (
  components text[] default '{}'::text[] not null,
  created_at timestamptz default now() not null,
  created_by uuid,
  id uuid default gen_random_uuid() not null,
  is_public boolean default false not null,
  resolved_at timestamptz,
  severity text default '' not null,
  started_at timestamptz default now() not null,
  status text default '' not null,
  title text not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
create index if not exists ops_incidents_created_idx on public.ops_incidents (created_at desc);
create trigger ops_incidents_set_updated_at before update on public.ops_incidents for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.ops_incidents to authenticated;
grant all on public.ops_incidents to service_role;
alter table public.ops_incidents enable row level security;
create policy "ops_incidents_platform_only" on public.ops_incidents for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.ops_retention_runs (
  cutoff text not null,
  deleted_rows bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  ran_at timestamptz default now() not null,
  table_name text not null,
  primary key (id)
);
grant select, insert, update, delete on public.ops_retention_runs to authenticated;
grant all on public.ops_retention_runs to service_role;
alter table public.ops_retention_runs enable row level security;
create policy "ops_retention_runs_platform_only" on public.ops_retention_runs for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.ops_status_components (
  key text not null,
  label text not null,
  position bigint default 0 not null,
  state text default '' not null,
  updated_at timestamptz default now() not null
);
create trigger ops_status_components_set_updated_at before update on public.ops_status_components for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.ops_status_components to authenticated;
grant all on public.ops_status_components to service_role;
alter table public.ops_status_components enable row level security;
create policy "ops_status_components_platform_only" on public.ops_status_components for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.order_status_transitions (
  from_status public.order_status not null,
  to_status public.order_status not null
);
grant select, insert, update, delete on public.order_status_transitions to authenticated;
grant all on public.order_status_transitions to service_role;
alter table public.order_status_transitions enable row level security;
create policy "order_status_transitions_platform_only" on public.order_status_transitions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.plan_definitions (
  active boolean default false not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  feature_flags jsonb default '{}'::jsonb not null,
  features jsonb default '{}'::jsonb not null,
  payment_methods_allowed jsonb default '{}'::jsonb not null,
  plan public.billing_plan not null,
  price_minor_int bigint,
  products_limit bigint default 0 not null,
  sort_order bigint default 0 not null,
  staff_limit bigint default 0 not null,
  title_bn text not null,
  title_en text not null,
  trial_days bigint default 0 not null,
  updated_at timestamptz default now() not null
);
create index if not exists plan_definitions_created_idx on public.plan_definitions (created_at desc);
create trigger plan_definitions_set_updated_at before update on public.plan_definitions for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.plan_definitions to authenticated;
grant all on public.plan_definitions to service_role;
alter table public.plan_definitions enable row level security;
create policy "plan_definitions_platform_only" on public.plan_definitions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.platform_admins (
  created_at timestamptz default now() not null,
  user_id uuid not null,
  primary key (user_id)
);
create index if not exists platform_admins_created_idx on public.platform_admins (created_at desc);
grant select, insert, update, delete on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;
create policy "platform_admins_read" on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

create table if not exists public.platform_audit_log (
  action text not null,
  actor text,
  after_data jsonb default '{}'::jsonb not null,
  before_data jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  entity text not null,
  entity_id uuid,
  id uuid default gen_random_uuid() not null,
  scope text default '' not null,
  primary key (id)
);
create index if not exists platform_audit_log_created_idx on public.platform_audit_log (created_at desc);
grant select, insert, update, delete on public.platform_audit_log to authenticated;
grant all on public.platform_audit_log to service_role;
alter table public.platform_audit_log enable row level security;
create policy "platform_audit_log_platform_only" on public.platform_audit_log for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.platform_flags (
  created_at timestamptz default now() not null,
  key text not null,
  updated_at timestamptz default now() not null,
  updated_by uuid,
  value jsonb default '{}'::jsonb not null
);
create index if not exists platform_flags_created_idx on public.platform_flags (created_at desc);
create trigger platform_flags_set_updated_at before update on public.platform_flags for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.platform_flags to authenticated;
grant all on public.platform_flags to service_role;
alter table public.platform_flags enable row level security;
create policy "platform_flags_platform_only" on public.platform_flags for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.profiles (
  created_at timestamptz default now() not null,
  email text,
  full_name text,
  id uuid not null,
  phone text,
  updated_at timestamptz default now() not null,
  primary key (id)
);
create index if not exists profiles_created_idx on public.profiles (created_at desc);
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_self" on public.profiles for all to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

create table if not exists public.rate_limit_counters (
  bucket text not null,
  hits bigint default 0 not null,
  subject text not null,
  window_start text not null
);
grant select, insert, update, delete on public.rate_limit_counters to authenticated;
grant all on public.rate_limit_counters to service_role;
alter table public.rate_limit_counters enable row level security;
create policy "rate_limit_counters_platform_only" on public.rate_limit_counters for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.refund_status_transitions (
  from_status text not null,
  to_status text not null
);
grant select, insert, update, delete on public.refund_status_transitions to authenticated;
grant all on public.refund_status_transitions to service_role;
alter table public.refund_status_transitions enable row level security;
create policy "refund_status_transitions_platform_only" on public.refund_status_transitions for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.theme_registry (
  active boolean default false not null,
  category text default '' not null,
  created_at timestamptz default now() not null,
  key text not null,
  name_bn text not null,
  name_en text not null,
  preset jsonb default '{}'::jsonb not null,
  sort_order bigint default 0 not null,
  summary_bn text default '' not null,
  summary_en text default '' not null,
  updated_at timestamptz default now() not null,
  version text default '' not null
);
create index if not exists theme_registry_created_idx on public.theme_registry (created_at desc);
create trigger theme_registry_set_updated_at before update on public.theme_registry for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.theme_registry to authenticated;
grant all on public.theme_registry to service_role;
alter table public.theme_registry enable row level security;
create policy "theme_registry_platform_only" on public.theme_registry for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.trial_fingerprints (
  blocked boolean default false not null,
  fingerprint text not null,
  first_seen_at timestamptz default now() not null,
  last_seen_at timestamptz default now() not null,
  merchant_count bigint default 0 not null
);
grant select, insert, update, delete on public.trial_fingerprints to authenticated;
grant all on public.trial_fingerprints to service_role;
alter table public.trial_fingerprints enable row level security;
create policy "trial_fingerprints_platform_only" on public.trial_fingerprints for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.vat_rates (
  category text default '' not null,
  country_code text default '' not null,
  created_at timestamptz default now() not null,
  effective_year bigint not null,
  id uuid default gen_random_uuid() not null,
  rate_basis_points bigint not null,
  primary key (id)
);
create index if not exists vat_rates_created_idx on public.vat_rates (created_at desc);
grant select, insert, update, delete on public.vat_rates to authenticated;
grant all on public.vat_rates to service_role;
alter table public.vat_rates enable row level security;
create policy "vat_rates_platform_only" on public.vat_rates for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.activity_log (
  action text not null,
  actor text,
  changed jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  id bigint default 0 not null,
  merchant_id uuid not null,
  resource_id uuid,
  resource_type text not null,
  primary key (id)
);
alter table public.activity_log add constraint activity_log_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists activity_log_merchant_idx on public.activity_log (merchant_id);
create index if not exists activity_log_created_idx on public.activity_log (created_at desc);
grant select, insert, update, delete on public.activity_log to authenticated;
grant all on public.activity_log to service_role;
alter table public.activity_log enable row level security;
create policy "activity_log_tenant_read" on public.activity_log for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "activity_log_tenant_write" on public.activity_log for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.api_keys (
  active boolean default false not null,
  created_at timestamptz default now() not null,
  created_by uuid,
  env public.api_key_env default 'test'::public.api_key_env not null,
  id uuid default gen_random_uuid() not null,
  key_hash text not null,
  last_used_at timestamptz,
  merchant_id uuid not null,
  name text not null,
  prefix text not null,
  revoked_at timestamptz,
  scopes jsonb default '{}'::jsonb not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.api_keys add constraint api_keys_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists api_keys_merchant_idx on public.api_keys (merchant_id);
create index if not exists api_keys_created_idx on public.api_keys (created_at desc);
create trigger api_keys_set_updated_at before update on public.api_keys for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.api_keys to authenticated;
grant all on public.api_keys to service_role;
alter table public.api_keys enable row level security;
create policy "api_keys_tenant_read" on public.api_keys for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "api_keys_tenant_write" on public.api_keys for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.approval_requests (
  created_at timestamptz default now() not null,
  expires_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  payload jsonb default '{}'::jsonb not null,
  resource_action text not null,
  resource_id uuid,
  resource_type text not null,
  review_comment text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  status public.approval_status default 'pending'::public.approval_status not null,
  submitted_by uuid not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.approval_requests add constraint approval_requests_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists approval_requests_merchant_idx on public.approval_requests (merchant_id);
create index if not exists approval_requests_created_idx on public.approval_requests (created_at desc);
create trigger approval_requests_set_updated_at before update on public.approval_requests for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.approval_requests to authenticated;
grant all on public.approval_requests to service_role;
alter table public.approval_requests enable row level security;
create policy "approval_requests_tenant_read" on public.approval_requests for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "approval_requests_tenant_write" on public.approval_requests for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.billing_events (
  actor text,
  created_at timestamptz default now() not null,
  event_type text not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  payload jsonb default '{}'::jsonb not null,
  primary key (id)
);
alter table public.billing_events add constraint billing_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists billing_events_merchant_idx on public.billing_events (merchant_id);
create index if not exists billing_events_created_idx on public.billing_events (created_at desc);
grant select, insert, update, delete on public.billing_events to authenticated;
grant all on public.billing_events to service_role;
alter table public.billing_events enable row level security;
create policy "billing_events_tenant_read" on public.billing_events for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "billing_events_tenant_write" on public.billing_events for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.brands (
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  description text,
  id uuid default gen_random_uuid() not null,
  logo_url text,
  merchant_id uuid not null,
  name text not null,
  slug text not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.brands add constraint brands_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists brands_merchant_idx on public.brands (merchant_id);
create index if not exists brands_created_idx on public.brands (created_at desc);
create trigger brands_set_updated_at before update on public.brands for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.brands to authenticated;
grant all on public.brands to service_role;
alter table public.brands enable row level security;
create policy "brands_tenant_read" on public.brands for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "brands_tenant_write" on public.brands for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.carriers (
  adapter text default '' not null,
  api_mode text default '' not null,
  code text not null,
  config jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  cutoff_hour bigint default 0 not null,
  deleted_at timestamptz,
  enabled boolean default false not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  name text not null,
  sort_order bigint default 0 not null,
  supports_pickup boolean default false not null,
  supports_pudo boolean default false not null,
  updated_at timestamptz default now() not null,
  webhook_secret text default '' not null,
  primary key (id)
);
alter table public.carriers add constraint carriers_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists carriers_merchant_idx on public.carriers (merchant_id);
create index if not exists carriers_created_idx on public.carriers (created_at desc);
create trigger carriers_set_updated_at before update on public.carriers for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.carriers to authenticated;
grant all on public.carriers to service_role;
alter table public.carriers enable row level security;
create policy "carriers_tenant_read" on public.carriers for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "carriers_tenant_write" on public.carriers for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.catalog_import_jobs (
  applied_at timestamptz,
  applied_summary jsonb,
  created_at timestamptz default now() not null,
  created_by uuid,
  diff jsonb default '{}'::jsonb not null,
  error text,
  file_name text default '' not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  row_count bigint default 0 not null,
  source_hash text not null,
  status text default '' not null,
  summary jsonb default '{}'::jsonb not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.catalog_import_jobs add constraint catalog_import_jobs_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists catalog_import_jobs_merchant_idx on public.catalog_import_jobs (merchant_id);
create index if not exists catalog_import_jobs_created_idx on public.catalog_import_jobs (created_at desc);
create trigger catalog_import_jobs_set_updated_at before update on public.catalog_import_jobs for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.catalog_import_jobs to authenticated;
grant all on public.catalog_import_jobs to service_role;
alter table public.catalog_import_jobs enable row level security;
create policy "catalog_import_jobs_tenant_read" on public.catalog_import_jobs for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "catalog_import_jobs_tenant_write" on public.catalog_import_jobs for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.categories (
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  description text,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  name text not null,
  parent_id uuid,
  slug text not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.categories add constraint categories_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.categories add constraint categories_parent_id_fkey foreign key (parent_id) references public.categories(id) on delete set null;
create index if not exists categories_merchant_idx on public.categories (merchant_id);
create index if not exists categories_created_idx on public.categories (created_at desc);
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "categories_tenant_read" on public.categories for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "categories_tenant_write" on public.categories for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.collections (
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  description text,
  id uuid default gen_random_uuid() not null,
  image_url text,
  is_published boolean default false not null,
  is_smart boolean default false not null,
  merchant_id uuid not null,
  name text not null,
  position bigint default 0 not null,
  rules jsonb default '{}'::jsonb not null,
  slug text not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.collections add constraint collections_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists collections_merchant_idx on public.collections (merchant_id);
create index if not exists collections_created_idx on public.collections (created_at desc);
create trigger collections_set_updated_at before update on public.collections for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.collections to authenticated;
grant all on public.collections to service_role;
alter table public.collections enable row level security;
create policy "collections_tenant_read" on public.collections for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "collections_tenant_write" on public.collections for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.consent_events (
  actor text,
  channel public.consent_channel not null,
  created_at timestamptz default now() not null,
  customer_id uuid,
  granted boolean not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  purpose public.consent_purpose not null,
  reason text,
  source text not null,
  subject_hash text,
  subscriber_id uuid,
  primary key (id)
);
alter table public.consent_events add constraint consent_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists consent_events_merchant_idx on public.consent_events (merchant_id);
create index if not exists consent_events_created_idx on public.consent_events (created_at desc);
grant select, insert, update, delete on public.consent_events to authenticated;
grant all on public.consent_events to service_role;
alter table public.consent_events enable row level security;
create policy "consent_events_tenant_read" on public.consent_events for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "consent_events_tenant_write" on public.consent_events for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.coupons (
  allow_combine boolean default false not null,
  amount_minor_int bigint default 0 not null,
  batch_label text,
  buy_quantity bigint default 0 not null,
  code text not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  deleted_at timestamptz,
  expires_at timestamptz,
  get_quantity bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  max_discount_minor_int bigint,
  merchant_id uuid not null,
  min_subtotal_minor_int bigint default 0 not null,
  one_per_order boolean default false not null,
  per_customer_limit bigint,
  percent_off bigint default 0 not null,
  priority bigint default 0 not null,
  redeemed_count bigint default 0 not null,
  starts_at timestamptz,
  status public.coupon_status default 'draft'::public.coupon_status not null,
  type public.coupon_type default 'fixed'::public.coupon_type not null,
  updated_at timestamptz default now() not null,
  usage_limit bigint,
  primary key (id)
);
alter table public.coupons add constraint coupons_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists coupons_merchant_idx on public.coupons (merchant_id);
create index if not exists coupons_created_idx on public.coupons (created_at desc);
create trigger coupons_set_updated_at before update on public.coupons for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.coupons to authenticated;
grant all on public.coupons to service_role;
alter table public.coupons enable row level security;
create policy "coupons_tenant_read" on public.coupons for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "coupons_tenant_write" on public.coupons for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.customers (
  auth_uid text not null,
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  email text,
  id uuid default gen_random_uuid() not null,
  locale text default '' not null,
  merchant_id uuid not null,
  name text default '' not null,
  phone text,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.customers add constraint customers_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists customers_merchant_idx on public.customers (merchant_id);
create index if not exists customers_created_idx on public.customers (created_at desc);
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy "customers_tenant_read" on public.customers for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "customers_tenant_write" on public.customers for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.export_jobs (
  attempts bigint default 0 not null,
  created_at timestamptz default now() not null,
  downloaded_at timestamptz,
  error text,
  expires_at timestamptz,
  filters jsonb default '{}'::jsonb not null,
  finished_at timestamptz,
  format text default '' not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  object_type public.export_object_type not null,
  range_end text,
  range_start text,
  requested_by uuid,
  schema_version bigint default 0 not null,
  signed_url text,
  signed_url_expires_at timestamptz,
  size_bytes bigint default 0 not null,
  started_at timestamptz,
  status public.export_job_status default 'queued'::public.export_job_status not null,
  storage_path text,
  total_rows bigint default 0 not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.export_jobs add constraint export_jobs_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists export_jobs_merchant_idx on public.export_jobs (merchant_id);
create index if not exists export_jobs_created_idx on public.export_jobs (created_at desc);
create trigger export_jobs_set_updated_at before update on public.export_jobs for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.export_jobs to authenticated;
grant all on public.export_jobs to service_role;
alter table public.export_jobs enable row level security;
create policy "export_jobs_tenant_read" on public.export_jobs for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "export_jobs_tenant_write" on public.export_jobs for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.fraud_blacklist (
  active boolean default false not null,
  created_at timestamptz default now() not null,
  created_by uuid,
  id uuid default gen_random_uuid() not null,
  kind public.fraud_blacklist_kind not null,
  merchant_id uuid not null,
  reason text,
  updated_at timestamptz default now() not null,
  value text not null,
  primary key (id)
);
alter table public.fraud_blacklist add constraint fraud_blacklist_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists fraud_blacklist_merchant_idx on public.fraud_blacklist (merchant_id);
create index if not exists fraud_blacklist_created_idx on public.fraud_blacklist (created_at desc);
create trigger fraud_blacklist_set_updated_at before update on public.fraud_blacklist for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.fraud_blacklist to authenticated;
grant all on public.fraud_blacklist to service_role;
alter table public.fraud_blacklist enable row level security;
create policy "fraud_blacklist_tenant_read" on public.fraud_blacklist for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "fraud_blacklist_tenant_write" on public.fraud_blacklist for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.fraud_rules (
  action text default '' not null,
  code text not null,
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  enabled boolean default false not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  params jsonb default '{}'::jsonb not null,
  precedence bigint default 0 not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.fraud_rules add constraint fraud_rules_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists fraud_rules_merchant_idx on public.fraud_rules (merchant_id);
create index if not exists fraud_rules_created_idx on public.fraud_rules (created_at desc);
create trigger fraud_rules_set_updated_at before update on public.fraud_rules for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.fraud_rules to authenticated;
grant all on public.fraud_rules to service_role;
alter table public.fraud_rules enable row level security;
create policy "fraud_rules_tenant_read" on public.fraud_rules for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "fraud_rules_tenant_write" on public.fraud_rules for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.gateway_accounts (
  active boolean default false not null,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  provider text not null,
  sandbox boolean default false not null,
  updated_at timestamptz default now() not null,
  webhook_secret text not null,
  primary key (id)
);
alter table public.gateway_accounts add constraint gateway_accounts_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists gateway_accounts_merchant_idx on public.gateway_accounts (merchant_id);
create index if not exists gateway_accounts_created_idx on public.gateway_accounts (created_at desc);
create trigger gateway_accounts_set_updated_at before update on public.gateway_accounts for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.gateway_accounts to authenticated;
grant all on public.gateway_accounts to service_role;
alter table public.gateway_accounts enable row level security;
create policy "gateway_accounts_tenant_read" on public.gateway_accounts for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "gateway_accounts_tenant_write" on public.gateway_accounts for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.gift_cards (
  balance_minor_int bigint not null,
  code text not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  expires_at timestamptz,
  id uuid default gen_random_uuid() not null,
  initial_minor_int bigint not null,
  issued_by uuid,
  merchant_id uuid not null,
  recipient_email text,
  recipient_phone text,
  status public.gift_card_status not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.gift_cards add constraint gift_cards_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists gift_cards_merchant_idx on public.gift_cards (merchant_id);
create index if not exists gift_cards_created_idx on public.gift_cards (created_at desc);
create trigger gift_cards_set_updated_at before update on public.gift_cards for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.gift_cards to authenticated;
grant all on public.gift_cards to service_role;
alter table public.gift_cards enable row level security;
create policy "gift_cards_tenant_read" on public.gift_cards for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "gift_cards_tenant_write" on public.gift_cards for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.impersonation_grants (
  consent_at timestamptz,
  consent_by uuid,
  expires_at timestamptz not null,
  id uuid default gen_random_uuid() not null,
  last_used_at timestamptz,
  merchant_id uuid not null,
  reason text not null,
  requested_at timestamptz default now() not null,
  requested_by uuid not null,
  revoked_at timestamptz,
  revoked_by uuid,
  scope text default '' not null,
  use_count bigint default 0 not null,
  primary key (id)
);
alter table public.impersonation_grants add constraint impersonation_grants_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists impersonation_grants_merchant_idx on public.impersonation_grants (merchant_id);
grant select, insert, update, delete on public.impersonation_grants to authenticated;
grant all on public.impersonation_grants to service_role;
alter table public.impersonation_grants enable row level security;
create policy "impersonation_grants_tenant_read" on public.impersonation_grants for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "impersonation_grants_tenant_write" on public.impersonation_grants for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.inventory_locations (
  active boolean default false not null,
  address_line text,
  city text,
  code text not null,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  is_default boolean default false not null,
  merchant_id uuid not null,
  name text not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.inventory_locations add constraint inventory_locations_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists inventory_locations_merchant_idx on public.inventory_locations (merchant_id);
create index if not exists inventory_locations_created_idx on public.inventory_locations (created_at desc);
create trigger inventory_locations_set_updated_at before update on public.inventory_locations for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.inventory_locations to authenticated;
grant all on public.inventory_locations to service_role;
alter table public.inventory_locations enable row level security;
create policy "inventory_locations_tenant_read" on public.inventory_locations for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "inventory_locations_tenant_write" on public.inventory_locations for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.invoices (
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  id uuid default gen_random_uuid() not null,
  idempotency_key text not null,
  invoice_number text not null,
  merchant_id uuid not null,
  paid_at timestamptz,
  period_end text not null,
  period_start text not null,
  plan public.billing_plan not null,
  status public.invoice_status default 'open'::public.invoice_status not null,
  subtotal_minor_int bigint default 0 not null,
  total_minor_int bigint default 0 not null,
  updated_at timestamptz default now() not null,
  vat_minor_int bigint default 0 not null,
  vat_rate_basis_points bigint default 0 not null,
  primary key (id)
);
alter table public.invoices add constraint invoices_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists invoices_merchant_idx on public.invoices (merchant_id);
create index if not exists invoices_created_idx on public.invoices (created_at desc);
create trigger invoices_set_updated_at before update on public.invoices for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.invoices to authenticated;
grant all on public.invoices to service_role;
alter table public.invoices enable row level security;
create policy "invoices_tenant_read" on public.invoices for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "invoices_tenant_write" on public.invoices for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.local_transactions (
  attempts bigint default 0 not null,
  client_id uuid not null,
  created_at timestamptz default now() not null,
  error text,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  payload jsonb default '{}'::jsonb not null,
  status public.sync_status default 'pending'::public.sync_status not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.local_transactions add constraint local_transactions_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists local_transactions_merchant_idx on public.local_transactions (merchant_id);
create index if not exists local_transactions_created_idx on public.local_transactions (created_at desc);
create trigger local_transactions_set_updated_at before update on public.local_transactions for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.local_transactions to authenticated;
grant all on public.local_transactions to service_role;
alter table public.local_transactions enable row level security;
create policy "local_transactions_tenant_read" on public.local_transactions for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "local_transactions_tenant_write" on public.local_transactions for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.marketplace_themes (
  category text default '' not null,
  compatible_versions jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  description text,
  id uuid default gen_random_uuid() not null,
  install_count bigint default 0 not null,
  manifest jsonb default '{}'::jsonb not null,
  name text not null,
  price_minor_int bigint default 0 not null,
  rating_count bigint default 0 not null,
  rating_sum bigint default 0 not null,
  seller_merchant_id uuid not null,
  slug text not null,
  status public.market_listing_status default 'draft'::public.market_listing_status not null,
  thumbnail_url text,
  trial_allowed boolean default false not null,
  updated_at timestamptz default now() not null,
  vendor_name text default '' not null,
  version text default '' not null,
  version_history jsonb default '{}'::jsonb not null,
  primary key (id)
);
alter table public.marketplace_themes add constraint marketplace_themes_seller_merchant_id_fkey foreign key (seller_merchant_id) references public.merchants(id) on delete cascade;
create index if not exists marketplace_themes_created_idx on public.marketplace_themes (created_at desc);
create trigger marketplace_themes_set_updated_at before update on public.marketplace_themes for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.marketplace_themes to authenticated;
grant all on public.marketplace_themes to service_role;
alter table public.marketplace_themes enable row level security;
create policy "marketplace_themes_platform_only" on public.marketplace_themes for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.marketplace_widgets (
  category text default '' not null,
  compatible_versions jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  description text,
  id uuid default gen_random_uuid() not null,
  install_count bigint default 0 not null,
  manifest jsonb default '{}'::jsonb not null,
  name text not null,
  price_minor_int bigint default 0 not null,
  rating_count bigint default 0 not null,
  rating_sum bigint default 0 not null,
  registry_id uuid not null,
  seller_merchant_id uuid not null,
  slug text not null,
  status public.market_listing_status default 'draft'::public.market_listing_status not null,
  thumbnail_url text,
  trial_allowed boolean default false not null,
  updated_at timestamptz default now() not null,
  vendor_name text default '' not null,
  version text default '' not null,
  version_history jsonb default '{}'::jsonb not null,
  primary key (id)
);
alter table public.marketplace_widgets add constraint marketplace_widgets_seller_merchant_id_fkey foreign key (seller_merchant_id) references public.merchants(id) on delete cascade;
create index if not exists marketplace_widgets_created_idx on public.marketplace_widgets (created_at desc);
create trigger marketplace_widgets_set_updated_at before update on public.marketplace_widgets for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.marketplace_widgets to authenticated;
grant all on public.marketplace_widgets to service_role;
alter table public.marketplace_widgets enable row level security;
create policy "marketplace_widgets_platform_only" on public.marketplace_widgets for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.media_assets (
  alt_text text,
  content_type text default '' not null,
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  file_name text not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  size_bytes bigint default 0 not null,
  storage_path text not null,
  updated_at timestamptz default now() not null,
  url text not null,
  primary key (id)
);
alter table public.media_assets add constraint media_assets_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists media_assets_merchant_idx on public.media_assets (merchant_id);
create index if not exists media_assets_created_idx on public.media_assets (created_at desc);
create trigger media_assets_set_updated_at before update on public.media_assets for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.media_assets to authenticated;
grant all on public.media_assets to service_role;
alter table public.media_assets enable row level security;
create policy "media_assets_tenant_read" on public.media_assets for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "media_assets_tenant_write" on public.media_assets for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.merchant_kyc (
  bin_no text,
  contact_phone text,
  created_at timestamptz default now() not null,
  document_paths jsonb default '{}'::jsonb not null,
  id uuid default gen_random_uuid() not null,
  legal_name text,
  merchant_id uuid not null,
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  state public.kyc_state default 'pending'::public.kyc_state not null,
  submitted_at timestamptz,
  trade_license_no text,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.merchant_kyc add constraint merchant_kyc_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists merchant_kyc_merchant_idx on public.merchant_kyc (merchant_id);
create index if not exists merchant_kyc_created_idx on public.merchant_kyc (created_at desc);
create trigger merchant_kyc_set_updated_at before update on public.merchant_kyc for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.merchant_kyc to authenticated;
grant all on public.merchant_kyc to service_role;
alter table public.merchant_kyc enable row level security;
create policy "merchant_kyc_tenant_read" on public.merchant_kyc for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "merchant_kyc_tenant_write" on public.merchant_kyc for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.merchant_settings (
  business_bin text,
  cod_enabled boolean default false not null,
  cod_surcharge_minor_int bigint default 0 not null,
  created_at timestamptz default now() not null,
  free_shipping_threshold_minor_int bigint,
  low_stock_threshold bigint default 0 not null,
  merchant_id uuid not null,
  mfs_enabled boolean default false not null,
  notify_prefs jsonb default '{}'::jsonb not null,
  prices_include_vat boolean default false not null,
  setup_dismissed_at timestamptz,
  setup_steps jsonb default '{}'::jsonb not null,
  ship_address_line text,
  ship_city text,
  ship_postcode text,
  shipping_flat_minor_int bigint default 0 not null,
  support_email text,
  support_phone text,
  tagline text,
  updated_at timestamptz default now() not null
);
alter table public.merchant_settings add constraint merchant_settings_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists merchant_settings_merchant_idx on public.merchant_settings (merchant_id);
create index if not exists merchant_settings_created_idx on public.merchant_settings (created_at desc);
create trigger merchant_settings_set_updated_at before update on public.merchant_settings for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.merchant_settings to authenticated;
grant all on public.merchant_settings to service_role;
alter table public.merchant_settings enable row level security;
create policy "merchant_settings_tenant_read" on public.merchant_settings for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "merchant_settings_tenant_write" on public.merchant_settings for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.merchant_suspensions (
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  payments_frozen boolean default false not null,
  reason text not null,
  reinstate_note text,
  reinstated_at timestamptz,
  reinstated_by uuid,
  suspended_at timestamptz default now() not null,
  suspended_by uuid not null,
  primary key (id)
);
alter table public.merchant_suspensions add constraint merchant_suspensions_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists merchant_suspensions_merchant_idx on public.merchant_suspensions (merchant_id);
grant select, insert, update, delete on public.merchant_suspensions to authenticated;
grant all on public.merchant_suspensions to service_role;
alter table public.merchant_suspensions enable row level security;
create policy "merchant_suspensions_tenant_read" on public.merchant_suspensions for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "merchant_suspensions_tenant_write" on public.merchant_suspensions for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.metafield_definitions (
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  is_required boolean default false not null,
  key text not null,
  label text not null,
  merchant_id uuid not null,
  namespace text default '' not null,
  owner_type text not null,
  updated_at timestamptz default now() not null,
  validation jsonb default '{}'::jsonb not null,
  value_type text default '' not null,
  primary key (id)
);
alter table public.metafield_definitions add constraint metafield_definitions_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists metafield_definitions_merchant_idx on public.metafield_definitions (merchant_id);
create index if not exists metafield_definitions_created_idx on public.metafield_definitions (created_at desc);
create trigger metafield_definitions_set_updated_at before update on public.metafield_definitions for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.metafield_definitions to authenticated;
grant all on public.metafield_definitions to service_role;
alter table public.metafield_definitions enable row level security;
create policy "metafield_definitions_tenant_read" on public.metafield_definitions for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "metafield_definitions_tenant_write" on public.metafield_definitions for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.metafields (
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  key text not null,
  merchant_id uuid not null,
  namespace text default '' not null,
  owner_id uuid,
  owner_type text not null,
  updated_at timestamptz default now() not null,
  value jsonb default '{}'::jsonb not null,
  value_type text default '' not null,
  primary key (id)
);
alter table public.metafields add constraint metafields_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists metafields_merchant_idx on public.metafields (merchant_id);
create index if not exists metafields_created_idx on public.metafields (created_at desc);
create trigger metafields_set_updated_at before update on public.metafields for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.metafields to authenticated;
grant all on public.metafields to service_role;
alter table public.metafields enable row level security;
create policy "metafields_tenant_read" on public.metafields for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "metafields_tenant_write" on public.metafields for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.notifications (
  archived_at timestamptz,
  body_bn text default '' not null,
  body_en text default '' not null,
  created_at timestamptz default now() not null,
  dedupe_key text,
  entity_id uuid,
  href text,
  id uuid default gen_random_uuid() not null,
  kind text not null,
  merchant_id uuid not null,
  read_at timestamptz,
  read_by uuid,
  severity public.notification_severity default 'info'::public.notification_severity not null,
  title_bn text not null,
  title_en text not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.notifications add constraint notifications_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists notifications_merchant_idx on public.notifications (merchant_id);
create index if not exists notifications_created_idx on public.notifications (created_at desc);
create trigger notifications_set_updated_at before update on public.notifications for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notifications_tenant_read" on public.notifications for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "notifications_tenant_write" on public.notifications for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.ops_incident_updates (
  body text not null,
  created_at timestamptz default now() not null,
  created_by uuid,
  id uuid default gen_random_uuid() not null,
  incident_id uuid not null,
  status text not null,
  primary key (id)
);
alter table public.ops_incident_updates add constraint ops_incident_updates_incident_id_fkey foreign key (incident_id) references public.ops_incidents(id) on delete cascade;
create index if not exists ops_incident_updates_created_idx on public.ops_incident_updates (created_at desc);
grant select, insert, update, delete on public.ops_incident_updates to authenticated;
grant all on public.ops_incident_updates to service_role;
alter table public.ops_incident_updates enable row level security;
create policy "ops_incident_updates_platform_only" on public.ops_incident_updates for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create table if not exists public.pos_sessions (
  actual_cash_minor_int bigint,
  close_time text,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  expected_cash_minor_int bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  note text,
  open_time text default '' not null,
  shift_date date not null,
  shift_totals jsonb default '{}'::jsonb not null,
  staff_user_id uuid not null,
  starting_cash_minor_int bigint default 0 not null,
  status public.pos_session_status default 'open'::public.pos_session_status not null,
  updated_at timestamptz default now() not null,
  variance_minor_int bigint,
  primary key (id)
);
alter table public.pos_sessions add constraint pos_sessions_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists pos_sessions_merchant_idx on public.pos_sessions (merchant_id);
create index if not exists pos_sessions_created_idx on public.pos_sessions (created_at desc);
create trigger pos_sessions_set_updated_at before update on public.pos_sessions for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.pos_sessions to authenticated;
grant all on public.pos_sessions to service_role;
alter table public.pos_sessions enable row level security;
create policy "pos_sessions_tenant_read" on public.pos_sessions for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "pos_sessions_tenant_write" on public.pos_sessions for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.segments (
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  name text not null,
  rule_field text default '' not null,
  rule_operator text default '' not null,
  rule_value text default '' not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.segments add constraint segments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists segments_merchant_idx on public.segments (merchant_id);
create index if not exists segments_created_idx on public.segments (created_at desc);
create trigger segments_set_updated_at before update on public.segments for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.segments to authenticated;
grant all on public.segments to service_role;
alter table public.segments enable row level security;
create policy "segments_tenant_read" on public.segments for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "segments_tenant_write" on public.segments for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.seo_meta (
  canonical text,
  created_at timestamptz default now() not null,
  entity_id uuid,
  entity_type public.seo_entity_type not null,
  faq jsonb default '{}'::jsonb not null,
  focus_keyword text,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  meta_description text,
  meta_title text,
  og_image_url text,
  robots_follow boolean default false not null,
  robots_index boolean default false not null,
  schema_type text,
  score bigint default 0 not null,
  updated_at timestamptz default now() not null,
  updated_by uuid,
  primary key (id)
);
alter table public.seo_meta add constraint seo_meta_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists seo_meta_merchant_idx on public.seo_meta (merchant_id);
create index if not exists seo_meta_created_idx on public.seo_meta (created_at desc);
create trigger seo_meta_set_updated_at before update on public.seo_meta for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.seo_meta to authenticated;
grant all on public.seo_meta to service_role;
alter table public.seo_meta enable row level security;
create policy "seo_meta_tenant_read" on public.seo_meta for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "seo_meta_tenant_write" on public.seo_meta for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.seo_meta_audit (
  actor text,
  after jsonb,
  before jsonb,
  created_at timestamptz default now() not null,
  entity_id uuid,
  entity_type public.seo_entity_type not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  reason text,
  primary key (id)
);
alter table public.seo_meta_audit add constraint seo_meta_audit_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists seo_meta_audit_merchant_idx on public.seo_meta_audit (merchant_id);
create index if not exists seo_meta_audit_created_idx on public.seo_meta_audit (created_at desc);
grant select, insert, update, delete on public.seo_meta_audit to authenticated;
grant all on public.seo_meta_audit to service_role;
alter table public.seo_meta_audit enable row level security;
create policy "seo_meta_audit_tenant_read" on public.seo_meta_audit for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "seo_meta_audit_tenant_write" on public.seo_meta_audit for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.settlement_files (
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  fee_minor_int bigint default 0 not null,
  file_date date not null,
  file_hash text not null,
  gross_minor_int bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  item_count bigint default 0 not null,
  matched_count bigint default 0 not null,
  merchant_id uuid not null,
  net_minor_int bigint default 0 not null,
  posted_at timestamptz,
  provider text not null,
  reject_reason text,
  status public.settlement_file_status default 'received'::public.settlement_file_status not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.settlement_files add constraint settlement_files_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists settlement_files_merchant_idx on public.settlement_files (merchant_id);
create index if not exists settlement_files_created_idx on public.settlement_files (created_at desc);
create trigger settlement_files_set_updated_at before update on public.settlement_files for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.settlement_files to authenticated;
grant all on public.settlement_files to service_role;
alter table public.settlement_files enable row level security;
create policy "settlement_files_tenant_read" on public.settlement_files for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "settlement_files_tenant_write" on public.settlement_files for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.shipping_zones (
  code text not null,
  created_at timestamptz default now() not null,
  districts text[] default '{}'::text[] not null,
  enabled boolean default false not null,
  id uuid default gen_random_uuid() not null,
  is_default boolean default false not null,
  merchant_id uuid not null,
  name_bn text default '' not null,
  name_en text not null,
  priority bigint default 0 not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.shipping_zones add constraint shipping_zones_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists shipping_zones_merchant_idx on public.shipping_zones (merchant_id);
create index if not exists shipping_zones_created_idx on public.shipping_zones (created_at desc);
create trigger shipping_zones_set_updated_at before update on public.shipping_zones for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.shipping_zones to authenticated;
grant all on public.shipping_zones to service_role;
alter table public.shipping_zones enable row level security;
create policy "shipping_zones_tenant_read" on public.shipping_zones for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "shipping_zones_tenant_write" on public.shipping_zones for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.staff_audit (
  action text not null,
  actor text,
  created_at timestamptz default now() not null,
  id bigint default 0 not null,
  member_id uuid,
  merchant_id uuid not null,
  payload jsonb default '{}'::jsonb not null,
  primary key (id)
);
alter table public.staff_audit add constraint staff_audit_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists staff_audit_merchant_idx on public.staff_audit (merchant_id);
create index if not exists staff_audit_created_idx on public.staff_audit (created_at desc);
grant select, insert, update, delete on public.staff_audit to authenticated;
grant all on public.staff_audit to service_role;
alter table public.staff_audit enable row level security;
create policy "staff_audit_tenant_read" on public.staff_audit for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "staff_audit_tenant_write" on public.staff_audit for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.staff_roles (
  created_at timestamptz default now() not null,
  grants jsonb default '{}'::jsonb not null,
  id uuid default gen_random_uuid() not null,
  is_fixed boolean default false not null,
  merchant_id uuid not null,
  name text not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.staff_roles add constraint staff_roles_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists staff_roles_merchant_idx on public.staff_roles (merchant_id);
create index if not exists staff_roles_created_idx on public.staff_roles (created_at desc);
create trigger staff_roles_set_updated_at before update on public.staff_roles for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.staff_roles to authenticated;
grant all on public.staff_roles to service_role;
alter table public.staff_roles enable row level security;
create policy "staff_roles_tenant_read" on public.staff_roles for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "staff_roles_tenant_write" on public.staff_roles for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.step_up_grants (
  action text not null,
  created_at timestamptz default now() not null,
  expires_at timestamptz not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid,
  method text not null,
  used_at timestamptz,
  user_id uuid not null,
  primary key (id)
);
alter table public.step_up_grants add constraint step_up_grants_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete set null;
create index if not exists step_up_grants_merchant_idx on public.step_up_grants (merchant_id);
create index if not exists step_up_grants_created_idx on public.step_up_grants (created_at desc);
grant select, insert, update, delete on public.step_up_grants to authenticated;
grant all on public.step_up_grants to service_role;
alter table public.step_up_grants enable row level security;
create policy "step_up_grants_tenant_read" on public.step_up_grants for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "step_up_grants_tenant_write" on public.step_up_grants for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.storefront_forms (
  consent_purpose public.consent_purpose default 'marketing'::public.consent_purpose not null,
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  description text,
  fields jsonb default '{}'::jsonb not null,
  id uuid default gen_random_uuid() not null,
  is_active boolean default false not null,
  merchant_id uuid not null,
  requires_consent boolean default false not null,
  slug text not null,
  success_message text default '' not null,
  title text not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.storefront_forms add constraint storefront_forms_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists storefront_forms_merchant_idx on public.storefront_forms (merchant_id);
create index if not exists storefront_forms_created_idx on public.storefront_forms (created_at desc);
create trigger storefront_forms_set_updated_at before update on public.storefront_forms for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.storefront_forms to authenticated;
grant all on public.storefront_forms to service_role;
alter table public.storefront_forms enable row level security;
create policy "storefront_forms_tenant_read" on public.storefront_forms for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "storefront_forms_tenant_write" on public.storefront_forms for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.storefront_pages (
  body_markdown text default '' not null,
  cover_image_url text,
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  excerpt text,
  id uuid default gen_random_uuid() not null,
  is_published boolean default false not null,
  merchant_id uuid not null,
  meta_description text,
  meta_title text,
  position bigint default 0 not null,
  published_at timestamptz,
  robots text default '' not null,
  show_in_nav boolean default false not null,
  slug text not null,
  title text not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.storefront_pages add constraint storefront_pages_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists storefront_pages_merchant_idx on public.storefront_pages (merchant_id);
create index if not exists storefront_pages_created_idx on public.storefront_pages (created_at desc);
create trigger storefront_pages_set_updated_at before update on public.storefront_pages for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.storefront_pages to authenticated;
grant all on public.storefront_pages to service_role;
alter table public.storefront_pages enable row level security;
create policy "storefront_pages_tenant_read" on public.storefront_pages for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "storefront_pages_tenant_write" on public.storefront_pages for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.subscribers (
  created_at timestamptz default now() not null,
  email text not null,
  email_consent boolean default false not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  phone text,
  sms_consent boolean default false not null,
  source text default '' not null,
  status text default '' not null,
  tags text[] default '{}'::text[] not null,
  unsubscribe_token text default '' not null,
  unsubscribed_at timestamptz,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.subscribers add constraint subscribers_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists subscribers_merchant_idx on public.subscribers (merchant_id);
create index if not exists subscribers_created_idx on public.subscribers (created_at desc);
create trigger subscribers_set_updated_at before update on public.subscribers for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.subscribers to authenticated;
grant all on public.subscribers to service_role;
alter table public.subscribers enable row level security;
create policy "subscribers_tenant_read" on public.subscribers for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "subscribers_tenant_write" on public.subscribers for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.subscriptions (
  cancelled_at timestamptz,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  current_period_start text default '' not null,
  dunning_stage bigint default 0 not null,
  grace_until text,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  next_billing_at timestamptz,
  past_due_since text,
  paused_at timestamptz,
  plan public.billing_plan default 'launch'::public.billing_plan not null,
  scheduled_plan public.billing_plan,
  scheduled_plan_at timestamptz,
  status public.subscription_status default 'trial'::public.subscription_status not null,
  trial_ends_at timestamptz,
  trial_fingerprint text,
  trial_started_at timestamptz,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.subscriptions add constraint subscriptions_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists subscriptions_merchant_idx on public.subscriptions (merchant_id);
create index if not exists subscriptions_created_idx on public.subscriptions (created_at desc);
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
create policy "subscriptions_tenant_read" on public.subscriptions for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "subscriptions_tenant_write" on public.subscriptions for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.tenant_limits (
  created_at timestamptz default now() not null,
  merchant_id uuid not null,
  products_limit bigint default 0 not null,
  staff_limit bigint default 0 not null,
  updated_at timestamptz default now() not null
);
alter table public.tenant_limits add constraint tenant_limits_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists tenant_limits_merchant_idx on public.tenant_limits (merchant_id);
create index if not exists tenant_limits_created_idx on public.tenant_limits (created_at desc);
create trigger tenant_limits_set_updated_at before update on public.tenant_limits for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.tenant_limits to authenticated;
grant all on public.tenant_limits to service_role;
alter table public.tenant_limits enable row level security;
create policy "tenant_limits_tenant_read" on public.tenant_limits for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "tenant_limits_tenant_write" on public.tenant_limits for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.tenant_purge_requests (
  decided_at timestamptz,
  decided_by uuid,
  failure text,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  reason text not null,
  requested_at timestamptz default now() not null,
  requested_by uuid not null,
  row_counts jsonb,
  scheduled_for text default '' not null,
  status text default '' not null,
  primary key (id)
);
alter table public.tenant_purge_requests add constraint tenant_purge_requests_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists tenant_purge_requests_merchant_idx on public.tenant_purge_requests (merchant_id);
grant select, insert, update, delete on public.tenant_purge_requests to authenticated;
grant all on public.tenant_purge_requests to service_role;
alter table public.tenant_purge_requests enable row level security;
create policy "tenant_purge_requests_tenant_read" on public.tenant_purge_requests for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "tenant_purge_requests_tenant_write" on public.tenant_purge_requests for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.theme_audit (
  action text not null,
  actor text,
  after jsonb,
  before jsonb,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  theme_id uuid,
  primary key (id)
);
alter table public.theme_audit add constraint theme_audit_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists theme_audit_merchant_idx on public.theme_audit (merchant_id);
create index if not exists theme_audit_created_idx on public.theme_audit (created_at desc);
grant select, insert, update, delete on public.theme_audit to authenticated;
grant all on public.theme_audit to service_role;
alter table public.theme_audit enable row level security;
create policy "theme_audit_tenant_read" on public.theme_audit for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "theme_audit_tenant_write" on public.theme_audit for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.wallet_ledger_entries (
  counterparty_merchant_id uuid,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  direction text not null,
  gross_minor_int bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  idempotency_key text not null,
  memo text,
  merchant_id uuid not null,
  platform_minor_int bigint default 0 not null,
  reference_id uuid,
  seller_minor_int bigint default 0 not null,
  source text not null,
  primary key (id)
);
alter table public.wallet_ledger_entries add constraint wallet_ledger_entries_counterparty_merchant_id_fkey foreign key (counterparty_merchant_id) references public.merchants(id) on delete set null;
alter table public.wallet_ledger_entries add constraint wallet_ledger_entries_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists wallet_ledger_entries_merchant_idx on public.wallet_ledger_entries (merchant_id);
create index if not exists wallet_ledger_entries_created_idx on public.wallet_ledger_entries (created_at desc);
grant select, insert, update, delete on public.wallet_ledger_entries to authenticated;
grant all on public.wallet_ledger_entries to service_role;
alter table public.wallet_ledger_entries enable row level security;
create policy "wallet_ledger_entries_tenant_read" on public.wallet_ledger_entries for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "wallet_ledger_entries_tenant_write" on public.wallet_ledger_entries for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.api_key_events (
  action text not null,
  actor text,
  api_key_id uuid,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  payload jsonb default '{}'::jsonb not null,
  primary key (id)
);
alter table public.api_key_events add constraint api_key_events_api_key_id_fkey foreign key (api_key_id) references public.api_keys(id) on delete set null;
alter table public.api_key_events add constraint api_key_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists api_key_events_merchant_idx on public.api_key_events (merchant_id);
create index if not exists api_key_events_created_idx on public.api_key_events (created_at desc);
grant select, insert, update, delete on public.api_key_events to authenticated;
grant all on public.api_key_events to service_role;
alter table public.api_key_events enable row level security;
create policy "api_key_events_tenant_read" on public.api_key_events for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "api_key_events_tenant_write" on public.api_key_events for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.articles (
  body text default '' not null,
  canonical text,
  category_id uuid,
  cover_image_url text,
  cover_media_id uuid,
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  excerpt text,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  meta_description text,
  meta_title text,
  published_at timestamptz,
  robots text default '' not null,
  scheduled_for text,
  slug text not null,
  status text default '' not null,
  tags text[] default '{}'::text[] not null,
  title text not null,
  title_en text,
  updated_at timestamptz default now() not null,
  views bigint default 0 not null,
  primary key (id)
);
alter table public.articles add constraint articles_category_id_fkey foreign key (category_id) references public.categories(id) on delete set null;
alter table public.articles add constraint articles_cover_media_id_fkey foreign key (cover_media_id) references public.media_assets(id) on delete set null;
alter table public.articles add constraint articles_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists articles_merchant_idx on public.articles (merchant_id);
create index if not exists articles_created_idx on public.articles (created_at desc);
create trigger articles_set_updated_at before update on public.articles for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.articles to authenticated;
grant all on public.articles to service_role;
alter table public.articles enable row level security;
create policy "articles_tenant_read" on public.articles for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "articles_tenant_write" on public.articles for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.billing_dunning_attempts (
  channel text not null,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  idempotency_key text not null,
  invoice_id uuid not null,
  merchant_id uuid not null,
  outcome text default '' not null,
  stage bigint not null,
  primary key (id)
);
alter table public.billing_dunning_attempts add constraint billing_dunning_attempts_invoice_id_fkey foreign key (invoice_id) references public.invoices(id) on delete cascade;
alter table public.billing_dunning_attempts add constraint billing_dunning_attempts_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists billing_dunning_attempts_merchant_idx on public.billing_dunning_attempts (merchant_id);
create index if not exists billing_dunning_attempts_created_idx on public.billing_dunning_attempts (created_at desc);
grant select, insert, update, delete on public.billing_dunning_attempts to authenticated;
grant all on public.billing_dunning_attempts to service_role;
alter table public.billing_dunning_attempts enable row level security;
create policy "billing_dunning_attempts_tenant_read" on public.billing_dunning_attempts for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "billing_dunning_attempts_tenant_write" on public.billing_dunning_attempts for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.campaigns (
  body_template text default '' not null,
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  failed_count bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  name text not null,
  scheduled_for text,
  segment_id uuid,
  sent_at timestamptz,
  sent_count bigint default 0 not null,
  status text default '' not null,
  subject text default '' not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.campaigns add constraint campaigns_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.campaigns add constraint campaigns_segment_id_fkey foreign key (segment_id) references public.segments(id) on delete set null;
create index if not exists campaigns_merchant_idx on public.campaigns (merchant_id);
create index if not exists campaigns_created_idx on public.campaigns (created_at desc);
create trigger campaigns_set_updated_at before update on public.campaigns for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.campaigns to authenticated;
grant all on public.campaigns to service_role;
alter table public.campaigns enable row level security;
create policy "campaigns_tenant_read" on public.campaigns for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "campaigns_tenant_write" on public.campaigns for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.customer_addresses (
  address_type public.address_type default 'shipping'::public.address_type not null,
  city text not null,
  created_at timestamptz default now() not null,
  customer_id uuid not null,
  deleted_at timestamptz,
  district text not null,
  full_name text not null,
  id uuid default gen_random_uuid() not null,
  is_default boolean default false not null,
  label text default '' not null,
  line1 text not null,
  line2 text,
  merchant_id uuid not null,
  phone text not null,
  postcode text,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.customer_addresses add constraint customer_addresses_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete cascade;
alter table public.customer_addresses add constraint customer_addresses_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists customer_addresses_merchant_idx on public.customer_addresses (merchant_id);
create index if not exists customer_addresses_created_idx on public.customer_addresses (created_at desc);
create trigger customer_addresses_set_updated_at before update on public.customer_addresses for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant all on public.customer_addresses to service_role;
alter table public.customer_addresses enable row level security;
create policy "customer_addresses_tenant_read" on public.customer_addresses for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "customer_addresses_tenant_write" on public.customer_addresses for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.customer_consents (
  channel public.consent_channel not null,
  customer_id uuid,
  granted boolean default false not null,
  granted_at timestamptz,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  purpose public.consent_purpose not null,
  session_token text,
  source text default '' not null,
  subject_hash text,
  subscriber_id uuid,
  updated_at timestamptz default now() not null,
  version bigint default 0 not null,
  withdrawn_at timestamptz,
  primary key (id)
);
alter table public.customer_consents add constraint customer_consents_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null;
alter table public.customer_consents add constraint customer_consents_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists customer_consents_merchant_idx on public.customer_consents (merchant_id);
create trigger customer_consents_set_updated_at before update on public.customer_consents for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.customer_consents to authenticated;
grant all on public.customer_consents to service_role;
alter table public.customer_consents enable row level security;
create policy "customer_consents_tenant_read" on public.customer_consents for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "customer_consents_tenant_write" on public.customer_consents for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.form_submissions (
  consent_granted boolean default false not null,
  created_at timestamptz default now() not null,
  form_id uuid not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  payload jsonb default '{}'::jsonb not null,
  status text default '' not null,
  primary key (id)
);
alter table public.form_submissions add constraint form_submissions_form_id_fkey foreign key (form_id) references public.storefront_forms(id) on delete cascade;
alter table public.form_submissions add constraint form_submissions_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists form_submissions_merchant_idx on public.form_submissions (merchant_id);
create index if not exists form_submissions_created_idx on public.form_submissions (created_at desc);
grant select, insert, update, delete on public.form_submissions to authenticated;
grant all on public.form_submissions to service_role;
alter table public.form_submissions enable row level security;
create policy "form_submissions_tenant_read" on public.form_submissions for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "form_submissions_tenant_write" on public.form_submissions for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.inventory_transfers (
  created_at timestamptz default now() not null,
  created_by uuid,
  from_location_id uuid not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  note text,
  received_at timestamptz,
  reference text not null,
  status public.transfer_status not null,
  to_location_id uuid not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.inventory_transfers add constraint inventory_transfers_from_location_id_fkey foreign key (from_location_id) references public.inventory_locations(id) on delete cascade;
alter table public.inventory_transfers add constraint inventory_transfers_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.inventory_transfers add constraint inventory_transfers_to_location_id_fkey foreign key (to_location_id) references public.inventory_locations(id) on delete cascade;
create index if not exists inventory_transfers_merchant_idx on public.inventory_transfers (merchant_id);
create index if not exists inventory_transfers_created_idx on public.inventory_transfers (created_at desc);
create trigger inventory_transfers_set_updated_at before update on public.inventory_transfers for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.inventory_transfers to authenticated;
grant all on public.inventory_transfers to service_role;
alter table public.inventory_transfers enable row level security;
create policy "inventory_transfers_tenant_read" on public.inventory_transfers for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "inventory_transfers_tenant_write" on public.inventory_transfers for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.marketplace_installs (
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  expires_at timestamptz,
  id uuid default gen_random_uuid() not null,
  idempotency_key text not null,
  is_trial boolean default false not null,
  kind public.market_kind not null,
  listing_name text default '' not null,
  listing_slug text default '' not null,
  merchant_id uuid not null,
  previous_snapshot jsonb default '{}'::jsonb not null,
  price_minor_int bigint default 0 not null,
  started_at timestamptz default now() not null,
  status public.market_install_status default 'installed'::public.market_install_status not null,
  theme_id uuid,
  updated_at timestamptz default now() not null,
  version text default '' not null,
  widget_id uuid,
  primary key (id)
);
alter table public.marketplace_installs add constraint marketplace_installs_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.marketplace_installs add constraint marketplace_installs_theme_id_fkey foreign key (theme_id) references public.marketplace_themes(id) on delete set null;
alter table public.marketplace_installs add constraint marketplace_installs_widget_id_fkey foreign key (widget_id) references public.marketplace_widgets(id) on delete set null;
create index if not exists marketplace_installs_merchant_idx on public.marketplace_installs (merchant_id);
create index if not exists marketplace_installs_created_idx on public.marketplace_installs (created_at desc);
create trigger marketplace_installs_set_updated_at before update on public.marketplace_installs for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.marketplace_installs to authenticated;
grant all on public.marketplace_installs to service_role;
alter table public.marketplace_installs enable row level security;
create policy "marketplace_installs_tenant_read" on public.marketplace_installs for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "marketplace_installs_tenant_write" on public.marketplace_installs for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.merchant_members (
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  invited_by uuid,
  last_login_at timestamptz,
  merchant_id uuid not null,
  mfa_status public.staff_mfa_status default 'none'::public.staff_mfa_status not null,
  role public.merchant_role default 'owner'::public.merchant_role not null,
  role_id uuid,
  status public.staff_status default 'invited'::public.staff_status not null,
  updated_at timestamptz default now() not null,
  user_id uuid not null,
  primary key (id)
);
alter table public.merchant_members add constraint merchant_members_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.merchant_members add constraint merchant_members_role_id_fkey foreign key (role_id) references public.staff_roles(id) on delete set null;
create index if not exists merchant_members_merchant_idx on public.merchant_members (merchant_id);
create index if not exists merchant_members_created_idx on public.merchant_members (created_at desc);
create trigger merchant_members_set_updated_at before update on public.merchant_members for each row execute function public.set_updated_at();
create unique index if not exists merchant_members_merchant_id_user_id_uq on public.merchant_members (merchant_id, user_id);
grant select, insert, update, delete on public.merchant_members to authenticated;
grant all on public.merchant_members to service_role;
alter table public.merchant_members enable row level security;
create policy "merchant_members_read" on public.merchant_members for select to authenticated
  using (user_id = auth.uid() or public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "merchant_members_manage" on public.merchant_members for all to authenticated
  using (public.is_merchant_admin(merchant_id) or public.is_platform_admin())
  with check (public.is_merchant_admin(merchant_id) or public.is_platform_admin());

create table if not exists public.orders (
  access_token text default '' not null,
  address_line text not null,
  city text not null,
  cod_surcharge_minor_int bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  customer_email text,
  customer_id uuid,
  customer_name text not null,
  customer_phone text not null,
  discount_minor_int bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  idempotency_key text,
  merchant_id uuid not null,
  note text,
  order_number text not null,
  payment_method public.payment_method default 'cod'::public.payment_method not null,
  postcode text,
  shipping_minor_int bigint default 0 not null,
  status public.order_status default 'pending'::public.order_status not null,
  subtotal_minor_int bigint default 0 not null,
  total_minor_int bigint default 0 not null,
  updated_at timestamptz default now() not null,
  vat_minor_int bigint default 0 not null,
  vat_rate_basis_points bigint default 0 not null,
  primary key (id)
);
alter table public.orders add constraint orders_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null;
alter table public.orders add constraint orders_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists orders_merchant_idx on public.orders (merchant_id);
create index if not exists orders_created_idx on public.orders (created_at desc);
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "orders_tenant_read" on public.orders for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "orders_tenant_write" on public.orders for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.products (
  brand_id uuid,
  category_id uuid,
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  description text,
  id uuid default gen_random_uuid() not null,
  image_url text,
  merchant_id uuid not null,
  product_kind public.product_kind default 'physical'::public.product_kind not null,
  requires_shipping boolean default false not null,
  search_doc text default '' not null,
  slug text not null,
  status public.catalog_status default 'draft'::public.catalog_status not null,
  tags text[] default '{}'::text[] not null,
  tax_category text default '' not null,
  title text not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.products add constraint products_brand_id_fkey foreign key (brand_id) references public.brands(id) on delete set null;
alter table public.products add constraint products_category_id_fkey foreign key (category_id) references public.categories(id) on delete set null;
alter table public.products add constraint products_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists products_merchant_idx on public.products (merchant_id);
create index if not exists products_created_idx on public.products (created_at desc);
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "products_tenant_read" on public.products for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "products_tenant_write" on public.products for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.shipping_rate_rules (
  base_minor_int bigint default 0 not null,
  carrier_code text,
  cod_fee_bp bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  enabled boolean default false not null,
  free_over_minor_int bigint,
  id uuid default gen_random_uuid() not null,
  max_weight_grams bigint default 0 not null,
  merchant_id uuid not null,
  min_weight_grams bigint default 0 not null,
  per_kg_minor_int bigint default 0 not null,
  priority bigint default 0 not null,
  updated_at timestamptz default now() not null,
  zone_id uuid not null,
  primary key (id)
);
alter table public.shipping_rate_rules add constraint shipping_rate_rules_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.shipping_rate_rules add constraint shipping_rate_rules_zone_id_fkey foreign key (zone_id) references public.shipping_zones(id) on delete cascade;
create index if not exists shipping_rate_rules_merchant_idx on public.shipping_rate_rules (merchant_id);
create index if not exists shipping_rate_rules_created_idx on public.shipping_rate_rules (created_at desc);
create trigger shipping_rate_rules_set_updated_at before update on public.shipping_rate_rules for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.shipping_rate_rules to authenticated;
grant all on public.shipping_rate_rules to service_role;
alter table public.shipping_rate_rules enable row level security;
create policy "shipping_rate_rules_tenant_read" on public.shipping_rate_rules for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "shipping_rate_rules_tenant_write" on public.shipping_rate_rules for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.abandoned_carts (
  cart_token text not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  customer_email text,
  customer_name text,
  customer_phone text,
  id uuid default gen_random_uuid() not null,
  last_seen_at timestamptz default now() not null,
  lines jsonb default '{}'::jsonb not null,
  merchant_id uuid not null,
  recovered_order_id uuid,
  recovery_sent_at timestamptz,
  status public.abandoned_cart_status not null,
  subtotal_minor_int bigint default 0 not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.abandoned_carts add constraint abandoned_carts_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.abandoned_carts add constraint abandoned_carts_recovered_order_id_fkey foreign key (recovered_order_id) references public.orders(id) on delete set null;
create index if not exists abandoned_carts_merchant_idx on public.abandoned_carts (merchant_id);
create index if not exists abandoned_carts_created_idx on public.abandoned_carts (created_at desc);
create trigger abandoned_carts_set_updated_at before update on public.abandoned_carts for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.abandoned_carts to authenticated;
grant all on public.abandoned_carts to service_role;
alter table public.abandoned_carts enable row level security;
create policy "abandoned_carts_tenant_read" on public.abandoned_carts for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "abandoned_carts_tenant_write" on public.abandoned_carts for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.ai_conversations (
  channel public.ai_channel default 'widget'::public.ai_channel not null,
  created_at timestamptz default now() not null,
  first_message_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  last_message_at timestamptz default now() not null,
  merchant_id uuid not null,
  order_id uuid,
  order_number text,
  phone_hash text,
  rating bigint,
  status public.ai_conversation_status default 'open'::public.ai_conversation_status not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.ai_conversations add constraint ai_conversations_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.ai_conversations add constraint ai_conversations_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
create index if not exists ai_conversations_merchant_idx on public.ai_conversations (merchant_id);
create index if not exists ai_conversations_created_idx on public.ai_conversations (created_at desc);
create trigger ai_conversations_set_updated_at before update on public.ai_conversations for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.ai_conversations to authenticated;
grant all on public.ai_conversations to service_role;
alter table public.ai_conversations enable row level security;
create policy "ai_conversations_tenant_read" on public.ai_conversations for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "ai_conversations_tenant_write" on public.ai_conversations for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.campaign_sends (
  campaign_id uuid not null,
  created_at timestamptz default now() not null,
  email text not null,
  error text,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  sent_at timestamptz,
  status text default '' not null,
  subscriber_id uuid,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.campaign_sends add constraint campaign_sends_campaign_id_fkey foreign key (campaign_id) references public.campaigns(id) on delete cascade;
alter table public.campaign_sends add constraint campaign_sends_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.campaign_sends add constraint campaign_sends_subscriber_id_fkey foreign key (subscriber_id) references public.subscribers(id) on delete set null;
create index if not exists campaign_sends_merchant_idx on public.campaign_sends (merchant_id);
create index if not exists campaign_sends_created_idx on public.campaign_sends (created_at desc);
create trigger campaign_sends_set_updated_at before update on public.campaign_sends for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.campaign_sends to authenticated;
grant all on public.campaign_sends to service_role;
alter table public.campaign_sends enable row level security;
create policy "campaign_sends_tenant_read" on public.campaign_sends for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "campaign_sends_tenant_write" on public.campaign_sends for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.charge_intents (
  amount_minor_int bigint not null,
  attempt bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  expires_at timestamptz default now() not null,
  failure_code text,
  id uuid default gen_random_uuid() not null,
  idempotency_key text not null,
  merchant_id uuid not null,
  method public.payment_method not null,
  order_id uuid not null,
  provider_reference text,
  return_nonce text default '' not null,
  settled_at timestamptz,
  status public.charge_intent_status default 'initiated'::public.charge_intent_status not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.charge_intents add constraint charge_intents_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.charge_intents add constraint charge_intents_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create index if not exists charge_intents_merchant_idx on public.charge_intents (merchant_id);
create index if not exists charge_intents_created_idx on public.charge_intents (created_at desc);
create trigger charge_intents_set_updated_at before update on public.charge_intents for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.charge_intents to authenticated;
grant all on public.charge_intents to service_role;
alter table public.charge_intents enable row level security;
create policy "charge_intents_tenant_read" on public.charge_intents for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "charge_intents_tenant_write" on public.charge_intents for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.cod_reconciliations (
  carrier_code text,
  cleared_at timestamptz,
  cleared_by uuid,
  collected_minor_int bigint not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  expected_minor_int bigint not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  note text,
  order_id uuid not null,
  status public.cod_recon_status default 'pending'::public.cod_recon_status not null,
  updated_at timestamptz default now() not null,
  variance_minor_int bigint not null,
  primary key (id)
);
alter table public.cod_reconciliations add constraint cod_reconciliations_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.cod_reconciliations add constraint cod_reconciliations_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create index if not exists cod_reconciliations_merchant_idx on public.cod_reconciliations (merchant_id);
create index if not exists cod_reconciliations_created_idx on public.cod_reconciliations (created_at desc);
create trigger cod_reconciliations_set_updated_at before update on public.cod_reconciliations for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.cod_reconciliations to authenticated;
grant all on public.cod_reconciliations to service_role;
alter table public.cod_reconciliations enable row level security;
create policy "cod_reconciliations_tenant_read" on public.cod_reconciliations for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "cod_reconciliations_tenant_write" on public.cod_reconciliations for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.collection_products (
  collection_id uuid not null,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  position bigint default 0 not null,
  product_id uuid not null,
  primary key (id)
);
alter table public.collection_products add constraint collection_products_collection_id_fkey foreign key (collection_id) references public.collections(id) on delete cascade;
alter table public.collection_products add constraint collection_products_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.collection_products add constraint collection_products_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
create index if not exists collection_products_merchant_idx on public.collection_products (merchant_id);
create index if not exists collection_products_created_idx on public.collection_products (created_at desc);
grant select, insert, update, delete on public.collection_products to authenticated;
grant all on public.collection_products to service_role;
alter table public.collection_products enable row level security;
create policy "collection_products_tenant_read" on public.collection_products for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "collection_products_tenant_write" on public.collection_products for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.coupon_redemptions (
  amount_minor_int bigint default 0 not null,
  coupon_id uuid not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  customer_key text not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  order_id uuid,
  primary key (id)
);
alter table public.coupon_redemptions add constraint coupon_redemptions_coupon_id_fkey foreign key (coupon_id) references public.coupons(id) on delete cascade;
alter table public.coupon_redemptions add constraint coupon_redemptions_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.coupon_redemptions add constraint coupon_redemptions_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
create index if not exists coupon_redemptions_merchant_idx on public.coupon_redemptions (merchant_id);
create index if not exists coupon_redemptions_created_idx on public.coupon_redemptions (created_at desc);
grant select, insert, update, delete on public.coupon_redemptions to authenticated;
grant all on public.coupon_redemptions to service_role;
alter table public.coupon_redemptions enable row level security;
create policy "coupon_redemptions_tenant_read" on public.coupon_redemptions for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "coupon_redemptions_tenant_write" on public.coupon_redemptions for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.disputes (
  amount_minor_int bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  due_at timestamptz,
  evidence text,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  order_id uuid not null,
  provider text,
  provider_reference text,
  reason text not null,
  reference text not null,
  resolved_at timestamptz,
  status public.dispute_status not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.disputes add constraint disputes_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.disputes add constraint disputes_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create index if not exists disputes_merchant_idx on public.disputes (merchant_id);
create index if not exists disputes_created_idx on public.disputes (created_at desc);
create trigger disputes_set_updated_at before update on public.disputes for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.disputes to authenticated;
grant all on public.disputes to service_role;
alter table public.disputes enable row level security;
create policy "disputes_tenant_read" on public.disputes for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "disputes_tenant_write" on public.disputes for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.fraud_assessments (
  action text default '' not null,
  context jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null,
  decisive_code text,
  engine_version bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  order_id uuid,
  score bigint default 0 not null,
  signals jsonb default '{}'::jsonb not null,
  subject_hash text not null,
  primary key (id)
);
alter table public.fraud_assessments add constraint fraud_assessments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.fraud_assessments add constraint fraud_assessments_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
create index if not exists fraud_assessments_merchant_idx on public.fraud_assessments (merchant_id);
create index if not exists fraud_assessments_created_idx on public.fraud_assessments (created_at desc);
grant select, insert, update, delete on public.fraud_assessments to authenticated;
grant all on public.fraud_assessments to service_role;
alter table public.fraud_assessments enable row level security;
create policy "fraud_assessments_tenant_read" on public.fraud_assessments for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "fraud_assessments_tenant_write" on public.fraud_assessments for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.fraud_cases (
  amount_minor_int bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  customer_phone text default '' not null,
  decision_at timestamptz,
  decision_by uuid,
  decision_note text,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  order_id uuid,
  order_number text default '' not null,
  reason jsonb default '{}'::jsonb not null,
  risk_score numeric default 0 not null,
  signals jsonb default '{}'::jsonb not null,
  status public.fraud_case_status default 'open'::public.fraud_case_status not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.fraud_cases add constraint fraud_cases_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.fraud_cases add constraint fraud_cases_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
create index if not exists fraud_cases_merchant_idx on public.fraud_cases (merchant_id);
create index if not exists fraud_cases_created_idx on public.fraud_cases (created_at desc);
create trigger fraud_cases_set_updated_at before update on public.fraud_cases for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.fraud_cases to authenticated;
grant all on public.fraud_cases to service_role;
alter table public.fraud_cases enable row level security;
create policy "fraud_cases_tenant_read" on public.fraud_cases for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "fraud_cases_tenant_write" on public.fraud_cases for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.fulfilments (
  carrier_code text,
  created_at timestamptz default now() not null,
  created_by uuid,
  delivered_at timestamptz,
  id uuid default gen_random_uuid() not null,
  idempotency_key text not null,
  location_id uuid,
  merchant_id uuid not null,
  order_id uuid not null,
  reference text not null,
  shipped_at timestamptz,
  status public.fulfilment_status not null,
  tracking_number text,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.fulfilments add constraint fulfilments_location_id_fkey foreign key (location_id) references public.inventory_locations(id) on delete set null;
alter table public.fulfilments add constraint fulfilments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.fulfilments add constraint fulfilments_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create index if not exists fulfilments_merchant_idx on public.fulfilments (merchant_id);
create index if not exists fulfilments_created_idx on public.fulfilments (created_at desc);
create trigger fulfilments_set_updated_at before update on public.fulfilments for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.fulfilments to authenticated;
grant all on public.fulfilments to service_role;
alter table public.fulfilments enable row level security;
create policy "fulfilments_tenant_read" on public.fulfilments for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "fulfilments_tenant_write" on public.fulfilments for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.gift_card_entries (
  actor text,
  amount_minor_int bigint not null,
  balance_after_minor_int bigint not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  gift_card_id uuid not null,
  id uuid default gen_random_uuid() not null,
  idempotency_key text not null,
  kind text not null,
  merchant_id uuid not null,
  order_id uuid,
  primary key (id)
);
alter table public.gift_card_entries add constraint gift_card_entries_gift_card_id_fkey foreign key (gift_card_id) references public.gift_cards(id) on delete cascade;
alter table public.gift_card_entries add constraint gift_card_entries_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.gift_card_entries add constraint gift_card_entries_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
create index if not exists gift_card_entries_merchant_idx on public.gift_card_entries (merchant_id);
create index if not exists gift_card_entries_created_idx on public.gift_card_entries (created_at desc);
grant select, insert, update, delete on public.gift_card_entries to authenticated;
grant all on public.gift_card_entries to service_role;
alter table public.gift_card_entries enable row level security;
create policy "gift_card_entries_tenant_read" on public.gift_card_entries for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "gift_card_entries_tenant_write" on public.gift_card_entries for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.marketplace_reviews (
  comment text,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  install_id uuid not null,
  merchant_id uuid not null,
  moderation_status text default '' not null,
  rating bigint not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.marketplace_reviews add constraint marketplace_reviews_install_id_fkey foreign key (install_id) references public.marketplace_installs(id) on delete cascade;
alter table public.marketplace_reviews add constraint marketplace_reviews_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists marketplace_reviews_merchant_idx on public.marketplace_reviews (merchant_id);
create index if not exists marketplace_reviews_created_idx on public.marketplace_reviews (created_at desc);
create trigger marketplace_reviews_set_updated_at before update on public.marketplace_reviews for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.marketplace_reviews to authenticated;
grant all on public.marketplace_reviews to service_role;
alter table public.marketplace_reviews enable row level security;
create policy "marketplace_reviews_tenant_read" on public.marketplace_reviews for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "marketplace_reviews_tenant_write" on public.marketplace_reviews for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.order_amendments (
  actor_id uuid,
  after_totals jsonb not null,
  before_totals jsonb not null,
  created_at timestamptz default now() not null,
  currency_code text not null,
  delta_minor_int bigint not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  order_id uuid not null,
  reason text not null,
  primary key (id)
);
alter table public.order_amendments add constraint order_amendments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.order_amendments add constraint order_amendments_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create index if not exists order_amendments_merchant_idx on public.order_amendments (merchant_id);
create index if not exists order_amendments_created_idx on public.order_amendments (created_at desc);
grant select, insert, update, delete on public.order_amendments to authenticated;
grant all on public.order_amendments to service_role;
alter table public.order_amendments enable row level security;
create policy "order_amendments_tenant_read" on public.order_amendments for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "order_amendments_tenant_write" on public.order_amendments for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.order_events (
  created_at timestamptz default now() not null,
  event_type text not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  note text,
  order_id uuid not null,
  primary key (id)
);
alter table public.order_events add constraint order_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.order_events add constraint order_events_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create index if not exists order_events_merchant_idx on public.order_events (merchant_id);
create index if not exists order_events_created_idx on public.order_events (created_at desc);
grant select, insert, update, delete on public.order_events to authenticated;
grant all on public.order_events to service_role;
alter table public.order_events enable row level security;
create policy "order_events_tenant_read" on public.order_events for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "order_events_tenant_write" on public.order_events for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.order_invoices (
  business_bin text,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  discount_minor_int bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  invoice_number text not null,
  issued_at timestamptz default now() not null,
  merchant_id uuid not null,
  order_id uuid not null,
  sequence_no bigint not null,
  sequence_year bigint not null,
  shipping_minor_int bigint default 0 not null,
  subtotal_minor_int bigint not null,
  total_minor_int bigint not null,
  vat_minor_int bigint default 0 not null,
  vat_rate_basis_points bigint default 0 not null,
  primary key (id)
);
alter table public.order_invoices add constraint order_invoices_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.order_invoices add constraint order_invoices_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create index if not exists order_invoices_merchant_idx on public.order_invoices (merchant_id);
create index if not exists order_invoices_created_idx on public.order_invoices (created_at desc);
grant select, insert, update, delete on public.order_invoices to authenticated;
grant all on public.order_invoices to service_role;
alter table public.order_invoices enable row level security;
create policy "order_invoices_tenant_read" on public.order_invoices for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "order_invoices_tenant_write" on public.order_invoices for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.payments (
  amount_minor_int bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  id uuid default gen_random_uuid() not null,
  idempotency_key text not null,
  merchant_id uuid not null,
  order_id uuid not null,
  payment_provider text not null,
  payment_status text default '' not null,
  provider_reference text,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.payments add constraint payments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.payments add constraint payments_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create index if not exists payments_merchant_idx on public.payments (merchant_id);
create index if not exists payments_created_idx on public.payments (created_at desc);
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "payments_tenant_read" on public.payments for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "payments_tenant_write" on public.payments for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.pos_orders (
  address_line text,
  auth_code text,
  captured_at timestamptz default now() not null,
  city text,
  client_id uuid not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  customer_name text,
  customer_phone text,
  discount_minor_int bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  items jsonb default '{}'::jsonb not null,
  merchant_id uuid not null,
  order_id uuid,
  origin public.pos_origin default 'offline'::public.pos_origin not null,
  payment_method public.pos_payment_method default 'cash'::public.pos_payment_method not null,
  session_id uuid,
  status public.pos_order_status default 'local_pending'::public.pos_order_status not null,
  subtotal_minor_int bigint default 0 not null,
  total_minor_int bigint default 0 not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.pos_orders add constraint pos_orders_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.pos_orders add constraint pos_orders_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.pos_orders add constraint pos_orders_session_id_fkey foreign key (session_id) references public.pos_sessions(id) on delete set null;
create index if not exists pos_orders_merchant_idx on public.pos_orders (merchant_id);
create index if not exists pos_orders_created_idx on public.pos_orders (created_at desc);
create trigger pos_orders_set_updated_at before update on public.pos_orders for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.pos_orders to authenticated;
grant all on public.pos_orders to service_role;
alter table public.pos_orders enable row level security;
create policy "pos_orders_tenant_read" on public.pos_orders for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "pos_orders_tenant_write" on public.pos_orders for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.product_bundles (
  active boolean default false not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  fixed_price_minor_int bigint,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  percent_off bigint default 0 not null,
  pricing_mode text default '' not null,
  product_id uuid not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.product_bundles add constraint product_bundles_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.product_bundles add constraint product_bundles_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
create index if not exists product_bundles_merchant_idx on public.product_bundles (merchant_id);
create index if not exists product_bundles_created_idx on public.product_bundles (created_at desc);
create trigger product_bundles_set_updated_at before update on public.product_bundles for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.product_bundles to authenticated;
grant all on public.product_bundles to service_role;
alter table public.product_bundles enable row level security;
create policy "product_bundles_tenant_read" on public.product_bundles for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "product_bundles_tenant_write" on public.product_bundles for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.product_reviews (
  author_name text default '' not null,
  body text default '' not null,
  created_at timestamptz default now() not null,
  customer_id uuid,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  moderation_note text,
  product_id uuid not null,
  published_at timestamptz,
  rating bigint not null,
  status public.review_status default 'pending'::public.review_status not null,
  title text default '' not null,
  updated_at timestamptz default now() not null,
  verified_purchase boolean default false not null,
  primary key (id)
);
alter table public.product_reviews add constraint product_reviews_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null;
alter table public.product_reviews add constraint product_reviews_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.product_reviews add constraint product_reviews_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
create index if not exists product_reviews_merchant_idx on public.product_reviews (merchant_id);
create index if not exists product_reviews_created_idx on public.product_reviews (created_at desc);
create trigger product_reviews_set_updated_at before update on public.product_reviews for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.product_reviews to authenticated;
grant all on public.product_reviews to service_role;
alter table public.product_reviews enable row level security;
create policy "product_reviews_tenant_read" on public.product_reviews for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "product_reviews_tenant_write" on public.product_reviews for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.product_variants (
  barcode text,
  compare_at_amount_minor_int bigint,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  deleted_at timestamptz,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  name text default '' not null,
  position bigint default 0 not null,
  price_amount_minor_int bigint default 0 not null,
  product_id uuid not null,
  sku text,
  stock_quantity bigint default 0 not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.product_variants add constraint product_variants_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.product_variants add constraint product_variants_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
create index if not exists product_variants_merchant_idx on public.product_variants (merchant_id);
create index if not exists product_variants_created_idx on public.product_variants (created_at desc);
create trigger product_variants_set_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.product_variants to authenticated;
grant all on public.product_variants to service_role;
alter table public.product_variants enable row level security;
create policy "product_variants_tenant_read" on public.product_variants for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "product_variants_tenant_write" on public.product_variants for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.refunds (
  amount_minor_int bigint not null,
  attempt bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  failure_code text,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  method public.payment_method,
  order_id uuid not null,
  payment_provider text,
  provider_reference text,
  reason text,
  refund_key text not null,
  requested_by uuid,
  settled_at timestamptz,
  status text default '' not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.refunds add constraint refunds_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.refunds add constraint refunds_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
create index if not exists refunds_merchant_idx on public.refunds (merchant_id);
create index if not exists refunds_created_idx on public.refunds (created_at desc);
create trigger refunds_set_updated_at before update on public.refunds for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.refunds to authenticated;
grant all on public.refunds to service_role;
alter table public.refunds enable row level security;
create policy "refunds_tenant_read" on public.refunds for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "refunds_tenant_write" on public.refunds for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.service_offerings (
  advance_booking_days bigint default 0 not null,
  buffer_minutes bigint default 0 not null,
  cancellation_hours bigint default 0 not null,
  capacity_per_slot bigint default 0 not null,
  created_at timestamptz default now() not null,
  duration_minutes bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  location_kind text default '' not null,
  merchant_id uuid not null,
  product_id uuid not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.service_offerings add constraint service_offerings_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.service_offerings add constraint service_offerings_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
create index if not exists service_offerings_merchant_idx on public.service_offerings (merchant_id);
create index if not exists service_offerings_created_idx on public.service_offerings (created_at desc);
create trigger service_offerings_set_updated_at before update on public.service_offerings for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.service_offerings to authenticated;
grant all on public.service_offerings to service_role;
alter table public.service_offerings enable row level security;
create policy "service_offerings_tenant_read" on public.service_offerings for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "service_offerings_tenant_write" on public.service_offerings for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.shipment_quotes (
  amount_minor_int bigint default 0 not null,
  breakdown jsonb default '{}'::jsonb not null,
  carrier_code text not null,
  cod_fee_minor_int bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  order_id uuid,
  rule_id uuid,
  stale boolean default false not null,
  weight_grams bigint default 0 not null,
  zone_id uuid,
  primary key (id)
);
alter table public.shipment_quotes add constraint shipment_quotes_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.shipment_quotes add constraint shipment_quotes_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.shipment_quotes add constraint shipment_quotes_rule_id_fkey foreign key (rule_id) references public.shipping_rate_rules(id) on delete set null;
alter table public.shipment_quotes add constraint shipment_quotes_zone_id_fkey foreign key (zone_id) references public.shipping_zones(id) on delete set null;
create index if not exists shipment_quotes_merchant_idx on public.shipment_quotes (merchant_id);
create index if not exists shipment_quotes_created_idx on public.shipment_quotes (created_at desc);
grant select, insert, update, delete on public.shipment_quotes to authenticated;
grant all on public.shipment_quotes to service_role;
alter table public.shipment_quotes enable row level security;
create policy "shipment_quotes_tenant_read" on public.shipment_quotes for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "shipment_quotes_tenant_write" on public.shipment_quotes for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.store_themes (
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  is_active boolean default false not null,
  merchant_id uuid not null,
  name text not null,
  published_version_id uuid,
  source_install_id uuid,
  source_listing_id uuid,
  source_listing_slug text,
  source_version text,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.store_themes add constraint store_themes_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.store_themes add constraint store_themes_published_version_id_fkey foreign key (published_version_id) references public.theme_versions(id) on delete set null;
alter table public.store_themes add constraint store_themes_source_install_id_fkey foreign key (source_install_id) references public.marketplace_installs(id) on delete set null;
create index if not exists store_themes_merchant_idx on public.store_themes (merchant_id);
create index if not exists store_themes_created_idx on public.store_themes (created_at desc);
create trigger store_themes_set_updated_at before update on public.store_themes for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.store_themes to authenticated;
grant all on public.store_themes to service_role;
alter table public.store_themes enable row level security;
create policy "store_themes_tenant_read" on public.store_themes for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "store_themes_tenant_write" on public.store_themes for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.webhook_events (
  amount_minor_int bigint,
  attempt bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  event_type text not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid,
  order_id uuid,
  payload jsonb default '{}'::jsonb not null,
  processed_at timestamptz,
  provider text not null,
  reason text,
  received_at timestamptz default now() not null,
  redelivery_count bigint default 0 not null,
  result jsonb default '{}'::jsonb not null,
  status text default '' not null,
  updated_at timestamptz default now() not null,
  webhook_id uuid not null,
  primary key (id)
);
alter table public.webhook_events add constraint webhook_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete set null;
alter table public.webhook_events add constraint webhook_events_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
create index if not exists webhook_events_merchant_idx on public.webhook_events (merchant_id);
create index if not exists webhook_events_created_idx on public.webhook_events (created_at desc);
create trigger webhook_events_set_updated_at before update on public.webhook_events for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.webhook_events to authenticated;
grant all on public.webhook_events to service_role;
alter table public.webhook_events enable row level security;
create policy "webhook_events_tenant_read" on public.webhook_events for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "webhook_events_tenant_write" on public.webhook_events for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.ai_messages (
  body text not null,
  conversation_id uuid not null,
  created_at timestamptz default now() not null,
  flagged boolean default false not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  role public.ai_message_role not null,
  primary key (id)
);
alter table public.ai_messages add constraint ai_messages_conversation_id_fkey foreign key (conversation_id) references public.ai_conversations(id) on delete cascade;
alter table public.ai_messages add constraint ai_messages_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists ai_messages_merchant_idx on public.ai_messages (merchant_id);
create index if not exists ai_messages_created_idx on public.ai_messages (created_at desc);
grant select, insert, update, delete on public.ai_messages to authenticated;
grant all on public.ai_messages to service_role;
alter table public.ai_messages enable row level security;
create policy "ai_messages_tenant_read" on public.ai_messages for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "ai_messages_tenant_write" on public.ai_messages for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.bundle_items (
  bundle_id uuid not null,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  quantity bigint default 0 not null,
  variant_id uuid not null,
  primary key (id)
);
alter table public.bundle_items add constraint bundle_items_bundle_id_fkey foreign key (bundle_id) references public.product_bundles(id) on delete cascade;
alter table public.bundle_items add constraint bundle_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.bundle_items add constraint bundle_items_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete cascade;
create index if not exists bundle_items_merchant_idx on public.bundle_items (merchant_id);
create index if not exists bundle_items_created_idx on public.bundle_items (created_at desc);
grant select, insert, update, delete on public.bundle_items to authenticated;
grant all on public.bundle_items to service_role;
alter table public.bundle_items enable row level security;
create policy "bundle_items_tenant_read" on public.bundle_items for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "bundle_items_tenant_write" on public.bundle_items for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.carrier_shipments (
  address_line text,
  attempt_count bigint default 0 not null,
  awb text,
  cancelled_at timestamptz,
  carrier_code text not null,
  carrier_id uuid,
  city text,
  cod_amount_minor_int bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  delivered_at timestamptz,
  id uuid default gen_random_uuid() not null,
  is_cod boolean default false not null,
  last_event_at timestamptz,
  merchant_id uuid not null,
  order_id uuid,
  pickup_slot_end text,
  pickup_slot_start text,
  pos_order_id uuid,
  pudo_point text,
  quote_id uuid,
  quote_stale boolean default false not null,
  rate_minor_int bigint default 0 not null,
  signature_text text,
  status public.shipment_status default 'created'::public.shipment_status not null,
  tracking_token text default '' not null,
  tracking_url text,
  updated_at timestamptz default now() not null,
  weight_grams bigint default 0 not null,
  zone_id uuid,
  primary key (id)
);
alter table public.carrier_shipments add constraint carrier_shipments_carrier_id_fkey foreign key (carrier_id) references public.carriers(id) on delete set null;
alter table public.carrier_shipments add constraint carrier_shipments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.carrier_shipments add constraint carrier_shipments_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.carrier_shipments add constraint carrier_shipments_pos_order_id_fkey foreign key (pos_order_id) references public.pos_orders(id) on delete set null;
alter table public.carrier_shipments add constraint carrier_shipments_quote_id_fkey foreign key (quote_id) references public.shipment_quotes(id) on delete set null;
alter table public.carrier_shipments add constraint carrier_shipments_zone_id_fkey foreign key (zone_id) references public.shipping_zones(id) on delete set null;
create index if not exists carrier_shipments_merchant_idx on public.carrier_shipments (merchant_id);
create index if not exists carrier_shipments_created_idx on public.carrier_shipments (created_at desc);
create trigger carrier_shipments_set_updated_at before update on public.carrier_shipments for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.carrier_shipments to authenticated;
grant all on public.carrier_shipments to service_role;
alter table public.carrier_shipments enable row level security;
create policy "carrier_shipments_tenant_read" on public.carrier_shipments for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "carrier_shipments_tenant_write" on public.carrier_shipments for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.charge_intent_events (
  created_at timestamptz default now() not null,
  detail jsonb default '{}'::jsonb not null,
  from_status text default '' not null,
  id uuid default gen_random_uuid() not null,
  intent_id uuid not null,
  merchant_id uuid not null,
  to_status public.charge_intent_status not null,
  primary key (id)
);
alter table public.charge_intent_events add constraint charge_intent_events_intent_id_fkey foreign key (intent_id) references public.charge_intents(id) on delete cascade;
alter table public.charge_intent_events add constraint charge_intent_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists charge_intent_events_merchant_idx on public.charge_intent_events (merchant_id);
create index if not exists charge_intent_events_created_idx on public.charge_intent_events (created_at desc);
grant select, insert, update, delete on public.charge_intent_events to authenticated;
grant all on public.charge_intent_events to service_role;
alter table public.charge_intent_events enable row level security;
create policy "charge_intent_events_tenant_read" on public.charge_intent_events for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "charge_intent_events_tenant_write" on public.charge_intent_events for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.customer_wishlist_items (
  created_at timestamptz default now() not null,
  customer_id uuid not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  product_variant_id uuid not null,
  stock_alert boolean default false not null,
  primary key (id)
);
alter table public.customer_wishlist_items add constraint customer_wishlist_items_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete cascade;
alter table public.customer_wishlist_items add constraint customer_wishlist_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.customer_wishlist_items add constraint customer_wishlist_items_product_variant_id_fkey foreign key (product_variant_id) references public.product_variants(id) on delete cascade;
create index if not exists customer_wishlist_items_merchant_idx on public.customer_wishlist_items (merchant_id);
create index if not exists customer_wishlist_items_created_idx on public.customer_wishlist_items (created_at desc);
grant select, insert, update, delete on public.customer_wishlist_items to authenticated;
grant all on public.customer_wishlist_items to service_role;
alter table public.customer_wishlist_items enable row level security;
create policy "customer_wishlist_items_tenant_read" on public.customer_wishlist_items for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "customer_wishlist_items_tenant_write" on public.customer_wishlist_items for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.digital_assets (
  content_type text default '' not null,
  created_at timestamptz default now() not null,
  deleted_at timestamptz,
  expiry_hours bigint default 0 not null,
  file_name text not null,
  id uuid default gen_random_uuid() not null,
  max_downloads bigint default 0 not null,
  merchant_id uuid not null,
  product_id uuid not null,
  size_bytes bigint default 0 not null,
  storage_path text not null,
  updated_at timestamptz default now() not null,
  variant_id uuid,
  primary key (id)
);
alter table public.digital_assets add constraint digital_assets_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.digital_assets add constraint digital_assets_product_id_fkey foreign key (product_id) references public.products(id) on delete cascade;
alter table public.digital_assets add constraint digital_assets_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete set null;
create index if not exists digital_assets_merchant_idx on public.digital_assets (merchant_id);
create index if not exists digital_assets_created_idx on public.digital_assets (created_at desc);
create trigger digital_assets_set_updated_at before update on public.digital_assets for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.digital_assets to authenticated;
grant all on public.digital_assets to service_role;
alter table public.digital_assets enable row level security;
create policy "digital_assets_tenant_read" on public.digital_assets for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "digital_assets_tenant_write" on public.digital_assets for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.dispute_events (
  actor text,
  created_at timestamptz default now() not null,
  dispute_id uuid not null,
  from_status public.dispute_status,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  note text,
  to_status public.dispute_status not null,
  primary key (id)
);
alter table public.dispute_events add constraint dispute_events_dispute_id_fkey foreign key (dispute_id) references public.disputes(id) on delete cascade;
alter table public.dispute_events add constraint dispute_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists dispute_events_merchant_idx on public.dispute_events (merchant_id);
create index if not exists dispute_events_created_idx on public.dispute_events (created_at desc);
grant select, insert, update, delete on public.dispute_events to authenticated;
grant all on public.dispute_events to service_role;
alter table public.dispute_events enable row level security;
create policy "dispute_events_tenant_read" on public.dispute_events for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "dispute_events_tenant_write" on public.dispute_events for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.fraud_audit (
  action text not null,
  actor text,
  case_id uuid,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  payload jsonb default '{}'::jsonb not null,
  primary key (id)
);
alter table public.fraud_audit add constraint fraud_audit_case_id_fkey foreign key (case_id) references public.fraud_cases(id) on delete set null;
alter table public.fraud_audit add constraint fraud_audit_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists fraud_audit_merchant_idx on public.fraud_audit (merchant_id);
create index if not exists fraud_audit_created_idx on public.fraud_audit (created_at desc);
grant select, insert, update, delete on public.fraud_audit to authenticated;
grant all on public.fraud_audit to service_role;
alter table public.fraud_audit enable row level security;
create policy "fraud_audit_tenant_read" on public.fraud_audit for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "fraud_audit_tenant_write" on public.fraud_audit for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.inventory_levels (
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  location_id uuid not null,
  low_stock_threshold bigint,
  merchant_id uuid not null,
  on_hand bigint default 0 not null,
  reserved bigint default 0 not null,
  updated_at timestamptz default now() not null,
  variant_id uuid not null,
  primary key (id)
);
alter table public.inventory_levels add constraint inventory_levels_location_id_fkey foreign key (location_id) references public.inventory_locations(id) on delete cascade;
alter table public.inventory_levels add constraint inventory_levels_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.inventory_levels add constraint inventory_levels_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete cascade;
create index if not exists inventory_levels_merchant_idx on public.inventory_levels (merchant_id);
create index if not exists inventory_levels_created_idx on public.inventory_levels (created_at desc);
create trigger inventory_levels_set_updated_at before update on public.inventory_levels for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.inventory_levels to authenticated;
grant all on public.inventory_levels to service_role;
alter table public.inventory_levels enable row level security;
create policy "inventory_levels_tenant_read" on public.inventory_levels for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "inventory_levels_tenant_write" on public.inventory_levels for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.inventory_transfer_items (
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  quantity bigint not null,
  transfer_id uuid not null,
  variant_id uuid not null,
  primary key (id)
);
alter table public.inventory_transfer_items add constraint inventory_transfer_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.inventory_transfer_items add constraint inventory_transfer_items_transfer_id_fkey foreign key (transfer_id) references public.inventory_transfers(id) on delete cascade;
alter table public.inventory_transfer_items add constraint inventory_transfer_items_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete cascade;
create index if not exists inventory_transfer_items_merchant_idx on public.inventory_transfer_items (merchant_id);
create index if not exists inventory_transfer_items_created_idx on public.inventory_transfer_items (created_at desc);
grant select, insert, update, delete on public.inventory_transfer_items to authenticated;
grant all on public.inventory_transfer_items to service_role;
alter table public.inventory_transfer_items enable row level security;
create policy "inventory_transfer_items_tenant_read" on public.inventory_transfer_items for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "inventory_transfer_items_tenant_write" on public.inventory_transfer_items for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.order_items (
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  line_total_minor_int bigint not null,
  merchant_id uuid not null,
  order_id uuid not null,
  product_title text not null,
  quantity bigint not null,
  sku text,
  unit_price_minor_int bigint not null,
  variant_id uuid,
  variant_name text default '' not null,
  primary key (id)
);
alter table public.order_items add constraint order_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.order_items add constraint order_items_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
alter table public.order_items add constraint order_items_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete set null;
create index if not exists order_items_merchant_idx on public.order_items (merchant_id);
create index if not exists order_items_created_idx on public.order_items (created_at desc);
grant select, insert, update, delete on public.order_items to authenticated;
grant all on public.order_items to service_role;
alter table public.order_items enable row level security;
create policy "order_items_tenant_read" on public.order_items for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "order_items_tenant_write" on public.order_items for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.pos_payments (
  amount_minor_int bigint not null,
  auth_code text,
  change_minor_int bigint default 0 not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  method public.pos_payment_method not null,
  pos_order_id uuid not null,
  tendered_minor_int bigint default 0 not null,
  primary key (id)
);
alter table public.pos_payments add constraint pos_payments_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.pos_payments add constraint pos_payments_pos_order_id_fkey foreign key (pos_order_id) references public.pos_orders(id) on delete cascade;
create index if not exists pos_payments_merchant_idx on public.pos_payments (merchant_id);
create index if not exists pos_payments_created_idx on public.pos_payments (created_at desc);
grant select, insert, update, delete on public.pos_payments to authenticated;
grant all on public.pos_payments to service_role;
alter table public.pos_payments enable row level security;
create policy "pos_payments_tenant_read" on public.pos_payments for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "pos_payments_tenant_write" on public.pos_payments for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.pos_refunds (
  amount_minor_int bigint not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  id uuid default gen_random_uuid() not null,
  idempotency_key text not null,
  lines jsonb default '{}'::jsonb not null,
  merchant_id uuid not null,
  method public.pos_payment_method not null,
  pos_order_id uuid not null,
  reason text,
  restock boolean default false not null,
  session_id uuid,
  staff_user_id uuid,
  primary key (id)
);
alter table public.pos_refunds add constraint pos_refunds_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.pos_refunds add constraint pos_refunds_pos_order_id_fkey foreign key (pos_order_id) references public.pos_orders(id) on delete cascade;
alter table public.pos_refunds add constraint pos_refunds_session_id_fkey foreign key (session_id) references public.pos_sessions(id) on delete set null;
create index if not exists pos_refunds_merchant_idx on public.pos_refunds (merchant_id);
create index if not exists pos_refunds_created_idx on public.pos_refunds (created_at desc);
grant select, insert, update, delete on public.pos_refunds to authenticated;
grant all on public.pos_refunds to service_role;
alter table public.pos_refunds enable row level security;
create policy "pos_refunds_tenant_read" on public.pos_refunds for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "pos_refunds_tenant_write" on public.pos_refunds for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.return_requests (
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  customer_note text,
  decided_at timestamptz,
  decided_by uuid,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  order_id uuid not null,
  reason text not null,
  reference text not null,
  refund_id uuid,
  refund_minor_int bigint default 0 not null,
  staff_note text,
  status public.return_status not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.return_requests add constraint return_requests_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.return_requests add constraint return_requests_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade;
alter table public.return_requests add constraint return_requests_refund_id_fkey foreign key (refund_id) references public.refunds(id) on delete set null;
create index if not exists return_requests_merchant_idx on public.return_requests (merchant_id);
create index if not exists return_requests_created_idx on public.return_requests (created_at desc);
create trigger return_requests_set_updated_at before update on public.return_requests for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.return_requests to authenticated;
grant all on public.return_requests to service_role;
alter table public.return_requests enable row level security;
create policy "return_requests_tenant_read" on public.return_requests for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "return_requests_tenant_write" on public.return_requests for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.review_replies (
  body text not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  published_at timestamptz default now() not null,
  review_id uuid not null,
  staff_user_id uuid not null,
  primary key (id)
);
alter table public.review_replies add constraint review_replies_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.review_replies add constraint review_replies_review_id_fkey foreign key (review_id) references public.product_reviews(id) on delete cascade;
create index if not exists review_replies_merchant_idx on public.review_replies (merchant_id);
grant select, insert, update, delete on public.review_replies to authenticated;
grant all on public.review_replies to service_role;
alter table public.review_replies enable row level security;
create policy "review_replies_tenant_read" on public.review_replies for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "review_replies_tenant_write" on public.review_replies for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.settlement_items (
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  fee_minor_int bigint default 0 not null,
  file_id uuid not null,
  gross_minor_int bigint not null,
  id uuid default gen_random_uuid() not null,
  match_kind text default '' not null,
  merchant_id uuid not null,
  net_minor_int bigint not null,
  order_id uuid,
  payment_id uuid,
  posted boolean default false not null,
  settlement_ref text not null,
  primary key (id)
);
alter table public.settlement_items add constraint settlement_items_file_id_fkey foreign key (file_id) references public.settlement_files(id) on delete cascade;
alter table public.settlement_items add constraint settlement_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.settlement_items add constraint settlement_items_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.settlement_items add constraint settlement_items_payment_id_fkey foreign key (payment_id) references public.payments(id) on delete set null;
create index if not exists settlement_items_merchant_idx on public.settlement_items (merchant_id);
create index if not exists settlement_items_created_idx on public.settlement_items (created_at desc);
grant select, insert, update, delete on public.settlement_items to authenticated;
grant all on public.settlement_items to service_role;
alter table public.settlement_items enable row level security;
create policy "settlement_items_tenant_read" on public.settlement_items for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "settlement_items_tenant_write" on public.settlement_items for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.stock_holds (
  checkout_token text not null,
  consumed_at timestamptz,
  created_at timestamptz default now() not null,
  expires_at timestamptz not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  order_id uuid,
  quantity bigint not null,
  released_at timestamptz,
  variant_id uuid not null,
  primary key (id)
);
alter table public.stock_holds add constraint stock_holds_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.stock_holds add constraint stock_holds_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.stock_holds add constraint stock_holds_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete cascade;
create index if not exists stock_holds_merchant_idx on public.stock_holds (merchant_id);
create index if not exists stock_holds_created_idx on public.stock_holds (created_at desc);
grant select, insert, update, delete on public.stock_holds to authenticated;
grant all on public.stock_holds to service_role;
alter table public.stock_holds enable row level security;
create policy "stock_holds_tenant_read" on public.stock_holds for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "stock_holds_tenant_write" on public.stock_holds for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.subscription_terms (
  billing_anchor_day bigint,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  interval_count bigint default 0 not null,
  interval_unit text default '' not null,
  merchant_id uuid not null,
  minimum_cycles bigint default 0 not null,
  trial_days bigint default 0 not null,
  updated_at timestamptz default now() not null,
  variant_id uuid not null,
  primary key (id)
);
alter table public.subscription_terms add constraint subscription_terms_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.subscription_terms add constraint subscription_terms_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete cascade;
create index if not exists subscription_terms_merchant_idx on public.subscription_terms (merchant_id);
create index if not exists subscription_terms_created_idx on public.subscription_terms (created_at desc);
create trigger subscription_terms_set_updated_at before update on public.subscription_terms for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.subscription_terms to authenticated;
grant all on public.subscription_terms to service_role;
alter table public.subscription_terms enable row level security;
create policy "subscription_terms_tenant_read" on public.subscription_terms for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "subscription_terms_tenant_write" on public.subscription_terms for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.theme_drafts (
  merchant_id uuid not null,
  revision bigint default 0 not null,
  templates jsonb default '{}'::jsonb not null,
  theme_id uuid not null,
  tokens jsonb default '{}'::jsonb not null,
  updated_at timestamptz default now() not null,
  updated_by uuid
);
alter table public.theme_drafts add constraint theme_drafts_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.theme_drafts add constraint theme_drafts_theme_id_fkey foreign key (theme_id) references public.store_themes(id) on delete cascade;
create index if not exists theme_drafts_merchant_idx on public.theme_drafts (merchant_id);
create trigger theme_drafts_set_updated_at before update on public.theme_drafts for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.theme_drafts to authenticated;
grant all on public.theme_drafts to service_role;
alter table public.theme_drafts enable row level security;
create policy "theme_drafts_tenant_read" on public.theme_drafts for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "theme_drafts_tenant_write" on public.theme_drafts for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.theme_versions (
  ast jsonb default '{}'::jsonb not null,
  checksum text,
  created_at timestamptz default now() not null,
  created_by uuid,
  id uuid default gen_random_uuid() not null,
  label text,
  merchant_id uuid not null,
  note text,
  published_at timestamptz,
  rollback_of text,
  source_registry_key text,
  source_registry_version text,
  status text default '' not null,
  templates jsonb default '{}'::jsonb not null,
  theme_id uuid not null,
  tokens jsonb default '{}'::jsonb not null,
  version bigint not null,
  primary key (id)
);
alter table public.theme_versions add constraint theme_versions_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.theme_versions add constraint theme_versions_rollback_of_fkey foreign key (rollback_of) references public.theme_versions(id) on delete set null;
alter table public.theme_versions add constraint theme_versions_theme_id_fkey foreign key (theme_id) references public.store_themes(id) on delete cascade;
create index if not exists theme_versions_merchant_idx on public.theme_versions (merchant_id);
create index if not exists theme_versions_created_idx on public.theme_versions (created_at desc);
grant select, insert, update, delete on public.theme_versions to authenticated;
grant all on public.theme_versions to service_role;
alter table public.theme_versions enable row level security;
create policy "theme_versions_tenant_read" on public.theme_versions for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "theme_versions_tenant_write" on public.theme_versions for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.cod_settlements (
  carrier_code text not null,
  created_at timestamptz default now() not null,
  currency_code text default 'BDT' not null,
  expected_minor_int bigint default 0 not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  note text,
  order_id uuid,
  reference text,
  reported_minor_int bigint,
  resolved_at timestamptz,
  resolved_by uuid,
  shipment_id uuid not null,
  state public.cod_settlement_state not null,
  updated_at timestamptz default now() not null,
  primary key (id)
);
alter table public.cod_settlements add constraint cod_settlements_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.cod_settlements add constraint cod_settlements_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
alter table public.cod_settlements add constraint cod_settlements_shipment_id_fkey foreign key (shipment_id) references public.carrier_shipments(id) on delete cascade;
create index if not exists cod_settlements_merchant_idx on public.cod_settlements (merchant_id);
create index if not exists cod_settlements_created_idx on public.cod_settlements (created_at desc);
create trigger cod_settlements_set_updated_at before update on public.cod_settlements for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.cod_settlements to authenticated;
grant all on public.cod_settlements to service_role;
alter table public.cod_settlements enable row level security;
create policy "cod_settlements_tenant_read" on public.cod_settlements for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "cod_settlements_tenant_write" on public.cod_settlements for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.courier_labels (
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  label_url text not null,
  merchant_id uuid not null,
  printable boolean default false not null,
  shipment_id uuid not null,
  primary key (id)
);
alter table public.courier_labels add constraint courier_labels_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.courier_labels add constraint courier_labels_shipment_id_fkey foreign key (shipment_id) references public.carrier_shipments(id) on delete cascade;
create index if not exists courier_labels_merchant_idx on public.courier_labels (merchant_id);
create index if not exists courier_labels_created_idx on public.courier_labels (created_at desc);
grant select, insert, update, delete on public.courier_labels to authenticated;
grant all on public.courier_labels to service_role;
alter table public.courier_labels enable row level security;
create policy "courier_labels_tenant_read" on public.courier_labels for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "courier_labels_tenant_write" on public.courier_labels for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.courier_webhook_events (
  attempts bigint default 0 not null,
  carrier_code text not null,
  event_id uuid not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid,
  next_attempt_at timestamptz,
  payload jsonb default '{}'::jsonb not null,
  processed_at timestamptz,
  reason text,
  received_at timestamptz default now() not null,
  shipment_id uuid,
  status public.courier_event_status not null,
  primary key (id)
);
alter table public.courier_webhook_events add constraint courier_webhook_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete set null;
alter table public.courier_webhook_events add constraint courier_webhook_events_shipment_id_fkey foreign key (shipment_id) references public.carrier_shipments(id) on delete set null;
create index if not exists courier_webhook_events_merchant_idx on public.courier_webhook_events (merchant_id);
grant select, insert, update, delete on public.courier_webhook_events to authenticated;
grant all on public.courier_webhook_events to service_role;
alter table public.courier_webhook_events enable row level security;
create policy "courier_webhook_events_tenant_read" on public.courier_webhook_events for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "courier_webhook_events_tenant_write" on public.courier_webhook_events for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.delivery_events (
  carrier_event_id uuid,
  created_at timestamptz default now() not null,
  event_type text not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  occurred_at timestamptz default now() not null,
  payload jsonb default '{}'::jsonb not null,
  shipment_id uuid not null,
  source text default '' not null,
  primary key (id)
);
alter table public.delivery_events add constraint delivery_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.delivery_events add constraint delivery_events_shipment_id_fkey foreign key (shipment_id) references public.carrier_shipments(id) on delete cascade;
create index if not exists delivery_events_merchant_idx on public.delivery_events (merchant_id);
create index if not exists delivery_events_created_idx on public.delivery_events (created_at desc);
grant select, insert, update, delete on public.delivery_events to authenticated;
grant all on public.delivery_events to service_role;
alter table public.delivery_events enable row level security;
create policy "delivery_events_tenant_read" on public.delivery_events for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "delivery_events_tenant_write" on public.delivery_events for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.digital_grants (
  asset_id uuid not null,
  created_at timestamptz default now() not null,
  customer_id uuid,
  downloads_used bigint default 0 not null,
  expires_at timestamptz not null,
  id uuid default gen_random_uuid() not null,
  last_download_at timestamptz,
  max_downloads bigint default 0 not null,
  merchant_id uuid not null,
  order_id uuid,
  revoked_at timestamptz,
  token_hash text not null,
  primary key (id)
);
alter table public.digital_grants add constraint digital_grants_asset_id_fkey foreign key (asset_id) references public.digital_assets(id) on delete cascade;
alter table public.digital_grants add constraint digital_grants_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null;
alter table public.digital_grants add constraint digital_grants_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.digital_grants add constraint digital_grants_order_id_fkey foreign key (order_id) references public.orders(id) on delete set null;
create index if not exists digital_grants_merchant_idx on public.digital_grants (merchant_id);
create index if not exists digital_grants_created_idx on public.digital_grants (created_at desc);
grant select, insert, update, delete on public.digital_grants to authenticated;
grant all on public.digital_grants to service_role;
alter table public.digital_grants enable row level security;
create policy "digital_grants_tenant_read" on public.digital_grants for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "digital_grants_tenant_write" on public.digital_grants for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.fulfilment_items (
  created_at timestamptz default now() not null,
  fulfilment_id uuid not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  order_item_id uuid not null,
  quantity bigint not null,
  primary key (id)
);
alter table public.fulfilment_items add constraint fulfilment_items_fulfilment_id_fkey foreign key (fulfilment_id) references public.fulfilments(id) on delete cascade;
alter table public.fulfilment_items add constraint fulfilment_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.fulfilment_items add constraint fulfilment_items_order_item_id_fkey foreign key (order_item_id) references public.order_items(id) on delete cascade;
create index if not exists fulfilment_items_merchant_idx on public.fulfilment_items (merchant_id);
create index if not exists fulfilment_items_created_idx on public.fulfilment_items (created_at desc);
grant select, insert, update, delete on public.fulfilment_items to authenticated;
grant all on public.fulfilment_items to service_role;
alter table public.fulfilment_items enable row level security;
create policy "fulfilment_items_tenant_read" on public.fulfilment_items for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "fulfilment_items_tenant_write" on public.fulfilment_items for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.return_events (
  actor text,
  created_at timestamptz default now() not null,
  from_status public.return_status,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  reason text,
  return_id uuid not null,
  to_status public.return_status not null,
  primary key (id)
);
alter table public.return_events add constraint return_events_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.return_events add constraint return_events_return_id_fkey foreign key (return_id) references public.return_requests(id) on delete cascade;
create index if not exists return_events_merchant_idx on public.return_events (merchant_id);
create index if not exists return_events_created_idx on public.return_events (created_at desc);
grant select, insert, update, delete on public.return_events to authenticated;
grant all on public.return_events to service_role;
alter table public.return_events enable row level security;
create policy "return_events_tenant_read" on public.return_events for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "return_events_tenant_write" on public.return_events for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.return_items (
  amount_minor_int bigint default 0 not null,
  created_at timestamptz default now() not null,
  id uuid default gen_random_uuid() not null,
  merchant_id uuid not null,
  order_item_id uuid not null,
  quantity bigint not null,
  restock boolean default false not null,
  return_id uuid not null,
  primary key (id)
);
alter table public.return_items add constraint return_items_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.return_items add constraint return_items_order_item_id_fkey foreign key (order_item_id) references public.order_items(id) on delete cascade;
alter table public.return_items add constraint return_items_return_id_fkey foreign key (return_id) references public.return_requests(id) on delete cascade;
create index if not exists return_items_merchant_idx on public.return_items (merchant_id);
create index if not exists return_items_created_idx on public.return_items (created_at desc);
grant select, insert, update, delete on public.return_items to authenticated;
grant all on public.return_items to service_role;
alter table public.return_items enable row level security;
create policy "return_items_tenant_read" on public.return_items for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "return_items_tenant_write" on public.return_items for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.settlement_variance_alerts (
  actual_minor_int bigint default 0 not null,
  created_at timestamptz default now() not null,
  expected_minor_int bigint default 0 not null,
  file_id uuid not null,
  id uuid default gen_random_uuid() not null,
  item_id uuid,
  kind text not null,
  merchant_id uuid not null,
  resolution_note text,
  resolved boolean default false not null,
  resolved_at timestamptz,
  resolved_by uuid,
  primary key (id)
);
alter table public.settlement_variance_alerts add constraint settlement_variance_alerts_file_id_fkey foreign key (file_id) references public.settlement_files(id) on delete cascade;
alter table public.settlement_variance_alerts add constraint settlement_variance_alerts_item_id_fkey foreign key (item_id) references public.settlement_items(id) on delete set null;
alter table public.settlement_variance_alerts add constraint settlement_variance_alerts_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
create index if not exists settlement_variance_alerts_merchant_idx on public.settlement_variance_alerts (merchant_id);
create index if not exists settlement_variance_alerts_created_idx on public.settlement_variance_alerts (created_at desc);
grant select, insert, update, delete on public.settlement_variance_alerts to authenticated;
grant all on public.settlement_variance_alerts to service_role;
alter table public.settlement_variance_alerts enable row level security;
create policy "settlement_variance_alerts_tenant_read" on public.settlement_variance_alerts for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "settlement_variance_alerts_tenant_write" on public.settlement_variance_alerts for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));

create table if not exists public.theme_schedules (
  action text not null,
  attempts bigint default 0 not null,
  completed_at timestamptz,
  created_at timestamptz default now() not null,
  created_by uuid,
  id uuid default gen_random_uuid() not null,
  last_error text,
  merchant_id uuid not null,
  run_at timestamptz not null,
  state text default '' not null,
  theme_id uuid not null,
  version_id uuid,
  primary key (id)
);
alter table public.theme_schedules add constraint theme_schedules_merchant_id_fkey foreign key (merchant_id) references public.merchants(id) on delete cascade;
alter table public.theme_schedules add constraint theme_schedules_theme_id_fkey foreign key (theme_id) references public.store_themes(id) on delete cascade;
alter table public.theme_schedules add constraint theme_schedules_version_id_fkey foreign key (version_id) references public.theme_versions(id) on delete set null;
create index if not exists theme_schedules_merchant_idx on public.theme_schedules (merchant_id);
create index if not exists theme_schedules_created_idx on public.theme_schedules (created_at desc);
grant select, insert, update, delete on public.theme_schedules to authenticated;
grant all on public.theme_schedules to service_role;
alter table public.theme_schedules enable row level security;
create policy "theme_schedules_tenant_read" on public.theme_schedules for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy "theme_schedules_tenant_write" on public.theme_schedules for all to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));
