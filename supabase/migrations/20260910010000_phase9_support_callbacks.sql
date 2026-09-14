-- ==============================================================================
-- Framique: Phase 9.3 & 9.4 — Support Callbacks Table
-- Migration: 20260910010000_phase9_support_callbacks.sql
-- ==============================================================================

-- support_callbacks: Stores in-chat callback requests from storefront customers
create table if not exists public.support_callbacks (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 1 and 100),
  phone_e164 text not null check (phone_e164 ~ '^\\+8801[3-9][0-9]{8}$'),
  preferred_window text not null check (preferred_window in ('morning', 'afternoon', 'evening')),
  note text check (char_length(note) <= 500),
  channel text not null default 'widget' check (channel in ('widget', 'whatsapp', 'messenger')),
  status text not null default 'pending' check (status in ('pending', 'contacted', 'failed', 'cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  contacted_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

-- Indexes
create index if not exists idx_support_callbacks_merchant_status
  on public.support_callbacks(merchant_id, status, created_at desc);

create index if not exists idx_support_callbacks_conversation
  on public.support_callbacks(conversation_id)
  where conversation_id is not null;

-- Deduplication index: one pending callback per phone per merchant in 30 min window
-- (enforced at application level via rate-limit; this index speeds the lookup)
create index if not exists idx_support_callbacks_phone_merchant
  on public.support_callbacks(merchant_id, phone_e164, status);

-- Enable RLS
alter table public.support_callbacks enable row level security;

-- Merchants can see their own callbacks
drop policy if exists support_callbacks_merchant_read on public.support_callbacks;
create policy support_callbacks_merchant_read on public.support_callbacks
  for select using (
    public.has_merchant_role(merchant_id, auth.uid(), 'viewer'::public.merchant_role)
  );

-- Merchants can update status of their own callbacks (marking contacted/failed/cancelled)
drop policy if exists support_callbacks_merchant_update on public.support_callbacks;
create policy support_callbacks_merchant_update on public.support_callbacks
  for update using (
    public.has_merchant_role(merchant_id, auth.uid(), 'editor'::public.merchant_role)
  );

-- Service role (server-side) can insert, update, select all
revoke all on public.support_callbacks from anon;
grant select on public.support_callbacks to authenticated;
grant all on public.support_callbacks to service_role;

-- Auto-update updated_at on mutations
create or replace function public.support_callbacks_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  if new.status = 'contacted' and old.status = 'pending' then
    new.contacted_at := timezone('utc'::text, now());
  end if;
  return new;
end;
$$;

drop trigger if exists support_callbacks_updated_at_trigger on public.support_callbacks;
create trigger support_callbacks_updated_at_trigger
  before update on public.support_callbacks
  for each row execute function public.support_callbacks_set_updated_at();

-- Notify merchant staff on new callback (via Supabase Realtime / pg_notify)
create or replace function public.support_callbacks_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_notify(
    'support_callbacks',
    json_build_object(
      'merchant_id', new.merchant_id,
      'callback_id', new.id,
      'customer_name', new.customer_name,
      'preferred_window', new.preferred_window,
      'status', new.status
    )::text
  );
  return new;
end;
$$;

drop trigger if exists support_callbacks_notify_trigger on public.support_callbacks;
create trigger support_callbacks_notify_trigger
  after insert on public.support_callbacks
  for each row execute function public.support_callbacks_notify();
