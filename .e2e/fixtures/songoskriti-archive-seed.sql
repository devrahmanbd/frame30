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

-- The reading code sorts by this kept counter; make it TRUE, not stale.
update blog_terms t
   set article_count = (
     select count(*) from article_terms at
      where at.term_id = t.id
   )
 where t.slug = 'handloom-heritage'
   and t.merchant_id = '11111111-1111-4111-8111-111111111111';
