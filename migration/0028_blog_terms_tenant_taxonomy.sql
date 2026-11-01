-- Phase 2k — align the deployed `blog_terms` tenancy with the schema the repo
-- has always intended.
--
-- `migration/0005_content_editorial_fields.sql` declares:
--
--   merchant_id uuid not null references public.merchants(id) on delete cascade
--   unique (merchant_id, kind, slug)
--
-- Production predates that file: its `blog_terms` has a NULLABLE `merchant_id`,
-- NO foreign key to `merchants`, and a GLOBAL `unique (slug)`. That last one is
-- the real defect: a slug could belong to only ONE merchant across the whole
-- platform, so a second store could never have its own `heritage` tag, and the
-- taxonomy the app resolves per tenant (`resolveTerm(..., merchantId)`) could
-- not be populated per store at all.
--
-- `0027` repaired the missing COLUMNS. This file repairs the tenancy
-- constraints so the table can actually hold per-merchant taxonomy.
--
-- Safe by construction: `blog_terms` is empty in production (verified 0 rows on
-- 2026-10-31 before this file was written), so `set not null` and the new
-- foreign key validate trivially and no data is rewritten. Every step is
-- guarded, so a re-run is a no-op and a fresh deploy (where 0005 already
-- created the correct shape) is untouched.

begin;

-- 1. `merchant_id` is the tenant key; the repo schema requires it.
alter table public.blog_terms
  alter column merchant_id set not null;

-- 2. The tenant FK 0005 declares. Added only when absent so a fresh deploy
--    (which already has it from 0005) is a no-op.
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'blog_terms_merchant_id_fkey'
       and conrelid = 'public.blog_terms'::regclass
  ) then
    alter table public.blog_terms
      add constraint blog_terms_merchant_id_fkey
      foreign key (merchant_id) references public.merchants(id) on delete cascade;
  end if;
end $$;

-- 3. Replace the global slug uniqueness with the per-tenant, per-kind one.
--    Dropped only if it is still the global constraint; a fresh deploy never
--    had it.
do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conname = 'blog_terms_slug_key'
       and conrelid = 'public.blog_terms'::regclass
       and pg_get_constraintdef(oid) = 'UNIQUE (slug)'
  ) then
    alter table public.blog_terms drop constraint blog_terms_slug_key;
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'blog_terms_merchant_kind_slug_key'
       and conrelid = 'public.blog_terms'::regclass
  ) then
    alter table public.blog_terms
      add constraint blog_terms_merchant_kind_slug_key
      unique (merchant_id, kind, slug);
  end if;
end $$;

commit;