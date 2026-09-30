# SDK Contracts (Internal Reference)

Last verified 2026-09-26 at HEAD `e4d342e9`.

Audience: reviewers checking a PR against engine invariants. Each section
states the invariant, pins the exact `file:line` at HEAD, and states what
breaks on violation. No tutorial prose; third-party narrative lives in
[third-party SDK guide](../developers/sdk.md),
[theme guide](../developers/themes.md),
[plugin guide](../developers/plugins.md), and
[contribution guidelines](../developers/guidelines.md).

## 1. Design tokens

- Invariant: the closed token shape is the
  [token type](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:6021`
  (`ThemeTokens`); defaults are the
  [default tokens](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:6076`
  (`DEFAULT_TOKENS`, brand `#0F766E`). Unknown or malformed input falls back
  per key, never throws: [token parser](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:6143` (`parseTokens`).
- Invariant: token-only CSS. Renderers emit variables from the
  [token-to-CSS mapper](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:6266` (`tokensToCss`, `--theme-*` plus `--fq-*`
  aliases); merchant stylesheets may use but never redefine `--theme-*`
  ([token guard](../../src/lib/custom-code.ts) `src/lib/custom-code.ts:65`,
  `TOKEN_VAR`). Breaks: redefinition silently forks theme styling per tenant.
- Invariant: locked per-theme palettes.
  [Songoskriti tokens](../../src/lib/themes/songoskriti/tokens.ts)
  `src/lib/themes/songoskriti/tokens.ts:10` pin brand `#1a1a1a`, surface
  `#faf9f7`;
  [Oceanblue tokens](../../src/lib/themes/oceanblue/tokens.ts)
  `src/lib/themes/oceanblue/tokens.ts:14` pins brand `#0B3A5B`. Breaks: the
  wiring suites below fail (`wiring.test.ts`, `preview.test.ts`).
- Invariant: font faces change only through the closed
  [font pairing table](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:6058` (`FONT_PAIRINGS`); there are no per-widget
  font pickers. Breaks: a locale switch can land on a face without Bangla
  coverage.

## 2. Skins and defaults merge

- Invariant: closed per-widget skin vocabularies in the
  [skin table](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:599`
  (`WIDGET_SKINS`): `product_rail`/`urgency_rail` share
  `editorial | compact | minimal`; `hero_carousel` is
  `split | fullbleed | minimal`; `testimonials` is `carousel | wall | single`;
  `product_grid` is `cards | rows`. The first option is the documented
  default, pinned in the
  [default-skin table](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:617` (`DEFAULT_WIDGET_SKIN`).
- Invariant: unknown, empty, or non-string skins resolve to the widget
  default, never a crash or empty attribute; non-skinnable types resolve to
  `""` ([skin resolver](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:638`, `resolveSkin`, via the
  [skinnability guard](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:627`). Breaks: renderer emits no `data-skin` or
  selects no skin sheet.
- Invariant: theme preset defaults merge UNDER authored props and accept only
  catalog-known keys ([core merge](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:734`, `withThemeWidgetDefaults`). Songoskriti wraps
  builders with [its defaults](../../src/lib/themes/songoskriti/skins.ts)
  `src/lib/themes/songoskriti/skins.ts:109` (`withSongoskritiDefaults`,
   defaults at `src/lib/themes/songoskriti/skins.ts:52`, resolver at
  `src/lib/themes/songoskriti/skins.ts:75`); Oceanblue wraps with
  [its defaults](../../src/lib/themes/oceanblue/skins.ts)
  `src/lib/themes/oceanblue/skins.ts:109` (`withOceanblueDefaults`,
  defaults at `src/lib/themes/oceanblue/skins.ts:52`, merge at
  `src/lib/themes/oceanblue/skins.ts:96`, resolver at
  `src/lib/themes/oceanblue/skins.ts:75`). Breaks: a theme override clobbers
  merchant inspector values or smuggles unknown props onto a node.
- Invariant: skin sheets load only for skins the page uses
  ([usage collector](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:679`, `usedWidgetSkins`, keyed by
  [sheet-key helper](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:666`;
  [CSS join](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:718`,
  `combineUsedSkinCss`). Per-breakpoint `skin` overrides stay
  presentation-only and never pull a sheet. Breaks: unused CSS ships or a
  used skin renders unstyled.
- Invariant: skin CSS is scoped to
  `[data-widget="<type>"][data-skin="<skin>"]`, uses `var(--theme-*)` plus
  literals for artwork only ([Songoskriti token policy](../../src/lib/themes/songoskriti/skins.css)
  `src/lib/themes/songoskriti/skins.css:8`). Breaks: the token-driven suites
  fail and a palette change misses skin sheets.

## 3. Catalog fields and persist-shape rule

- Invariant: the core registry is the closed
  [base catalog](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:796`
  (`BASE_CATALOG`); the widget type enum is the
  [section-type union](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:113`. Plugins never extend it; they contribute via
  the single `plugin_block` tier (see §7).
- Invariant: bilingual schema is derived, not authored twice. The
  [bitext declaration](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:5311` (`BITEXT_FIELDS`) lists English-side keys per
  type; [schema derivation](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:5805` (`withBiText`) promotes each to kind `bitext`
  and adds an empty `${key}_bn` default. Runtime key reads go through the
  [bitext key reader](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:5825` (`biTextKeysOf`), not the raw table. Breaks:
  inspector shows one tab, lint misreports translation coverage.
- Invariant: the served catalog is `BASE_CATALOG` piped through `withBiText`,
  `withMedia`, `withStyleLayer` ([served catalog](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:5902`, `SECTION_CATALOG`); lookups go through the
  [catalog accessor](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:5997`
  (`catalogEntry`). Breaks: renderers and the **Studio** canvas disagree on
  defaults or fields.
- Invariant (persist-shape rule): stored trees are truncated, never rejected.
  [Section parsing](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:6569`
  (`parseSection`) drops cyclic nodes, re-suffixes duplicate ids, keeps unknown
  widgets as placeholders, and caps array rows at
  [row cap](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:299`
  (`MAX_ARRAY_ROWS = 24`); [template parsing](../../src/lib/builder-ast.ts)
  `src/lib/builder-ast.ts:6825` (`parseAst`) caps slots at
  [slot cap](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:6778`
  (`MAX_SECTIONS_PER_SLOT = 60`), depth at
  [depth cap](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:302`
  (`MAX_TREE_DEPTH = 6`), and nodes at
  [node cap](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:303`
  (`MAX_NODES_PER_TEMPLATE = 300`), with all ceilings published in the
  [payload limits](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:6781`
  (`AST_LIMITS`). Only known template keys persist
  ([template parser](../../src/lib/builder-ast.ts) `src/lib/builder-ast.ts:6908`,
  `parseTemplates`; v2 upgrade at `src/lib/builder-ast.ts:6864`). Breaks:
  oversized or hostile payloads 500 the save path or fork renderer state.

## 4. Studio twin parity

- Invariant: every `BASE_CATALOG` entry resolves in the **Studio** widget map
  with BASE-mirroring defaults 1:1, including the `skin` default and an empty
  `_bn` twin per `BITEXT_FIELDS` key ([parity contract](../../src/lib/studio/catalog.ts)
  `src/lib/studio/catalog.ts:2418`). Intentional exclusions only:
  `page_content` (context slot, zero fields) and `plugin_block` (covered by
  the `app-block` twin).
- Invariant: the contract is machine-pinned by the
  [twin-parity suite](../../src/lib/studio/catalog.test.ts)
  `src/lib/studio/catalog.test.ts:837` (`studio twin parity`): full
  `SECTION_CATALOG` resolution, account-twin content defaults, thin-twin
  schema coverage, skinnable-twin default skins. Breaks: a widget added to
  `BASE_CATALOG` is uneditable in the **Studio**.

## 5. Preview engine and focus links

- Invariant: the engine never names a theme. Themes implement the
  [preview port](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:283` (`PreviewThemeSource`); the
  [preview registry](../../src/lib/preview-sources.ts)
  `src/lib/preview-sources.ts:14` (`SOURCES`, via
  [source lookup](../../src/lib/preview-sources.ts)
  `src/lib/preview-sources.ts:19`) is the only place that names themes.
  Breaks: engine edits per theme; add-theme requires engine changes.
- Invariant: every template renders non-empty. Authored mains come from the
  [Songoskriti source](../../src/lib/themes/songoskriti/preview.ts)
  `src/lib/themes/songoskriti/preview.ts:40` and the
  [Oceanblue source](../../src/lib/themes/oceanblue/preview.ts)
  `src/lib/themes/oceanblue/preview.ts:40`; unauthored templates synthesize
  the [generic demo body](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:322` (`genericDemoMain`), assembled with
  template-scoped ids by the
  [template assembler](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:345` (`assemblePreviewTemplates`). Breaks: a
  preview tab lands on an empty page.
- Invariant: in-canvas links never escape the frame. Demo links map to
  template tabs via [href mapping](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:42` (`previewTargetForHref`, blocked auth
  paths at `src/lib/theme-preview-nav.ts:34`); clicks intercept at
  [canvas click handler](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:134` (`handlePreviewCanvasClick`) and all
  submits block with [disabled toast](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:120` (`PREVIEW_DISABLED_MESSAGE`) via
  [submit handler](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:179`. Focus travels as `?focus=`, never
  `?slug=`, and search keys round-trip parsed (`q`/`max` only, sliced to
  [query limit](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:193`) through the
  [search switch helper](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:225` and
  [search validator](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:246`. Breaks: preview links 404 on platform
  hosts or leak raw query strings into refresh-safe URLs.
- Invariant: clicked slugs change the demo. The
  [focus resolver](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:411` (`resolveDemoFocus`) maps known slugs to
  catalog rows and unknown slugs to `new-in` rows under a humanized title;
  the [focus applier](../../src/lib/theme-preview-nav.ts)
  `src/lib/theme-preview-nav.ts:451` (`applyDemoFocus`) retitles the first
  heading and repoints the first collection rail without touching authored AST
  ids. Breaks: every collection link renders one static demo.
- Invariant: Songoskriti homepage is 20 sections opening on `hero_carousel`
  ([homepage builder](../../src/lib/themes/songoskriti/homepage.ts)
  `src/lib/themes/songoskriti/homepage.ts:31`; pinned by wiring and preview
  suites, see §8); Oceanblue homepage is 14 sections opening on
  `announcement_bar` + `hero_carousel` per the
  [Oceanblue design spec](../../docs/superpowers/specs/2026-09-30-oceanblue-theme-design.md)
  `src/lib/themes/oceanblue/homepage.ts:23`. Breaks: homepage-order
  regressions slip past review.

## 6. Dashboard-menu data flow

- Invariant: menus are a flat ordered list with `parentId`; nesting,
  reordering, and validation live in the pure half
  ([menu model](../../src/lib/menus/menu.ts) `src/lib/menus/menu.ts:95`,
  `buildTree`; depth capped by [menu depth](../../src/lib/menus/menu.ts)
  `src/lib/menus/menu.ts:57`, `MAX_MENU_DEPTH = 3`). Server code trusts one
  shape only.
- Invariant: dashboard menus win by location claim; unclaimed locations render
  `[]` and theme static `nav_menu` widgets stay as fallback
  ([store-menu shaper](../../src/lib/menus/menu.ts)
  `src/lib/menus/menu.ts:427`, `shapeStoreMenus`, first claimant per location;
  [mobile selector](../../src/lib/menus/menu.ts) `src/lib/menus/menu.ts:446`,
  `selectMobileMenu`, mobile falls back to header).
- Invariant: storefront reads never 500 on menu failure. The
  [menu loader](../../src/lib/menus/menu.server.ts)
  `src/lib/menus/menu.server.ts:128` (`loadStoreMenus`) takes the
  already-resolved merchant id, reads through public RLS, caches 120s under
  the tenant prefix, and degrades to
  [empty menus](../../src/lib/menus/menu.ts) `src/lib/menus/menu.ts:420`.
  Payloads ride every chrome load in the
  [storefront loader](../../src/lib/storefront.server.ts)
  `src/lib/storefront.server.ts:170` and `src/lib/storefront.server.ts:426`.
- Invariant: header selection is data-driven in the
  [store header](../../src/components/store/StoreHeader.tsx)
  `src/components/store/StoreHeader.tsx:213` (dashboard header wins; hardcoded
  Songoskriti tree is preview fallback only). Dashboard nodes carry no `_bn`
  field and render as-authored in every locale. Breaks: generic stores gain
  phantom nav or বাংলা rewrites merchant-authored labels.

## 7. Plugin manifest, sandbox, and lifecycle internals

- Invariant: core registry stays closed; plugins contribute a namespaced tier
  `plugin:{pluginId}/{widget}` rendered through one sandboxed island
  ([manifest header](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:10`; [key helpers](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:93`, `src/lib/plugin-manifest.ts:97`).
- Invariant: compatibility is declared against
  [builder API version](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:18` (`BUILDER_API_VERSION = "3.1.0"`), matched by
  [range checker](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:109` (caret and `>=a <b` forms only). Resource
  ceiling is [plugin budget](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:21` (`PLUGIN_BUDGET`: 120 KB JS, 50 ms main
  thread); over-budget fails validation. Server extension points are the
  closed [hook list](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:24` (`SERVER_HOOKS`); manifests may not invent
  hooks, widget contributions require `render_storefront`, and hooks require
  an HTTPS `hooksUrl` ([manifest gate](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:191`, `parseManifest`). Entry bundles rejecting
  `import(`/`eval`/`new Function` fail as dynamic code. Breaks: unreviewed
  code paths execute in the storefront.
- Invariant: resolution never throws. The single
  [widget resolver](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:446` (`resolvePluginWidget`, used by tray,
  canvas, and storefront) returns labelled-placeholder reasons (`bad_key`,
  `not_installed`, `unknown_widget`, `incompatible`, `disabled`).
- Invariant: permission changes are consent-gated. The
  [permission differ](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:335` (`permissionDiff`) marks any added scope
  `requiresConsent`; settings coerce through
  [settings defaults](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:348` and
  [settings validation](../../src/lib/plugin-manifest.ts)
  `src/lib/plugin-manifest.ts:363` (unknown keys dropped).
- Invariant: vendor code never runs in-process. Hook delivery reuses the
  signed, scope-gated path with an 800 ms ceiling and breaker
  ([hook runner](../../src/lib/plugin-hooks.server.ts)
  `src/lib/plugin-hooks.server.ts:208`, `runHook`;
  [timeout](../../src/lib/plugin-hooks.server.ts)
  `src/lib/plugin-hooks.server.ts:20`; queued retry at
  `src/lib/plugin-hooks.server.ts:230`). The sidecar is supervised lifecycle
  state only ([sidecar host](../../src/lib/plugin-sidecar.server.ts)
  `src/lib/plugin-sidecar.server.ts:40`, `syncSidecars`; started per active
  install, stopped on suspend). Suspend/resume obey the pure
  [transition guard](../../src/lib/plugin-lifecycle.server.ts)
  `src/lib/plugin-lifecycle.server.ts:33` (`assertTransition`); the platform
  kill switch is ([kill switch](../../src/lib/plugins.server.ts)
  `src/lib/plugins.server.ts:27`). Breaks: a suspended or kill-switched
  plugin keeps receiving hooks.

## 8. Test-gate map

| Suite                                                                       | What it pins (fail = contract broken)                                                                |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/studio/catalog.test.ts:837` (`studio twin parity`)                 | §4: full catalog resolution, account-twin defaults, thin-twin schema, default skins                  |
| `src/lib/widget-registry.test.ts:35` (closed enum; `tokens only` at `:121`) | §3 + §1: one registry entry per catalog widget, renderer for each, no theme imports, no raw colors   |
| `src/lib/themes/songoskriti/wiring.test.ts:13`                              | §1 + §5: `#1a1a1a` brand lock, 20-section `hero_carousel`-first order                                |
| `src/lib/themes/songoskriti/preview.test.ts:16`                             | §5: preview source identity, homepage head/length/close                                              |
| `src/lib/themes/songoskriti/skins.test.ts:32`                               | §2: editorial defaults, vocabulary containment, merge precedence, token-driven CSS                   |
| `src/lib/themes/oceanblue/skins.test.ts` (`OCEANBLUE_WIDGET_DEFAULTS`)      | §2: minimal defaults (`split` hero, `minimal` rails, `cards` grid, `single` wall), divergence from Songoskriti |
| `src/lib/theme-preview-nav.test.ts:16`                                      | §5: href mapping, demo bodies for every template, focus resolution/application, `?focus=` round-trip |
| `src/lib/theme-preview.test.ts`                                             | §5: `resolveThemePreview` per key, unknown key returns null                                          |
| `src/lib/page-builder-widgets.test.ts`                                      | §3: widget defaults, field shapes, persist-shape truncation                                          |
| `src/lib/menus/menu.test.ts:58`                                             | §6: handle slugging, tree build/flatten, depth limit, validation                                     |
| `src/components/store/StoreHeader.test.tsx:163`                             | §6: dashboard-menus-win selection, Songoskriti fallback only                                         |
| `src/lib/phase5-plugins.test.ts:81`                                         | §7: manifest accept/reject matrix, budget caps, key round-trip, placeholder downgrade                |
| `src/lib/plugin-lifecycle.test.ts:76`                                       | §7: suspend/resume machine, idempotency, kill-switch fan-out                                         |
| `src/lib/plugin-acceptance.test.ts:136`                                     | §7: hook-to-scope gate matrix, signed egress, replay idempotency, cross-merchant deny, audit rows    |
| `src/lib/plugins-consent.test.ts:51`                                        | §7: superset-grant refusal, consent evidence, audit on grant                                         |
| `src/lib/plugin-bundle-gate.test.ts:33`                                     | §7: oversized/dynamic-code/no-scope bundle rejection                                                 |
| `src/lib/phase2-bilingual.test.ts:16`                                       | §3: `_bn` twin derivation, locale/digit token CSS                                                    |
| `src/lib/phase3-theme.test.ts:59`                                           | §1: shadow/motion/dark token CSS mapping                                                             |
| `src/lib/custom-code-xss.test.ts`                                           | §1: `--theme-*` redefinition refused, XSS stripped                                                   |
| `src/lib/primary-section.test.ts`                                           | §3: single-h1 section preference (hero first) shared by host and preview                             |

## 9. Known source contradiction

- The [Songoskriti homepage header](../../src/lib/themes/songoskriti/homepage.ts)
  `src/lib/themes/songoskriti/homepage.ts:8` describes a "30+ sections"
  hierarchy, but the builder emits 20 `s(` calls
  (`src/lib/themes/songoskriti/homepage.ts:31` through `:382`) matching the
  wiring suite assertion of exactly 20
  (`src/lib/themes/songoskriti/wiring.test.ts:31`). The "30+" header comment is stale
  relative to both the builder and the test; the test is authoritative until
  the comment is corrected. Count re-verified at HEAD (20 `s("` calls).
