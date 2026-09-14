-- Migration 20260910030000: ML Training Data Immunity & Decoupling Shield (Phase 10.2)
--
-- Objective: Guarantee that deleting a user, customer, or merchant from normal/transactional
-- tables NEVER deletes or cascades to ML training data, fine-tuning datasets, DPO pairs,
-- or RL reward trajectories.

-- A. Alter foreign keys on ai_training_conversations to ON DELETE SET NULL
do $$
declare
  fk_record record;
begin
  -- Find and drop foreign key on merchant_id
  for fk_record in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'ai_training_conversations'
      and constraint_type = 'FOREIGN KEY'
      and constraint_name like '%merchant%'
  loop
    execute 'alter table public.ai_training_conversations drop constraint if exists ' || quote_ident(fk_record.constraint_name);
  end loop;

  -- Find and drop foreign key on conversation_id
  for fk_record in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'ai_training_conversations'
      and constraint_type = 'FOREIGN KEY'
      and constraint_name like '%conversation%'
  loop
    execute 'alter table public.ai_training_conversations drop constraint if exists ' || quote_ident(fk_record.constraint_name);
  end loop;
end $$;

-- B. Make foreign key columns nullable so rows remain intact when entities are deleted
alter table public.ai_training_conversations
  alter column merchant_id drop not null;

alter table public.ai_training_conversations
  alter column conversation_id drop not null;

-- C. Re-attach foreign keys with ON DELETE SET NULL
alter table public.ai_training_conversations
  add constraint fk_ai_training_merchant
  foreign key (merchant_id) references public.merchants(id) on delete set null;

alter table public.ai_training_conversations
  add constraint fk_ai_training_conversation
  foreign key (conversation_id) references public.ai_conversations(id) on delete set null;

-- D. Add decoupled immutable surrogate columns
alter table public.ai_training_conversations
  add column if not exists merchant_cohort_hash varchar(64) not null default 'default_cohort';

alter table public.ai_training_conversations
  add column if not exists anonymized_actor_token varchar(64);

-- E. Create index on merchant_cohort_hash for decoupled training queries
create index if not exists idx_ai_training_cohort_hash
  on public.ai_training_conversations(merchant_cohort_hash, created_at desc);

-- F. Alter ai_conversation_feedback to ON DELETE SET NULL as well
do $$
declare
  fk_rec record;
begin
  for fk_rec in
    select constraint_name
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'ai_conversation_feedback'
      and constraint_type = 'FOREIGN KEY'
      and constraint_name like '%conversation%'
  loop
    execute 'alter table public.ai_conversation_feedback drop constraint if exists ' || quote_ident(fk_rec.constraint_name);
  end loop;
end $$;

alter table public.ai_conversation_feedback
  alter column conversation_id drop not null;

alter table public.ai_conversation_feedback
  add constraint fk_ai_feedback_conversation
  foreign key (conversation_id) references public.ai_conversations(id) on delete set null;
