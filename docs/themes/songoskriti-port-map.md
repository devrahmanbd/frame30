# Songoskriti port map — rows, lanes, verdicts

This is the row-by-row companion to [the theme authoring guide](./creation.md)
§14–§15: every row from the port's classification appears here exactly once,
with the lane it shipped in, the parity verdict per resolution graph, the
live/dormant status of each presentation claim, and the evidence pin a
reviewer can open.

Evidence home: `docs/superpowers/songoskriti-evidence/port/`.
[inventory.md](../superpowers/songoskriti-evidence/port/inventory.md)
(Task 1 recon) and
[classification.md](../superpowers/songoskriti-evidence/port/classification.md)
(Task 2 lanes/verdicts) are the sources for every table below. Frozen
reference stills + capture parameters:
[reference/](../superpowers/songoskriti-evidence/port/reference/) and
[reference-manifest.json](../superpowers/songoskriti-evidence/port/reference-manifest.json).
After run: [after/](../superpowers/songoskriti-evidence/port/after/).
Verdict table:
[parity-report.md](../superpowers/songoskriti-evidence/port/parity-report.md).

**Lane key.** (a) shared key reused as-is; (b) theme presentation (same key,
theme-owned markup/styling); (c) theme-owned surface (theme data, theme
assets, or a `theme:<key>/<slug>` widget).

**Verdict tokens.** `neutral` — the resolution returns the same non-branded
component/data for owner, foreign, and unknown themes; `live` — the
presentation is registered through a productive carrier; `dormant (proof)` —
deliberately not registered, with a non-use proof; `escalated` — tracked
open item, documented only this cycle.

## 1. Homepage counts (the evidence contract)

- **21 sections / 12 distinct types** emitted by `buildHomepageMain`
  (`src/lib/themes/songoskriti/homepage.ts:23`; mechanical count in
  `inventory.md` A1).
- **9 intended types** in `HOMEPAGE_SECTION_TYPES`
  (`src/lib/themes/songoskriti/types.ts:17`; A2).
- **Union 14** = the 12 emitted ∪ intended-only
  {`announcement_bar`, `circle_categories`} (A3). Only `circle_categories`
  is emitted elsewhere (`src/lib/themes/songoskriti/archetypes.ts:205,262`).
- **18 keys** in the widget pack `SONGOSKRITI_WIDGETS`
  (`src/components/builder/songoskriti.tsx:2592`, key map `:2616-2633`;
  A4).
- **9 template keys** (`src/lib/builder-ast.ts:46-60`) and **2 variations**
  (`minimal`, `festive`; `src/lib/themes/songoskriti/variations.ts:22`;
  A5–A6).

## 2. Lane (a) — 11 shared rows, neutral in every graph

These rows ship no theme override: resolution for the owner theme, a foreign
theme, and an unknown theme lands on the same shared renderer or data
module. The widget-key rows carry per-key three-graph neutrality suites; a
failure there is a misclassification signal, never something to fix by
editing `src/`.

| Row (classification id)       | Surface / key              | Verdict                                                                          | Evidence                                                                                                                                                      |
| ----------------------------- | -------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HP-HERO-CAROUSEL              | `hero_carousel`            | neutral — keyed (owner + somvabona + unknown) and unkeyed resolve one component  | `src/lib/themes/songoskriti/hero-carousel-neutrality.test.ts`; renderer `src/components/builder/heritage.tsx:1404` into `GENERIC_WIDGETS` (`widgets.tsx:1106`) |
| HP-RECENTLY-VIEWED            | `recently_viewed`          | neutral — three-graph identity                                                    | `src/lib/themes/songoskriti/recently-viewed-neutrality.test.ts`; base `src/components/builder/widgets.tsx:1608`                                               |
| HP-CIRCLE-CATEGORIES          | `circle_categories`        | neutral — three-graph identity                                                    | `src/lib/themes/songoskriti/circle-categories-neutrality.test.ts`; generic collection renderer                                                               |
| CHR-HEADER-FALLBACK           | header fallback tree       | neutral — data module, no theme import                                            | `src/lib/header-copy.ts`; `src/components/store/theme-chrome.ts` (`theme-chrome.test.ts`)                                                                     |
| CHR-HEADER-ANNOUNCEMENT       | header announcement        | neutral — data module                                                             | `src/lib/header-copy.ts:247`                                                                                                                                  |
| CHR-HEADER-LOGO               | header logo lockup         | neutral — data module                                                             | `src/lib/header-copy.ts:241`                                                                                                                                  |
| CHR-FOOTER-COPY               | footer copy constants      | neutral — data module                                                             | `src/lib/footer-copy.ts:16,24,37,40`                                                                                                                          |
| COPY-HEADER-MENU              | header menu bilingual      | neutral — data module                                                             | `src/lib/header-copy.ts:185,233`                                                                                                                              |
| COPY-FOOTER                   | footer copy bilingual      | neutral — data module                                                             | `src/lib/footer-copy.ts`; `src/lib/themes/songoskriti/footer-copy-neutrality.test.ts`                                                                         |
| MOT-MOTION                    | motion primitives          | neutral — shared hooks, no brand prefix                                           | `src/components/builder/songoskriti-motion.ts`                                                                                                                |
| MOT-HOOKS                     | motion hooks               | neutral — shared hooks                                                            | `src/components/builder/songoskriti-motion.ts:519,589`; `songoskriti-motion.test.ts`                                                                          |

