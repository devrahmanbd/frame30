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
- [ ] Repeater conversions next: 6 hero, 7 footer_sitemap, 8 spec_table
  (same pattern: test-first, seed-on-load, dual-read theme + SEO).
  Defer: size_guide (2-D), quiz, shoppable pins, order/checkout steps.
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
- Other session (heritage-cutover): placeholder pipeline live
  (`/api/public/ph/<seed>` SVG route, Unsplash purged, homepage imgs
  0 broken). NEXT from them: publish clothing-heritage to
  flame-fashion-bd demo merchant (live store still runs beauty draft).
