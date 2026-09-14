# Theme Plan C — "Circuit" (electronics / gadgets) · সার্কিট

Status: Planning · Target: `theme-presets.ts` preset + builder capability upgrade
Depends on: AST v3 nesting, container + style panel, data-bound widget contract — `docs/04-builder/theme-plan-marketplace.md` §3
Companions: `theme-plan-marketplace.md` (Bazaar) · `theme-plan-apparel.md` (Atelier) · `theme-plan-beauty.md` (Rupaboti)

---

## 0. Position

Circuit is the **spec-and-trust** pole. Where Bazaar sells breadth and Atelier sells mood, Circuit sells *certainty*: specs, comparison, warranty, EMI, authenticity. It must read as fluent to a Bangladeshi buyer in Bangla and to a diaspora/English buyer in the same layout — no separate templates, one AST, two locales.

Reuses from the shared registry: all layout widgets, `product_grid`, `product_rail`, `facet_sidebar`, `variant_picker`, `cart_lines`, `cart_summary`, chrome and checkout sets. Circuit adds §3.

---

## 1. Bilingual design core (EN + বাংলা)

This is the section every later theme inherits. Bilingualism is a **layout constraint**, not a translation task.

| Rule | Implementation |
| --- | --- |
| One AST, two locales | Copy never lives in the AST as a bare string; every text prop is `{ en, bn }` resolved by `c/{theme_id}/{locale}.json` (`03-storefront/i18n.md`). Builder text fields render a two-tab input. |
| Type pairing | Latin: Inter / grotesk 400–800. Bangla: **Noto Sans Bengali variable 400–900**. Both bound to `--fq-font-ui` via a font stack, never per-widget. |
| Bangla is not smaller | Bangla optical size runs larger: `--fq-bn-scale: 1.06` applied on `:lang(bn)`, line-height 1.7 (vs 1.5 Latin) so conjuncts and matras never clip. `overflow: visible` on heading boxes. |
| No all-caps Bangla | Eyebrows/labels use uppercase+tracking only under `:lang(en)`; `:lang(bn)` falls back to weight 700 + colour. |
| Length elasticity | Bangla strings run 15–30% longer. Every button, chip, tab and badge is min-width, never fixed width; nav allows 2-line wrap; card titles clamp at 2 lines with `-webkit-box`. |
| Numerals | Prices, specs, model numbers, EMI tables all use `font-variant-numeric: tabular-nums`. Digit system is a theme token: `--fq-digits: latin | bengali`; ৳ prefix, 0 decimals on product/cart (`06-payments/currency.md`). |
| Mixed-script safety | Model numbers, SKUs and units stay Latin inside Bangla sentences, wrapped in `<span dir="ltr" lang="en">` so shaping never breaks. |
| Locale switch | `LanguageToggle` in header; choice persists per store, sets `<html lang>`, and swaps the font subset — no page reload, no layout shift (both subsets preloaded). |
| Spec tables | Two-column tables must survive long Bangla labels: label column `min-content` up to 45%, value column tabular; on mobile they stack to definition rows. |
| A11y | Status via icon + text, never colour alone. `aria-label`s are locale-resolved. 44px targets. Contrast ≥ 4.5:1 in light and dark. |

---

## 2. Core design principles (opinionated)

| Principle | Rule |
| --- | --- |
| Spec density, zero hype | Information-first cards: title, key spec line, price, EMI, warranty chip, stock. No lifestyle fluff above the fold. |
| Cool technical palette | Slate canvas (`#F7F8FA` light / `#0B0F14` dark), ink `#0F172A`, one electric accent (`--fq-accent`, teal-600), amber = warning/low-stock, red = real price drop only, mint = in-stock/warranty valid. Neon is banned; dark-mode glow ≤ 5% opacity. |
| Hairlines, not shadows | 1px borders (`--fq-line`), radius 8px, elevation reserved for overlays. |
| Comparison is a first-class page | Compare tray persists across browsing; up to 4 SKUs; diff-highlight rows. |
| Trust ladder | Authenticity, warranty months, service-centre presence, return window and EMI are shown *before* the add-to-cart, not in the footer. |
| Motion = state, not decoration | 120–200ms `--fq-ease-out` on state change; compare-row draw 300ms; no parallax, no autoplay. Reduced-motion → none. |
| Dark mode is designed, not inverted | Both modes ship tokens; product imagery gets a paper-white plate in dark mode so cutouts don't float. |
| Performance | Spec tables SSR'd; sparkline is inline SVG ≤ 2KB; hero ≤ 250KB AVIF; CSS ≤ 60KB gz, JS ≤ 100KB gz, LCP < 2.5s. |

