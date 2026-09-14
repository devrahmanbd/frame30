# Theme Plan A — "Bazaar" (Amazon-class marketplace)

Status: Planning · Target: `theme-presets.ts` preset + builder capability upgrade
Depends on: `src/lib/builder-ast.ts` (AST v2), `src/components/builder/SectionRenderer.tsx`, `src/components/store/ThemeChrome.tsx`
Companion: `docs/04-builder/theme-plan-apparel.md`

---

## 0. Where this plan stands (updated)

The bricks described below are **built**. This section is kept as the rationale, not as a to-do:

- The registry is a closed `Record<SectionType, WidgetMeta>` of 117 widgets, every one with a renderer — a missing renderer is a type error, not a runtime placeholder.
- Composition, not hand-coded pages: a theme is an AST plus token JSON. `theme_import_demo` writes that JSON into `theme_templates` and seeds `is_demo` catalogue rows; `theme_purge_demo` reverses it.
- Data is batched: one `resolveWidgetData` call per template render, tenant-scoped, with a timeout and a last-good fallback. Widgets never fetch.

What remains theme work is composition and copy (per-blueprint বাংলা coverage, tokens, imagery), not new bricks. Read §2 as the shipped catalogue and §3 as the shipped builder contract.

---

## 1. Core design principles (opinionated)

| Principle | Rule |
| --- | --- |
| Density over drama | Information-per-scroll is the KPI. No full-bleed 90vh hero. Above-the-fold shows ≥ 3 distinct modules. |
| Decision surfaces | Every card carries price, rating, delivery promise, and a primary action. Never a bare image + title. |
| Neutral chrome, loud commerce | Chrome uses `--fq-neutral-*`; saturation is reserved for price, deal, and CTA. One accent (`--fq-accent`) only. |
| Grid is the system | 12-col desktop / 8 tablet / 4 mobile, 16px gutter. Every widget declares its column span; nothing is free-floating. |
| Motion is feedback, not decoration | ≤ 200ms, transform/opacity only, `prefers-reduced-motion` honoured. Rail scroll, skeleton→content, add-to-cart flyout. No scroll-jacking, no parallax. |
| Skeleton parity | Every data widget ships a skeleton whose box model matches the loaded state exactly (zero CLS). |
| Type scale | 12/13/14/16/20/28/40. Body 13–14px. Headings semi-bold, never display-weight. Bangla via `--fq-font-bangla`, LTR/RTL-safe. |
| Radius & shadow | `--fq-radius-sm: 4px`, `md: 8px`. Shadows only on hover/overlay; flat resting state. |
| Accessibility | AA contrast on price/CTA, 44px hit targets on mobile, focus ring on every interactive card, semantic `<h1>` claimed by exactly one widget per template. |

Token additions required in `styles.css` `@theme`:
`--fq-deal`, `--fq-deal-foreground`, `--fq-rating`, `--fq-promise`, `--fq-price-strike`, `--fq-rail-fade`, `--fq-surface-raised`, `--fq-grid-gutter`.

---

## 2. Widgets to build

Legend: **[N]** new widget, **[U]** upgrade of an existing catalog entry.

### 2.1 Layout / structure

| Widget | Type key | Slots | Notes |
| --- | --- | --- | --- |
| Container **[N]** | `container` | all | The Elementor unlock: holds `children: Section[]`, props `cols`, `gap`, `align`, `bg`, `padY`, `maxW`, all responsive. Requires AST recursion (§3.1). |
| Columns **[N]** | `columns` | all | Sugar over `container` with fixed 2/3/4 split presets. |
| Tabs **[N]** | `tabs` | main | Named panes, each pane a container. Used for PDP description/specs/reviews. |
| Accordion **[N]** | `accordion` | main | Reuses `faq` renderer internals. |
| Sticky bar **[N]** | `sticky_bar` | header/footer | Pins on scroll past offset; mobile buy-bar on PDP. |
| Spacer **[U]** | `spacer` | all | Add responsive height. |
| Divider **[N]** | `divider` | all | Hairline/label variants. |

### 2.2 Global chrome

| Widget | Type key | Notes |
| --- | --- | --- |
| Utility bar **[N]** | `utility_bar` | Deliver-to location, language, currency, help. |
| Mega menu **[N]** | `mega_menu` | Department tree, 3-level, image column, keyboard navigable. |
| Search command **[N]** | `search_command` | Category-scoped select + typeahead (products, categories, recent). |
| Account/cart cluster **[N]** | `account_cart` | Auth-aware; cart badge count from `useCart`. |
| Department strip **[N]** | `department_strip` | Horizontal scroll of top categories. |
| Footer sitemap **[N]** | `footer_sitemap` | 4–6 link columns + locale/legal row. |
| Trust bar **[N]** | `trust_bar` | Payment, COD, return, courier logos. |

