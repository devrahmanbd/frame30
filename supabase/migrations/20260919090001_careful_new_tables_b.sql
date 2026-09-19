create table if not exists public.draft_order_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  draft_order_id uuid not null references public.draft_orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete set null,
  title text not null default '',
  variant_name text not null default '',
  sku text not null default '',
  quantity bigint not null default 1,
  unit_price_minor_int bigint not null default 0,
  line_total_minor_int bigint not null default 0,
  created_at timestamp with time zone not null default now()
);
create index if not exists idx_draft_order_items_draft on public.draft_order_items(draft_order_id);

-- Ensure purchase_orders tables exist
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  code text not null,
  name text not null,
  email text,
  phone text,
  address_line text default '',
  lead_time_days integer not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (merchant_id, code)
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  location_id uuid,
  number text not null default '',
  currency_code text not null default 'BDT',
  status text not null default 'draft',
  note text default '',
  total_minor_int bigint not null default 0,
  expected_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
create index if not exists idx_purchase_orders_merchant on public.purchase_orders(merchant_id);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete restrict,
  sku text not null default '',
  quantity_ordered bigint not null default 1,
  quantity_received bigint not null default 0,
  unit_cost_minor_int bigint not null default 0,
  created_at timestamp with time zone not null default now()
);
create index if not exists idx_po_items_po on public.purchase_order_items(purchase_order_id);
create table if not exists public.ops_cron_jobs (
  key text primary key,
  label text not null default '',
  description text default '',
  schedule text not null default '0 * * * *',
  timezone text not null default 'UTC',
  timeout_ms integer not null default 30000,
  sla_max_duration_ms integer not null default 60000,
  alert_after_failures integer not null default 3,
  max_overdue_seconds integer not null default 3600,
  enabled boolean not null default true,
  paused_reason text,
  next_run_at timestamp with time zone,
  last_run_at timestamp with time zone,
  last_status text,
  consecutive_failures integer not null default 0,
  lease_token text,
  lease_expires_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.ops_cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null references public.ops_cron_jobs(key) on delete cascade,
  status text not null default 'running',
  trigger text not null default 'scheduled',
  attempt integer not null default 1,
  started_at timestamp with time zone not null default now(),
  finished_at timestamp with time zone,
  duration_ms integer,
  http_status integer,
  error_code text,
  error_message text,
  stats jsonb not null default '{}'::jsonb
);
create index if not exists idx_ops_cron_runs_job on public.ops_cron_runs(job_key, started_at desc);
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
    public.is_merchant_member(merchant_id)
  );

