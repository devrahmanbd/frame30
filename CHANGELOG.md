# Changelog — Framique (frame30)

All notable changes, decisions, and policy cutovers. Mirrored as
long-term memories in mem0.ai (user `devrahmanbd`) — every entry below
has a matching memory so future sessions inherit the why, not just the what.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — session-heritage-cutover branch

### Security
- **Path-shaped storefronts removed (custom domains only).** `/store/*` on
  platform hosts now answers bare **404** (0-byte body, reveals nothing).
  Decided after repeated operator order: path URLs are an abuse surface
  (free platform-trust hosting for malicious stores).
  Excepted: draft previews (`preview_token`, token-verified downstream),
  token-gated `/track` + `/order/*` (buyer email/SMS links), loopback dev.
  Metric: `framique_path_storefront_blocked_total`.
- **Custom-host deep links rewritten internally** (`microscrop.shop/p/x` →
  `/store/<slug>/p/x` in `server.ts`). Slug always comes from the
  `merchant_domains` allowlist — no open redirect, no cross-tenant.
- Bare-slug widget hrefs (`href: p.slug`) fixed to absolute store paths.

### Added
- **Heritage widgets** (clothing-heritage parity): `rewards_club`,
  `wedding_shop`, `gift_finder` — AST catalog + apparel renderers +
  bilingual help + TDD suites. Catalog 141 → 144 widgets.
- **Local SVG placeholder pipeline** (`/api/public/ph/<seed>`, heritage
  tokens, immutable cache). StoreImage, MediaFrame, and heritage
  hero/dept/story/product/banner imageless slots render it. All 68 demo +
  21 blueprint Unsplash hotlinks replaced with seeded placeholders.
- **Theme preview demo data**: preview frame injects demo-catalog rows via
  `WidgetDataProvider`, so product grids render instead of
  skeleton-spinning. Hero slides carry default images; monogram badge is
  crop-safe (no full-bleed letters on wide crops).
- **Dynamic dashboard View-store anchor**: points at
  `https://<primary>/` when the merchant has an active primary domain,
  falls back to `/store/<slug>`. New `currentMerchantPrimaryHostFn`.
- **DeepWiki integration removed**: dataset stubbed, vector engine
  gutted to empty-result stubs, copilot re-grounded on live KB hybrid
  search, docs-AI uses the docs index only.

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
- `microscrop.shop` domain row is `issuing_cert`, not `active` — View-store
  anchor stays on fallback until Verify flips it.
- Custom-host `/sitemap.xml`/`robots.txt`, onboarding copy still
  advertising `/store/` URLs, analytics beacon 500 (pre-existing).

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
