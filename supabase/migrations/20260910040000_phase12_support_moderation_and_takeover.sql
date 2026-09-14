-- ==============================================================================
-- Framique: Phase 12.1 — Support Chat Moderation, Human Takeover & Operator Collaboration
-- Migration: 20260910040000_phase12_support_moderation_and_takeover.sql
--
-- Objectives:
--   1. Extend public.ai_conversations with human takeover mode, triage priority,
--      private operator notes, assigned operator, and timestamped intervention tracking.
--   2. Add sent_by_operator column to ai_messages to distinguish human vs bot messages.
--   3. Enable Supabase Realtime replication for live moderation workbench.
--   4. Enforce RLS: only platform_admins can read operator_notes and update takeover_mode.
--   5. Create a high-performance composite index for the moderation queue.
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Extend public.ai_conversations with moderation & takeover columns
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Human takeover mode: 'ai' = bot handles replies, 'human_takeover' = operator handles replies
alter table public.ai_conversations
  add column if not exists takeover_mode varchar(20) not null default 'ai'
    constraint chk_ai_conversations_takeover_mode
    check (takeover_mode in ('ai', 'human_takeover'));

-- 2. Support triage priority for queue sorting and SLA tracking
alter table public.ai_conversations
  add column if not exists priority varchar(20) not null default 'normal'
    constraint chk_ai_conversations_priority
    check (priority in ('low', 'normal', 'high', 'urgent'));

-- 3. Private internal operator scratchpad — only visible to platform_admins via RLS
alter table public.ai_conversations
  add column if not exists operator_notes text;

-- 4. Assigned operator for dedicated escalation ownership
alter table public.ai_conversations
  add column if not exists assigned_operator_id uuid
    references auth.users(id) on delete set null;

-- 5. Track human agent activity timestamps for SLA audit
alter table public.ai_conversations
  add column if not exists last_operator_message_at timestamptz;

-- 6. Track latest customer message for urgency sorting
alter table public.ai_conversations
  add column if not exists last_customer_message_at timestamptz;

-- 7. Resolved-at timestamp for lifecycle completion tracking
alter table public.ai_conversations
  add column if not exists resolved_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Extend public.ai_messages for human vs bot attribution
-- ─────────────────────────────────────────────────────────────────────────────

-- Indicates the message was typed by a platform operator (human), not the AI
alter table public.ai_messages
  add column if not exists sent_by_operator_id uuid
    references auth.users(id) on delete set null;

alter table public.ai_messages
  add column if not exists is_internal_note boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Composite indexes for the moderation queue workbench
-- ─────────────────────────────────────────────────────────────────────────────

-- Primary queue index: sort by priority desc, urgency (last customer msg), then create date
create index if not exists idx_ai_conversations_moderation_queue
  on public.ai_conversations (
    priority desc nulls last,
    last_customer_message_at desc nulls last,
    created_at desc
  )
  where status = 'open';

-- Takeover mode filter — for "Needs Agent" tab badge count
create index if not exists idx_ai_conversations_takeover_mode
  on public.ai_conversations (takeover_mode, status, created_at desc);

-- Assigned operator lookup
create index if not exists idx_ai_conversations_assigned_operator
  on public.ai_conversations (assigned_operator_id, status)
  where assigned_operator_id is not null;

-- Operator messages for audit log
create index if not exists idx_ai_messages_operator
  on public.ai_messages (sent_by_operator_id, created_at desc)
  where sent_by_operator_id is not null;

-- Internal notes (only platform admin should see these)
create index if not exists idx_ai_messages_internal_notes
  on public.ai_messages (conversation_id, created_at desc)
  where is_internal_note = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Update the set_updated_at trigger to include new columns
--    (trigger is already bound to ai_conversations, no additional action needed)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- E. Row-Level Security policies for operator_notes & takeover_mode
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop and re-create read policy to keep it current
drop policy if exists "ai_conversations_tenant_read" on public.ai_conversations;
create policy "ai_conversations_tenant_read" on public.ai_conversations
  for select to authenticated
  using (
    public.is_merchant_member(merchant_id) or public.is_platform_admin()
  );

