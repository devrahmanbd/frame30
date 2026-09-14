# Theme Plan B — "Atelier" (apparel / fashion) — Build TODO

Status: **Executable TODO** · Target: shipping `atelier` blueprint preset + typography subsystem upgrade
Registry: all 117 widgets exist today; Atelier adds **no new renderer** — every box below is composition, policy, or platform capability.
Companions: `theme-plan-marketplace.md` (Bazaar), `theme-plan-electronics.md` (Circuit), `theme-plan-beauty.md` (Rupaboti), `theme-runtime.md`, `theme-registry.md`, `publishing.md`.

Legend: `[ ]` todo · `[x]` already in the codebase · `[!]` blocking gate (publish must fail without it)
Every box is done only when it has a test in `src/lib/*.test.ts` or a gate script under `scripts/`.

---

## 0. Position and non-negotiables

Atelier is the editorial pole of the platform. Bazaar proves density; Atelier proves restraint from the **same brick set**. If Atelier ever needs a theme-exclusive renderer or a `themeKey` branch, the registry is wrong and the change is rejected.

- [x] Registry has no per-theme gate (`WidgetMeta` carries no `themeKey`) — asserted in `definition-of-done.test.ts`.
- [ ] Atelier composes from shared widgets only; no new widget type keys introduced by this plan.
- [!] Every string authored in the preset carries a বাংলা twin (`BLUEPRINT_BN`); publish blocks below 90% coverage.
- [!] Every money value stays a server-validated integer minor unit; no client arithmetic in any Atelier section.

---

## 1. Design system steps

### 1.1 Tokens
- [ ] Atelier token set: paper `#FBF8F4`, ink `#1C1917`, muted ink `#6E6A65`, brand `#111827`, seasonal pigment `#B45309` (accent), sale red reserved as the only second accent.
- [ ] `radius: 2px` (sharp), `container: 1240px`, `density: airy`, `typeScale: expressive`, `spaceUnit: 24px`, `shadow: none`, `motion: subtle`.
- [ ] Contrast check every ink/paper/pigment pair with `contrastRatio()` ≥ 4.5:1 for body, ≥ 3:1 for ≥24px display; record the numbers in the preset test.
- [ ] Designed dark set (`dark: { brand, accent, surface, ink }`) — paper inverts to `#141210`, pigment lightens; light-only is not acceptable for a flagship blueprint.
- [ ] Scrim token applied on every text-over-image section (`container.bgImage` + `scrim`, `editorial_hero`, `collection_story`, `banner`).

### 1.2 Rhythm and layout
- [ ] Section spacing 128px desktop / 96px tablet / 64px mobile, driven by `spaceUnit` only — no hardcoded margins in props.
- [ ] Portrait 4:5 media ratio as the default for `product_grid`, `product_rail`, `lookbook`; ratio is reserved so CLS stays ≤ 0.02.
- [ ] Max two competing focal elements per viewport on the home template.
- [ ] Eyebrow style (uppercase, 11px, `0.16em` tracking) expressed through `typeScale: expressive` + heading `eyebrow` prop, never per-widget font overrides.

### 1.3 Motion
- [x] `reveal.ts` degrades to opacity-only under `prefers-reduced-motion: reduce`.
- [ ] Atelier uses `reveal: rise` on editorial sections, `stagger` (≤60ms) on grids, `none` on chrome and checkout.
- [ ] `marquee` in Atelier uses the type-only variant, pauses on hover, static under reduced motion.
- [!] No widget hand-rolls animation; a lint rule rejects inline `transition`/`animation` in `html` blocks inside blueprint presets.

---

## 2. Typography: BN/EN, Google Fonts, and custom fonts

Current state: `FONT_PAIRINGS` has 4 presets + `custom`; `FONT_PRELOAD` hardcodes one Google stylesheet (Noto Sans Bengali + Inter); `styles.css` declares metric-matched fallback faces for both.

### 2.1 Pairing model
- [x] Theme-level pairing (`fontPairing` → `fontDisplay`/`fontBody`); **no per-widget font pickers** — keep it that way.
- [ ] Add editorial pairings for Atelier: `editorial-serif` (display: `Playfair Display`, body: `Inter`), `editorial-bangla` (display: `Hind Siliguri`, body: `Noto Sans Bengali`), keeping `custom` as the escape hatch.
- [ ] Atelier default = `editorial-mix`; the seasonal switch to `editorial-serif` must be a one-token change with no section edits.

### 2.2 Bilingual correctness
- [x] `--font-bangla` stack + `.fq-bn` line-height/scale (`--fq-bn-scale`) so বাংলা does not clip ascenders/descenders.
- [ ] Every pairing declares a Bangla-capable body face; a Latin-only body face is only allowed when a Bangla fallback is appended automatically at token-render time.
- [!] Font resolver test: for each pairing × locale (`en`, `bn`), the resolved CSS stack must contain a face that covers the script, else the test fails.
- [ ] Bengali numerals (`digits: bengali`) keep tabular numerals for money — verify `font-variant-numeric: tabular-nums` survives the Bangla stack.

