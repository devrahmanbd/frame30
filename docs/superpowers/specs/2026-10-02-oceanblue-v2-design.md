# Oceanblue-v2 — Full-Storefront Design Spec

**Status:** user-approved for implementation · **Date:** 2026-10-02
**Key:** `oceanblue-v2` — brand-new theme built from zero. `oceanblue` v1 untouched.
**Direction:** biba.in DNA (Hallmark `study` URL-mode, 2026-10-02: white paper, maroon
`#a72f30` accent ~5–10% footprint, WorkSans body + CrimsonPro display + Montserrat
labels, mega-menu, 4-slide photographic hero, category tiles, Most Loved /
Recommended rails, Shop by Color, trust strip, 5-column index footer).
Original work only — DNA is structural; no copied pixels, copy, assets, or layouts.
**Method:** hallmark (studied-DNA route; catalog suspended for this build).
OpenDesign MCP/daemon not present in this environment — visual verification via
chrome-devtools (snapshot + DOM asserts + fresh-page renders), not screenshots.

## 1. Identity & scope

New standalone premium ethnic-marketplace theme for Bangladesh. Full storefront:
nine templates (index, product, collection, account, page, blog, cart, checkout,
search) sharing one header/footer chrome. BD skin throughout: BDT-first symbol
pricing with Latin digits, EN/BN inline twins on shopper strings, COD / bKash /
Nagad / Rocket badges, Eid/wedding occasion routing. Light-only v1 (`dark: null`).
Merchant photography absent — gradient/monogram placeholders 1:1-swappable later
(P9-6 imagery stays user-side).

Out of scope: PDP widget rebuilds (existing PDP widgets carry it),
multi-currency (BDT only), dark set, retiring v1, any push/deploy (commit only).

## 2. Tokens & visual system

`OCEANBLUE_V2_TOKENS` in `src/lib/themes/oceanblue-v2/tokens.ts`, same
`ThemeTokens` shape as v1 (`src/lib/themes/oceanblue/tokens.ts`) + `DEFAULT_GLOBALS`:

| Token | Value | Note |
| --- | --- | --- |
| `brand` | `#A72F30` | Deep maroon (studied DNA); white text ≈ 7.5:1 |
| `accent` | `#5C1A24` | Darker maroon-plum for hover/festive depth, never body text on white alone |
| `surface` | `#FFFFFF` | White canvas |
| `ink` | `#241318` | Maroon-black body ink |
| `tint` | blush `#F9EFEF` | Festive band wash — verify `ThemeTokens` in `builder-ast` carries the slot; otherwise declare as a named `skins.css` variable and reference by name only |
| `radius` | `10px` | Distinct from v1 `8px` |
| `fontDisplay` | editorial serif stack | CrimsonPro role; Bengali falls back to Bangla stack in `styles.css`, zero negative tracking |
| `fontBody` | grotesque stack | WorkSans role + Bangla fallback |
| `fontLabel` | uppercase grotesque | Montserrat role, labels/eyebrows only |
| `container` | `1280px` | |
| `density` | `comfortable` | |
| `shadow` | `soft` | |
| `motion` | `subtle` | Collapses under `prefers-reduced-motion` |
| `digits` | `latin` | |
| `locale` | `en` | |
| `currencyDisplay` | `symbol` | BDT-first |
| `fontPairing` | `bengali-classic` | Shared pairing, Bangla-safe |
| `dark` | `null` | Light-only |
| `globals` | `DEFAULT_GLOBALS` | Merchant-editable palette via `TokenEditor` |

Contrast gates pass by construction on brand/ink; accent never sets small body text.

## 3. Homepage rhythm (14 sections, `buildHomepageMain()`)

Built only through `sectionFactory` so ids stay unique and `_bn` twins fill from
the theme dictionary; wrapped in `withOceanblueV2Defaults()` (`skins.ts`):

1. `announcement_bar` — chrome-slotted only (copy lives in `header-fallback.ts`),
   dismissible, evergreen, no fabricated discounts
2. Header chrome — masthead (logo/nav/icons shared chrome) + rotating assurance
   strip + mega-menu tree (Category + Collection columns) in `header-fallback.ts`
3. `hero_carousel` skin `banner` — 4 full-bleed photographic slides
   (New Season / Wedding Edit / Girls / NXT), H1 on slide 1, `autoAdvanceMs: 5000`
4. `circle_categories` — 8 visual category tiles
5. `product_rail` skin `loved` — Most Loved (ratings, wishlist, Quick View,
   scarcity line only when true, real counts only)
6. `split_feature` — maroon campaign banner, single CTA with real permalink
7. `product_rail` skin `recommended` — Recommended with % OFF on true sale only
8. `circle_categories` — Shop by Color (color-family tiles → filtered URLs)
9. `trust_marquee` — shipping / payments / returns, real claims, frozen under
   reduced motion
10. `collection_story` — single editorial brand block
11. `testimonials` skin `single` — one rotating quote, real or omitted
12. `store_locator` — merchant-data outlets only, never invented addresses
13. `newsletter` — subscribe with consent line (exactly one instance sitewide)
14. Footer — `footer_sitemap` (5-column index) + `payment_icons` + `social_strip`
    (omit when handles unconfigured — no `href="#"`) + about `rich_text` + colophon

Global rules: `sticky_buy_bar` PDP-only; no uppercase-only display classes on new
storefront copy (no raw `uppercase`); one newsletter instance; every CTA resolves
to a real permalink.

## 4. Secondary templates (`buildSecondaryMain(s, kind)`)

- **collection/listing** — filter chips, sort, honest result counts, empty state
- **product (PDP)** — gallery, buy box, variant picker, `sticky_buy_bar`, trust row
- **cart / checkout / search / account / page / blog** — same chrome, v2 skins,
  honest empty states, no fabricated totals (server-computed minor units only)

## 5. Data

Reuse the 52-product `OCEANBLUE` demo catalog (`demo-catalog.ts`, BDT minor
units, OB-* SKUs); v2 preview maps to the same key. No new data work.

## 6. Wiring checklist (mirror v1, new key)

New dir `src/lib/themes/oceanblue-v2/`:
`index.ts`, `types.ts`, `tokens.ts`, `skins.ts`, `skins.css`, `homepage.ts`,
`secondary.ts`, `header.ts`, `header-fallback.ts`, `footer.ts`, `preset.ts`
(`makeSection("oceanblue-v2", …)`, all nine templates), `preview.ts`, plus
`preview.test.ts`, `render.test.tsx`, `registry.test.ts`, `wiring.test.ts`.
Wire-ups: `preview-sources.ts` entry, `theme-chrome.ts` chrome entry,
`catalog-meta.ts` entry (`oceanblue-v2`, honest zeros), `theme-preview-nav`
resolve, one Supabase registry-row migration (generated embed, never
hand-written). Isolation: theme prod files import engine lib only (`@/lib/*`),
never `@/components/*` (enforced by `isolation.test.ts`).

## 7. Honesty rules (Hallmark discipline 2)

No fabricated metrics, testimonials, counts, helplines, or addresses. Stat-led
blocks use real numbers, labelled placeholders, or a different macrostructure.
Social/payment/footer rows omit when unconfigured.

## 8. Gates per batch

`typecheck` → `test` → `test:contracts` → eslint on touched files (report repo
net delta, never claim clean) → rebuild `:3000` + chrome-devtools verify
(snapshot asserts, 0 console errors, desktop + 390px) → commit. No push, no
deploy without explicit user word. `ops/routing/*` never staged.
