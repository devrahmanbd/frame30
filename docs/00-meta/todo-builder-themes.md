# TODO — Page builder & the four blueprint themes

Scope: `src/lib/builder-ast.ts` (AST v3 + catalog), `src/components/builder/*`
(renderers), `src/lib/theme-blueprints.ts` (Bazaar / Atelier / Circuit / Rupaboti),
measured against `docs/04-builder/theme-plan-{marketplace,apparel,electronics,beauty}.md`.

Legend: `[ ]` open · `[!]` blocking gate · numbers are measured, not estimated.

---

## 0. Where we actually are

Better than the plans assume. The bricks are done; the **themes** are not shipped.

| Layer | State |
| --- | --- |
| Widget registry | 117 `SectionType` keys, all with renderers. `WIDGET_COMPONENTS` is `Record<SectionType, WidgetComponent>`, so a missing renderer is a type error — "declared but unimplemented" is structurally impossible. |
| AST v3 | Nesting (`children`), depth cap 6, 300-node cap, `container: true`, slot legality, lint — done (`builder-ast.ts:181-208`). |
| Responsive + style panel | `bp` map (sm/md/lg), `hidden[]`, universal `padY/padX/bg/radius/border/shadow/maxW/align` as token-only style props — done. |
| Data contract | One batched `resolveWidgetData` per template render, tenant-scoped, widgets never fetch — done (`widget-data.server.ts:593`, `storefront.server.ts:86`). |
| Editor UX | Layer tree, drag/drop, multi-select, undo/redo history, saved blocks + export/import — done (`use-builder-editor.ts:89-101`, `saved-blocks.ts`). |
| Demo import | `theme_import_demo` RPC wired (`themes.server.ts:775`). |
| Themes | All four blueprints authored with all 7 templates — but only **Atelier** ships (`SHIPPED_BLUEPRINT_KEYS = ["atelier"]`). |

**The single biggest gap is বাংলা coverage, which is what gates shipping:**

| Blueprint | Bilingual props filled | Coverage | Ships? |
| --- | --- | --- | --- |
| atelier | 195 / 195 | 100% | yes |
| bazaar | 91 / 268 | 34.0% | no |
| rupaboti | 86 / 311 | 27.7% | no |
| circuit | 69 / 293 | 23.5% | no |

Gate is ≥90%. Three flagship themes are invisible to merchants purely for translation debt.

---

## 1. Ship the three withheld blueprints (highest value, lowest risk)

- [!] Fill `BLUEPRINT_BN` for Bazaar (177 strings), Circuit (224), Rupaboti (225). These are authored EN strings that already exist — no design work.
- [ ] Add a coverage assertion per blueprint in `theme-presets.test.ts` (fail < 90%), so the number can't silently regress.
- [ ] Expand `SHIPPED_BLUEPRINT_KEYS` to all four; update the `THEME_PRESETS` length assertion (currently 11) and the catalogue in `docs/04-builder/themes-catalog.md`.
- [ ] Per-theme token sets are declared but not contrast-verified: run `contrastRatio()` over every ink/surface/accent pair, light **and** dark, and record the numbers in the preset test.
- [ ] Designed dark sets: confirm each blueprint declares `dark: { brand, accent, surface, ink }` rather than relying on inversion.

## 2. Bilingual system maturity (Circuit §1 is the platform contract) — done

- [x] `--fq-bn-scale: 1.06` + line-height 1.7 applied via `:lang(bn)`, with `overflow: visible` on heading boxes (`styles.css`, asserted in `phase2-bilingual.test.ts`).
- [x] No all-caps under `:lang(bn)`: storefront copy uses the `fq-caps` utility, which self-disables in a `bn` subtree. Raw `uppercase` in a storefront widget file fails a lint test.
- [x] Length elasticity: no fixed-width tappables inside a `bn` subtree (`width: auto; max-width: 100%; white-space: normal`), asserted in test. Visual 320/768/1280 sweep still worth a manual pass.
- [x] Mixed-script safety: `segmentMixedScript` + `<Bi>` wrap SKUs, model numbers and units in `<span dir="ltr" lang="en">` (isolated via `unicode-bidi: isolate`).
- [x] Numerals: `--fq-digits` theme token emitted by `tokensToCss`; `tabular-nums` + `tnum` survive the Bangla stack for `.money`, `[data-numeric]` and `tabular-nums`.
- [x] Missing-translation fail-safe: `resolveBiTextTagged` renders English with `lang="en"` (flagged `data-bn-fallback`), never an empty node.

## 3. Typography subsystem — done

- [x] `FONT_PRELOAD` is derived, not hardcoded: `fontPreload()`/`fontHeadLinks()` build the sheet from the active pairing with `preconnect` to both Google origins and `display=swap` (`theme-fonts.ts`, wired into `store.$slug.index.tsx`).
- [x] Editorial pairings added (`editorial-serif`, `editorial-bangla`, `editorial-mix`) alongside the existing 4 + `custom`.
- [x] Font resolver test: every pairing × locale resolves to a face covering that script; a Latin-only body face on `bn` appends a Bengali-capable family (`phase3-fonts.test.ts`).
- [x] Metric-matched fallback `@font-face` for every catalogue family, asserted against `styles.css`.
- [x] Budget enforcement: ≤ 4 weights per family, ≤ 2 families per theme, `latin` + `bengali` subsets only — checked at publish.
- [x] Custom fonts: `theme-fonts` bucket at `{merchantId}/{family}/{weight}.woff2`, server-side woff2 magic-byte validation, ≤ 400KB × ≤ 4 files, upload UI in the token panel (`CustomFontsPanel`).
- [x] Licence attestation (`font_assets.licence_confirmed_at`) required before publish; an unattested face is never emitted as `@font-face`.
- [x] CSP `font-src 'self'` only — custom faces are served same-origin from `/api/public/font/*`; silent fallback + `framique_theme_font_fallback_total` on a 404.


