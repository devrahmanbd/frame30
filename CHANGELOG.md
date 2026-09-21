# Changelog

All notable changes and operator decisions. Newest first. The CI pipeline
(`.circleci/config.yml`) and the task-finish rule in AGENTS.md keep this file
honest: every shipped task lands an entry here in the same commit.

## Unreleased

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

### Fixed
- Block editor removed from pages (builder-only; legacy classic pages stay
  readable); Default page editor setting deleted.
- Empty canvas over saved content: studio adopts late-resolving server docs
  (pristine-guarded) + tolerant parse of escaped-bracket payloads.
- Quick Edit and bulk verbs now maintain `is_published` for pages (Published
  rows were publicly invisible).
- Themes screen crash from NULL `installed_at` (sort hardened, all install
  paths stamp it, live rows backfilled).
- Missing `builder_global_blocks` table (code referenced, never migrated).
- Auth console redesigned (hallmark modern-minimal).

### Decisions (operator decrees)
- Content editor URL is the single page builder; `/dashboard/builder`
  remains theme-only until later retirement.
- No local `bun test` — tests run in the CircleCI `unit-contract` job.
- Verify on production only (SSH build+deploy, browser checks); no localhost
  testing. Push to GitHub; deploy via SSH when told.
- Path storefronts removed — custom domains only; homepage exercises on a
  custom domain.
- Reports of stale UI were stale browser bundles / wrong-merchant sessions,
  verified with the reporter's own account where possible.
- Shared clone + single server across agents caused interleaved commits,
  a 502 from an unpushed-file commit, and a frankenbuild — coordinate
  deploy windows; never reset shared history.
