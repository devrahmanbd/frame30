# Oceanblue Theme — Design Spec

**Status:** approved for implementation · **Date:** 2026-09-30
**Key:** `oceanblue` — new standalone theme (premium clean minimal, big-catalog discovery).
Songoskriti untouched. Prerequisite: Somvabona removal completes first (deletions already staged in worktree; remaining src comments + docs references cleaned in the same branch before Oceanblue lands, so `rg -i somvabona` returns zero hits outside `.git`).

## 1. Identity & scope

Biba-scale premium marketplace for Bangladesh, not a boutique: deep taxonomy (Suit Sets / Kurtas / Dresses / Bottoms / Girls / Jewellery / Collections / Sale), image-led discovery rails, and trust machinery above persuasion copy. Clean minimal surface — white canvas, one ocean brand color, muted gold reserved for offer/wedding moments only. BD skin throughout: BDT-first symbol pricing with Latin digits, EN/BN inline twins on every shopper string, COD / bKash / Nagad / Rocket badges, Eid/wedding occasion routing.

Out of scope for v1: PDP widget rebuilds (existing PDP widgets carry it), multi-currency (BDT only), dark theme set (`dark: null`, light-only like the shipped themes), merchant photography (gradient/placeholder art pipeline now, 1:1 swap later).

## 2. Tokens & visual system

`OCEANBLUE_TOKENS` in `src/lib/themes/oceanblue/tokens.ts`, starting from `DEFAULT_TOKENS`:

| Token | Value | Note |
| --- | --- | --- |
| `brand` | `#0B3A5B` | Deep ocean; white text 11.86:1 (AAA, verified) |
| `accent` | `#C08A3E` | Muted gold; 3.02:1 on white — decorative fills/borders/large graphics only, never body text |
| `surface` | `#FFFFFF` | Clean white canvas |
| `ink` | `#0F1E2E` | 16.86:1 on white (AAA, verified) |
| `radius` | `8px` | Soft minimal corners (vs Songoskriti sharp `0px`) |
| `fontDisplay` | `Inter` | Clean grotesque headlines, no editorial serif |
| `fontBody` | `Inter` | Bangla falls back to the Bangla stack in `styles.css` |
| `container` | `1280px` | |
| `density` | `comfortable` | |
| `typeScale` | `default` | |
| `spaceUnit` | `16px` | |
| `shadow` | `soft` | |
| `motion` | `subtle` | Collapses under `prefers-reduced-motion` |
| `digits` | `latin` | |
| `locale` | `en` | |
| `currencyDisplay` | `symbol` | BDT-first |
| `fontPairing` | `bengali-classic` | Shared pairing, Bangla-safe (zero negative tracking) |
| `dark` | `null` | Light-only v1 |
| `globals` | `DEFAULT_GLOBALS` | Merchant-editable palette via `TokenEditor` |

Contrast gates that publish enforces (4.5:1 text, 3:1 chrome) pass by construction on brand/ink; gold never appears in a text role so it cannot trip the gate.

## 3. Homepage rhythm (approved, 14 sections)

`buildHomepageMain()` in `src/lib/themes/oceanblue/homepage.ts`, wrapped in `withOceanblueDefaults()` (`src/lib/themes/oceanblue/skins.ts`), built only through `sectionFactory` so ids stay unique and `_bn` twins fill from the theme dictionary:

1. `announcement_bar` — shipping/offer line, bilingual, dismissible
2. Header — `mega_menu` (8 top items: Salwar Kameez, Kurtas & Tops, Dresses, Bottoms, Girls, Jewellery, Collections, Sale; each with Category + Collection columns) + `search_command` + `account_cart`
3. `hero_carousel` skin `split`, 3 slides (New Arrival / Lehenga & Wedding / Girls & NXT), H1 claimed by slide 1, `autoAdvanceMs: 5000`, `atmosphere: none` (clean, no wash)
4. `circle_categories` — 8 visual category tiles (Biba-style image discovery)
5. `product_rail` skin `minimal` — Most Loved (collection source + limit, real counts only)
6. `split_feature` — festive campaign banner (gold accent surface, token-driven)
7. `product_rail` skin `minimal` — Bestsellers
8. `circle_categories` — Shop by Color (color-family tiles resolving to filtered collection URLs)
9. `trust_marquee` — Free Shipping / Secure Payments / Easy Return (real claims only, freezes under reduced motion)
10. `collection_story` — brand proof story, single editorial block
11. `testimonials` skin `single` — one rotating customer quote
12. `store_locator` — flagship outlets, names + hours from merchant data, never invented addresses
13. `newsletter` — subscribe with consent line
14. Footer — `footer_sitemap` + `payment_icons` (MFS/COD marks) + `social_strip` + about `rich_text` + colophon

