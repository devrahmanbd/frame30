-- ==============================================================================
-- Framique: Phase 9 Support KB Hybrid Semantic Search & OpenRouter AI Gateway Seed
-- Migration: 0012_phase9_support_kb_hybrid_search.sql
-- ==============================================================================

-- 1. Create support_kb_docs table if not exists
create table if not exists public.support_kb_docs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  title text not null,
  body text not null,
  locale text not null default 'en' check (locale in ('en', 'bn')),
  status text not null default 'published' check (status in ('draft', 'published')),
  tags text[] not null default '{}',
  source_url text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  deleted_at timestamptz
);

-- Indexes for support_kb_docs
create index if not exists idx_support_kb_docs_merchant_status 
  on public.support_kb_docs(merchant_id, status) 
  where deleted_at is null;

-- Enable RLS
alter table public.support_kb_docs enable row level security;

-- Policies for support_kb_docs
drop policy if exists support_kb_docs_tenant_read on public.support_kb_docs;
create policy support_kb_docs_tenant_read on public.support_kb_docs
  for select using (
    deleted_at is null and (
      status = 'published' or
      public.has_merchant_role(merchant_id, auth.uid(), 'viewer'::public.merchant_role)
    )
  );

drop policy if exists support_kb_docs_tenant_write on public.support_kb_docs;
create policy support_kb_docs_tenant_write on public.support_kb_docs
  for all using (
    public.has_merchant_role(merchant_id, auth.uid(), 'editor'::public.merchant_role)
  )
  with check (
    public.has_merchant_role(merchant_id, auth.uid(), 'editor'::public.merchant_role)
  );

-- 2. Create support_kb_chunks table if not exists
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
    public.has_merchant_role(merchant_id, auth.uid(), 'editor'::public.merchant_role)
  );

grant select, insert, update, delete on public.support_kb_docs to authenticated;
grant select, insert, update, delete on public.support_kb_chunks to authenticated;
grant all on public.support_kb_docs to service_role;
grant all on public.support_kb_chunks to service_role;

-- 3. Dot product / cosine similarity helper for double precision[] arrays
create or replace function public.cosine_similarity_array(
  a double precision[],
  b double precision[]
)
returns double precision
language plpgsql
immutable
as $$
declare
  dot_product double precision := 0.0;
  norm_a double precision := 0.0;
  norm_b double precision := 0.0;
  len integer;
  i integer;
begin
  if a is null or b is null then
    return 0.0;
  end if;
  len := array_length(a, 1);
  if len is null or len != array_length(b, 1) or len = 0 then
    return 0.0;
  end if;

  for i in 1..len loop
    dot_product := dot_product + (a[i] * b[i]);
    norm_a := norm_a + (a[i] * a[i]);
    norm_b := norm_b + (b[i] * b[i]);
  end loop;

  if norm_a = 0.0 or norm_b = 0.0 then
    return 0.0;
  end if;

  return dot_product / (sqrt(norm_a) * sqrt(norm_b));
end;
$$;

-- 4. Hybrid Reciprocal Rank Fusion Search RPC
create or replace function public.support_kb_hybrid_search(
  _merchant_id uuid,
  _q text,
  _query_embedding double precision[] default null,
  _limit integer default 5,
  _rrf_k integer default 60
)
returns table (
  doc_id uuid,
  title text,
  body text,
  source_url text,
  combined_score double precision,
  text_rank double precision,
  vector_sim double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
  has_vector boolean := _query_embedding is not null and array_length(_query_embedding, 1) > 0;
begin
  return query
  with text_matches as (
    select
      c.doc_id,
      d.title,
      c.body,
      d.source_url,
      ts_rank_cd(c.fts, plainto_tsquery('english', _q)) as rank_score,
      row_number() over (order by ts_rank_cd(c.fts, plainto_tsquery('english', _q)) desc) as text_order
    from public.support_kb_chunks c
    join public.support_kb_docs d on d.id = c.doc_id
    where c.merchant_id = _merchant_id
      and d.deleted_at is null
      and d.status = 'published'
      and (
        plainto_tsquery('english', _q) = ''::tsquery
        or c.fts @@ plainto_tsquery('english', _q)
      )
    order by rank_score desc
    limit 20
  ),
  vector_matches as (
    select
      c.doc_id,
      d.title,
      c.body,
      d.source_url,
      case
        when has_vector and c.embedding is not null
        then public.cosine_similarity_array(c.embedding, _query_embedding)
        else 0.0
      end as sim_score,
      row_number() over (
        order by (
          case
            when has_vector and c.embedding is not null
            then public.cosine_similarity_array(c.embedding, _query_embedding)
            else 0.0
          end
        ) desc
      ) as vector_order
    from public.support_kb_chunks c
    join public.support_kb_docs d on d.id = c.doc_id
    where c.merchant_id = _merchant_id
      and d.deleted_at is null
      and d.status = 'published'
    order by sim_score desc
    limit 20
  ),
  combined as (
    select
      coalesce(t.doc_id, v.doc_id) as doc_id,
      coalesce(t.title, v.title) as title,
      coalesce(t.body, v.body) as body,
      coalesce(t.source_url, v.source_url) as source_url,
      coalesce(t.rank_score, 0.0)::double precision as t_score,
      coalesce(v.sim_score, 0.0)::double precision as v_score,
      (
        coalesce(1.0 / (_rrf_k + t.text_order), 0.0) +
        coalesce(1.0 / (_rrf_k + v.vector_order), 0.0)
      )::double precision as rrf_score
    from text_matches t
    full outer join vector_matches v on t.doc_id = v.doc_id and t.body = v.body
  )
  select
    c.doc_id,
    c.title,
    c.body,
    c.source_url,
    c.rrf_score as combined_score,
    c.t_score as text_rank,
    c.v_score as vector_sim
  from combined c
  order by c.rrf_score desc
  limit _limit;
end;
$$;

grant execute on function public.support_kb_hybrid_search(uuid, text, double precision[], integer, integer) to authenticated, anon, service_role;

-- 5. Seed ai.gateway in platform_dynamic_config
insert into public.platform_dynamic_config (
  id,
  description,
  active_slot,
  blue_payload,
  red_payload,
  version
) values (
  'ai.gateway',
  'OpenRouter AI Chat and Embedding Gateway Configuration',
  'blue',
  '{
    "apiKey": "sk-or-v1-REDACTED",
    "chatModel": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "fallbackChatModel": "nvidia/nemotron-3.5-lightning:free",
    "embeddingModel": "nvidia/llama-nemotron-embed-vl-1b-v2:free",
    "gatewayUrl": "https://openrouter.ai/api/v1"
  }'::jsonb,
  '{
    "apiKey": "sk-or-v1-REDACTED",
    "chatModel": "nvidia/nemotron-3-ultra-550b-a55b:free",
    "fallbackChatModel": "nvidia/nemotron-3.5-lightning:free",
    "embeddingModel": "nvidia/llama-nemotron-embed-vl-1b-v2:free",
    "gatewayUrl": "https://openrouter.ai/api/v1"
  }'::jsonb,
  1
) on conflict (id) do nothing;
