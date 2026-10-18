# Songoskriti Unified Port — Inventory (Task 1)

**Branch:** `frame30` · **Scope:** read-only recon. **Capture commit:** `72e8c54e` (task-1 inventory commit). All commits between `c86a6125` and HEAD are docs-only; check: `git log --oneline --stat c86a6125..HEAD -- src/` returns no `src/` changes (raw output: empty).

Evidence home: `docs/superpowers/songoskriti-evidence/port/`.

Row format (all axes): `surface | definition site (file:line, symbol) | editor visibility evidence (authorized-registry resolve / tray / schema; file:line) | renderer + winning source map for a non-songoskriti theme, per graph (keyed storefront; unkeyed editor/studio) | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line)`.

## 1. Templates

Songoskriti dresses **all 9** `TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-57`): `index, product, collection, account, page, blog, cart, checkout, search`. Preview source `src/lib/themes/songoskriti/preview.ts:80-330` (`songoskritiPreviewSource`, switch over templates). Zones per `TEMPLATE_ZONES` (`src/lib/builder-ast.ts:118-170`).

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map (non-songoskriti) | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| index template | `src/lib/themes/songoskriti/preview.ts:88` (`case "index": return buildHomepageMain(s)`) | `src/lib/themes/songoskriti/preview.ts` (productive entry via `builtin-themes.ts:12`); registry `buildEditorExtensionRegistry` n/a (template not widget) | keyed: theme preview source; unkeyed: n/a (no editor template surface) | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti-snapshots.test.tsx` |
| collection template | `src/lib/themes/songoskriti/preview.ts:90-120` (`case "collection"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti.test.tsx` |
| product template | `src/lib/themes/songoskriti/preview.ts:121-165` (`case "product"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti.test.tsx` |
| page template | `src/lib/themes/songoskriti/preview.ts:166-176` (`case "page"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| blog template | `src/lib/themes/songoskriti/preview.ts:177-190` (`case "blog"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| search template | `src/lib/themes/songoskriti/preview.ts:191-205` (`case "search"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| cart template | `src/lib/themes/songoskriti/preview.ts:206-225` (`case "cart"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| checkout template | `src/lib/themes/songoskriti/preview.ts:226-250` (`case "checkout"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| account template | `src/lib/themes/songoskriti/preview.ts:251-256` (`case "account"`) | same | keyed: preview source; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| variations (minimal, festive) | `src/lib/themes/songoskriti/variations.ts:16-48` (`SONGOSKRITI_VARIATIONS`) | `src/lib/themes/songoskriti/variations.ts:50` (`SONGOSKRITI_VARIATIONS_CHECK`) | keyed: `songoskritiTokensFor`; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/lib/themes/songoskriti/variations.test.ts` |

## 2. Homepage

`buildHomepageMain(s)` in `src/lib/themes/songoskriti/homepage.ts:17` emits **21 sections / 12 distinct types** (verified via node count, appendix). `HOMEPAGE_SECTION_TYPES` in `src/lib/themes/songoskriti/types.ts:17-26` lists 9 intended types. `announcement_bar` and `circle_categories` never emitted by the homepage builder; `circle_categories` does appear in `src/lib/themes/songoskriti/archetypes.ts:205,262` (collection builders). Union = 14 types.

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| homepage composition (21 sections) | `src/lib/themes/songoskriti/homepage.ts:17` (`buildHomepageMain`) | `src/lib/themes/songoskriti/preview.ts:88` (`case "index"`) | keyed: theme preview; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti-snapshots.test.tsx` |
| hero_carousel | `homepage.ts:23` | n/a (homepage builder) | keyed: `SONGOSKRITI_WIDGETS.hero_carousel` (in `songoskriti.tsx`); unkeyed: `WIDGET_COMPONENTS.hero_carousel` | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| department_grid | `homepage.ts:58` | n/a | keyed: `SONGOSKRITI_WIDGETS.department_grid`; unkeyed: `WIDGET_COMPONENTS.department_grid` | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/theme-locale-sinks.test.tsx` |
| product_rail ×6 | `homepage.ts:83,108,133,206,231,261` | n/a | keyed: `SONGOSKRITI_WIDGETS.product_rail` vs generic merch rail; unkeyed: `WIDGET_COMPONENTS.product_rail` | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/demo-widget-proof.test.tsx` |
| craft_story ×2 | `homepage.ts:96,278` | n/a | keyed: `SONGOSKRITI_WIDGETS.craft_story` (no generic) → undefined; unkeyed: `WIDGET_COMPONENTS.craft_story` | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| split_feature ×4 | `homepage.ts:120,186,218,296` | n/a | keyed: `SONGOSKRITI_WIDGETS.split_feature` vs generic apparel; unkeyed: `WIDGET_COMPONENTS.split_feature` | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| recently_viewed | `homepage.ts:150` | n/a | keyed: base widgets.tsx:1608; unkeyed: `WIDGET_COMPONENTS.recently_viewed` | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| finder_row | `homepage.ts:162` | n/a | keyed: `SONGOSKRITI_WIDGETS.finder_row` (no generic) → undefined; unkeyed: `WIDGET_COMPONENTS.finder_row` | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx:682` |
| collection_story | `homepage.ts:246` | n/a | keyed: `SONGOSKRITI_WIDGETS.collection_story` vs generic apparel; unkeyed: `WIDGET_COMPONENTS.collection_story` | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| ugc_gallery | `homepage.ts:290` | n/a | keyed: `SONGOSKRITI_WIDGETS.ugc_gallery` vs generic apparel; unkeyed: `WIDGET_COMPONENTS.ugc_gallery` | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti-snapshots.test.tsx` |
| testimonials | `homepage.ts:308` | n/a | keyed: `SONGOSKRITI_WIDGETS.testimonials` (no generic) → undefined; unkeyed: `WIDGET_COMPONENTS.testimonials` | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| trust_footer | `homepage.ts:336` | n/a | keyed: `SONGOSKRITI_WIDGETS.trust_footer` (no generic) → undefined; unkeyed: `WIDGET_COMPONENTS.trust_footer` | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| store_locator | `homepage.ts:365` | n/a | keyed: `SONGOSKRITI_WIDGETS.store_locator` vs generic apparel; unkeyed: `WIDGET_COMPONENTS.store_locator` | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti-snapshots.test.tsx` |

## 3. Renderer neutrality (SONGOSKRITI_WIDGETS, 18 keys)

Key set from `src/components/builder/songoskriti.tsx:2577-2600` (18 keys). Registry import `src/lib/unified-widget-registry.ts:127`. Keyed storefront resolution: `src/components/builder/theme-widgets.ts:73-78` (`resolveWidgetComponent(themeKey, type)` = `THEME_WIDGETS[themeKey]?.()[type] ?? GENERIC_WIDGETS[type]`). Unkeyed editor/studio: `resolveWidgetComponent(null, …)` → `WIDGET_COMPONENTS` in `src/components/builder/widgets.tsx:1666-1668` (spreads `...SONGOSKRITI_WIDGETS` last → songoskriti wins all 18). Studio delegation: `src/components/builder/studio/renderers.tsx:1457-1477` (delegates `product_grid` to `WIDGET_COMPONENTS.product_grid`).

Generic-map membership (keyed foreign theme, e.g. somvabona): a key is neutral if it exists in `GENERIC_WIDGETS` (base = chrome/merch/pdp/collection/cart/account/apparel/heritage/somvabona + basic/blog/circuit/beauty/beauty-home). finder_row, craft_story, testimonials, trust_footer are NOT in any generic map → unreachable for foreign theme.

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| finder_row | `src/components/builder/songoskriti.tsx:2577` (SONGOSKRITI_WIDGETS) | `src/lib/unified-widget-registry.ts:127` import | keyed: `THEME_WIDGETS[foreign]?.()[finder_row]` = undefined (no generic); unkeyed: `WIDGET_COMPONENTS.finder_row` = Songoskriti | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx:682` |
| craft_story | `src/components/builder/songoskriti.tsx:2578` | same | keyed: undefined (no generic); unkeyed: Songoskriti | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| testimonials | `src/components/builder/songoskriti.tsx:2579` | same | keyed: undefined (no generic); unkeyed: Songoskriti | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| trust_footer | `src/components/builder/songoskriti.tsx:2580` | same | keyed: undefined (no generic); unkeyed: Songoskriti | keyed: unreachable; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx` |
| product_rail | `src/components/builder/songoskriti.tsx:2581` | same | keyed: generic merch rail (neutral); unkeyed: Songoskriti rail | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/demo-widget-proof.test.tsx` |
| product_grid | `src/components/builder/songoskriti.tsx:2582` | same + studio delegation (renderers.tsx:1457) | keyed: generic grid; unkeyed: Songoskriti grid | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| rich_text | `src/components/builder/songoskriti.tsx:2583` | same | keyed: generic (base); unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| newsletter | `src/components/builder/songoskriti.tsx:2584` | same | keyed: generic (base); unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| footer_sitemap | `src/components/builder/songoskriti.tsx:2585` | same | keyed: generic chrome; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/footer-locale.test.tsx` |
| payment_icons | `src/components/builder/songoskriti.tsx:2586` | same | keyed: generic chrome; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| department_grid | `src/components/builder/songoskriti.tsx:2587` | same | keyed: generic heritage; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/theme-locale-sinks.test.tsx` |
| mega_menu | `src/components/builder/songoskriti.tsx:2588` | same | keyed: generic chrome; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx:393` |
| store_locator | `src/components/builder/songoskriti.tsx:2589` | same | keyed: generic apparel; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti-snapshots.test.tsx` |
| split_feature | `src/components/builder/songoskriti.tsx:2590` | same | keyed: generic apparel; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| collection_story | `src/components/builder/songoskriti.tsx:2591` | same | keyed: generic apparel; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| ugc_gallery | `src/components/builder/songoskriti.tsx:2592` | same | keyed: generic apparel; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti-snapshots.test.tsx` |
| category_header | `src/components/builder/songoskriti.tsx:2593` | same | keyed: generic collection; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| result_toolbar | `src/components/builder/songoskriti.tsx:2594` | same | keyed: generic collection; unkeyed: Songoskriti | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |

## 4. Global chrome

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| header builder | `src/lib/themes/songoskriti/header.ts:17` (`buildHeaderMain`) | `preview.ts` header (template !== checkout) | keyed: theme preview; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| header presentation (mega_menu) | `src/lib/themes/songoskriti/header-presentation.tsx:776` (`registerThemePresentation("songoskriti","mega_menu",...)`) | `src/lib/unified-widget-registry.ts:127` import chain; `src/lib/themes/songoskriti/index.ts:7-12` (re-export activation) | keyed: theme presentation; foreign: generic mega_menu | keyed: neutral; unkeyed: songoskriti-leak | `src/components/builder/songoskriti.test.tsx:393` |
| header fallback (mega-menu tree) | `src/lib/header-copy.ts` (neutral data module); `src/lib/themes/songoskriti/header-fallback.ts` (compat re-export) | `src/components/store/theme-chrome.ts` (key-driven lookup via `DEFAULT_HEADER_CHROME_KEY`) | keyed: neutral (data, no theme import); unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/store/theme-chrome.test.ts` |
| header announcement | `src/lib/header-copy.ts` (`HEADER_ANNOUNCEMENT`) | same | keyed: neutral; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| header logo lockup | `src/lib/header-copy.ts` (`HEADER_LOGO`) | same | keyed: neutral; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| footer builder | `src/lib/themes/songoskriti/footer.ts:202` (`buildFooterMain`) | `preview.ts` footer (template !== checkout) | keyed: theme preview; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| footer proof presentation (footer_sitemap) | `src/lib/themes/songoskriti/footer-proof-presentation.tsx:217` (`registerThemePresentation("songoskriti","footer_sitemap",...)`) | registry import chain | keyed: theme; foreign: generic | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |
| footer copy constants | `src/lib/footer-copy.ts` (`STATEMENT`, `NEWSLETTER`, `PAYMENT_MARKS`, `COLOPHON`) | shared chrome | keyed: neutral (data module); unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| announcement presentation | `src/lib/themes/songoskriti/announcement-presentation.tsx:108` (`registerThemePresentation("songoskriti","announcement_bar",...)`) | **verified dormant**: `grep -rn "announcement-presentation" src/ --include="*.ts" --include="*.tsx"` returns only test files (`StoreHeader.test.tsx`, `platform-acceptance.test.tsx`, `announcement-presentations-proof.test.tsx`) plus data-attribute strings/comments; `preview.ts` does not import it; `index.ts` re-exports `header-presentation` + `ornament` only. | keyed: theme (if activated); foreign: generic | keyed: neutral (if activated); unkeyed: n/a | n/a (no dedicated test) |
| menu behavior (mega_menu) | `src/lib/themes/songoskriti/header-presentation.tsx:171-279` (`SongoskritiDesktopNav`, `SongoskritiMobileDrawer`) | mega_menu presentation | keyed: theme; foreign: generic | keyed: neutral; unkeyed: songoskriti-leak | n/a (no dedicated test) |

Conclusion for announcement: test-only → dormant, Task 2 escalation lane.

## 5. Tokens / skins

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| tokens | `src/lib/themes/songoskriti/tokens.ts:12` (`SONGOSKRITI_TOKENS`) | `preview.ts:64` (`tokens: songoskritiTokensFor(variationKey)`) | keyed: theme tokens; foreign: own tokens | keyed: neutral; unkeyed: n/a | `src/lib/themes/songoskriti/skins.test.ts` |
| skins (widget defaults) | `src/lib/themes/songoskriti/skins.ts:42` (`SONGOSKRITI_WIDGET_DEFAULTS`) | `skins.ts:63` (`withSongoskritiDefaults`) | keyed: theme skin defaults; foreign: own | keyed: neutral; unkeyed: n/a | `src/lib/themes/songoskriti/skins.test.ts` |
| skins.css | `src/lib/themes/songoskriti/skins.css` (imported in skins.ts:14) | `skins.ts:14` (`import "./skins.css"`) | keyed: css-only; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| skin sets | `src/lib/themes/songoskriti/skins.ts:21` (`SONGOSKRITI_SKIN_SETS`: product_rail, hero_carousel, testimonials, product_grid) | `skins.ts:32` (`resolveSongoskritiSkin`) | keyed: theme; foreign: generic skin | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| variations (minimal, festive) | `src/lib/themes/songoskriti/variations.ts:16` (`SONGOSKRITI_VARIATIONS`) | `variations.ts:50` (`SONGOSKRITI_VARIATIONS_CHECK`) | keyed: variation tokens; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/lib/themes/songoskriti/variations.test.ts` |

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
| header menu bilingual | `src/lib/header-copy.ts` (`HEADER_MENU_BN`) | `header-copy.ts:headerMenuLabel` | keyed: neutral (data); unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/footer-locale.test.tsx` |
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
| SONGOSKRITI_COLLECTIONS archetypes | `src/lib/themes/songoskriti/archetypes.ts:16` (`SONGOSKRITI_COLLECTIONS`) | collection builders (department/campaign/listing) | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |

## 8. Motion + product-data deps

| surface | definition site (file:line, symbol) | editor visibility evidence | renderer + winning source map per graph | neutrality verdict per graph | parity coverage (existing test/snapshot; file:line) |
|---|---|---|---|---|---|
| songoskriti-motion | `src/components/builder/songoskriti-motion.ts` (shared hooks `useCarouselCycle`, `useScrollReveals`) | `songoskriti.tsx:50` import | keyed: neutral (shared hooks); unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti-motion.test.ts` |
| shared motion hooks | `src/components/builder/songoskriti-motion.ts` exports | used by songoskriti widgets | keyed: neutral; unkeyed: n/a | keyed: neutral; unkeyed: n/a | `src/components/builder/songoskriti-motion.test.ts` |
| SONGOSKRITI_COLLECTIONS | `archetypes.ts:16` (`SONGOSKRITI_COLLECTIONS`) | collection builders | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| /c/ hrefs | `homepage.ts` + `archetypes.ts` | collection builders | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| /ph/songoskriti/ asset paths | `homepage.ts`, `archetypes.ts`, `header-copy.ts` | n/a | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| demo-data assumptions | `src/lib/themes/songoskriti/homepage.ts` (collection slugs: sarees, new-in, festive, etc.) | preview engine | keyed: theme; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| dressed-hero (versioned) | `src/lib/themes/songoskriti/dressed-hero-dressings.ts:49-50` (`registerVersionedPresentation`) | `dressed-hero-presentation.tsx` | keyed: versioned dressing; unkeyed: n/a | keyed: neutral; unkeyed: n/a | n/a (no dedicated test) |
| ornament (theme-owned) | `src/lib/themes/songoskriti/ornament-def.ts:19` (`SONGOSKRITI_ORNAMENT_ID = "theme:songoskriti/ornament"`) + `registerWidget` at line 65 | `src/lib/themes/songoskriti/index.ts:13-18` (re-export activation) | keyed: theme-owned; foreign: placeholder | keyed: neutral; unkeyed: n/a | `src/lib/themes/songoskriti/ornament-presentation.test.tsx` |

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

`SONGOSKRITI_VARIATIONS` array length 2 (`minimal`, `festive`) at `variations.ts:16`.

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

## Self-check (Step 4)

- Every row has all six columns populated: yes — all tables in §§1–8 use the six-column format; cells that do not apply are marked `n/a (<reason>)` (e.g. template rows unkeyed editor surface, homepage builder rows).
- No row says "see above" without its own evidence: checked; rows cite file:line.
- Counts in prose (21 sections / 12 distinct / union 14 / 18 keys / 9 templates / 2 variations) equal appendix (A1–A6): yes.
- Verdict tokens are exactly `neutral` / `songoskriti-leak` / `unreachable` (plus `n/a` for non-applicable graphs), recorded per graph in the form `keyed: <token>; unkeyed: <token>`.
- Previously UNVERIFIED items resolved: studio `product_grid` delegation verified at `studio/renderers.tsx:1457-1477`; announcement-presentation liveness verified dormant (A8); recently_viewed generic-map membership verified (base widgets.tsx:1608).

## Drift / notes for Task 2

- `src/lib/themes/songoskriti/footer-copy.ts` does not exist; the equivalent is `src/lib/footer-copy.ts` (neutral data module). Recorded as `src/lib/footer-copy.ts`.
- `announcement-presentation.tsx` dormant (test-only) → escalation candidate.