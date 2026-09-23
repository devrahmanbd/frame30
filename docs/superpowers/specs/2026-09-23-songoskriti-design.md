# Songoskriti Heritage Theme — Design Spec

**Status:** approved by owner 2026-09-23 (Approach A: clean-slate, single theme)
**Goal:** One business-worthy clothing-heritage theme (`songoskriti`, সংস্কৃতি) with Aarong-grade storefront, demo data, and motion — installable, previewable, and compatible with custom CSS/JS, menus, and the theme engine.

**Architecture:** New preset pack on the restored theme engine (no engine changes unless a gap is proven): preset AST (8 templates) + blueprints + tokens + demo seed + marketplace listing. Old demo seeds/catalogs/pack rows deleted; live demo rows purged by cleanup migration. Studio widgets added only for proven catalog gaps.

**Tech Stack:** TanStack Start, React 19, Tailwind v4, GSAP 3 (tweens, timelines, ScrollTrigger; `useGSAP` + scoped `gsap.context`, `matchMedia` reduced-motion), Vitest, Supabase migrations.

## 1. Brand tokens

- Palette (locked): terracotta `#8A3B1F` brand, ember `#C45D3E` accent, ivory `#FAF8F5` paper, ink `#2D2A26`. Justification: explicit Aarong-parity brief (warm craft is the brand, not a default reach).
- Type: display serif EN (restrained, headlines only, roman — never italic headers), Tiro Bangla display for বাংলা, Inter body. Tabular numerals on all BDT money (`fmtBDT` only).
- Signature: weave-lattice motif + asymmetric 7/5 editorial hero. One marquee max. Mobile verified at 320/375/414/768 (no h-scroll, single-line CTAs, min 44px targets).

## 2. Homepage rhythm (8 sections, Aarong DNA)

1. Announcement marquee (single, bilingual lines)
2. Masthead: hand-built SVG logo lockup + search/account/cart; menubar (Women, Men, Kids, Home & Living, Jewellery, New In)
3. Hero carousel: 3 slides (festive drop, handloom craft, artisan story), autoplay 6s, swipe/dots/keyboard, pause-on-hover, static first slide under reduced motion
4. Shop-by-category circles (6: Women, Men, Kids, Living, Jewellery, New In)
5. Occasion entry (Eid/festive, wedding, gifting finders surfaced)
6. Product rails (New arrivals, Bestsellers — snap scroll + arrows)
7. Craft story (artisan copy; stats use real or explicitly demo-labeled numbers only — never fabricated metrics)
8. Testimonials (max 3 lines each, name + role) → trust bar → statement footer + newsletter (single CTA intent per section)

## 3. Motion (GSAP)

- Hero load timeline (gsap-timeline, position parameters, defaults): eyebrow → headline (SplitText words, optional) → sub → CTA → image drift-in.
- ScrollTrigger batch reveals (`once: true`, `toggleActions` play/none), `start: "top top"` pinning only if a sticky-stack section is approved; `ScrollTrigger.refresh()` after images load.
- Carousel: CSS scroll-snap + tiny JS controller (dots/keyboard/autoplay); GSAP only for slide transitions (x/autoAlpha); Draggable/Observer optional for swipe.
- Performance: transforms + opacity only, `will-change` sparingly, `quickTo` for pointer effects, kill off-screen triggers, `content-visibility` on long rails.
- React: `useGSAP` with scope ref (or `gsap.context` + `ctx.revert()`), client-only (no SSR execution), `gsap.matchMedia` for breakpoints + `prefers-reduced-motion` (duration 0/static fallback).

## 4. Imagery + demo data

- ~14 assets via Gemini Imagen REST, key from `GEMINI_API_KEY` env only (never committed, never logged; user exports it; key past exposure noted — restrict/revoke after). 3 heroes, 6 category, 4–6 product, 1 SVG logo lockup hand-built. Saved `public/ph/songoskriti/`, blueprint seeds reference files.
- Fallback: dept-tinted SVG placeholders (existing `/api/public/ph` pipeline) if generation fails. No hotlinked stock, no invented brand photography passed off as real.
- Fresh demo seed migration (products with BDT minor-unit prices, categories, collections, homepage designation); cleanup migration purges `is_demo` rows of retired packs. Old demo seed files + `DEMO_CATALOGS` verticals + preview-demo fallbacks deleted; widget-data fallbacks retargeted to `songoskriti`/marketplace spread.
- Bilingual EN/BN on every authored string where schema supports `_bn`.

## 5. Widgets + engine compatibility

- Audit `builder-ast` catalog + Studio catalog for gaps (carousel, circles, rails, story, testimonials, trust, marquee, newsletter, lookbook). Build ONLY missing widgets (TDD, catalog-controls-defaults parity test updated).
- New theme must work with: custom CSS/JS (per-theme code), nav menus (menu picker binding), preview tokens (`?preview_theme_id` + signed URLs), install/activate/publish pipeline, demo import, SEO templates/sitemap/canonical.
- No new dependencies (gsap already in `package.json`).

## 6. Verification

- `theme-preview/songoskriti` screenshot-verified desktop + mobile, zero console errors.
- Lighthouse a11y ≥ 90, CLS ≈ 0, LCP measured + noted (bundle-owned regressions flagged, not hidden).
- `vitest run` touched suites green; `tsc --noEmit` zero new errors; `vite build` exit 0.
- Contract: every new widget in `catalog.test.ts` PORTED list; demo COD order proof optional.

## Global Constraints

- One theme only (`songoskriti`); no replacement packs.
- Isolated worktrees (`/tmp/opencode/songoskriti-*`), never `/opt/frame28` directly.
- TDD, targeted suites, branch-only PRs, no production deploy without explicit order.
- Copy: plain verbs, sentence case, no filler; no invented metrics/testimonials/counts.