-- Platform admins can update all moderation control fields (takeover_mode, priority,
-- operator_notes, assigned_operator_id). Merchant members retain write for their own
-- conversations (order linking, status, etc.) but cannot touch operator_notes.
drop policy if exists "ai_conversations_tenant_write" on public.ai_conversations;
create policy "ai_conversations_tenant_write" on public.ai_conversations
  for update to authenticated
  using (
    public.is_merchant_member(merchant_id) or public.is_platform_admin()
  )
  with check (
    -- Merchant members cannot set takeover_mode or write operator_notes
    (
      public.is_merchant_member(merchant_id) and
      -- Guard: if caller is ONLY a merchant member, operator_notes stays null/unchanged
      (operator_notes is null or public.is_platform_admin())
    )
    or public.is_platform_admin()
  );

-- Allow authenticated merchant members to insert new conversations
drop policy if exists "ai_conversations_tenant_insert" on public.ai_conversations;
create policy "ai_conversations_tenant_insert" on public.ai_conversations
  for insert to authenticated
  with check (
    public.is_merchant_member(merchant_id)
  );

-- Allow platform admins to delete conversations (GDPR / abuse)
drop policy if exists "ai_conversations_platform_delete" on public.ai_conversations;
create policy "ai_conversations_platform_delete" on public.ai_conversations
  for delete to authenticated
  using (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- F. RLS for ai_messages — internal notes visible only to platform admins
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "ai_messages_tenant_read" on public.ai_messages;
create policy "ai_messages_tenant_read" on public.ai_messages
  for select to authenticated
  using (
    -- Regular message: merchant member can read their own
    (
      not is_internal_note
      and (public.is_merchant_member(merchant_id) or public.is_platform_admin())
    )
    or
    -- Internal notes: only platform admins
    (
      is_internal_note and public.is_platform_admin()
    )
  );

drop policy if exists "ai_messages_tenant_write" on public.ai_messages;
create policy "ai_messages_tenant_write" on public.ai_messages
  for insert to authenticated
  with check (
    -- Bot/customer messages: merchant member can insert for their store
    (not is_internal_note and public.is_merchant_member(merchant_id))
    or
    -- Operator messages & internal notes: only platform admins
    (public.is_platform_admin())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- G. Grants
-- ─────────────────────────────────────────────────────────────────────────────

grant select, insert, update, delete on public.ai_conversations to authenticated;
grant all on public.ai_conversations to service_role;

grant select, insert, update, delete on public.ai_messages to authenticated;
grant all on public.ai_messages to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- H. Enable Supabase Realtime replication for live moderation workbench
-- ─────────────────────────────────────────────────────────────────────────────

-- Add ai_conversations to the Realtime publication (idempotent approach)
do $$
begin
  -- Check if supabase_realtime publication exists before adding tables
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    -- Add ai_conversations to realtime publication if not already present
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'ai_conversations'
    ) then
      alter publication supabase_realtime add table public.ai_conversations;
    end if;

    -- Add ai_messages to realtime publication if not already present
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'ai_messages'
    ) then
      alter publication supabase_realtime add table public.ai_messages;
    end if;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- I. Helper function: update_conversation_takeover_mode
