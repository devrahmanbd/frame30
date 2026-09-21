# Changelog — Framique (frame30)

All notable changes, decisions, and policy cutovers. Mirrored as
long-term memories in mem0.ai (user `devrahmanbd`) — every entry below
has a matching memory so future sessions inherit the why, not just the what.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> ⚠️ **WARNING — shared-server deploy collisions.** Two agents deploy to one
> server from one clone: observed interleaved origin/main, a 502 from an
> unpushed-file commit, a frankenbuild (restart landed mid-build), production
> checked out onto a stale detached HEAD (deploys silently not taking
> effect), and the cutover living only as uncommitted server edits + stash.
> Coordinate deploy windows; after every deploy verify `git rev-parse HEAD`
> AND a bundle marker before announcing; never reset shared history.

### Changed
- Page builder is the content editor URL (`/dashboard/content/editor`):
  full-window Elementor-style takeover (Elements/SEO tabs, flush canvas,
  compact title, sidebar starts closed, single device switcher).
- `/dashboard/builder` stays the theme studio; page/theme engines merge by
  porting, retirement of `/builder` only after editor testing.
- Path storefronts removed: `/store/*` on platform hosts answers bare 404
  (custom-domain-only cutover); custom hosts serve at `/` via internal
  rewrite. Draft previews, token-gated order flows and loopback dev exempt.
- Dashboard "View store" resolves to the merchant's primary custom domain
  when one exists (`currentMerchantPrimaryHostFn`).

### Added
- Buyer-critical URLs (order tracking + welcome CTAs, drip CTAs via
  rebasing, sitemap/robots/llms rewrite coverage) resolve to the primary
  custom domain; payments cancel uses request origin (already correct).
- Custom-domain-aware merchant links: View-store, page preview/view,
  quick-edit and document permalink prefixes, editor preview + SEO URLs,
  sitemap link, and settings header all resolve to the primary custom
  domain when one exists (`useStoreUrl` + pure builders in
  `storefront-url.ts`, unit-tested). Onboarding no longer promises a path
  URL. Blog paths untouched (platform routes, unaffected by the cutover).
- Customizable homepage: set/remove-as-homepage list actions (published
  pages only), stored in `setup_steps.homepage_page_id`, rendered at `/`
  with theme-template fallback on path and custom hosts.
- 17 ported widgets in the page editor: faq, marquee, countdown, banner,
  trust_bar, announcement_bar, heritage_story, editorial_banner,
  editorial_hero, lookbook, hero, textile_showcase, department_grid,
  story_trunk, marquee_strip, hero_carousel, testimonial_carousel.
- Universal template blocks: cart page, store header/footer, rich FAQ,
  testimonial slider, split hero (+ `cart` library category).
- Global blocks both directions in pages: insert as detached copies,
  save-as-global-block from the node menu (`builder_global_blocks` table
  created via migration with RLS + grants).
- Structure panel parity: filter search, expand/collapse all, inline
  duplicate/delete per row.
- Anti-wipeout guard: page-builder saves that would blank authored content
  abort with a visible error instead of persisting.
- Route code splitting (components + loaders) for the client bundle.
- CI migrated to CircleCI only (`.circleci/config.yml`); GitHub Actions
  removed. E2E job auto-activates when `.e2e/playwright.config.ts` lands.
- Heritage widgets (clothing-heritage parity): `rewards_club`,
  `wedding_shop`, `gift_finder` — AST catalog + apparel renderers +
  bilingual help + TDD suites (catalog 141 → 144).
- Local SVG placeholder pipeline (`/api/public/ph/<seed>`, heritage
  tokens, immutable cache); StoreImage/MediaFrame/heritage imageless slots
  render it; all demo + blueprint Unsplash hotlinks replaced.
- Theme preview demo-data injection (grids render products, no skeletons);
  crop-safe monogram badge; hero slide default images.
- DeepWiki integration removed (dataset stubbed, copilot on live KB).
- mem0.ai changelog mirror (policy/cutover/theme/deploy/gaps/ci).

### Changed
- **CI moved GitHub Actions → CircleCI** (`.circleci/config.yml` owns
  build/test/lint/e2e; no new Actions workflows). Recorded in AGENTS.md.
- **Deploy convention**: separate worktrees (`/opt/frame28` main,
  `/opt/frame28-heritage` branch), deploys only via
  `ops/deploy-from-git.sh <branch>` (pushed branch → ephemeral worktree
  build → rsync `.output` → restart → live verify). Never build in the
  live tree, never `git stash` a shared clone.

### Verification (live, https://framique.qubickle.com)
- `/store/<slug>` (+ deep paths, fake slugs, case variants) → 404.
- `/` → 200 landing; `microscrop.shop/` + `/cart` → 200 storefront.
- Preview Cart tab: 0 skeletons, priced demo products with images.
- Login as merchant: dashboard renders, no page errors.
- Targeted suites green (cutover 8, placeholder 5, preview-data 3,
  heritage 7, registry 8, metadata 9, builder 167).

### Known gaps / follow-ups
- Full `bun run test`: 3392 pass / 27 fail — remaining failures are
  pre-existing (authz, nav, CSP, support-agent, time-machine…), untouched
  by this batch.
- `microscrop.shop` serves the Flame Fashion BD **beauty draft**; the
  Aarong look needs clothing-heritage published on that merchant (or a
  custom domain on Akira, which already has it active).
- `microscrop.shop` domain row is now `active` + primary — View-store anchor
  resolves to the custom domain; `useStoreUrl` covers dashboard surfaces.
- Custom-host `/sitemap.xml`/`robots.txt` still open; analytics beacon now
  degrades to 202 on missing warehouse schema (owner migration pending);
  hydration nonce mismatch fixed (empty-coerce + csp-nonce meta read).

## [2026-09-21] — main (other loop: page-builder Elementor parity)
- Ported theme widgets as native studio widgets (faq, marquee, countdown,
  banner, trust_bar, announcement_bar; then 11 heritage/hero widgets).
- Layers parity + save-as-global-block port; anti-wipeout autosave guard.
- Operator decrees recorded in progress.md: verify on production only,
  push to GitHub, path storefronts removed, shared-clone hazard noted.

## [2026-09-18/19] — spectacular scope (from git history)
- CI migrated to CircleCI (`aa744e8`); Supabase JWT/keys rotated (Sept 18).
- Clothing-heritage theme + Aarong-grade storefront + demo catalogs.
- 429 storm fixed (windowed RPC + console/loopback buckets).
- CMS homepage designation + route code-splitting; auth redesign.
