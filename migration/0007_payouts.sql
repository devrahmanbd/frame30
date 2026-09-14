-- Payout module: the service layer (src/lib/payouts.server.ts) shipped before
-- its storage did, so every payout call resolved to a missing relation. These
-- tables match that layer exactly: derived balance, reservations, four-eyes
-- approvals and an append-only event trail.

create type public.payout_state as enum (
  'draft', 'requested', 'approved', 'processing', 'paid', 'failed', 'cancelled', 'reversed'
);
create type public.payout_method as enum ('mfs', 'bank');
create type public.payout_account_state as enum ('pending', 'verified', 'rejected', 'disabled');

-- ------------------------------------------------------------------ accounts
create table public.payout_accounts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  label text not null,
  method public.payout_method not null,
  state public.payout_account_state not null default 'pending',
  holder_name text not null,
  mfs_provider text,
  msisdn text,
  bank_name text,
  branch_name text,
  account_number text,
  routing_number text,
  last4 text,
  is_default boolean not null default false,
  verified_at timestamptz,
  rejection_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payout_accounts_merchant_idx on public.payout_accounts (merchant_id, created_at);

grant select on public.payout_accounts to authenticated;
grant all on public.payout_accounts to service_role;
alter table public.payout_accounts enable row level security;
create policy payout_accounts_tenant_read on public.payout_accounts
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- ------------------------------------------------------------------- payouts
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  account_id uuid not null references public.payout_accounts(id) on delete restrict,
  amount_minor_int bigint not null check (amount_minor_int > 0),
  fee_minor_int bigint not null default 0 check (fee_minor_int >= 0),
  net_minor_int bigint not null check (net_minor_int >= 0),
  currency_code text not null default 'BDT',
  method public.payout_method not null,
  state public.payout_state not null default 'draft',
  approvals_required integer not null default 1 check (approvals_required between 1 and 3),
  idempotency_key text not null,
  note text,
  requested_at timestamptz not null default now(),
  requested_by uuid,
  released_at timestamptz,
  released_by uuid,
  paid_at timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  failure_code text,
  failure_detail text,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, idempotency_key)
);
create index payouts_merchant_idx on public.payouts (merchant_id, requested_at desc);
create index payouts_worker_idx on public.payouts (state, next_attempt_at);

grant select on public.payouts to authenticated;
grant all on public.payouts to service_role;
alter table public.payouts enable row level security;
create policy payouts_tenant_read on public.payouts
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- ----------------------------------------------------------------- approvals
create table public.payout_approvals (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  actor uuid not null,
  decision text not null check (decision in ('approve', 'reject')),
  note text,
  created_at timestamptz not null default now(),
  unique (payout_id, actor)
);
create index payout_approvals_payout_idx on public.payout_approvals (payout_id);

grant select on public.payout_approvals to authenticated;
grant all on public.payout_approvals to service_role;
alter table public.payout_approvals enable row level security;
create policy payout_approvals_tenant_read on public.payout_approvals
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- --------------------------------------------------------------------- holds
create table public.payout_holds (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  amount_minor_int bigint not null check (amount_minor_int >= 0),
  reason text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid
);
create index payout_holds_open_idx on public.payout_holds (merchant_id) where released_at is null;

grant select on public.payout_holds to authenticated;
grant all on public.payout_holds to service_role;
alter table public.payout_holds enable row level security;
create policy payout_holds_tenant_read on public.payout_holds
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- -------------------------------------------------------------------- events
create table public.payout_events (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.payouts(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  event text not null,
  actor uuid,
  from_state public.payout_state,
  to_state public.payout_state,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index payout_events_payout_idx on public.payout_events (payout_id, created_at);

grant select on public.payout_events to authenticated;
grant all on public.payout_events to service_role;
alter table public.payout_events enable row level security;
create policy payout_events_tenant_read on public.payout_events
  for select to authenticated
  using (public.is_merchant_member(merchant_id, auth.uid()) or public.is_platform_admin(auth.uid()));

-- History is evidence: no rewriting a payout trail, even from a compromised
-- service-role session.
create or replace function public.payout_events_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'payout_events.append_only';
end;
$$;
create trigger payout_events_no_rewrite
  before update or delete on public.payout_events
  for each row execute function public.payout_events_append_only();

create trigger payout_accounts_touch before update on public.payout_accounts
  for each row execute function public.set_updated_at();
create trigger payouts_touch before update on public.payouts
  for each row execute function public.set_updated_at();
