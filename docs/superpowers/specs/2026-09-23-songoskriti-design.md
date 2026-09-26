> **Superseded (2026-09-26):** authoritative guides are
> [Builder README](../04-builder/README.md) and
> [Theme authoring](../themes/creation.md). Kept as history; do not edit.

# Songoskriti Heritage Theme — Design Spec (rev 2)

**Status:** owner-approved Approach A; reviewer round 1 (16 findings) addressed below.
**Goal:** One business-worthy clothing-heritage theme (`songoskriti`, সংস্কৃতি) with Aarong-grade storefront, demo data, and motion — installable, previewable, compatible with custom CSS/JS, menus, and the theme engine.

**Architecture:** New preset pack on the restored theme engine. No engine rewrites: preset AST + blueprints + tokens + demo seed + marketplace listing only. Demo purge scoped to seeded preview IDs with explicit owner order + rollback note (separate runbook, not this build).

**Tech Stack:** TanStack Start, React 19, Tailwind v4, GSAP 3.15.0 (SplitText ships free with the pinned npm package since 3.13 — import `gsap/SplitText`, no license; verify at build via lockfile + import smoke), Vitest, Supabase migrations.

**Templates (9 keys in `TEMPLATE_KEYS` `src/lib/builder-ast.ts:45`; 8 designed):** `index, product, collection, page, blog, cart, checkout, search`. `account` explicitly exempt (no account template in this preset). §2 below is ONE homepage (`index`) × 8 sections.

## 1. Brand tokens — Touch: `src/lib/themes/songoskriti/tokens.ts` (new), `src/styles.css` (tokens only)

- Palette (locked): terracotta `#8A3B1F` brand, ember `#C45D3E` accent, ivory `#FAF8F5` paper, ink `#2D2A26`.
- Type: display serif EN headlines only, roman (never italic headers); Tiro Bangla display; Inter body. Money via `fmtMoney` (`src/lib/money.ts:171`), tabular numerals.
- i18n: `_bn` twins where schema supports them (widget prop `*_bn` fields per `builder-ast` bitext; `articles.title_bn/body_bn` per supabase types). Test asserts every authored EN string in the preset has its `_bn` twin or an explicit exemption comment.
- Signature: weave-lattice motif + 7/5 editorial grid INSIDE each hero slide (resolves carousel-vs-grid: grid is per-slide layout).
- Responsive matrix (§6 verifies): 320/375/414/768, no h-scroll (`overflow-x: clip`), single-line CTAs, ≥44px targets — snapshot + screenshot per width.

## 2. Homepage rhythm — Touch: `src/lib/themes/songoskriti/homepage.ts` (new, `buildHomepageMain(s)` pattern), `src/lib/themes/songoskriti/header.ts`, `footer.ts`

1. Announcement marquee (single on page; bilingual lines)
2. Masthead: hand-built SVG logo lockup + search/account/cart; menubar (Women, Men, Kids, Home & Living, Jewellery, New In) bound to real menus via menu picker
3. Hero carousel ×3 slides (festive drop, handloom craft, artisan story), 7/5 grid per slide; autoplay 6s, scroll-snap + dots/keyboard/arrows, pause-on-hover; reduced-motion → static first slide
4. Shop-by-category circles ×6 (Women, Men, Kids, Living, Jewellery, New In)
5. Occasion finder entry (Eid/festive, wedding, gifting)
6. Product rails ×2 (New arrivals, Bestsellers; snap + arrows)
7. Craft story (copy only; stats: real or demo-labeled numbers, never fabricated)
8. Testimonials (≤3 lines, name + role) → trust bar → statement footer + newsletter (one primary CTA per section: exactly one `cta-primary` anchor each)

## 3. Motion — Touch: `src/components/builder/songoskriti-motion.ts` (new, client-only), hero component

- Hero load timeline (`gsap.timeline({defaults:{duration:.6,ease:"power2.out"}})`, position params, labels): eyebrow → SplitText-words headline → sub → CTA → image x/autoAlpha drift.
- ScrollTrigger.batch reveals, `once:true`, `toggleActions:"play none none none"`; `ScrollTrigger.refresh()` after images load; created top-to-bottom.
- Swipe decision: scroll-snap + buttons ONLY (no Draggable/Observer). No pinning anywhere (no sticky-stack section exists).
- React: `useGSAP` + scope ref (fallback `gsap.context` + `ctx.revert()`); `gsap.matchMedia` for ≥768px vs below + `prefers-reduced-motion` (duration 0 / static); transforms + opacity only; `quickTo` for pointer effects; kill off-screen triggers.

## 4. Imagery + demo — Touch: `public/ph/songoskriti/` (15 files, manifest below), seed `supabase/migrations/20260924_songoskriti_demo.sql` (new), `src/lib/demo-catalog.ts` (ADD `songoskriti` key only; existing 6 verticals untouched)

- Manifest (15): `hero-festive.svg→png, hero-weaves, hero-artisans` (3, 1600×900) + `cat-women/men/kids/living/jewelry/newin` (6, 800×800) + `prod-panjabi/saree/kurta/kantha/necklace` (5, 900×1200) + `logo-lockup.svg` hand-built (1).
- Generation: Gemini Imagen REST `POST https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict`, key from `GEMINI_API_KEY` env only (never committed/logged; owner rotates key first — generation blocked until rotation confirmed). Retry ×2, then per-asset fallback: file-if-exists else `/api/public/ph` dept-tinted SVG. Seed references files, never remote URLs.
- Demo seed: products (BDT minor units), categories, collections, homepage designation; bilingual twins. Old demo data untouched (separate purge runbook).
- Copy gates (checkable): one `cta-primary` anchor per section (grep test), testimonials `line-clamp-3`, sentence case (manual review checklist in PR).

## 5. Widgets — Touch: `src/lib/builder-ast.ts` (append only), `src/lib/studio/catalog.ts` (append only), `src/components/builder/songoskriti.tsx` (new renderers, only if gap proven)

- Audit list 1:1 with §2: marquee, masthead/menubar horn (chrome, not widget), hero_carousel, category circles, occasion finder, product rail, craft story, testimonials, trust bar, footer/newsletter. Lookbook DEFERRED (not in §2).
- Build only proven-missing ones, TDD, each added to `PORTED` in `src/lib/studio/catalog.test.ts:10`, catalog-controls-defaults parity updated.
- Engine compat smoke (no engine changes): install theme via Appearance, open custom CSS, pick a menu, preview via restored `src/routes/theme-preview.$key.tsx` (restore from `dddfdc2^` — file originates in `de6c9af`; `ba620a1` postdates the purge — verify), publish, demo import, sitemap/canonical render. Failing smoke → gap report, not engine rewrite.

## 6. Verification (numeric gates, baseline = PR merge-base)

- `theme-preview/songoskriti` + storefront: desktop + mobile screenshots, zero console errors on those routes.
- a11y ≥ 90, CLS < 0.1, LCP < 2.5s on `/theme-preview/songoskriti` (mobile-simulated noted if infra-bound).
- 4-width matrix (§1): snapshot + screenshot each, assert no h-scroll, CTA single-line, targets ≥44px.
- `vitest run` touched suites green; `tsc --noEmit` zero NEW errors vs baseline; `vite build` exit 0.
- COD order proof: dropped (manual QA, not a gate).

## Global Constraints

- Single new key `songoskriti`; additive demo changes only.
- Work in `/tmp/opencode/songoskriti` worktrees; branch PRs; no deploy without explicit order.
- TDD, targeted suites only.