### 2.3 Merchandising

| Widget | Type key | Notes |
| --- | --- | --- |
| Product rail **[N]** | `product_rail` | The single most important brick. Horizontal snap-scroll, arrows on desktop, source = collection / manual / `recently_viewed` / `bestsellers` / `recommended`. |
| Card grid **[U]** | `product_grid` | Add `density` (comfortable/compact/list), `cardVariant`, `showRating`, `showPromise`, `showBadges`, responsive cols. |
| Deal of the day **[N]** | `deal_card` | Price, strike, % off, claimed bar, countdown (reuse `countdown`). |
| Deal strip **[N]** | `deal_strip` | Rail of `deal_card`. |
| Category tiles **[U]** | `collection_grid` | Add 2x2-in-card variant ("Shop by category" quad tile). |
| Hero carousel **[U]** | `hero` | Multi-slide, autoplay off by default, dots, LCP-optimised first slide. |
| Sponsored slot **[N]** | `sponsored_slot` | Labelled "Sponsored", feeds ad pipeline. |
| Brand strip **[N]** | `brand_strip` | Logo rail. |
| Compare table **[N]** | `compare_table` | 3–5 products × attribute rows. |
| Recently viewed **[N]** | `recently_viewed` | Local-storage backed rail. |
| Bundle / FBT **[N]** | `bundle_offer` | "Frequently bought together" with combined price + single add. |

### 2.4 PDP

| Widget | Type key | Notes |
| --- | --- | --- |
| Gallery **[U]** | `product_media` | Thumb rail, zoom-on-hover, mobile swipe, video slide. |
| Buy box **[N]** | `buy_box` | Composite: price, savings, delivery promise, stock, qty stepper, add/buy-now, seller line. Replaces the split `price_block`/`add_to_cart` on this theme. |
| Variant picker **[N]** | `variant_picker` | Swatch / chip / dropdown, disabled-state for OOS combos. |
| Delivery promise **[N]** | `delivery_promise` | Pincode/thana input → ETA + COD availability. |
| Rating summary **[N]** | `rating_summary` | Average, count, 5-bar distribution, filter chips. |
| Review list **[N]** | `review_list` | Sort, media thumbnails, verified badge, helpful vote. |
| Q&A **[N]** | `product_qna` | Question list + ask box. |
| Spec table **[N]** | `spec_table` | Key/value from product metafields. |
| Seller card **[N]** | `seller_card` | Rating, policies, "more from this seller". |
| Sticky buy bar **[N]** | `sticky_buy_bar` | Mobile-only pinned price + CTA. |

### 2.5 Collection / search

| Widget | Type key | Notes |
| --- | --- | --- |
| Facet sidebar **[N]** | `facet_sidebar` | Price range, brand, rating, attributes, in-stock. URL-synced. |
| Active filters **[N]** | `filter_chips` | Removable chips + clear-all. |
| Sort + count bar **[N]** | `result_toolbar` | Sort select, result count, density toggle. |
| Pagination **[N]** | `pagination` | Numbered + "load more" variants. |
| Category header **[N]** | `category_header` | Title, description, subcategory pills. |
| Empty state **[N]** | `empty_state` | Illustration, message, suggested rails. |

### 2.6 Cart / checkout / account

| Widget | Type key | Notes |
| --- | --- | --- |
| Cart line list **[N]** | `cart_lines` | Qty stepper, save-for-later, remove, per-line stock warning. |
| Order summary **[U]** | `cart_summary` | Coupon field, VAT line, shipping estimate, sticky on desktop. |
| Checkout stepper **[N]** | `checkout_steps` | Address → delivery → payment → review. |
| Payment method grid **[N]** | `payment_methods` | COD / bKash / Nagad / card tiles. |
| Order tracker **[N]** | `order_tracker` | Timeline with courier events. |

### 2.7 Engagement / infra

`countdown` **[U]** (compact variant), `newsletter` **[U]** (inline + modal), `announcement_bar` **[N]**, `notice` **[N]**, `breadcrumb` **[U]** (JSON-LD emit), `html` **[U]** (sandboxed, unchanged).

Total: **~48 new + 9 upgraded** widgets.

---

## 3. Builder contract (as built)

### 3.1 AST v3 — nesting
`Section` carries `children?: Section[]`. `parseAst` recurses with a depth cap of 6 and 300 nodes per template; a widget accepts children only when its catalogue entry declares `container: true`. Slot legality is checked per parent, and `lintTemplate` walks the whole tree.