-- Merchants can update status of their own callbacks (marking contacted/failed/cancelled)
drop policy if exists support_callbacks_merchant_update on public.support_callbacks;
create policy support_callbacks_merchant_update on public.support_callbacks
  for update using (
    public.is_merchant_admin(merchant_id)
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
create table if not exists public.support_kb_chunks (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  doc_id uuid not null references public.support_kb_docs(id) on delete cascade,
  ordinal integer not null default 0,
  body text not null,
  embedding double precision[],
  fts tsvector generated always as (to_tsvector('english', body)) stored,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- Indexes for support_kb_chunks
create index if not exists idx_support_kb_chunks_merchant_doc 
  on public.support_kb_chunks(merchant_id, doc_id);

create index if not exists idx_support_kb_chunks_fts 
  on public.support_kb_chunks using gin(fts);

-- Enable RLS
alter table public.support_kb_chunks enable row level security;

drop policy if exists support_kb_chunks_read on public.support_kb_chunks;
create policy support_kb_chunks_read on public.support_kb_chunks
  for select using (true);

drop policy if exists support_kb_chunks_write on public.support_kb_chunks;
create policy support_kb_chunks_write on public.support_kb_chunks
  for all using (
    public.is_merchant_admin(merchant_id)
  );

grant select, insert, update, delete on public.support_kb_docs to authenticated;
grant select, insert, update, delete on public.support_kb_chunks to authenticated;
grant all on public.support_kb_docs to service_role;
grant all on public.support_kb_chunks to service_role;
create table if not exists public.ai_conversation_feedback (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review text check (char_length(review) <= 1000),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint uq_ai_conversation_feedback unique (conversation_id)
);

-- Indexes for feedback analytics
create index if not exists idx_ai_conversation_feedback_merchant_rating
  on public.ai_conversation_feedback(merchant_id, rating, created_at desc);

-- Enable RLS
alter table public.ai_conversation_feedback enable row level security;

-- Policies for feedback
drop policy if exists ai_conversation_feedback_read on public.ai_conversation_feedback;
create policy ai_conversation_feedback_read on public.ai_conversation_feedback
  for select using (
    public.is_merchant_member(merchant_id)
  );

drop policy if exists ai_conversation_feedback_write on public.ai_conversation_feedback;
create policy ai_conversation_feedback_write on public.ai_conversation_feedback
  for all using (
    public.is_merchant_admin(merchant_id)
  );

grant select on public.ai_conversation_feedback to authenticated;
grant all on public.ai_conversation_feedback to service_role;

-- 3. Create ai_training_conversations table (RLHF, SFT & DPO Flywheel)
create table if not exists public.ai_training_conversations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  turn_index integer not null default 0,
  system_prompt text not null,
  user_turn text not null,
  context_passages jsonb not null default '[]'::jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  agent_reply text not null,
  latency_ms integer not null default 0,
  csat_rating integer check (csat_rating between 1 and 5),
  csat_review text,
  grounded boolean not null default true,
  guardrail_blocked boolean not null default false,
  loop_detected boolean not null default false,
  reward_score double precision default 0.0,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- Indexes for training data export
create index if not exists idx_ai_training_export_sft
  on public.ai_training_conversations(csat_rating, created_at desc)
  where csat_rating >= 4;

create index if not exists idx_ai_training_reward
  on public.ai_training_conversations(reward_score desc);

create index if not exists idx_ai_training_merchant_conv
  on public.ai_training_conversations(merchant_id, conversation_id, turn_index);

-- Enable RLS
alter table public.ai_training_conversations enable row level security;

-- Policies for training data
drop policy if exists ai_training_conversations_read on public.ai_training_conversations;
create policy ai_training_conversations_read on public.ai_training_conversations
  for select using (
    public.is_merchant_admin(merchant_id)
  );

grant select on public.ai_training_conversations to authenticated;
grant all on public.ai_training_conversations to service_role;
-- ---- INFERRED tables (no repo DDL; shapes strictly from code call sites) ----
-- REVIEW REQUIRED by a DBA before alteration. All are absent live, so
-- creation is risk-free; column choices are reverse-engineered, not spec'd.

-- experiment children (experiments.server.ts shapes)
CREATE TABLE IF NOT EXISTS public.experiment_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  key text NOT NULL,
  is_control boolean NOT NULL DEFAULT false,
  weight_pct integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_experiment_variants_exp ON public.experiment_variants (merchant_id, experiment_id);

CREATE TABLE IF NOT EXISTS public.experiment_exposures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  variant_id uuid NULL,
  metric text NOT NULL,
  hits bigint NOT NULL DEFAULT 0,
  value_minor_int bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_experiment_exposures_exp ON public.experiment_exposures (merchant_id, experiment_id);

-- support children (support-tickets.server.ts shapes)
CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_id uuid NULL,
  action text NOT NULL,
  before jsonb NULL,
  after jsonb NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_events_ticket ON public.support_ticket_events (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS public.support_sla_policies (
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  priority text NOT NULL,
  first_response_minutes integer NOT NULL,
  resolution_minutes integer NOT NULL,
  PRIMARY KEY (merchant_id, priority)
);

-- oauth family (oauth.server.ts shapes; cross-checked with oauth-reuse.test.ts)
CREATE TABLE IF NOT EXISTS public.oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  name text NOT NULL,
  client_id text NOT NULL UNIQUE,
  client_type text NOT NULL,
  client_secret_hash text NULL,
  redirect_uris jsonb NOT NULL DEFAULT '[]'::jsonb,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NULL,
  secret_rotated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oauth_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  client_row_id uuid NOT NULL REFERENCES public.oauth_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  revoked_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oauth_consents_client_user ON public.oauth_consents (client_row_id, user_id);

CREATE TABLE IF NOT EXISTS public.oauth_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  client_row_id uuid NOT NULL REFERENCES public.oauth_clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  code_hash text NOT NULL UNIQUE,
  redirect_uri text NOT NULL,
  code_challenge text NULL,
  code_challenge_method text NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_authorizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oauth_tenant_rw ON public.oauth_clients;
CREATE POLICY oauth_tenant_rw ON public.oauth_clients FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));
DROP POLICY IF EXISTS oauth_consents_tenant_rw ON public.oauth_consents;
CREATE POLICY oauth_consents_tenant_rw ON public.oauth_consents FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));
DROP POLICY IF EXISTS oauth_authorizations_tenant_rw ON public.oauth_authorizations;
CREATE POLICY oauth_authorizations_tenant_rw ON public.oauth_authorizations FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));

-- theme custom code (custom-code.server.ts COLUMNS/Row shapes).
-- Two onConflict targets in code REQUIRE these unique constraints.
CREATE TABLE IF NOT EXISTS public.theme_custom_code (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  theme_id uuid NOT NULL,
  version_id uuid NULL REFERENCES public.theme_versions(id) ON DELETE CASCADE,
  css text NOT NULL DEFAULT '',
  js text NOT NULL DEFAULT '',
  head_snippet text NOT NULL DEFAULT '',
  body_start text NOT NULL DEFAULT '',
  body_end text NOT NULL DEFAULT '',
  js_requires_consent boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (theme_id),
  UNIQUE (version_id)
);
ALTER TABLE public.theme_custom_code ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS theme_custom_code_tenant_rw ON public.theme_custom_code;
CREATE POLICY theme_custom_code_tenant_rw ON public.theme_custom_code FOR ALL TO authenticated
  USING (public.is_merchant_member(merchant_id)) WITH CHECK (public.is_merchant_member(merchant_id));

NOTIFY pgrst, 'reload schema';
