-- THROWAWAY e2e stack only (docker exec e2e-supabase-db-1). NEVER the
-- configured database: .env routes to PRODUCTION.
--
-- Swarm 4 archive seed (§(u.1)F, record-first): the handloom-heritage term
-- carries exactly 13 LIVE published articles so the merchant archive route
-- `/store/<slug>/blog/category/<termSlug>` renders BOTH pages of the
-- platform's real pager (12-per-page): page 1 = 12 rows, page 2 = the
-- term's own oldest article, "The Jamdani Weavers of Sonargaon"
-- (published 2026-10-20). The 11 idempotent rows below insert with a
-- REDUCED published_at one hour apart starting at 2026-10-25 03:00, so
-- every new row sits strictly AFTER the existing 2026-10-22 row — the
-- 12/1 page split holds by ordering, not by mutation of the legacy rows.
--
-- Deterministic ids: `aaaaaaaa-0004-4000-8000-` + fixed 12-hex suffix
-- (`…000000000cb1` … `…000000000cbb`). `ON CONFLICT DO NOTHING` makes a
-- rerun a no-op.
insert into articles (
  id, merchant_id, slug, title, title_en, excerpt, body,
  meta_title, meta_description, status, tags, views,
  editor, allow_comments, format, visibility, menu_order,
  created_at, updated_at, published_at
) values
  ('aaaaaaaa-0004-4000-8000-000000000cb1','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-1','Swarm4 Archive Seed 1','Swarm4 Archive Seed 1',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 1','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-25 03:00:00+00','2026-10-25 03:00:00+00','2026-10-25 03:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000cb2','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-2','Swarm4 Archive Seed 2','Swarm4 Archive Seed 2',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 2','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-25 02:00:00+00','2026-10-25 02:00:00+00','2026-10-25 02:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000cb3','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-3','Swarm4 Archive Seed 3','Swarm4 Archive Seed 3',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 3','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-25 01:00:00+00','2026-10-25 01:00:00+00','2026-10-25 01:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000cb4','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-4','Swarm4 Archive Seed 4','Swarm4 Archive Seed 4',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 4','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-25 00:00:00+00','2026-10-25 00:00:00+00','2026-10-25 00:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000cb5','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-5','Swarm4 Archive Seed 5','Swarm4 Archive Seed 5',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 5','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-24 23:00:00+00','2026-10-24 23:00:00+00','2026-10-24 23:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000cb6','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-6','Swarm4 Archive Seed 6','Swarm4 Archive Seed 6',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 6','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-24 22:00:00+00','2026-10-24 22:00:00+00','2026-10-24 22:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000cb7','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-7','Swarm4 Archive Seed 7','Swarm4 Archive Seed 7',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 7','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-24 21:00:00+00','2026-10-24 21:00:00+00','2026-10-24 21:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000cb8','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-8','Swarm4 Archive Seed 8','Swarm4 Archive Seed 8',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 8','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-24 20:00:00+00','2026-10-24 20:00:00+00','2026-10-24 20:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000cb9','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-9','Swarm4 Archive Seed 9','Swarm4 Archive Seed 9',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 9','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-24 19:00:00+00','2026-10-24 19:00:00+00','2026-10-24 19:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000cba','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-10','Swarm4 Archive Seed 10','Swarm4 Archive Seed 10',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 10','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-24 18:00:00+00','2026-10-24 18:00:00+00','2026-10-24 18:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000cbb','11111111-1111-4111-8111-111111111111',
   'swarm4-archive-page-11','Swarm4 Archive Seed 11','Swarm4 Archive Seed 11',
   'Archive pager seed (page 1).',
   'A seeded published record so the handloom-heritage archive proves its real pager.',
   'Swarm4 Archive Seed 11','Archive pager seed.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-24 17:00:00+00','2026-10-24 17:00:00+00','2026-10-24 17:00:00+00')
on conflict (id) do nothing;

-- The term itself and the two "legacy" articles. NOTHING else in the repo
-- inserts a blog_terms row, so without the term the reader's resolve fails
-- closed and the route 404s. The 2026-10-22 row makes page 1 exactly 12; the
-- 2026-10-20 "Sonargaon" row is the term's oldest article and heads page 2.
insert into public.blog_terms (id, merchant_id, kind, slug, name, name_en, description, sort_order, robots_index, article_count)
values (
  'aaaaaaaa-0004-4000-8000-000000000ca0',
  '11111111-1111-4111-8111-111111111111',
  'category', 'handloom-heritage', 'Handloom Heritage', 'Handloom Heritage',
  'Hand-woven heritage textiles from the looms of Bangladesh.', 0, true, 0
)
on conflict do nothing;