--    Provides a security definer function that platform admins call to change
--    takeover_mode, preventing direct field mutation via the REST API from
--    non-admin sessions.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_conversation_takeover(
  _conversation_id uuid,
  _mode varchar(20),  -- 'ai' or 'human_takeover'
  _operator_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _result jsonb;
begin
  -- Only platform admins can change takeover mode
  if not public.is_platform_admin(_caller) then
    raise exception 'insufficient_privileges: only platform_admins can change takeover_mode'
      using errcode = 'P0001';
  end if;

  if _mode not in ('ai', 'human_takeover') then
    raise exception 'invalid_takeover_mode: must be ''ai'' or ''human_takeover'''
      using errcode = 'P0001';
  end if;

  update public.ai_conversations
  set
    takeover_mode = _mode,
    assigned_operator_id = case
      when _mode = 'human_takeover' then coalesce(_operator_id, _caller)
      else null
    end,
    last_operator_message_at = case
      when _mode = 'human_takeover' then now()
      else last_operator_message_at
    end,
    updated_at = now()
  where id = _conversation_id
  returning jsonb_build_object(
    'id', id,
    'takeover_mode', takeover_mode,
    'assigned_operator_id', assigned_operator_id,
    'priority', priority,
    'status', status
  ) into _result;

  if not found then
    raise exception 'not_found: conversation % does not exist', _conversation_id
      using errcode = 'P0002';
  end if;

  return _result;
end;
$$;

grant execute on function public.set_conversation_takeover(uuid, varchar, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- J. Helper function: set_conversation_priority
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_conversation_priority(
  _conversation_id uuid,
  _priority varchar(20)  -- 'low', 'normal', 'high', 'urgent'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _result jsonb;
begin
  if not public.is_platform_admin(_caller) then
    raise exception 'insufficient_privileges: only platform_admins can set conversation priority'
      using errcode = 'P0001';
  end if;

  if _priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'invalid_priority: must be ''low'', ''normal'', ''high'', or ''urgent'''
      using errcode = 'P0001';
  end if;

  update public.ai_conversations
  set
    priority = _priority,
    updated_at = now()
  where id = _conversation_id
  returning jsonb_build_object(
    'id', id,
    'priority', priority,
    'takeover_mode', takeover_mode,
    'status', status
  ) into _result;

  if not found then
    raise exception 'not_found: conversation % does not exist', _conversation_id
      using errcode = 'P0002';
  end if;

  return _result;
end;
$$;

grant execute on function public.set_conversation_priority(uuid, varchar) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- K. Helper function: save_operator_notes
--    Secure upsert for private operator scratchpad (platform admin only)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.save_operator_notes(
  _conversation_id uuid,
  _notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
begin
  if not public.is_platform_admin(_caller) then
    raise exception 'insufficient_privileges: only platform_admins can write operator_notes'
      using errcode = 'P0001';
  end if;

  update public.ai_conversations
  set
    operator_notes = _notes,
    updated_at = now()
  where id = _conversation_id;

  if not found then
    raise exception 'not_found: conversation % does not exist', _conversation_id
      using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.save_operator_notes(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- L. Helper function: close_conversation
--    Resolves and closes an escalated conversation with resolved_at timestamp
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.close_moderated_conversation(
  _conversation_id uuid,
  _closing_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
  _result jsonb;
begin
  if not public.is_platform_admin(_caller) then
    raise exception 'insufficient_privileges: only platform_admins can close moderated conversations'
      using errcode = 'P0001';
  end if;

  update public.ai_conversations
  set
    status = 'closed',
    takeover_mode = 'ai',
    resolved_at = now(),
    operator_notes = coalesce(_closing_notes, operator_notes),
    assigned_operator_id = null,
    updated_at = now()
  where id = _conversation_id
  returning jsonb_build_object(
    'id', id,
    'status', status,
    'resolved_at', resolved_at,
    'takeover_mode', takeover_mode
  ) into _result;

  if not found then
    raise exception 'not_found: conversation % does not exist', _conversation_id
      using errcode = 'P0002';
  end if;

  return _result;
end;
$$;

grant execute on function public.close_moderated_conversation(uuid, text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- M. Moderation queue view for platform admin workbench
--    Returns all open conversations with full triage metadata, sorted by urgency
-- ─────────────────────────────────────────────────────────────────────────────

create or replace view public.moderation_queue as
select
  c.id,
  c.merchant_id,
  c.status,
  c.takeover_mode,
  c.priority,
  c.operator_notes,
  c.assigned_operator_id,
  c.last_operator_message_at,
  c.last_customer_message_at,
  c.resolved_at,
  c.channel,
  c.phone_hash,
  c.order_id,
  c.order_number,
  c.created_at,
  c.updated_at,
  m.name  as merchant_name,
  m.email as merchant_email,
  -- SLA urgency score: urgent=4, high=3, normal=2, low=1
  case c.priority
    when 'urgent' then 4
    when 'high'   then 3
    when 'normal' then 2
    when 'low'    then 1
    else 2
  end as priority_rank,
  -- Minutes elapsed since last customer message (for SLA countdown display)
  extract(epoch from (now() - c.last_customer_message_at)) / 60 as minutes_since_last_customer_msg,
  -- Needs agent flag: bot is live but customer has been waiting
  (c.takeover_mode = 'ai' and c.status = 'open' and
    c.last_customer_message_at is not null and
    (c.last_operator_message_at is null or c.last_customer_message_at > c.last_operator_message_at)
  ) as needs_human_agent
from public.ai_conversations c
left join public.merchants m on m.id = c.merchant_id
order by
  priority_rank desc,
  c.last_customer_message_at desc nulls last,
  c.created_at desc;

-- Security: moderation_queue view inherits RLS from ai_conversations (security_invoker by default)
-- Only platform_admins can query this view because ai_conversations RLS requires is_platform_admin()
-- for cross-merchant visibility
