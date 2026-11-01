-- Production blog taxonomy, derived from the articles that already exist.
--
-- Nothing here is invented copy: the TAGS are the `articles.tags` values the
-- merchant already authored, and the two CATEGORIES are the grouping those
-- tags imply (`heritage` spans the weaver and nakshi-kantha stories; `festive`
-- is the Eid collection). Per merchant, because `blog_terms` is now
-- tenant-scoped (`unique (merchant_id, kind, slug)` — see
-- `migration/0028_blog_terms_tenant_taxonomy.sql`).
--
-- What the app needs in order to resolve an archive:
--   * `blog_terms.article_count` > 0 (the facets rail selects `> 0`, and
--     `resolveTerm` orders by it), so it is recomputed from the links below,
--     never guessed;
--   * an `article_terms` row per (article, term), with `merchant_id` matching
--     both sides — the archive listing joins on it and windows by its
--     `created_at`.
--
-- Idempotent: safe to re-run. It never deletes a term or a link.

begin;

-- 1. Categories: one per tag-derived theme, for every merchant that owns a
--    matching published article.
with cats (slug, name, description, match_tag) as (
  values
    ('heritage', 'Heritage',
     'Handloom lineage, craft and the people behind it.', 'heritage'),
    ('festive', 'Festive',
     'Eid and festive edits, straight from the loom.', 'festive')
)
insert into public.blog_terms (merchant_id, kind, slug, name, description)
select distinct a.merchant_id, 'category', c.slug, c.name, c.description
  from public.articles a
  join cats c on c.match_tag = any (a.tags)
 where a.status = 'published'
   and a.deleted_at is null
on conflict (merchant_id, kind, slug) do update
  set name = excluded.name,
      description = excluded.description,
      updated_at = now();

-- 2. Tags: every tag the merchant actually used on a published article.
insert into public.blog_terms (merchant_id, kind, slug, name)
select distinct
       a.merchant_id,
       'tag',
       tag,
       initcap(replace(tag, '-', ' '))
  from public.articles a
  cross join lateral unnest(a.tags) as tag
 where a.status = 'published'
   and a.deleted_at is null
   and tag is not null
   and btrim(tag) <> ''
on conflict (merchant_id, kind, slug) do nothing;

-- 3. Links: a term is attached to a published article when the article's own
--    tags say so (tags), or when its tags fall under the category's theme.
--    `created_at` is pinned to the article's publish time so the archive
--    pager has a stable, meaningful window key. Exactly one link per article
--    is `is_primary` (the category when there is one) — the listing's category
--    chip is the primary link.
insert into public.article_terms
  (merchant_id, article_id, term_id, created_at, is_primary)
select s.merchant_id, s.article_id, s.term_id, s.created_at,
       row_number() over (
         partition by s.article_id
         order by (s.kind = 'category') desc, s.slug
       ) = 1
  from (
    select a.merchant_id,
           a.id as article_id,
           t.id as term_id,
           coalesce(a.published_at, now()) as created_at,
           t.kind,
           t.slug
      from public.articles a
      join public.blog_terms t
        on t.merchant_id = a.merchant_id
     where a.status = 'published'
       and a.deleted_at is null
       and (
            (t.kind = 'tag' and t.slug = any (a.tags))
         or (t.kind = 'category' and t.slug in ('heritage', 'festive')
             and t.slug = any (a.tags))
       )
  ) s
on conflict (article_id, term_id) do nothing;

-- 4. Recompute the denormalised counter the readers order by. Derived, so it
--    can never disagree with the links that were just written.
update public.blog_terms t
   set article_count = (
         select count(*)::int
           from public.article_terms at
          where at.term_id = t.id
       ),
       updated_at = now();

commit;