Token additions: `--fq-line`, `--fq-mono`, `--fq-bn-scale`, `--fq-digits`, `--fq-plate`, `--fq-accent-glow`, `--fq-spec-row`.

---

## 3. Additional widgets

`[N]` new · `[U]` upgrade of an existing brick.

| Widget | Type key | Notes |
| --- | --- | --- |
| Spec table **[N]** | `spec_table` | Grouped rows (Display / Battery / …), collapsible groups, bilingual labels, mobile stack. |
| Spec highlights **[N]** | `spec_highlights` | 4–6 icon+value tiles (chipset, RAM, battery mAh, warranty). |
| Compare tray **[N]** | `compare_tray` | Sticky bottom tray, add from any card, ≤4 SKUs, persists in local state. |
| Compare table **[N]** | `compare_table` | Side-by-side matrix, "differences only" toggle, sticky first column. |
| Warranty panel **[N]** | `warranty_panel` | Months, coverage, official/parallel import flag, service-centre list. |
| Authenticity badge **[N]** | `authenticity_badge` | "অফিসিয়াল পণ্য" / "Official product" chip with source note. |
| EMI calculator **[N]** | `emi_calculator` | Bank list, tenure chips (3/6/9/12), per-month integer ৳, server-fed rates — no client money math. |
| Price history **[N]** | `price_sparkline` | Tiny SVG + text alternative ("lowest ৳ in 90 days"). |
| Stock & delivery **[N]** | `stock_delivery` | In-stock, pickup point, ETA by district, COD availability. |
| Bundle builder **[N]** | `bundle_builder` | Phone + case + protector with combined server total. |
| Config picker **[U]** | `variant_picker` | `matrix` mode: RAM×Storage×Colour grid with unavailable combos disabled + reason. |
| Q&A **[N]** | `product_qna` | Customer questions, merchant answers, bilingual. |
| Review breakdown **[U]** | `rating_summary` | Star histogram + verified-purchase filter. |
| Tech doc links **[N]** | `doc_links` | Manual PDF, firmware, datasheet. |
| Brand rail **[N]** | `brand_rail` | Authorised-brand logo strip with brand landing links. |
| Deal countdown **[U]** | `countdown` | Technical variant, mono tabular, text-only under reduced motion. |
| Category mega grid **[U]** | `mega_menu` | 3-level tech taxonomy with icons. |
| Support strip **[N]** | `support_strip` | Hotline, WhatsApp, service centre, return policy — 4 tiles. |
| Buying guide **[N]** | `buying_guide` | Editorial block that links to filtered collections. |
| Trade-in **[N]** | `trade_in` | Estimate form → quote (server-valued). |

Circuit-specific: **20 widgets** (16 new, 4 upgrades).

---

## 4. Page-builder changes specific to this theme

Everything in `theme-plan-marketplace.md` §3 applies. Additional:

1. **Bilingual text control** — every string prop becomes `{ en, bn }` with tabbed inputs, a "missing translation" lint, and fallback rules (`bn → en`, flagged).
2. **Locale preview toggle** in the editor canvas (EN / বাংলা / side-by-side) so overflow is caught at design time.
3. **Table widget primitive** — a shared `data_table` renderer that `spec_table`, `compare_table` and `warranty_panel` all consume (sticky headers/columns, responsive stacking).
4. **Cross-section state channel** — `compare_tray` needs shared client state that survives navigation; add a themed store slot rather than per-widget context.
5. **Grouped/repeatable props** in the inspector (spec groups, EMI tenures) — array editors with drag reorder.
6. **Unit + digit formatting props** on numeric widgets (`৳`, mAh, GB, months; latin/bengali digits) resolved by the renderer, never by widget code.
7. **Lint rules**: no fixed-width buttons, no `text-transform: uppercase` on a `bn` string, no text over image without a scrim token.