insert into articles (
  id, merchant_id, slug, title, title_en, excerpt, body,
  meta_title, meta_description, status, tags, views,
  editor, allow_comments, format, visibility, menu_order,
  created_at, updated_at, published_at
) values
  ('aaaaaaaa-0004-4000-8000-000000000ca1','11111111-1111-4111-8111-111111111111',
   'heritage-of-the-tangail-loom','The Heritage of the Tangail Loom','The Heritage of the Tangail Loom',
   'How one river district kept a weaving tradition alive.',
   'Tangail''s weavers carry a tradition older than the mills.',
   'The Heritage of the Tangail Loom','How one river district kept a weaving tradition alive.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-22 03:00:00+00','2026-10-22 03:00:00+00','2026-10-22 03:00:00+00'),
  ('aaaaaaaa-0004-4000-8000-000000000ca2','11111111-1111-4111-8111-111111111111',
   'the-jamdani-weavers-of-sonargaon','The Jamdani Weavers of Sonargaon','The Jamdani Weavers of Sonargaon',
   'Two weavers, one loom, six weeks — the slowest cloth in the world.',
   'Jamdani is drawn by hand, thread by thread, on a loom with no jacquard.',
   'The Jamdani Weavers of Sonargaon','Two weavers, one loom, six weeks — the slowest cloth in the world.', 'published',
   '{handloom-heritage}', 0, 'classic', true, 'standard', 'public', 0,
   '2026-10-20 03:00:00+00','2026-10-20 03:00:00+00','2026-10-20 03:00:00+00')
on conflict (id) do nothing;

-- Wire every new row to the seeded term. The unique (article_id, term_id)
-- pk makes a rerun a no-op.
insert into article_terms (merchant_id, article_id, term_id)
select a.merchant_id, a.id, t.id
  from articles a
  join blog_terms t
    on t.slug = 'handloom-heritage' and t.merchant_id = a.merchant_id
 where a.slug like 'swarm4-archive-page-%'
   and a.merchant_id = '11111111-1111-4111-8111-111111111111'
on conflict do nothing;

-- Wire the two legacy articles to the term too, so the term carries all 13.
insert into article_terms (merchant_id, article_id, term_id)
select a.merchant_id, a.id, t.id
  from articles a
  join blog_terms t
    on t.slug = 'handloom-heritage' and t.merchant_id = a.merchant_id
 where a.slug in ('heritage-of-the-tangail-loom', 'the-jamdani-weavers-of-sonargaon')
   and a.merchant_id = '11111111-1111-4111-8111-111111111111'
on conflict do nothing;

-- The reading code sorts by this kept counter; make it TRUE, not stale.
update blog_terms t
   set article_count = (
     select count(*) from article_terms at
      where at.term_id = t.id
   )
 where t.slug = 'handloom-heritage'
   and t.merchant_id = '11111111-1111-4111-8111-111111111111';

-- The merchant's OWN CMS page the "Page" journey visits
-- (/store/<slug>/pages/our-story). It must render the studio's copy and carry
-- NO demo phrasing (the journey asserts neither "Demo page", "demo story" nor
-- "Meet the makers" appears). Seeded here, not in migration/0003, because the
-- demo catalogue is keyed to the Frame19 store and this is Songoskriti's own
-- record; the page slug the lane reads is `our-story`.
insert into public.storefront_pages (id, merchant_id, slug, title, excerpt, body_markdown, meta_title, meta_description, is_published, show_in_nav, position, published_at, robots) values
  ('41000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'our-story', 'Our Story',
   'Songoskriti began with a single loom and grew with every weaver who joined it.',
   '## Our story

Songoskriti began with a single loom in Tangail and grew, thread by thread, with every weaver who joined the studio. The cloth is still drawn by hand, and every piece carries the name of the loom it came from.',
   'Our Story — Songoskriti', 'Songoskriti began with a single loom. The story of the studio and the weavers behind every hand-woven piece.',
   true, true, 0, now() - interval '17 days', 'index,follow')
  on conflict (id) do update set title = excluded.title, excerpt = excluded.excerpt, body_markdown = excluded.body_markdown, is_published = true;
