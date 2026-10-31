-- Phase 2j — blog_terms taxonomy columns the app has always read.
--
-- The taxonomy readers select a 14-column shape
-- (src/lib/blog-index.server.ts TERM_COLUMNS: id, merchant_id, kind, slug,
-- name, name_en, description, parent_id, sort_order, cover_image_url,
-- meta_title, meta_description, robots_index, article_count), but ONLY the
-- base 8 were ever created (migration/0005_content_editorial_fields.sql:28).
-- The remaining columns exist in NEITHER the checked-in chain NOR the deployed
-- database. Because `resolveTerm()` discards the Postgres error
-- (`const { data } = await query`, :334), the missing columns are silent: the
-- select fails with 42703, the term can never resolve, and every
-- category/tag archive 404s — on a fresh stack AND in production.
--
-- Additive and idempotent, so it is safe on BOTH:
--   * a fresh deploy, where 0005 already created the base table and this file
--     adds only the extended columns; and
--   * the drifted deployed database, which is missing even merchant_id,
--     description and updated_at (it predates 0005), where this file repairs
--     the shape in place.
-- No constraint is dropped, no existing column is altered, no data is touched.

begin;

alter table public.blog_terms
  add column if not exists merchant_id uuid,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists name_en text,
  add column if not exists parent_id uuid,
  add column if not exists sort_order integer not null default 0,
  add column if not exists cover_image_url text,
  add column if not exists meta_title text,
  add column if not exists meta_description text,
  add column if not exists robots_index boolean not null default false,
  add column if not exists article_count integer not null default 0;

-- Nested taxonomy: the app models a term tree (parent_id), and the generated
-- types declare this self-referencing FK (blog_terms_parent_id_fkey). Added
-- only when absent so a re-run is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'blog_terms_parent_id_fkey'
  ) then
    alter table public.blog_terms
      add constraint blog_terms_parent_id_fkey
      foreign key (parent_id) references public.blog_terms(id) on delete set null;
  end if;
end $$;

-- The archive reader orders by (article_count desc, id asc); index it so the
-- resolve stays cheap once terms accumulate.
create index if not exists blog_terms_article_count_idx
  on public.blog_terms(article_count desc, id asc);

commit;
