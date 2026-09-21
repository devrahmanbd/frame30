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
- TODO next: decide products/store_themes public-read tightening +
  NEEDS-REVIEW backlog (order oracle token, blog global namespace,
  releaseCheckout binding, recordResolvedMiss attribution, variant
  reader discipline, domains permission granularity).
- [x] API audit closed for EXPOSED items (`b8e5b53`, deployed):
  review RPC had no ownership check AND referenced a missing column
  (all submissions errored) — fixed, proven live 3 ways, test row
  removed. Step-up mint now verifies membership. Charge intents bound
  slug==order merchant. Order page 404s on slug mismatch. Console
  surface otherwise CLEAN (session-scoped + permissioned); money paths
  scope before step-up consume.
- [x] 0-day CLOSED (`e5e0b06`, deployed + verified): CloudMan chrome
  served on microscrop.shop via /store/<foreign-slug> whenever host
  resolution missed (outage-poisoned cache → featured fallback).
  server.ts now fail-closes foreign slugs on custom hosts (bare 404);
  own paths unaffected. Live: foreign 404, cart/home 200. 36/36
  contract tests (5 new).
- [x] Merchant AI control removed (`1c28cca`, deployed): kill-switch
  MERCHANT_AI_ENABLED=false at nav + route + server layers (8 RPCs
  denied). Support channel (/dashboard/support) untouched. Verified
  live: ai/* URLs bounce to dashboard, nav has no AI entries. 4 new
  gate tests green.
- Deploy lesson: deploy script's silent fetch can build stale code
  (19:44 build lacked the filter); re-deploy fixed. Verify-after-
  deploy is mandatory, not optional.

## Settings cleanup (Sept 21) — LIVE VERIFIED via screenshots
- General (`settings.tsx`): deleted in-page Subnav Tabs (duplicate of the
  global SectionTabs strip); removed TotpCard teaser (lives on Security
  page). Page is now header + one form card.
- Email (`settings_.email.tsx`): removed 3-card overview grid (state already
  in header StatusPill); single-column flow: header, SMTP config, test,
  deliverability note. Container narrowed to max-w-3xl like General.
- Store switcher OFF in AdminShell (`{false && ...}` with comment; code
  kept for future multi-store). Header shows plain store name.
- Verified live as flamedev7: dup-tabs 0, 2FA card absent, overview absent,
  form + test present; screenshots set-general-after/set-email-after.
- Branch session-settings-cleanup deployed, then merged to main (17-check
  script: cart 307 was the disk-full postgres incident per above,
  re-checked 200 after). tsc: only pre-existing errors.

## PR #4 merged + main live (Sept 21)
- Pulled main at c33c56a (PR #4 session-interconnect merged).
- Deployed main: 17/17 contract checks green (platform /store/* 404s,
  microscrop.shop/ + /cart 200, placeholder API 200).
- Live re-check as flamedev7: General dup-tabs 0, 2FA card absent.

## Heritage v2 complete-theme loop (Sept 21) — AUTONOMOUS
- Spec: docs/superpowers/specs/2026-09-21-heritage-complete-store-design.md
  (builds on Sept-20 spec, 8/8 shipped; grounded in 5 live ref screenshots).
- Audit: all 8 TemplateKeys present; PDP deep (reviews/size/fit/care);
  95 demo products, 0 real images; finders exist but buried; no gates run.
- TODO:
- [ ] Slice 1: campaign homepage (hero copy, occasion entry, lookbook, UGC)
- [ ] Slice 2: Bangla display identity
- [ ] Slice 3: demo imagery direction (crop-safe seeds, no hotlinking)
- [ ] Slice 4: Lighthouse + a11y gates, COD test order
- [ ] Slice 5: versioned v2 release via publish pipeline
- [x] Slice 1: campaign homepage (festive-drop hero first, lookbook
  "Shop the look" x4 looks, wedding/gift finders surfaced after
  new-arrivals; story/craft/testimonials keep order below).
  Tests 7/7 green. .bn duplicate-key errors pre-existing (untouched).
- [x] Slice 1 bugfix: wedding_shop/gift_finder/rewards_club rendered
  NULL everywhere — catalog `templates` (slot-gating) misapplied to
  prop-driven widgets. Removed the field (3 lines, builder-ast.ts).
  Tests 10/10. .bn + catalog-group tsc errors pre-existing.