### 2.3 Loading, CLS, and performance
- [x] Both subsets ship in one stylesheet and are preloaded, so a locale switch never swaps in an unloaded face.
- [x] Metric-matched fallback faces (`Inter Fallback`, `Noto Sans Bengali Fallback`) hold the pre-swap box height.
- [ ] Derive `FONT_PRELOAD.stylesheet` from the active theme's pairing instead of a constant, emitting `preconnect` to `fonts.googleapis.com` + `fonts.gstatic.com` and `display=swap` on every family.
- [ ] Add a metric-matched fallback `@font-face` for each newly added family; a pairing without a fallback face fails the vitals gate.
- [ ] Weight budget: max 4 weights per family, ≤ 2 families per theme; reject a pairing that exceeds it.
- [ ] `latin` + `bengali` subsets only (`&subset=` / `unicode-range`), no `latin-ext` bloat.

### 2.4 Custom / self-hosted fonts (merchant uploads)
- [ ] Storage bucket `theme-fonts`, tenant-scoped path `{merchantId}/{family}/{weight}.woff2`; `.woff2` only, ≤ 400KB per file, ≤ 4 files per family.
- [ ] Validate the upload server-side (magic bytes + parse) before it is addressable; reject anything that is not a real woff2.
- [ ] Admin UI in the theme token panel: upload family → assign to display/body → live preview → save sets `fontPairing: "custom"`.
- [!] Licence attestation checkbox stored with the upload (`font_assets.licence_confirmed_at`); no attestation, no publish.
- [ ] Emit `@font-face` for custom families into the theme's scoped style block with `font-display: swap` and a declared metric-matched fallback (size-adjust captured at upload time).
- [ ] CSP: extend `font-src`/`style-src` to the storage origin only; keep `custom-code.ts` CSP otherwise unchanged.
- [ ] Fail-safe: if a custom font 404s or fails validation at render time, fall back to the theme's pairing silently and log `framique_theme_font_fallback_total`.

---

## 3. Responsive steps (per breakpoint)

Breakpoints are the existing AST `bp` map (`sm`/`md`/`lg`) plus `hidden`.

- [ ] Mobile (≤ 640px): single column; `lookbook` → 2-up; `product_grid` 2-up; sticky `sticky_buy_bar` on PDP; `mega_menu` collapses to drawer; `facet_sidebar` becomes a bottom-sheet via the overlay host.
- [ ] Tablet (641–1024px): 2–3 column grids, `split_feature` stacks image-first, section spacing 96px.
- [ ] Desktop (≥ 1025px): 4-up grids, offset `lookbook` alignment, hover image swap enabled (pointer: fine only).
- [ ] Every section that is hidden on a breakpoint uses `hidden: [...]` — never CSS-only hiding, so the SSR payload stays truthful.
- [!] No horizontal scroll at 320px on any of the 7 templates in EN and বাংলা (বাংলা strings run ~20–30% longer — check button and chip wrapping).
- [ ] Touch targets ≥ 44px for `size_selector`, `variant_picker` swatches, `wishlist_button`, pagination.
- [ ] Images: `sizes`/`srcset` per breakpoint, `loading=lazy` below the fold, `fetchpriority=high` for the `editorial_hero` LCP image only.

---

## 4. Widgets used by Atelier (all already in the registry)

- [ ] **Chrome**: `announcement_bar`, `utility_bar`, `mega_menu`, `search_command`, `account_cart`, `footer_sitemap`, `payment_icons`, `social_strip`, `trust_bar`.
- [ ] **Home**: `editorial_hero`, `lookbook`, `split_feature`, `collection_story`, `shoppable_image`, `product_rail`, `ugc_gallery`, `testimonial`, `marquee`, `newsletter`.
- [ ] **PDP**: `breadcrumb`, `product_media`, `price_block`, `variant_picker` (swatch mode), `size_selector`, `size_guide`, `fit_note`, `stock_delivery`, `add_to_cart`, `wishlist_button`, `back_in_stock`, `care_panel`, `sustain_badge`, `complete_the_look`, `product_meta`, `rating_summary`, `review_list`, `product_qna`, `sticky_buy_bar`, `quick_view`.
- [ ] **Collection**: `category_header`, `filter_chips`, `result_toolbar`, `facet_sidebar`, `product_grid`, `pagination`, `empty_state`.
- [ ] **Cart / checkout**: `cart_drawer`, `cart_lines`, `cart_summary`, `free_shipping_bar`, `checkout_steps`, `payment_methods`, `order_tracker`.
- [ ] **Content / support**: `page_content`, `rich_text`, `faq`, `buying_guide`, `store_locator`, `doc_links`, `support_strip`, `loyalty_strip`.
- [ ] Confirm each placement passes `isContextMismatch` (e.g. `price_block` only on `product`/`cart`) — preset test asserts zero mismatches.

