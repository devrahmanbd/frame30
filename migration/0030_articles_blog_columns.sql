-- Phase 2k — restore the two `articles` columns the public blog readers select.
--
-- `src/integrations/supabase/types.ts` and the blog readers declare:
--
--   author_id       uuid          (nullable — `migration/0005` adds it)
--   reading_minutes integer       (the card/read-time badge)
--
-- Production's `articles` table predates both. PostgREST answers
-- `42703 column articles.reading_minutes does not exist`, the listing read
-- degrades to its empty fallback, and every term archive renders
-- "No articles … yet." even though the taxonomy links are present. The term
-- header still renders (the count comes from `blog_terms.article_count`),
-- which is exactly the misleading half-page this migration removes.
--
-- Additive and idempotent. `reading_minutes` is backfilled from the body
-- (≈200 words per minute, floor 1) so existing posts do not read "1 min".
--
-- NOTE: `author_id` is added WITHOUT a foreign key because production has no
-- `blog_authors` table (the reader tolerates its absence: the author chip is
-- decoration, never the article). That gap is recorded in report.md rather
-- than papered over here.

begin;

alter table public.articles
  add column if not exists author_id uuid,
  add column if not exists reading_minutes integer not null default 1;

-- Backfill only rows still on the default, so a re-run never overwrites a
-- deliberately edited read time.
update public.articles
   set reading_minutes = greatest(
         1,
         ceil(
           coalesce(
             array_length(
               regexp_split_to_array(btrim(coalesce(body, '')), '\s+'),
               1
             ),
             0
           ) / 200.0
         )::int
       )
 where reading_minutes = 1
   and coalesce(btrim(body), '') <> '';

commit;