### 3.2 Data-bound widget contract
`WidgetMeta.data` declares `{ source, params }` over the closed source list (collection, manual, recommendation, reviews, facets, taxonomy, variants, qna, order, specs, finance, product). `collectWidgetRequests` dedupes a template into one request set and `resolveWidgetData` resolves it in a single batched, tenant-scoped call — with a 2.5s per-source timeout that degrades to the last-good payload rather than an empty rail. Every data widget ships a skeleton whose box reserves the loaded aspect ratio (enforced by `skeletonParityGate`).

### 3.3 Responsive + style panel
Per-breakpoint props live under `bp` (sm/md/lg) with `hidden[]`; every widget accepts the universal style props `padY`, `padX`, `bg`, `radius`, `border`, `shadow`, `maxW`, `align`. Values are tokens only — free-form colours are rejected by `parseTokens`.

### 3.4 Editor UX
Layer tree, drag-and-drop into containers, multi-select, duplicate/copy-paste across templates, keyboard reorder, saved blocks with export/import, and a 50-step undo/redo history.

### 3.5 Demo import
`theme_import_demo(theme_key, _catalog)` is idempotent and per-merchant: it writes the preset AST and tokens, seeds the vertical catalogue from `src/lib/demo-catalog.ts` behind `is_demo`, and records `theme.demo_imported` in `theme_audit` with row counts. `theme_purge_demo` removes only `is_demo` rows and reports what it removed.

### 3.6 Guardrails
The registry is a closed enum; unknown types render as placeholders. Token overrides stay restricted to `semantic.%` / `component.%` / `dark_semantic.%`. No inline `<style>`/`<script>` from widget props, and no renderer branches on a theme key.

---

## 4. "Bazaar" theme composition

**Tokens** — neutral `#0F1111` ink, surface `#FFFFFF`, raised `#F7F8F8`, chrome `#131921`, accent `#FF9900`-class warm amber, deal `#CC0C39`-class red, rating amber, promise green. Radius 4/8. Font: system-ui + Bangla fallback, 13px body.

**index**
```
header: utility_bar · [search_command | account_cart] · mega_menu · department_strip
main:   hero(carousel, 3 slides)
        container(cols=4) → collection_grid(quad-tile) ×4      ← overlaps hero bottom
        deal_strip("Today's deals", countdown)
        product_rail("Bestsellers")
        banner(2-up)
        product_rail("Recommended for you")
        brand_strip
        product_rail("Recently viewed")
        newsletter(inline)
footer: trust_bar · footer_sitemap · notice(locale/legal)
```

**collection** — `category_header` · `container(cols=[3,9])` → [`facet_sidebar`] [`filter_chips` · `result_toolbar` · `product_grid(density=comfortable)` · `pagination`] · `product_rail("Related")`

**product** — `breadcrumb` · `container(cols=[5,4,3])` → [`product_media`] [`heading` · `rating_summary(compact)` · `variant_picker` · `spec_table(short)`] [`buy_box` · `delivery_promise`] · `bundle_offer` · `tabs(Description | Specs | Q&A)` · `rating_summary(full)` · `review_list` · `product_rail("Similar items")` · `sticky_buy_bar(mobile)`

**cart** — `cart_lines` + sticky `cart_summary` · `product_rail("Add-ons")`
**checkout** — `checkout_steps` · `payment_methods` · `cart_summary`
**page / blog** — `container(cols=[8,4])` → [`page_content`] [`newsletter` · `product_rail`]

---

## 5. Build order

1. AST v3 nesting + `container`/`columns` + style panel (unblocks everything).
2. `product_rail`, `product_grid` upgrade, card variants, skeletons.
3. Chrome set (`utility_bar`, `mega_menu`, `search_command`, `account_cart`, `footer_sitemap`).
4. PDP set (`buy_box`, `variant_picker`, `rating_summary`, `review_list`, `delivery_promise`).
5. Collection set (`facet_sidebar`, `result_toolbar`, `pagination`).
6. Deals + recommendation rails, `compare_table`, `bundle_offer`.
7. Preset AST + demo importer + preset tests (extend `theme-presets.test.ts`).

## 6. Acceptance

- `parseTemplates` round-trips the preset with zero `invalid` nodes and zero lint issues.
- Lighthouse: perf ≥ 90 mobile on index/collection/product, a11y ≥ 95, CLS < 0.02.
- Each template renders with a single `<h1>`, valid Product/BreadcrumbList/ItemList JSON-LD.
- One batched data call per template render; no N+1 from rails.
- Demo import is idempotent and fully reversible.