---

## 5. SEO / AEO and customizability steps

- [ ] One `h1` claimant per template; all other headings demoted — enforced by `lintTemplate`.
- [ ] JSON-LD singletons per page: `Product` + `Offer` (PDP), `ItemList` (collection, lookbook), `BreadcrumbList`, `FAQPage` (one only — `faq` or `care_panel`, never both), `Article`/`HowTo` on guides with author + reviewer metadata.
- [ ] Answer-first blocks server-rendered above the fold on PDP (`size_guide` summary, `fit_note`, delivery promise) — never inside a client-only island.
- [!] `seo-answers` lint: no answer widget nested in a non-crawlable container.
- [ ] Per-template `head()` with unique title/description/og for storefront routes; hreflang alternates for `en`/`bn` via `seo-technical.ts`.
- [ ] `og:image` from the editorial hero absolute URL at the leaf route only.
- [ ] `seo_templates` rows shipped with the preset: title/description patterns for product, collection, page; merchant-editable in `SeoTemplatesPanel`.
- [ ] `llms.txt` catalogue map available for the store when `aiCrawlers` is opted in.
- [ ] Customizability contract: colours, fonts, radius, density, spacing, section order, media ratio, reveal mode and all copy are editable in the studio **without code**; document the surface in `theme-registry.md`.

---

## 6. Compatibility with the existing platform

- [ ] AST v3 only; preset declares `api: "^3.0.0"` and is rejected by `registryPackage` if incompatible (`registry-version.ts`).
- [ ] Built with `sectionFactory(BLUEPRINT_BN)` from `theme-section.ts` so ids are unique and বাংলা fills automatically.
- [ ] Round-trips through parse → serialize → parse with no drift (preset test).
- [ ] One batched, deduped data call per template render (`collectWidgetRequests`); no N+1 from rails.
- [ ] Hydration policy: `static` for editorial/content, `visible` for rails and UGC, `interaction` for size guide/quick view/cart drawer, `eager` only for chrome.
- [ ] Storefront cache key includes `tenant · template · locale · theme_version`; publishing purges only this merchant.
- [ ] Demo import: apparel catalogue (garments with sizes, colourways, fabric, model measurements) behind `theme_import_demo`, idempotent and fully reversible via `theme_purge_demo`.
- [ ] Registers in `THEME_PRESETS` alongside the other blueprints; preset-count test updated.

---

## 7. Safety, fail-safes, and gates

- [ ] `WidgetBoundary` placeholder proves a single throwing widget cannot take down an Atelier page (test one deliberately throwing section).
- [ ] Guardrails must pass: scrim on text-over-image, no pre-checked marketing consent (`back_in_stock`, `newsletter`), before/after disclaimer if used, no client-side money math.
- [!] Publish gate: parse clean + lint clean + ≥90% বাংলা coverage + a11y contrast pass in light/dark × EN/বাংলা.
- [ ] Vitals gate on index/collection/product: perf ≥ 90 mobile, a11y ≥ 95, LCP < 2.5s, INP < 200ms, CLS < 0.02, TBT ≤ 300ms.
- [ ] Overlay invariants: `OverlayHost` is the only focus-trap/scroll-lock/Escape owner for drawer, size guide, quick view, mobile filters.
- [ ] Tenant isolation asserted before any resolver call; custom fonts and demo rows are merchant-scoped.
- [ ] Plugins/custom code inside Atelier remain sandboxed, versioned, budgeted and kill-switchable.
- [ ] Fail-safes: missing image → reserved ratio placeholder; empty rail → section self-hides; missing translation → English with `lang` attribute, never an empty node; font failure → pairing fallback; data resolver timeout → cached last-good payload.

---

## 8. Execution order

1. Typography subsystem (§2.1–2.3) + tests.
2. `BLUEPRINT_BN` dictionary for all authored Atelier strings (§0 gate).
3. Register the Atelier blueprint; make parse/lint/round-trip/context tests green.
4. Responsive pass (§3) with 320/768/1280 sweeps in EN + বাংলা.
5. SEO/AEO wiring + `seo_templates` seed (§5).
6. Apparel demo catalogue in `theme_import_demo` / `theme_purge_demo` (§6).
7. Custom font upload pipeline (§2.4).
8. Run a11y + vitals gates; flip Atelier to `stable` in the catalogue.

## 9. Definition of done for this theme

- [ ] Parses, lints and renders all 7 templates in EN and বাংলা, light and dark.
- [ ] Every widget it uses comes from the shared registry with zero theme branches.
- [ ] Money is always a server integer ৳ with tabular numerals.
- [ ] Fonts: both scripts preloaded, metric-matched fallbacks, custom upload path validated and licence-attested.
- [ ] Demo import idempotent and reversible; publish blocked on any failing gate.
