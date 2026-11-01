-- Phase 2k — reshape the deployed `article_terms` into the table the app reads.
--
-- `migration/0005_content_editorial_fields.sql` (and
-- `src/integrations/supabase/types.ts`) declare:
--
--   merchant_id uuid not null references merchants(id) on delete cascade
--   article_id  uuid not null references articles(id)  on delete cascade
--   term_id     uuid not null references blog_terms(id) on delete cascade
--   is_primary  boolean not null default false
--   created_at  timestamptz not null default now()
--   primary key (article_id, term_id)
--
-- Production predates that file. Its `article_terms` was
-- `(id, article_id, term text not null, kind text not null, created_at)` with
-- a surrogate `id` primary key. Every canonical reader
-- (`blog-index.server.ts`, `blog-reader.server.ts`, `blog-taxonomy.server.ts`,
-- `editor.server.ts`, `content-desk.server.ts`) queries `term_id`/`merchant_id`,
-- so on production those reads returned 400 and the taxonomy silently
-- disappeared (`resolveTerm` discards the Postgres error). `store-blog.server.ts`
-- still carried a legacy fallback that read `term`/`kind` as strings.
--
-- The table is EMPTY in production (verified 0 rows on 2026-10-31 before this
-- file was written), so dropping the legacy identity columns rewrites no data.
-- The backfill below still runs first, so the file is correct even if it is
-- ever replayed against a table that does hold legacy rows.
--
-- Idempotent: every add/drop is guarded and a re-run is a no-op.

begin;

-- 1. The canonical columns. Added nullable so legacy rows can be mapped before
--    the NOT NULL constraints are applied.
alter table public.article_terms
  add column if not exists merchant_id uuid,
  add column if not exists term_id uuid,
  add column if not exists is_primary boolean not null default false;

-- 2. Backfill the tenant key from the owning article.
update public.article_terms at
   set merchant_id = a.merchant_id
  from public.articles a
 where at.article_id = a.id
   and at.merchant_id is null;

-- 3. Backfill the term link from the legacy `(term, kind)` strings when the
--    row carries them and the merchant still owns a matching term.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'article_terms'
       and column_name = 'term'
  ) then
    execute $sql$
      update public.article_terms at
         set term_id = mapped.term_id
        from (
          select l.article_id, t.id as term_id
            from public.article_terms l
            join public.articles a on a.id = l.article_id
            join public.blog_terms t
              on t.merchant_id = a.merchant_id
             and t.slug = l.term
             and t.kind = l.kind
           where l.term_id is null
        ) mapped
       where at.article_id = mapped.article_id
         and at.term_id is null
    $sql$;
  end if;
end $$;

-- 4. Refuse to drop the legacy key if any row could not be mapped: silently
--    discarding a taxonomy link is worse than a failed deploy.
do $$
declare
  unmapped bigint;
begin
  select count(*) into unmapped
    from public.article_terms
   where merchant_id is null or term_id is null;
  if unmapped > 0 then
    raise exception
      'article_terms: % row(s) cannot be mapped to (merchant_id, term_id); refusing to drop the legacy key',
      unmapped;
  end if;
end $$;

-- 5. Drop the surrogate key ONLY when it is still the legacy `PRIMARY KEY (id)`
--    so a fresh deploy (already keyed by article_id, term_id) is untouched.
do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conname = 'article_terms_pkey'
       and conrelid = 'public.article_terms'::regclass
       and pg_get_constraintdef(oid) = 'PRIMARY KEY (id)'
  ) then
    alter table public.article_terms drop constraint article_terms_pkey;
  end if;
end $$;

-- 6. The legacy string columns are written by nothing the app runs; the
--    canonical link is `term_id`.
alter table public.article_terms drop column if exists term;
alter table public.article_terms drop column if exists kind;
alter table public.article_terms drop column if exists id;

-- 7. Canonical NOT NULLs + primary key.
alter table public.article_terms
  alter column merchant_id set not null,
  alter column term_id set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'article_terms_pkey'
       and conrelid = 'public.article_terms'::regclass
  ) then
    alter table public.article_terms
      add constraint article_terms_pkey primary key (article_id, term_id);
  end if;
end $$;

-- 8. Tenant-containment foreign keys the repo schema declares. Guarded so a
--    fresh deploy (0005 already added them) is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'article_terms_merchant_id_fkey'
       and conrelid = 'public.article_terms'::regclass
  ) then
    alter table public.article_terms
      add constraint article_terms_merchant_id_fkey
      foreign key (merchant_id) references public.merchants(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'article_terms_article_id_fkey'
       and conrelid = 'public.article_terms'::regclass
  ) then
    alter table public.article_terms
      add constraint article_terms_article_id_fkey
      foreign key (article_id) references public.articles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'article_terms_term_id_fkey'
       and conrelid = 'public.article_terms'::regclass
  ) then
    alter table public.article_terms
      add constraint article_terms_term_id_fkey
      foreign key (term_id) references public.blog_terms(id) on delete cascade;
  end if;
end $$;

-- 9. The archive listing resolves a term's links by `term_id`.
create index if not exists article_terms_term_idx
  on public.article_terms(term_id);

commit;