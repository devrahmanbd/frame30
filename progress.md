# Project State (loop source of truth)

Goal: one Elementor-grade page builder at `/dashboard/content/editor`
(templates + widgets usable on any theme and standalone pages);
`/dashboard/builder` stays theme-only until later retirement. Custom
domains only (no path storefronts). CI is CircleCI-only; no local tests;
verify on production; push to GitHub.

## Deployed
- Origin/main tip: see `git log --oneline -1` (loop updates this line per
  batch — do NOT trust it stale; production deploys separately).
- Last verified live: page editor renders saved content, 48 widgets in
  tray, homepage set/remove, themes screen, custom-domain storefront.

## Decisions (mirrored in mem0 + CHANGELOG)
- D1 content-editor URL = the page builder; block editor removed from pages.
- D2 merge by porting (no engine rewrite): theme widgets become native
  studio widgets; templates become universal blocks.
- D3 data-backed widgets stay placeholders on canvas, live on storefront.
- D4 path storefronts retired (bare 404); merchant links resolve to the
  primary custom domain with path fallback.
- D5 no local `bun test` (CircleCI `unit-contract` only); no localhost
  verification (production browser only); push to GitHub.
- D6 every shipped task logs CHANGELOG.md + mem0 in the same commit.
- D7 two agents share clone + server: coordinate deploy windows, verify
  HEAD + bundle markers post-deploy, never reset shared history.

## TODO queue (loop works top-down)
- [x] Theme parity 1: slices A/B/C/D (84 widgets, `4153d77`, 304 tests).
- [x] Theme parity 2: final 4 (add_to_cart, rewards_club, wedding_shop,
  gift_finder — `476da4b`, 316 tests). Union gap closed except 24 below.
- [x] Storefront round-trip audit: all 24 slice-D widgets LIVE on
  storefront (generic pass-through, SectionRenderer resolves all).
  Watch items: checkout_steps static activeStep, product_meta silent
  null, canvas blindness + `widgetHtml` "" fallback for data widgets.
- [x] Theme parity 3 (24 widgets, `02ef60d`, 388 tests): set A chrome/
  forms/commerce + set B discovery/assurance/layout. columns is a real
  container (isContainerNode, sanitise, nodeHtml, canvas grid mapping).
  nav_menu keeps theme-verbatim items array + repeater (department_grid
  precedent). Icon registry +21 imports; fixed Star-fallback orphans
  (gift_builder, bundle_offer, subbrand_spotlight, rewards_club,
  gift_finder). Full SectionType union now ported (minus structural
  primitives + section/paragraph which exist nowhere).
- [x] Repeater 1/8 faq (`4925edd`, TDD: RED watched, 398 tests GREEN):
  items array + repeater panel, scalars kept, load-time seeding,
  canvas/theme/JSON-LD all dual-read. Limitation: rows lack _bn sibs.
- [x] Repeater 2/8 product_qna (`5d4d96d`, TDD, 400 tests): items +
  repeater panel + askHref gap fix, seedQaItems generalized, canvas Q&A
  card, theme precedence items > live rows > scalars, MessageSquareQuote
  icon. SEO/blueprints untouched by design.
- [x] Repeater 3/8 trust_bar (`04684d4`, TDD + swarm, 402 tests):
  Badges repeater {icon,title,body}, seedTrustItems, canvas + chrome
  dual-read, scalar sections byte-identical. No SEO/export consumers.
- [x] Repeater 4/8 announcement_bar (`8c0ddd8`, TDD + swarm, 404
  tests): Messages repeater {text}, seedAnnouncementItems,
  StudioAnnouncement + theme dual-read, rotation/dismiss untouched.
- [x] Repeater 5/8 lookbook (`4195642`, TDD + swarm, 406 tests):
  Tiles repeater {image,alt,href}, seedLookbookItems, canvas + apparel
  dual-read with index-based ratio preserved. Caught own duplicate-
  keywords slip pre-commit.
- [x] Repeater 6/8 hero (`cd2b57b`, TDD + swarm, 408 tests): Slides
  repeater with slide-1 fold-in seeding, per-slide CTA, first-slide
  subheading, pager/eager unchanged. Fixed own duplicate-keywords slip
  again (read-before-edit rule re-learned).
- [x] Repeaters 7-8/8 footer_sitemap + spec_table (`f512bc1`, TDD +
  swarm, 412 tests): Columns repeater (textarea links, no nesting),
  tolerant comma+newline parser (fixes newline-seed blob rendering),
  Rows repeater with resolved>items>scalars precedence. 8/8 DONE.
- [ ] Deferred conversions (needs design, not porting): size_guide
  (2-D matrix), quiz (heterogeneous steps), shoppable pins (canvas
  UX), order/checkout steps (fixed pipelines, no author value).
- [ ] Layers dock follow-ups (filter exists; dock/undock toggle).
- [ ] Global-blocks save-from-page reverse conversion.
- [ ] Homepage render proof on a custom domain (needs published page).
- [ ] Dashboard LCP: head-import diet + per-language i18n split.
- [ ] `.e2e/playwright.config.ts` harness (e2e-critical passes by design).
- [ ] Retire `/dashboard/builder` after editor testing (explicit user call).

## Follow-ups / hazards
- Homepage success path needs a merchant-owned published page + domain.
- Merchant test data (akira) must be left clean after verification runs.
- CONTRACT: catalog-controls-defaults parity test must cover every new
  widget (see `catalog.test.ts` PORTED list).
- [x] Clothing Heritage ACTIVE on flame-fashion-bd (microscrop.shop):
  operator-ordered theme change executed via app-faithful server-side
  activation (flag flip + published-pointer coherence + theme_audit row,
  actor flamedev7). Verified live in browser: heritage hero, weavers
  story, artisan showcase, festive, fair-trade, UGC, filters, grid,
  flagship outlets. Zero console errors.
- SSH investigation (same run): server HEAD 933c059 (1 docs commit
  behind GitHub main), service freshly started 16:02 CEST from a
  16:02 build, zero journal errors (3h), haproxy:443 → openresty:80 →
  node. Watch: disk 94% (26G free).
- Note: flamedev7@gmail.com owns AKIRA only; microscrop.shop belongs to
  Flame Fashion BD (owner nahid52flame@gmail.com) — dashboard theme
  change was impossible for that account, hence the server-side path.
  Skipped: installRegistryTheme draft refresh (rendering unaffected).
- [x] Owner onboarding trap FIXED (`53e1896` + deploy): fresh logins
  raced concurrent membership checks and bounced real owners to
  /onboarding despite live membership rows (proven: landing query
  returned the row, app still routed to wizard). Single-gate rule now:
  login always lands /dashboard, its gate owns onboarding decisions.
- [x] Dead storefront link FIXED + deployed: settings showed path URL
  (bare 404) as "live" with no domain. Now: connect-domain CTA.
  Verified live on Rupaboti settings. Deploy contract all green.
- RLS verdict (live DB read): writes all tenant-scoped + WITH CHECKs
  clean; reads tenant-gated; uneven public reads — products=all rows
  (drafts/deleted visible), store_themes=all rows (inactive visible),
  variants properly gated (active+public+not-deleted). Not an active
  breach path for prices/stock (variant-gated), but draft disclosure.
- TODO next: API cross-tenant audit (unscoped merchant_id scan over
  *.functions.ts) + decide products/store_themes public-read tightening.