Global rule: `sticky_buy_bar` is PDP-only and never appears on index; the announcement bar never repeats mid-page.

No fabricated metrics, ratings, prices, or store addresses anywhere in defaults or demo copy.

## 4. Skins (closed vocabularies, theme defaults under authored props)

Core vocabularies in `WIDGET_SKINS` are reused unchanged; Oceanblue defaults:

| Widget | Core vocab (first = core default) | Oceanblue default |
| --- | --- | --- |
| `product_rail` | `editorial`, `compact`, `minimal` | `minimal` |
| `hero_carousel` | `split`, `fullbleed`, `minimal` | `split` |
| `testimonials` | `carousel`, `wall`, `single` | `single` |
| `product_grid` | `cards`, `rows` | `cards` |
| `urgency_rail` | `editorial`, `compact`, `minimal` | `minimal` |

Wired via `withOceanblueDefaults()` merging under authored props through the shared `withThemeWidgetDefaults` helper, so inspector values always win and only catalog-known keys persist. `skins.css` is token-only (`var(--theme-*)`, `color-mix` washes, `pointer-events-none` on wash layers, reduced-motion gates) and pinned by a `stays token-driven` test matching the Songoskriti/Somvabona gate pattern.

## 5. Templates (creation.md 12-area definition of done)

All keys in `TEMPLATE_KEYS` (`index`, `product`, `collection`, `account`, `page`, `blog`, `cart`, `checkout`, `search`), each `{ header, main, footer }`, responsive `bp` overrides, route-headed templates (`product`, `collection`, `account`, `page`, `blog`, `search`) carrying no H1 claimant while `index`/`cart`/`checkout` carry exactly one (`lintTemplate` enforces both directions):

- **product**: `breadcrumb`, `product_media` (1:1, thumbnails, zoom), `price_block` (compare-at), `variant_picker` + `size_guide`, `add_to_cart`, `delivery_promise`, `rating_summary` + `review_list` + `product_qna`, `complete_the_look`, `sticky_buy_bar`
- **collection**: `category_header` (live counts), `facet_sidebar` (price/size/color/fabric/fit/occasion), `result_toolbar` (6 sorts), `product_grid` cards, `pagination`, `empty_state`
- **cart/checkout**: `cart_lines`, `cart_summary` (server quote), `checkout_steps`, `payment_methods` (MFS/COD marks), order tracker post-purchase
- **blog**: `blog_terms` + `blog_archive` + `blog_pager` + `newsletter`
- **page**: `page_content` + `breadcrumb`
- **search**: collection listing reuse via `withSearch()`, never a hand duplicate
- **account**: orders/profile context widgets, route-supplied H1
- Header/footer/menus/forms/auth-link behavior identical to the creation.md contract (no credential markup in theme sections; `account_cart` entry only)

Every user string carries its `_bn` twin at construction; publish blocks below 90% Bangla coverage (`TRANSLATION_PUBLISH_FLOOR`).

## 6. Preview, registry, demo data

- `oceanbluePreviewSource()` in `src/lib/themes/oceanblue/preview.ts` implementing the `PreviewThemeSource` port (`theme-preview-nav.ts:283`); registered in `src/lib/preview-sources.ts` (the only place that names themes for preview); unauthored templates return `null` for engine-synthesized demo bodies; `?focus=` contract, account paths blocked.
- Preset entry + `CATALOG_META` entry (`rating: 0, installs: 0`, honest zeros); registry seed regenerated via `bun scripts/seed-theme-registry.ts`, never hand-edited.
- Demo import reads the registry (seed before testing imports); preflight before overwrite; `overwrite: true` deletes only colliding rows in FK order.
- Install → publish → activate through the standard desk functions; publish gated on clean `lintTemplate`, Bangla ≥ 90%, font licence/budget, contrast via `composePublishGate`; rollback via `theme_rollback` + purge.

## 7. Testing & rollout

Per creation.md §11, green before catalogue submission: theme `wiring.test.ts` (locked homepage composition), `skins.test.ts` (defaults + token-driven CSS, no hex literals), `preview.test.ts` (every authored template covered), `studio/catalog.test.ts` twin parity, `theme-preview-nav.test.ts`, `theme-preview.test.ts`, `isolation.test.ts` (no cross-theme imports, no theme-name branches in shared chrome), plus persist round-trip (skins + `_bn` twins survive `parseSection`) and package gates (§9.2: ≤2MB, ≤200 sections/template, single H1, bn ≥ 0.9, no executable content, `api ^3.0.0`). Version semver-bumped every resubmission; `key: oceanblue` never renamed after first publish.