## 3. Lane (b) — 22 presentation rows

Same key, theme-owned markup. A claim is live when a productive carrier
registers it for `songoskriti × key`; foreign themes keep resolving the
shared renderer (never another theme's brand). Carriers:

- Storefront: `src/lib/themes/songoskriti/preview.ts:37`
  (`registerSongoskritiPresentationClaims(SONGOSKRITI_WIDGETS)`, reached via
  `src/lib/preview-sources.ts`).
- Editor: `src/components/builder/songoskriti.tsx:2642` — a lazy hop into
  `src/lib/themes/songoskriti/claims-activation.ts`, which receives the
  already-evaluated pack (no TDZ; see creation.md §14.2).

The registrar is idempotent (skips already-claimed pairs), so both carriers
coexist and never evict the `mega_menu` claim. The claims list is exactly
the 13 theme-fixable keys (`src/lib/themes/songoskriti/presentation-claims.ts`),
pinned by `presentation-claims-activation.test.ts` (storefront graph, editor
graph, completeness, idempotence) and `claims-activation.test.ts`.

| Row (classification id) | Key                | Status                                                                                                        | Evidence / proof pointer                                                                                                            |
| ----------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| HP-DEPARTMENT-GRID      | `department_grid`  | live — claimed this cycle                                                                                     | claims registrar + activation tests above; carrier pins above                                                                       |
| HP-PRODUCT-RAIL         | `product_rail`     | live — claimed this cycle                                                                                     | same                                                                                                                                |
| HP-CRAFT-STORY          | `craft_story`      | escalated (core-required; no generic fallback — stays global, no removal; tracked core item, docs-only here)  | classification.md §Escalations                                                                                                      |
| HP-SPLIT-FEATURE        | `split_feature`    | live — claimed this cycle                                                                                     | same as HP-DEPARTMENT-GRID                                                                                                          |
| HP-FINDER-ROW           | `finder_row`       | escalated (core-required; same posture as `craft_story`)                                                      | classification.md §Escalations                                                                                                      |
| HP-COLLECTION-STORY     | `collection_story` | live — claimed this cycle                                                                                     | same                                                                                                                                |
| HP-UGC-GALLERY          | `ugc_gallery`      | live — claimed this cycle                                                                                     | same                                                                                                                                |
| HP-TESTIMONIALS         | `testimonials`     | escalated (core-required)                                                                                     | classification.md §Escalations                                                                                                      |
| HP-TRUST-FOOTER         | `trust_footer`     | escalated (core-required)                                                                                     | classification.md §Escalations                                                                                                      |
| HP-STORE-LOCATOR        | `store_locator`    | live — claimed this cycle                                                                                     | same                                                                                                                                |
| HP-ANNOUNCEMENT-BAR     | `announcement_bar` | dormant (proof) — module is test-only; no productive importer                                                | `src/lib/themes/songoskriti/announcement-presentation.tsx:108`; A8 grep; `dormant-presentation-claims.test.ts`                       |
| RK-PRODUCT-GRID         | `product_grid`     | live — claimed this cycle; studio delegation bypass open (`src/components/builder/studio/renderers.tsx:1502-1531`) | activation tests; classification.md §Escalations                                                                               |
| RK-RICH-TEXT            | `rich_text`        | live — claimed this cycle                                                                                     | same as HP-DEPARTMENT-GRID                                                                                                          |
| RK-NEWSLETTER           | `newsletter`       | live — claimed this cycle                                                                                     | same                                                                                                                                |
| RK-FOOTER-SITEMAP       | `footer_sitemap`   | live — claimed this cycle; the `footer-proof` variant stays dormant with proof                                | `src/lib/themes/songoskriti/footer-proof-presentation.tsx:217`; `footer-presentations-proof.test.tsx`; `dormant-presentation-claims.test.ts` |
| RK-PAYMENT-ICONS        | `payment_icons`    | live — claimed this cycle                                                                                     | same as HP-DEPARTMENT-GRID                                                                                                          |
| RK-MEGA-MENU            | `mega_menu`        | live — already live before this cycle (not re-claimed; first-wins guard keeps it)                             | `src/lib/themes/songoskriti/header-presentation.tsx:776`; carried by `preview.ts:16`                                                |
| RK-CATEGORY-HEADER      | `category_header`  | live — claimed this cycle                                                                                     | same as HP-DEPARTMENT-GRID                                                                                                          |
| RK-RESULT-TOOLBAR       | `result_toolbar`   | live — claimed this cycle                                                                                     | same                                                                                                                                |
| COPY-WIDGET-BILINGUAL   | widget `_bn` twins | rides the (b) components; identity assertion ties each claim to the pack component                            | `presentation-claims-activation.test.ts`; `src/components/builder/songoskriti.tsx` inline `t()` calls                               |
| VER-DRESSED-HERO        | dressed-hero       | dormant (proof) — versioned dressing, no productive importer outside tests                                    | `src/lib/themes/songoskriti/dressed-hero-dressings.ts:49-50`; `dormant-presentation-claims.test.ts`                                 |
| VER-DRESSED-REVIEWS     | dressed-reviews    | dormant (proof) — versioned dressing for `plugin:acme/reviews`                                                | `src/lib/themes/songoskriti/dressed-hero-dressings.ts:50`; same proof suite                                                         |

Live count check: 13 claimed keys + `mega_menu` already live = 14 live
claims; 4 escalated keys; 3 dormant rows + the `footer-proof` variant;
`COPY-WIDGET-BILINGUAL` rides the live components. Classification rows:
11 homepage + 8 renderer + 1 bilingual + 2 versioned = 22.

### Tray and universal-body notes

- The studio extension tray lists registered defs under **every** active
  theme (`resolveExtensionTrayEntries`,
  `src/components/builder/studio/StudioBuilder.tsx:836`) — widget defs are
  universal (creation.md §14.1).
- The legacy per-theme claim seam (`themeTrayEntries`,
  `src/lib/widget-presentation.ts:856`) still powers older
  platform-discovery surfaces; it does not decide renderability.
- Universal bodies: resolution walks owner → generic presentation →
  recoverable fallback (`resolvePresentation`,
  `src/lib/widget-presentation.ts:585`); `registerGenericPresentation`
  (`src/lib/theme-presentations.ts:1006`) registers the neutral body.
  "Widget preview unavailable" is retired for registered components.

## 4. Lane (c) — 26 theme-owned rows

No shared-key question: these surfaces are the theme's own data, assets, and
one registry widget.

| Row (classification id) | Surface                       | What ships / carrier today                                                                                                                          |
| ----------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| TPL-INDEX               | index template                | preview case `src/lib/themes/songoskriti/preview.ts:91`                                                                                             |
| TPL-PRODUCT             | product template              | `preview.ts:149`                                                                                                                                    |
| TPL-COLLECTION          | collection template           | `preview.ts:93`                                                                                                                                     |
| TPL-ACCOUNT             | account template              | `preview.ts:318`                                                                                                                                    |
| TPL-PAGE                | page template                 | `preview.ts:207`                                                                                                                                    |
| TPL-BLOG                | blog template                 | `preview.ts:218`                                                                                                                                    |
| TPL-SEARCH              | search template               | `preview.ts:235`                                                                                                                                    |
| TPL-CART                | cart template                 | `preview.ts:253`                                                                                                                                    |
| TPL-CHECKOUT            | checkout template             | `preview.ts:283`                                                                                                                                    |
| TPL-VARIATIONS          | minimal / festive variations  | `src/lib/themes/songoskriti/variations.ts:22,66`                                                                                                    |
| HP-COMPOSITION          | homepage composition          | `src/lib/themes/songoskriti/homepage.ts:23` (21 sections; §1 above)                                                                                 |
| CHR-HEADER-BUILDER      | header builder                | `src/lib/themes/songoskriti/header.ts:17`                                                                                                           |
| CHR-FOOTER-BUILDER      | footer builder                | `src/lib/themes/songoskriti/footer.ts:202`                                                                                                          |
| TOK-TOKENS              | tokens                        | `src/lib/themes/songoskriti/tokens.ts:9`                                                                                                            |
| TOK-SKINS               | widget defaults               | `src/lib/themes/songoskriti/skins.ts:52`                                                                                                            |
| TOK-SKINS-CSS           | `skins.css`                   | imported at `src/lib/themes/songoskriti/skins.ts:28`                                                                                                |
| TOK-SKIN-SETS           | closed skin sets              | `src/lib/themes/songoskriti/skins.ts:35`                                                                                                            |
| COPY-HP                 | homepage bilingual            | `src/lib/themes/songoskriti/homepage.ts`, `_bn` twins on every section                                                                              |
| COPY-ARCHETYPES         | archetypes bilingual          | `src/lib/themes/songoskriti/archetypes.ts` `_bn` fields                                                                                             |
| MED-PUBLIC-DIR          | theme asset directory         | `public/ph/songoskriti/`                                                                                                                            |
| MED-ASSET-GEN           | asset generator script        | `scripts/gen-songoskriti-assets.mjs`                                                                                                                |
| MED-PH-PATHS            | `/ph/songoskriti/…` refs      | `homepage.ts`, `archetypes.ts`, `src/lib/header-copy.ts`                                                                                            |
| MED-C-HREFS             | `/c/…` collection hrefs       | `homepage.ts`, `archetypes.ts`                                                                                                                      |
| MED-COLLECTIONS         | collection archetypes         | `src/lib/themes/songoskriti/archetypes.ts:22`                                                                                                       |
| MOT-DEMO-DATA          | demo-data slugs               | `src/lib/themes/songoskriti/homepage.ts` (`sarees`, `new-in`, `festive`, …)                                                                         |
| THM-ORNAMENT            | `theme:songoskriti/ornament`  | def `src/lib/themes/songoskriti/ornament-def.ts:40,91`; owner dress `ornament-presentation.tsx`; universal body `ornament-generic-presentation.tsx` |

Ornament activation (the (c) widget's productive path): both carriers
side-effect-import the presentation modules — editor
(`src/components/builder/songoskriti.tsx:86`) and storefront
(`preview.ts:27`) — and the def self-claims lazily through a guarded dynamic
import (registry-import-free at runtime; creation.md §14.2). Proof suites:
`ornament-def.test.ts`, `ornament-reachability.test.ts`,
`ornament-recovery.test.ts`, `ornament-presentation.test.tsx`.

## 5. Parity evidence

- **Frozen reference** at `9e680632` (`9e6806329d47`), recorded in
  `reference-manifest.json`; stills under `reference/`. Freeze fixtures:
  `src/components/builder/songoskriti-port-freeze.test.tsx`.
- **After run** at `b3258d8c`
  (`b3258d8c6be9bebd4e5f156485c8affaf630ca88`): **60 passed / 1 skipped /
  0 failed** (61 tests, 8.3 min, exit 0) — all 54 template stills (9
  templates × 1440/768/375 × en/bn), 2 mega-menu + 2 variation stills and
  the drawer-en still within the frozen thresholds
  (`maxDiffPixelRatio: 0.02`, `threshold: 0.2`); stills under `after/`.
- **The single skip** is the recorded manual-review surface
  `chrome-mobile-drawer-375-bn.png` (no baseline at freeze; investigation
  verdict: capture-time hydrate/click flake, not an app defect — parity
  report §7, with the banked follow-up).
- **Browser journey** (post-universal-model):
  `.e2e/songoskriti-editor-journey.spec.ts`; run evidence under
  `docs/superpowers/songoskriti-evidence/port/e2e/` (`run-red.txt`,
  `run-green-1.txt`, `run-green-2.txt`, `error-context-red.md`,
  `failure-tray.png`, `trace-red.zip`).

## 6. Open items (documented, not closed by this port)

1. **Four shared keys without a universal body yet** — `finder_row`,
   `craft_story`, `testimonials`, `trust_footer`. They carry no generic
   fallback in any shared map, so removal would delete the catalogue key
   (classification.md §Escalations); per the universal model ruling they
   stay global and their branded look is dress, not body. Tracked core
   item; docs-only here.
2. **`product_grid` studio delegation bypass** —
   `src/components/builder/studio/renderers.tsx:1502-1531`: `:1522`
   resolves `WIDGET_COMPONENTS.product_grid` directly and bypasses
   `resolveThemePresentation`, so the themed grid cannot go live in the
   studio without a core edit (prohibited scope for the port cycle;
   classification.md §Escalations).
3. **Drawer bn re-baseline** — hydrate-robust `openMobileDrawer` + fresh bn
   still, after an approved fix round (parity report §7).
