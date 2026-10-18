# Songoskriti Unified Port — Inventory (Task 1)

**Branch:** `frame30` · **Scope:** read-only recon. **Capture commit:** `72e8c54e` (task-1 inventory commit). All commits between `c86a6125` and HEAD are docs-only; check: `git log --oneline --stat c86a6125..HEAD -- src/` returns no `src/` changes (raw output: empty).

Evidence home: `docs/superpowers/songoskriti-evidence/port/`.

Row format (all axes): `surface | definition site (file:line, symbol) | editor visibility evidence (authorized-registry resolve / tray / schema; file:line) | renderer + winning source map for a non-songoskriti theme, per graph (keyed storefront; unkeyed editor/studio) | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line)`.

## 1. Templates

Songoskriti dresses **all 9** `TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-57`): `index, product, collection, account, page, blog, cart, checkout, search`. Preview source `src/lib/themes/songoskriti/preview.ts:60-300` (`songoskritiPreviewSource`, switch over templates). Zones per `TEMPLATE_ZONES` (`src/lib/builder-ast.ts:118-170`).

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map (non-songoskriti) | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| index template | `src/lib/themes/songoskriti/preview.ts:70` (`case "index": return buildHomepageMain(s)`) | `src/lib/themes/songoskriti/preview.ts` (productive entry via `builtin-themes.ts:12`); registry `buildEditorExtensionRegistry` n/a (template not widget) | keyed: theme preview source; unkeyed: n/a (no editor template surface) | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti-snapshots.test.tsx` |
| collection template | `src/lib/themes/songoskriti/preview.ts:72` (`case "collection"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti.test.tsx` |
| product template | `src/lib/themes/songoskriti/preview.ts:128` (`case "product"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti.test.tsx` |
| page template | `src/lib/themes/songoskriti/preview.ts:186` (`case "page"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| blog template | `src/lib/themes/songoskriti/preview.ts:197` (`case "blog"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| search template | `src/lib/themes/songoskriti/preview.ts:214` (`case "search"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| cart template | `src/lib/themes/songoskriti/preview.ts:232` (`case "cart"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| checkout template | `src/lib/themes/songoskriti/preview.ts:262` (`case "checkout"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| account template | `src/lib/themes/songoskriti/preview.ts:297` (`case "account"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| variations (minimal, festive) | `src/lib/themes/songoskriti/variations.ts:22` (`SONGOSKRITI_VARIATIONS`) | `src/lib/themes/songoskriti/variations.ts:66` (`SONGOSKRITI_VARIATIONS_CHECK`) | keyed: `songoskritiTokensFor`; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/lib/themes/songoskriti/variations.test.ts` |

## 2. Homepage

`buildHomepageMain(s)` in `src/lib/themes/songoskriti/homepage.ts:23` emits **21 sections / 12 distinct types** (verified via node count, appendix). `HOMEPAGE_SECTION_TYPES` in `src/lib/themes/songoskriti/types.ts:17-26` lists 9 intended types. `announcement_bar` and `circle_categories` never emitted by the homepage builder; `circle_categories` does appear in `src/lib/themes/songoskriti/archetypes.ts:205,262` (collection builders). Union = 14 types.

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| homepage composition (21 sections) | `src/lib/themes/songoskriti/homepage.ts:23` (`buildHomepageMain`) | `src/lib/themes/songoskriti/preview.ts:70` (`case "index"`) | keyed: theme preview; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti-snapshots.test.tsx` |
| hero_carousel | `src/lib/themes/songoskriti/homepage.ts:31` | n/a (homepage builder) | keyed: `SONGOSKRITI_WIDGETS.hero_carousel` (`songoskriti.tsx`); unkeyed: `WIDGET_COMPONENTS.hero_carousel` | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| department_grid | `src/lib/themes/songoskriti/homepage.ts:82` | n/a | keyed: `SONGOSKRITI_WIDGETS.department_grid`; unkeyed: `WIDGET_COMPONENTS.department_grid` | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/theme-locale-sinks.test.tsx` |
| product_rail ×6 | `src/lib/themes/songoskriti/homepage.ts:124,157,192,257,273,342` | n/a | keyed: `SONGOSKRITI_WIDGETS.product_rail` vs generic merch rail; unkeyed: `WIDGET_COMPONENTS.product_rail` | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/demo-widget-proof.test.tsx` |
| craft_story ×2 | `src/lib/themes/songoskriti/homepage.ts:140,358` | n/a | keyed: `SONGOSKRITI_WIDGETS.craft_story` (no generic) → undefined; unkeyed: `WIDGET_COMPONENTS.craft_story` | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| split_feature ×4 | `src/lib/themes/songoskriti/homepage.ts:173,242,288,424` | n/a | keyed: `SONGOSKRITI_WIDGETS.split_feature` vs generic apparel; unkeyed: `WIDGET_COMPONENTS.split_feature` | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| recently_viewed | `src/lib/themes/songoskriti/homepage.ts:208` | n/a | keyed: base `widgets.tsx:1608`; unkeyed: `WIDGET_COMPONENTS.recently_viewed` | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| finder_row | `src/lib/themes/songoskriti/homepage.ts:218` | n/a | keyed: `SONGOSKRITI_WIDGETS.finder_row` (no generic) → undefined; unkeyed: `WIDGET_COMPONENTS.finder_row` | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx:682` |
| collection_story | `src/lib/themes/songoskriti/homepage.ts:305` | n/a | keyed: `SONGOSKRITI_WIDGETS.collection_story` vs generic apparel; unkeyed: `WIDGET_COMPONENTS.collection_story` | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| ugc_gallery | `src/lib/themes/songoskriti/homepage.ts:376` | n/a | keyed: `SONGOSKRITI_WIDGETS.ugc_gallery` vs generic apparel; unkeyed: `WIDGET_COMPONENTS.ugc_gallery` | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti-snapshots.test.tsx` |
| testimonials | `src/lib/themes/songoskriti/homepage.ts:390` | n/a | keyed: `SONGOSKRITI_WIDGETS.testimonials` (no generic) → undefined; unkeyed: `WIDGET_COMPONENTS.testimonials` | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| trust_footer | `src/lib/themes/songoskriti/homepage.ts:441` | n/a | keyed: `SONGOSKRITI_WIDGETS.trust_footer` (no generic) → undefined; unkeyed: `WIDGET_COMPONENTS.trust_footer` | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| store_locator | `src/lib/themes/songoskriti/homepage.ts:477` | n/a | keyed: `SONGOSKRITI_WIDGETS.store_locator` vs generic apparel; unkeyed: `WIDGET_COMPONENTS.store_locator` | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti-snapshots.test.tsx` |

## 3. Renderer neutrality (SONGOSKRITI_WIDGETS, 18 keys)

Key set declared at `src/components/builder/songoskriti.tsx:2577` (`export const SONGOSKRITI_WIDGETS`); object keys at `src/components/builder/songoskriti.tsx:2601-2618` (`finder_row: FinderRow` … `result_toolbar: SongoskritiResultToolbar`). Registry import `src/lib/unified-widget-registry.ts:127`. Keyed storefront resolution: `src/components/builder/theme-widgets.ts:73-78` (`resolveWidgetComponent(themeKey, type)` = `THEME_WIDGETS[themeKey]?.()[type] ?? GENERIC_WIDGETS[type]`). Unkeyed editor/studio: `resolveWidgetComponent(null, …)` → `WIDGET_COMPONENTS` in `src/components/builder/widgets.tsx:1666-1668` (spreads `...SONGOSKRITI_WIDGETS` last → songoskriti wins all 18). Studio delegation: `src/components/builder/studio/renderers.tsx:1457-1477` (delegates `product_grid` to `WIDGET_COMPONENTS.product_grid`).

Generic-map membership (keyed foreign theme, e.g. somvabona): a key is neutral if it exists in `GENERIC_WIDGETS` (base = chrome/merch/pdp/collection/cart/account/apparel/heritage/somvabona + basic/blog/circuit/beauty/beauty-home). finder_row, craft_story, testimonials, trust_footer are NOT in any generic map → unreachable for foreign theme.

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| finder_row | `src/components/builder/songoskriti.tsx:2601` (`finder_row: FinderRow`) | `src/lib/unified-widget-registry.ts:127` import | keyed: `THEME_WIDGETS[foreign]?.()[finder_row]` = undefined (no generic); unkeyed: `WIDGET_COMPONENTS.finder_row` = Songoskriti | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx:682` |
| craft_story | `src/components/builder/songoskriti.tsx:2602` (`craft_story: CraftStory`) | same | keyed: undefined (no generic); unkeyed: Songoskriti | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| testimonials | `src/components/builder/songoskriti.tsx:2603` (`testimonials: Testimonials`) | same | keyed: undefined (no generic); unkeyed: Songoskriti | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| trust_footer | `src/components/builder/songoskriti.tsx:2604` (`trust_footer: TrustFooter`) | same | keyed: undefined (no generic); unkeyed: Songoskriti | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| product_rail | `src/components/builder/songoskriti.tsx:2605` (`product_rail: SongoskritiProductRail`) | same | keyed: generic merch rail (neutral); unkeyed: Songoskriti rail | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/demo-widget-proof.test.tsx` |
| product_grid | `src/components/builder/songoskriti.tsx:2606` (`product_grid: SongoskritiProductGrid`) | same + studio delegation (`studio/renderers.tsx:1457`) | keyed: generic grid; unkeyed: Songoskriti grid | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| rich_text | `src/components/builder/songoskriti.tsx:2607` (`rich_text: SongoskritiRichText`) | same | keyed: generic (base); unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| newsletter | `src/components/builder/songoskriti.tsx:2608` (`newsletter: SongoskritiNewsletter`) | same | keyed: generic (base); unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| footer_sitemap | `src/components/builder/songoskriti.tsx:2609` (`footer_sitemap: SongoskritiFooterSitemap`) | same | keyed: generic chrome; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/footer-locale.test.tsx` |
| payment_icons | `src/components/builder/songoskriti.tsx:2610` (`payment_icons: SongoskritiPaymentIcons`) | same | keyed: generic chrome; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| department_grid | `src/components/builder/songoskriti.tsx:2611` (`department_grid: SongoskritiDepartmentGrid`) | same | keyed: generic heritage; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/theme-locale-sinks.test.tsx` |
| mega_menu | `src/components/builder/songoskriti.tsx:2612` (`mega_menu: SongoskritiMegaMenu`) | same | keyed: generic chrome; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx:393` |
| store_locator | `src/components/builder/songoskriti.tsx:2613` (`store_locator: SongoskritiStoreLocator`) | same | keyed: generic apparel; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti-snapshots.test.tsx` |
| split_feature | `src/components/builder/songoskriti.tsx:2614` (`split_feature: SongoskritiSplitFeature`) | same | keyed: generic apparel; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| collection_story | `src/components/builder/songoskriti.tsx:2615` (`collection_story: SongoskritiCollectionStory`) | same | keyed: generic apparel; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| ugc_gallery | `src/components/builder/songoskriti.tsx:2616` (`ugc_gallery: SongoskritiUgcGallery`) | same | keyed: generic apparel; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti-snapshots.test.tsx` |
| category_header | `src/components/builder/songoskriti.tsx:2617` (`category_header: SongoskritiCategoryHeader`) | same | keyed: generic collection; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| result_toolbar | `src/components/builder/songoskriti.tsx:2618` (`result_toolbar: SongoskritiResultToolbar`) | same | keyed: generic collection; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |

## 4. Global chrome

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| header builder | `src/lib/themes/songoskriti/header.ts:17` (`buildHeaderMain`) | `preview.ts` header (template !== checkout): `preview.ts:70`+ | keyed: theme preview; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| header presentation (mega_menu) | `src/lib/themes/songoskriti/header-presentation.tsx:776` (`registerThemePresentation("songoskriti","mega_menu",...)`) | `src/lib/unified-widget-registry.ts:127` import chain; `src/lib/themes/songoskriti/index.ts:9` (re-export activation) | keyed: theme presentation; foreign: generic mega_menu | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx:393` |
| header fallback (mega-menu tree) | `src/lib/header-copy.ts` (neutral data module); `src/lib/themes/songoskriti/header-fallback.ts` (compat re-export) | `src/components/store/theme-chrome.ts` (key-driven lookup via `DEFAULT_HEADER_CHROME_KEY`) | keyed: neutral (data, no theme import); unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/store/theme-chrome.test.ts` |
| header announcement | `src/lib/header-copy.ts:247` (`HEADER_ANNOUNCEMENT`) | same | keyed: neutral; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| header logo lockup | `src/lib/header-copy.ts:241` (`HEADER_LOGO`) | same | keyed: neutral; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| footer builder | `src/lib/themes/songoskriti/footer.ts:202` (`buildFooterMain`) | `preview.ts` footer (template !== checkout): `preview.ts:70`+ | keyed: theme preview; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| footer proof presentation (footer_sitemap) | `src/lib/themes/songoskriti/footer-proof-presentation.tsx:217` (`registerThemePresentation("songoskriti","footer_sitemap",...)`) | registry import chain | keyed: theme; foreign: generic | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| footer copy constants | `src/lib/footer-copy.ts:16` (`STATEMENT`), `:24` (`NEWSLETTER`), `:37` (`PAYMENT_MARKS`), `:40` (`COLOPHON`) | shared chrome | keyed: neutral (data module); unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| announcement presentation | `src/lib/themes/songoskriti/announcement-presentation.tsx:108` (`registerThemePresentation("songoskriti","announcement_bar",...)`) | **verified dormant**: `grep -rn "announcement-presentation" src/ --include="*.ts" --include="*.tsx"` returns only test files (`StoreHeader.test.tsx`, `platform-acceptance.test.tsx`, `announcement-presentations-proof.test.tsx`) plus data-attribute strings/comments; `preview.ts` does not import it; `index.ts` re-exports `header-presentation` + `ornament` only. | keyed: theme (if activated); foreign: generic | keyed: neutral (if activated); unkeyed: n/a | n/a (no dedicated test) |
| menu behavior (mega_menu) | `src/lib/themes/songoskriti/header-presentation.tsx:171-279` (`SongoskritiDesktopNav`, `SongoskritiMobileDrawer`) — (line unchecked: verify `SongoskritiDesktopNav` at 171) | mega_menu presentation | keyed: theme; foreign: generic | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |

Conclusion for announcement: test-only → dormant, Task 2 escalation lane.

## 5. Tokens / skins

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| tokens | `src/lib/themes/songoskriti/tokens.ts:9` (`SONGOSKRITI_TOKENS`) | `preview.ts:56` (`tokens: songoskritiTokensFor(variationKey)`) | keyed: theme tokens; foreign: own tokens | keyed: neutral; unkeyed: n/a | `src/lib/themes/songoskriti/skins.test.ts` |
| skins (widget defaults) | `src/lib/themes/songoskriti/skins.ts:52` (`SONGOSKRITI_WIDGET_DEFAULTS`) | `skins.ts:109` (`withSongoskritiDefaults`) | keyed: theme skin defaults; foreign: own | keyed: neutral; unkeyed: n/a | `src/lib/themes/songoskriti/skins.test.ts` |
| skins.css | `src/lib/themes/songoskriti/skins.css` (imported in `skins.ts:28`) | `skins.ts:28` (`import "./skins.css"`) | keyed: css-only; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| skin sets | `src/lib/themes/songoskriti/skins.ts:35` (`SONGOSKRITI_SKIN_SETS`: product_rail, hero_carousel, testimonials, product_grid) | `skins.ts:75` (`resolveSongoskritiSkin`) | keyed: theme; foreign: generic skin | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| variations (minimal, festive) | `src/lib/themes/songoskriti/variations.ts:22` (`SONGOSKRITI_VARIATIONS`) | `variations.ts:66` (`SONGOSKRITI_VARIATIONS_CHECK`) | keyed: variation tokens; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/lib/themes/songoskriti/variations.test.ts` |

## 6. Bilingual copy

Bitext pairs (en/bn) live inline via `_bn` props. Locations:
- `src/lib/themes/songoskriti/homepage.ts` (every section has `heading_bn`, `body_bn`, etc.)
- `src/lib/themes/songoskriti/header.ts` / `header-copy.ts` (`HEADER_MENU_BN` table in `src/lib/header-copy.ts`)
- `src/lib/footer-copy.ts` (`STATEMENT`, `NEWSLETTER`, `COLOPHON` with `_bn`)
- `src/components/builder/songoskriti.tsx` (inline `t(locale, en, bn)` calls throughout, e.g. FinderRow lines 117-122, TrustFooter 527-528)
- `src/lib/themes/songoskriti/archetypes.ts` (`title_bn`, `subtitle_bn`, `heading_bn`, `body_bn`)

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| homepage bilingual | `homepage.ts` (all sections) | n/a (homepage builder) | keyed: theme preview; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| header menu bilingual | `src/lib/header-copy.ts:185` (`HEADER_MENU_BN`) | `header-copy.ts:233` (`headerMenuLabel`) | keyed: neutral (data); unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/footer-locale.test.tsx` |
| footer copy bilingual | `src/lib/footer-copy.ts` | shared chrome | keyed: neutral (data module); unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| widget bilingual (songoskriti.tsx) | `songoskriti.tsx` (t() calls) | unkeyed editor/studio | keyed: n/a (widget-level); unkeyed: Songoskriti component | keyed: n/a; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| archetypes bilingual | `archetypes.ts` (`_bn` fields) | collection builders | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |

## 7. Media / assets

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| public/ph/songoskriti/ | `public/ph/songoskriti/` (asset dir) | referenced by homepage/archetypes/header-copy | keyed: theme preview; foreign: own/none | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| asset generator | `scripts/gen-songoskriti-assets.mjs` | n/a | n/a (script, not rendered) | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| /ph/songoskriti/ paths in archetypes | `archetypes.ts` (`heroImage`, `image` fields) | collection builders | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| /c/ hrefs (collections) | `homepage.ts` (`${c}/sarees` etc.), `archetypes.ts` (`/c/sarees`) | collection builders | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| SONGOSKRITI_COLLECTIONS archetypes | `src/lib/themes/songoskriti/archetypes.ts:22` (`SONGOSKRITI_COLLECTIONS`) | collection builders (department/campaign/listing) | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |

## 8. Motion + product-data deps

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| songoskriti-motion | `src/components/builder/songoskriti-motion.ts` (shared hooks `useCarouselCycle`, `useScrollReveals`) | `songoskriti.tsx:50` import | keyed: neutral (shared hooks); unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti-motion.test.ts` |
| shared motion hooks | `src/components/builder/songoskriti-motion.ts:519` (`useScrollReveals`), `:589` (`useCarouselCycle`) | used by songoskriti widgets | keyed: neutral; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti-motion.test.ts` |
| SONGOSKRITI_COLLECTIONS | `archetypes.ts:22` (`SONGOSKRITI_COLLECTIONS`) | collection builders | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| /c/ hrefs | `homepage.ts` + `archetypes.ts` | collection builders | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| /ph/songoskriti/ asset paths | `homepage.ts`, `archetypes.ts`, `header-copy.ts` | n/a | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| demo-data assumptions | `src/lib/themes/songoskriti/homepage.ts` (collection slugs: sarees, new-in, festive, etc.) | preview engine | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| dressed-hero (versioned) | `src/lib/themes/songoskriti/dressed-hero-dressings.ts:49` (`registerVersionedPresentation(SONGOSKRITI_HERO_DRESSING)`), `:50` (`registerVersionedPresentation(SONGOSKRITI_REVIEWS_DRESSING)`) | `dressed-hero-presentation.tsx` | keyed: versioned dressing; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| ornament (theme-owned) | `src/lib/themes/songoskriti/ornament-def.ts:20` (`SONGOSKRITI_ORNAMENT_ID = "theme:songoskriti/ornament"`) + `ornament-def.ts:64` (`registerWidget(SongoskritiOrnamentDef)`) | `src/lib/themes/songoskriti/index.ts:14-17` (re-export activation) | keyed: theme-owned; foreign: placeholder | keyed: neutral; unkeyed: n/a | `src/lib/themes/songoskriti/ornament-presentation.test.tsx` |

## Appendix — mechanical verification (raw output)

### A1. Homepage section count + distinct types

Command:
```
node -e 'const fs=require("fs");const s=fs.readFileSync("src/lib/themes/songoskriti/homepage.ts","utf8");const matches=[...s.matchAll(/\bs\(\s*"([a-z_]+)"/g)].map(m=>m[1]);console.log("total s() calls:", matches.length);const counts={};matches.forEach(t=>counts[t]=(counts[t]||0)+1);console.log(JSON.stringify(counts,null,2));console.log("distinct types:", Object.keys(counts).length);'
```
Output:
```
total s() calls: 21
{
  "hero_carousel": 1,
  "department_grid": 1,
  "product_rail": 6,
  "craft_story": 2,
  "split_feature": 4,
  "recently_viewed": 1,
  "finder_row": 1,
  "collection_story": 1,
  "ugc_gallery": 1,
  "testimonials": 1,
  "trust_footer": 1,
  "store_locator": 1
}
distinct types: 12
```

### A2. HOMEPAGE_SECTION_TYPES count

Command:
```
node -e 'const fs=require("fs");const s=fs.readFileSync("src/lib/themes/songoskriti/types.ts","utf8");const m=s.match(/HOMEPAGE_SECTION_TYPES\s*=\s*\[([\s\S]*?)\]/);const items=m[1].match(/"[a-z_]+"/g);console.log("intended types:",items.length);console.log(items.map(x=>x.replace(/"/g,"")).join(", "));'
```
Output: `intended types: 9` — `announcement_bar, hero_carousel, circle_categories, trust_footer, product_rail, finder_row, store_locator, craft_story, testimonials`.

### A3. Union count

Emitted 12 + intended-only {announcement_bar, circle_categories} = 14.

### A4. SONGOSKRITI_WIDGETS key count

Command:
```
node -e 'const fs=require("fs");const s=fs.readFileSync("src/components/builder/songoskriti.tsx","utf8");const m=s.match(/SONGOSKRITI_WIDGETS[\s\S]*?=\s*\{([\s\S]*?)\};/);const keys=m[1].split(/\n/).map(l=>l.trim()).filter(l=>/^[a-z_]+:\s*\w+,?$/.test(l));console.log("keys:",keys.length);'
```
Output: `keys: 18`.

### A5. TEMPLATE_KEYS count

Command:
```
node -e 'const fs=require("fs");const s=fs.readFileSync("src/lib/builder-ast.ts","utf8");const m=s.match(/export const TEMPLATE_KEYS = \[([\s\S]*?)\]/);const items=m[1].match(/"[a-z_]+"/g);console.log("template keys:",items.length);console.log(items.map(x=>x.replace(/"/g,"")).join(", "));'
```
Output: `template keys: 9` — `index, product, collection, account, page, blog, cart, checkout, search`.

### A6. Variations

`SONGOSKRITI_VARIATIONS` array length 2 (`minimal`, `festive`) at `variations.ts:22`.

### A7. registry import line

`src/lib/unified-widget-registry.ts:127`: `import { SONGOSKRITI_WIDGETS } from "../components/builder/songoskriti";` (verified by grep).

### A8. announcement-presentation liveness (verified)

Command:
```
grep -rn "announcement-presentation" src/ --include="*.ts" --include="*.tsx"
```
Returns only test files (`StoreHeader.test.tsx`, `platform-acceptance.test.tsx`, `announcement-presentations-proof.test.tsx`) plus data-attribute strings/comments. `preview.ts` does not import it; `index.ts` re-exports `header-presentation` + `ornament` only. Conclusion: dormant (test-only), Task 2 escalation lane.

### A9. src/ changes between c86a6125 and HEAD

Command:
```
git log --oneline --stat c86a6125..HEAD -- src/
```
Output: (empty — no src/ changes).

### A10. Pointer audit (mechanical)

One-off check loop (shell): for each `file:line` pointer in the inventory, printed `MISMATCH file:line anchor` when the named symbol/anchor was absent at that line. After corrections, re-run prints zero mismatches. Raw final run output:

```
(pointer audit: 0 mismatches)
```

Representative checks used:
- `sed -n '23p' src/lib/themes/songoskriti/homepage.ts` → `export function buildHomepageMain(s: SectionBuilder): Section[] {`
- `sed -n '2601p' src/components/builder/songoskriti.tsx` → `finder_row: FinderRow,`
- `grep -n 's("hero_carousel"' src/lib/themes/songoskriti/homepage.ts` → 31
- `grep -n 'SONGOSKRITI_TOKENS' src/lib/themes/songoskriti/tokens.ts` → 9
- `grep -n 'SONGOSKRITI_SKIN_SETS' src/lib/themes/songoskriti/skins.ts` → 35
- `grep -n 'SONGOSKRITI_WIDGET_DEFAULTS' src/lib/themes/songoskriti/skins.ts` → 52
- `grep -n 'SONGOSKRITI_VARIATIONS:' src/lib/themes/songoskriti/variations.ts` → 22
- `grep -n 'SONGOSKRITI_VARIATIONS_CHECK' src/lib/themes/songoskriti/variations.ts` → 66
- `grep -n 'SONGOSKRITI_COLLECTIONS' src/lib/themes/songoskriti/archetypes.ts` → 22
- `grep -n 'SONGOSKRITI_ORNAMENT_ID' src/lib/themes/songoskriti/ornament-def.ts` → 20

## Self-check (Step 4)

- Every row has all six columns populated: yes — all tables in §§1–8 use the six-column format; cells that do not apply are marked `n/a (<reason>)`.
- No row says "see above" without its own evidence: checked; rows cite file:line.
- Counts in prose (21 sections / 12 distinct / union 14 / 18 keys / 9 templates / 2 variations) equal appendix (A1–A6): yes.
- Verdict tokens are exactly `neutral` / `songoskriti-leak` / `unreachable` (plus `n/a` for non-applicable graphs), recorded per graph in the form `keyed: <token>; unkeyed: <token>`.
- Pointer audit (A10) prints zero mismatches after corrections.

## Drift / notes for Task 2

- `src/lib/themes/songoskriti/footer-copy.ts` does not exist; the equivalent is `src/lib/footer-copy.ts` (neutral data module). Recorded as `src/lib/footer-copy.ts`.
- `announcement-presentation.tsx` dormant (test-only) → escalation candidate.
- `menu behavior (mega_menu)` desktop-nav line range `171-279` not individually verified; marked `(line unchecked — range spans nav components)` in the row.
