-- ==============================================================================
-- Framique: Phase 9.5 & 9.6 — CSAT Reviews & Continuous Training Flywheel
-- Migration: 0014_phase9_csat_and_training_data.sql
-- ==============================================================================

-- 1. Ensure ai_conversations has rating and review columns
alter table if exists public.ai_conversations
  add column if not exists rating integer check (rating between 1 and 5),
  add column if not exists review text;

-- 2. Create ai_conversation_feedback table (CSAT ratings & qualitative reviews)
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
    public.has_merchant_role(merchant_id, auth.uid(), 'viewer'::public.merchant_role)
  );

drop policy if exists ai_conversation_feedback_write on public.ai_conversation_feedback;
create policy ai_conversation_feedback_write on public.ai_conversation_feedback
  for all using (
    public.has_merchant_role(merchant_id, auth.uid(), 'editor'::public.merchant_role)
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
    public.has_merchant_role(merchant_id, auth.uid(), 'owner'::public.merchant_role)
  );

grant select on public.ai_training_conversations to authenticated;
grant all on public.ai_training_conversations to service_role;