---

## 5. "Circuit" theme composition

**Tokens** — canvas slate-50 / slate-950, accent teal-600 (dark: teal-400), line `#E2E8F0` / `#1E293B`, radius 8, section spacing 64/80px, font pair Inter + Noto Sans Bengali.

**index**
```
header: announcement_bar(EMI / free delivery) · [logo | mega_menu | search | account · compare · cart]
main:   hero_split(deal of the day + spec_highlights)
        category_tiles(10 tech categories, icon-led)
        product_rail("আজকের ডিল / Today's deals", countdown)
        brand_rail
        product_rail("নতুন এসেছে / New arrivals")
        buying_guide ×2
        support_strip
        product_rail("Best sellers")
footer: footer_sitemap(4 cols) · payment_icons · trust_bar · locale + newsletter
compare_tray (sticky, global)
```

**collection** — `category_header` · `facet_sidebar` (brand, price, RAM/storage, rating, availability; drawer on mobile) · `result_toolbar` (sort, density, per-page) · `product_grid(cols=[2,3,4], card=spec variant, compare checkbox, quick specs on hover)` · `pagination` · `buying_guide` after row 3.

**product**
```
container(cols=[6,6])
  ├ product_media(gallery + zoom, plate background)
  └ container(sticky)
      heading · authenticity_badge · rating_summary(compact)
      price_block · price_sparkline · emi_calculator
      variant_picker(matrix) · stock_delivery
      add_to_cart · compare toggle · wishlist
      warranty_panel · support_strip(compact)
spec_highlights
spec_table(grouped)
bundle_builder
doc_links
product_qna
review_list(verified filter)
compare_table(same-category suggestions)
product_rail("Similar / একই ধরনের")
```

**cart** — `cart_lines` (spec sub-line per item) · `cart_summary` (server totals) · `emi_calculator` on the whole cart · `product_rail("Accessories")`.

**checkout** — shared set, token-restyled; COD + district ETA surfaced at the address step.

**page / blog** — buying guides: single column 68ch, `spec_table` and `compare_table` inline, CTA to filtered collections.

---

## 6. Build order

1. Consume shared AST v3 + container + style panel from Plan A.
2. Bilingual text layer: `{en,bn}` props, i18n resolution, locale preview, lint rules (this unblocks Plan D too).
3. `data_table` primitive → `spec_table`, `compare_table`, `warranty_panel`.
4. Commerce trust set: `emi_calculator`, `stock_delivery`, `authenticity_badge`, `price_sparkline` (all server-valued).
5. Compare state channel → `compare_tray` + compare page.
6. Config matrix mode on `variant_picker`; `bundle_builder`.
7. Content set: `buying_guide`, `doc_links`, `product_qna`, `brand_rail`, `support_strip`.
8. Preset AST + light/dark tokens + demo import (32 SKUs, 8 categories, bilingual copy, 2 buying guides).

## 7. Acceptance

- Preset parses and lints clean across all 7 templates in **both** locales.
- Locale switch causes zero layout shift; no clipped Bangla conjuncts at 320px width.
- Every money value is a server-validated integer ৳ with tabular numerals; no client-side total or EMI math.
- Spec/compare tables are real `<table>` with `<th scope>`; sparkline has a text alternative.
- Dark mode designed (not inverted); contrast ≥ 4.5:1 in both modes.
- Reduced-motion: no transitions beyond opacity; countdown degrades to text.
- Lighthouse perf ≥ 90 mobile; CSS ≤ 60KB gz, JS ≤ 100KB gz, LCP < 2.5s.
- ≥ 70% of Circuit's registry is shared with Bazaar/Atelier — no theme-exclusive renderer branches.
