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

## [2026-09-21] — 84-widget port batch (`4153d77`)
- Slices A/B/C/D: 20 layout chrome + 20 trust/commerce + 20 guides/advisors
  + 24 data-backed placeholders → catalog + controls + renderers.
- Contract gate: 304/304 pass (registration, category, controls-match,
  instantiate, per-widget parity expects for all 101 widgets).
- tsc clean on touched files; pre-existing errors in PageBuilder.tsx /
  ThemesScreen.tsx untouched. tsgo binary unavailable locally; CircleCI
  lint-typecheck is the gate.
- Rebased onto `c6caaf9` (heritage-cutover merge); progress.md rewritten as
  compact loop state, other session's placeholder-pipeline note preserved.

## [2026-09-21] — final-4 port + audits (`476da4b`)
- add_to_cart, rewards_club, wedding_shop, gift_finder → catalog +
  controls + canvas renderers + parity expects. Contract 316/316.
- Completed bundle_offer (i1–i4 variant IDs) + product_media (images,
  thumbnails, zoom) scalar control coverage.
- 4-agent swarm: slice-E porter + 3 read-only audits. Findings: 24 more
  theme widgets verified missing (next set); all 24 slice-D widgets LIVE
  on storefront; repeater conversion plan ranked (faq first, 8 total).
- tsc clean on touched files; model.ts/PageBuilder errors pre-existing.

## [2026-09-21] — parity-3 port (`02ef60d`)
- 24 widgets (2 porter agents × 12): all theme defaults verified verbatim
  against builder-ast.ts; newsletter canvas uses static mock (no live
  form elements in the editing surface); icons deduped to resolvable
  lucide names.
- columns container support: model + sanitise + nodeHtml + canvas CSS
  mapping; storefront already resolves via theme Container.
- Contract 388/388 (new MEDIA/LAYOUT category sets); tsc clean on all
  touched ranges (upgradeWidget/widgetHtml/Section drifts pre-existing).

## [2026-09-21] — faq repeater conversion (`4925edd`)
- TDD: failing contract + migration tests first, then minimal GREEN.
- faq defaults gain `items: []`; panel uses one repeater (q1-a3 controls
  removed, scalar defaults kept for pass-through); load migration seeds
  items from non-empty scalars without overwriting author edits.
- Canvas, theme renderer, and FAQPage JSON-LD all read items-first with
  scalar fallback — storefront and SEO cannot diverge.
- tsc caught a real bug pre-commit: block `const rows` shadowed the
  `rows()` helper (TDZ) — renamed to `list`.
- Icon registry gains CircleHelp. Known gap: repeater rows lack `_bn`
  bilingual siblings (scalars keep theirs).

## [2026-09-21] — product_qna repeater conversion (`5d4d96d`)
- TDD + swarm: porter agent's pdp diff verified line-exact, applied as
  specified; consumer audit replaced direct greps after agent infra
  failure (icon orphan, askHref gap, SEO DATA_BACKED no-op confirmed).
- Precedence items > live Q&A rows > scalars keeps scalar-only pages
  byte-identical; loadQnaSource still stubbed so scalars stay live path.
- Contract 400/400, studio suite 414/414, tsc clean on touched ranges.

## [2026-09-21] — trust_bar repeater conversion (`04684d4`)
- TDD + swarm: porter diff applied line-exact; audit via direct greps
  (second agent hit provider overload twice running).
- Icon values are TRUST_ICON keys — repeater icon field stays text-kind;
  canvas STUDIO_TRUST_ICON table unchanged, unknown keys still "•".
- Contract 402/402, studio 416/416, chrome+seo adjacent 26/26.

## [2026-09-21] — announcement_bar repeater conversion (`8c0ddd8`)
- TDD + swarm: both recon agents landed (theme spec + 9-area audit).
- Row shape is {text} objects, not strings: PropValue admits PropRow[]
  only, matching every repeater precedent; porter's String(row) adapted.
- No SEO/export touch: zero announcement consumers there; m1/m2/m3
  export invisibility pre-exists and is unchanged.
- Contract 404/404, studio+chrome 426/426, tsc clean on touched ranges.

## [2026-09-21] — lookbook repeater conversion (`4195642`)
- TDD + swarm: both recon agents landed with exact line refs.
- Ratio alternation is index-based in both paths, so items rows paint
  identically to scalar order (landscape first).
- Scope holds: legacy builder-ast fields, blueprints seeds, BITEXT,
  widgetHtml/export untouched (zero consumers; fallback covers).
- Contract 406/406, studio+atelier 433/433, tsc clean on touched ranges.

## [2026-09-21] — hero repeater conversion (`cd2b57b`)
- TDD + swarm: theme spec (with seed rule + leftover disposition) and
  9-area audit both landed; spec applied line-exact after verification.
- Hardest conversion so far: implicit slide 1 folded into row schema,
  global CTA copied per scalar row, subheading first-slide-only.
- Seeding mirrors the scalar keep-first filter exactly (slide 1 kept
  when any slide has content).
- Contract 408/408, studio+hero-adjacent 464/464, tsc clean on ranges.

## [2026-09-21] — footer_sitemap + spec_table repeaters (`f512bc1`)
- TDD + swarm: one spec+audit agent per widget, both landed.
- footer: {title, links:textarea} rows (nested repeater unproven in all
  20 existing blocks); tolerant parser fixes newline blueprint seeds.
- spec: resolved > items > scalars preserves the resolved-wins
  contract; tsc caught missing SpecPair.unit on item rows.
- Icon registry gains FolderTree + Table. Repeaters 8/8 complete.
- Contract 412/412, 463 incl. adjacent suites, tsc clean on ranges.

## [2026-09-21] — Clothing Heritage activated on microscrop.shop
- Operator-ordered: Flame Fashion BD (owner nahid52flame@gmail.com, not
  flamedev7's Akira) switched Rupaboti → Clothing Heritage via
  app-faithful activation (published pointer verified live first, flag
  flip, coherence kept, theme.activated audit row, actor flamedev7).
- Browser-verified: heritage homepage renders with zero console errors;
  cart/quiz/announcement interactions proven earlier same day.
- Server state: HEAD 933c059, fresh 16:02 CEST build+start, no errors;
  disk 94% flagged. Registry draft refresh skipped (rendering-safe).

## [2026-09-18/19] — spectacular scope (from git history)
- CI migrated to CircleCI (`aa744e8`); Supabase JWT/keys rotated (Sept 18).
- Clothing-heritage theme + Aarong-grade storefront + demo catalogs.
- 429 storm fixed (windowed RPC + console/loopback buckets).
- CMS homepage designation + route code-splitting; auth redesign.