## 4. Demo data lifecycle — done

- [x] Per-vertical catalogues authored in `src/lib/demo-catalog.ts` and passed to `theme_import_demo` as `_catalog`: apparel (sizes, colourways, fabric, model measurements), marketplace (broad multi-category), electronics (specs, EMI, warranty), beauty (shades, ingredients, routine steps). Referential integrity asserted in `phase4-demo-catalog.test.ts`.
- [x] `theme_purge_demo` removes only `is_demo` rows across products, variants, collection links, collections and categories, and reports counts; import is a no-op when demo rows already exist (idempotent + fully reversible).
- [x] `theme.demo_imported` / `theme.demo_purged` recorded in `theme_audit` with row counts.


## 5. SEO / AEO per template — done

- [x] Single `<h1>` claimant enforced by `lintTemplate` against a declared `ROUTE_H1_TEMPLATES` list (product/collection/page/blog take theirs from route data) — no test allow-list any more; two claimants is still an error everywhere.
- [x] JSON-LD singletons: `JSONLD_SINGLETONS` covers `Product`, `Offer`-carrying product graphs, `ItemList`, `BreadcrumbList`, `Article`/`HowTo` and exactly one `FAQPage` — `care_panel` now emits its own `FAQPage`, so `faq` + `care_panel` on one template is a lint error and only one graph is collected.
- [x] `seo-answers` lint: an answer widget inside a sandboxed HTML island or a client-only container (`quick_view`) is an error; inside a deferred panel (`tabs`) it warns.
- [x] `hreflang` alternates for `en`/`bn` via `seo-technical.ts`; every storefront leaf route has a unique `head()`.
- [x] `seo_templates` rows ship with each preset (`presetSeoTemplates`, per-vertical copy) and are seeded on theme install without ever overwriting merchant-authored copy; editable in `SeoTemplatesPanel`.

## 6. Gates that exist as scripts but are not enforced — done

- [x] `gates:release` runs `perf:budget` + `a11y:gate` + `vitals:gate`, and `gates` now chains it — the scripts block a release instead of merely existing. `RELEASE_GATES` in `publish-gates.ts` declares them, asserted against `package.json`.
- [x] Publish gate composition: `composePublishGate` (parse + lint + ≥90% বাংলা + fonts + contrast light/dark + skeleton parity), wired into `publishVersion`; blocked publishes are logged with their codes.
- [x] Contrast: every ink/surface/accent pair measured in light **and** dark (`contrastReport`), text pairs blocking at 4.5:1, non-text chrome advisory at 3:1. `inkOn` now also considers a near-black candidate, which fixed unreadable button labels in every dark set.
- [x] Vitals targets live in one place (`web-vitals.ts`); `vitals-gate.mjs` is asserted to quote the same LCP/CLS/TBT numbers, and the a11y gate sweeps the same light/dark × EN/বাংলা matrix as `GATE_MATRIX`.
- [x] Zero-CLS skeleton parity: `skeletonParityGate` fails any data widget whose placeholder has no count or no platform aspect ratio (`phase6-gates.test.ts`).

## 7. Runtime robustness / fail-safes — done

- [x] Empty rail self-hides, a missing image still reserves its ratio box, and a slow/failing source falls back to its last-good payload (`RESOLVER_TIMEOUT_MS` + per-tenant last-good cache in `widget-data.server.ts`) — each asserted in `phase7-runtime.test.ts` / `phase7-failsafe.test.tsx`.
- [x] `WidgetBoundary`: a deliberately failed node per shipped blueprint proves the rest of the template still renders.
- [x] Storefront cache key is `tenant · template · locale · theme_version`; a publish purge clears one merchant and leaves every other tenant warm (asserted against the live cache).
- [x] Hydration policy audited per widget: chrome `eager`, editorial `static`, rails/UGC `visible`, drawers/size guide/quick view/mobile filters `interaction`.
- [x] Overlay invariants: no builder component other than `OverlayHost` locks scroll or declares `aria-modal`; the host owns focus trap, Escape and focus restore.


## 8. Consistency / documentation debt — done

- [x] `theme-plan-marketplace.md` now says `product_qna`, matching the registry and the other three plans.
- [x] §0/§3 of the marketplace plan rewritten to describe what shipped: AST v3, the 117-widget registry, the batched data contract with timeout + last-good fallback, and the `_catalog` demo lifecycle.
- [x] The no-code customizability contract (colour, fonts, radius, density, spacing, section order, media ratio, reveal, all copy, SEO copy) is documented in `theme-registry.md`.
- [x] `definition-of-done.test.ts` proves no blueprint introduces a theme-exclusive widget: every blueprint-only widget grafts into another blueprint's template and lints clean, and no renderer branches on — or even accepts — a theme key.

---

## Suggested order

1. §1 বাংলা fill → ship Bazaar, Circuit, Rupaboti. Three flagship themes for translation work only.
2. §6 publish gate wiring, so the gates stop being advisory.
3. §2 bilingual layout sweep (this is where real breakage will surface).
4. §3 typography subsystem, then custom fonts.
5. §4 demo catalogues + purge.
6. §7 fail-safes, §8 doc cleanup.