# Builder, themes, and studio — authoritative guide (merged 2026-09-26)

> Supersedes: theme-runtime.md, theme-registry.md, themes-catalog.md,
> theme-authoring-export.md, sections-templates.md (kept as history).

Status: Authoritative · Merged from built code (REPORT-THEMES.md §§1–5 is code reality;
every locked value below cites its `file:line`).
Companions that stay current: [the publishing contract](publishing.md) (schedule, preview
shares, rollback) and [the widget catalog contract](app-blocks.md) (block model, sandbox).
Plans: `theme-registry.md` (registry contract) · `theme-runtime.md` (TR-1/TR-2, fallback) ·
`sections-templates.md` (widget/section models) · `publishing.md` (schedule/publish/rollback) ·
`app-blocks.md` (widget catalog, sandbox, validation) · E2E: `docs/15-e2e/theme_registry.md`
Design baseline: `00-meta/design-system.md` (builder consumes tokens; themes get token subset)

---

## Purpose

Own drag-and-drop page builder (Elementor-style) over a JSON AST engine. Merchants compose storefront pages from widgets, styled by design tokens — no code. Also drives theme preview.

## Components

- **Editor UI (admin SPA)**: canvas, widget library sidebar, property inspector, device preview (desktop/tablet/mobile), undo/redo, template library.
- **Engine (runtime-agnostic)**: AST `{type:"page", children:[{widget, id, props, styles}]}`; serializer → HTML; hydration for interactivity (only widget JS, sandboxed); SSR-safe.
- **Widget system**: built-in widgets (heading, text, image, product grid, collection grid, buy box, form, video, countdown, FAQ accordion, marquee, custom HTML) + community widgets from marketplace (12) with versioned sandbox.
- **Design tokens editor**: brand palette → semantic map, fonts (Bangla display), radius, spacing; live preview; save per theme.
- **Theme/preview**: `?preview=ast` render in storefront runtime; publish → CDN cache purge.

## Data model

`pages(ast jsonb)`, `widgets(manifest)`, `theme_tokens`, `templates`, `revisions` (every publish snapshot for rollback).

## State machine (publish)

`draft → preview → published` (rollback = restore previous revision).

## Events

`page.published`, `widget.installed`, `theme.updated`.

## Failure/recovery

- Editor crash → autosave draft every 5s to Redis; recovery prompt on reload.
- Invalid widget in page → skip widget, show placeholder, never break whole page.

---

### Design guidelines — builder editor, token editor, preview

- Intent: a tool that feels like a professional design studio — fast, precise, calm; canvas is the star, chrome recedes.
- Key surfaces: canvas + ruler + device bar, widget library rail (left), property inspector (right), top bar (undo/redo/publish), token color picker, live preview.
- Palette: near-monochrome chrome (slate 100–900) so the canvas's brand colors pop; accent only for selection (BD teal) and "unsaved" amber dot; publish mint.
- Typography: compact 0.875rem panels; canvas shows real theme fonts (Bangla display in preview); tabular nums for width/offset inputs.
- Density: editor-dense — snap-to-grid visual, property fields stacked 4px, keyboard-first (arrow keys to nudge, Enter to commit).
- Motion: drag ghost 120ms; panel slide 200ms; device switch crossfade 240ms; reduced-motion → none.
- A11y: every widget selectable+keyboard draggable; property inspector is a form with labels; focus ring; contrast badge live.
- Performance: canvas virtualization (only visible widgets in DOM), AST diffing, worker for serialization, publish purge quick.
- Anti-slop: distinctive — a "widget" tray in Bangla with hand-drawn-style icons; a live BD-brand palette suggestion engine (from merchant's logo upload); 1-click "My color" auto-palette extraction.

---

## Strict guardrails

### 2. Data & tenancy

- Page ASTs, widget manifests, theme tokens, templates and `revisions` are tenant-scoped (`merchant_id` + RLS); a merchant can never see or edit another store's theme or pages.
- `revisions` keep every publish snapshot so rollback is always a restore of a saved snapshot — never re-rendered from memory.

### 3. State transitions

- Publish machine: `draft → preview → published`; only the published revision serves the storefront; rollback = restore previous published revision (a new publish, never a destructive overwrite).
- Publish triggers the CDN cache purge so visitors never land on a stale page after a merchant publishes.

### 4. Vendors & data-export

- Community widgets from the marketplace are versioned and sandboxed — only validated widget JS executes, inside the sandbox (see 12); a failing sandbox validation means the widget is never loaded.
- Unpacking theme upgrades: registry keeps the last-good revision when a new one (or its widgets) fail validation (see 15-e2e/theme_registry.md).

### 6. Accessibility & performance

- Editor is keyboard-first: every widget selectable + keyboard-draggable; property inspector is a labeled form; contrast badge live; focus ring; reduced-motion → editor motion none.
- Canvas virtualization (only visible widgets in DOM), AST diffing, worker-based serialization, publish purge runs off the UI thread.

### 7. Failure & recovery

- Editor crash → autosave draft every 5s to Redis; recovery prompt on reload, no lost work.
- Invalid widget on a page → skip it, show placeholder with an inline error, never break the whole page render.

### 8. Testing gates

- builder_loop E2E must pass: draft → autosave → preview → publish → rollback, plus the invalid-widget placeholder path.
- Theme-registry validation failure → last-good fallback verified in `docs/15-e2e/theme_registry.md`.
- §21 contract suites (T4.3, contract-level vitest — no Playwright, no `.e2e/`
  infra exists in this repo) must pass alongside the adjacent suites:
  - lifecycle (`src/lib/builder-lifecycle.contract.test.tsx:35`, `:108`, `:144`) —
    built-in widget builder→save→preview→publish→render, authored-data round
    trip, broken widget → placeholder with siblings intact.
  - themes (`src/lib/builder-themes.contract.test.tsx:82`, `:132`, `:185`) —
    community `plugin_block` install→persist→render→switch, `product_grid`
    A/B extending the `DemoProductWidget` proof pattern
    (`src/components/builder/demo-widget-proof.test.tsx:2`), broken theme →
    generic fallback + server last-good pin (`src/lib/themes.server.ts:1189`).
  - chrome (`src/lib/builder-chrome.contract.test.tsx:79`, `:128`, `:158`,
    `:197`, `:239`, `:282`) — menu assign→render, header locale switch
    geometry-intact, announcement→all templates, footer global→all templates,
    mobile-width structure (`src/lib/responsive.ts:11`, `:154`), bn integrity.

### Audit verdict — checklist

Follow-up record for `00-meta/audit-verdict.md`; every line below is verifiable in this plan's own sections or the plans it references.

- **Sections audited**: Purpose, Scope, state machine, guardrails `### 2`/`### 3`, failure & recovery, testing gates; all claims trace to sections above or to `publishing.md`, `theme-registry.md`, `theme-runtime.md`.
- **State machine quoted**: `draft → preview → published` (§3 above); `publishing.md` adds the `scheduled` arm and `§14` adds `scheduled_removal → unpublished`; both flow through `theme_publish` — never a second publish implementation.
- **Scheduled publishing**: `pages.scheduled_at` → scheduler promotes via `theme_publish` (`publishing.md` §5); failure gate is the registry's last-good fallback (`theme-registry.md` §6), and the storefront never serves a half-published page.
- **Widget sandbox**: community widgets are versioned + sandboxed; only validated JS executes (§4 above, `app-blocks.md`); failing validation = widget never loaded.
- **Events (v0)**: `page.published` + `theme.updated` only; no new event surface is introduced by this checklist.
- **Owners**: builder/runtime for the machine; storefront for TR-8 serving rules; 05-marketing for articles via `content-cms.md`.

## Studio UI (implemented)

`/admin/builder` is a three-pane studio: slot outline + widget tray, device-scoped
canvas, and a tabbed side panel (Settings / Brand / History / Themes).

- **Templates** — index, product, collection, cart, checkout, blog, page. Each is
  edited independently and stored in one `templates` JSONB document.
- **Autosave** — `useBuilderEditor` debounces 3s of quiet, carries a monotonic
  revision so a slow request cannot overwrite newer work, keeps a 50-step
  undo/redo history, and blocks navigation while a change is unsaved.
- **Lint gate** — `lintTemplate` errors disable Publish (for example a template
  with no primary heading); warnings stay advisory.
- **Brand tokens** — colors are contrast-checked live against AA 4.5:1 and the
  badge states pass/fail in words, never color alone.
- **History** — immutable versions with restore, plus scheduled publishes handled
  by the `theme_sweep` cron runner.
- **Registry** — official themes install as a draft version, so the merchant keeps
  their last-good published theme if they change their mind.

Published tokens reach the storefront as CSS variables on the store root
(`fq-theme-scope`), so merchant branding never leaks into admin chrome.

## Phase C — official theme packages

Two built theme packages ship the complete template hierarchy (`index`,
`product`, `collection`, `page`, `blog`, `cart`, `checkout`), each with
header/main/footer slots, responsive breakpoint overrides and the context
widgets the template requires: `songoskriti` and `somvabona` (the ten-name
`CATALOG_META` table in `src/lib/themes/catalog-meta.ts:1` is picker-floor
metadata only — SQL rows override it; only the two built packages resolve
through `registryPackage`).

- Source of truth: the built packages behind `registryPackage` in
  `src/lib/themes.server.ts:682` (version `1.0.0`), assembled from the
  theme preview sources (`resolveThemePreview` in
  `src/lib/theme-preview-nav.ts:404`). `theme_registry` holds catalogue
  metadata only, so SQL and runtime cannot drift.
- Install path: `installRegistryTheme` validates and lints the package
  server-side, then calls the `theme_install_preset` RPC with
  `(_merchant_id, _key, _preset, _overwrite_draft)`
  (`src/lib/themes.server.ts:732`); the RPC writes a draft version, so any
  lint error rejects the install and the merchant keeps their last-good theme.
  The server keeps the last-good pin with a builtin fallback
  (`lastGoodVersion` in `src/lib/themes.server.ts:1189`, asserted in
  `src/lib/builder-themes.contract.test.tsx:212`).
- Guard rails: per-theme wiring suites assert token validity and template
  completeness (`src/lib/themes/songoskriti/wiring.test.ts:1`,
  `src/lib/themes/somvabona/wiring.test.ts:1`), and
  `src/lib/theme-presets.test.ts` does not exist — no such suite is claimed.

---

## Authoritative theme reference (merged from built code)

The sections below replace the overlapping planning docs listed in the banner.
All values match HEAD; stale planning brand locks are void.

### Mental model — Widget is capability, Theme is presentation

- **Widget = functionality / data / state / actions.** The closed
  `SectionType` registry is shared by every theme: `WidgetMeta` carries no
  theme field (`src/lib/widget-registry.ts:68`), so a widget authored for one
  vertical drops into any theme. Pinned by the DoD 5 suite in
  `src/lib/definition-of-done.test.ts:102`.
- **Builder = composition + props + placement.** Merchants arrange sections,
  set props, and place them in header/main/footer slots; the engine owns
  parsing (`parseAst` in `src/lib/builder-ast.ts:7463`), validation, and the
  single batched data call. Save → reload is byte-stable
  (`src/lib/builder-lifecycle.contract.test.tsx:108`).
- **Theme = presentation, claimed through the registries.** A theme never
  forks the renderer. It claims `themeKey × widgetType` pairs with
  `registerThemePresentation` (`src/lib/theme-presentations.ts:35`);
  themeable community widgets with `themeKey × pluginKey` through
  `registerCommunityPresentation`
  (`src/lib/plugin-theme-contract.ts:165`); chrome surfaces (header shell,
  menu, announcement, footer) through the same widget registry plus the
  header-shell lookup (`resolveHeaderShell` in
  `src/components/store/StoreHeader.tsx:316`, generic fallback in
  `src/components/store/StoreHeader.tsx:840`). The engine
  (`SectionRenderer`) resolves the registered presentation first and falls
  back to the existing `resolveWidgetComponent` result when nothing is
  registered (`src/components/builder/SectionRenderer.tsx:272`, over
  `src/components/builder/theme-widgets.ts:45`). Unregistered pairs render
  byte-identical to before — zero behavior change.
- **Plugin = extension.** Class A (isolated) renders in the sandboxed island
  and never dresses; Class B (themeable) declares the versioned
  schema/data/actions/slots/states contract and renders through the theme
  presentation when dressed, the generic island when not
  (`src/lib/plugin-theme-contract.ts:6`, `:58`, `:266`).
- **Runtime = platform services.** Flow: AST → widget/plugin contract →
  active theme → theme presentation → storefront. No theme branches in shared
  code: registries name no theme and branch on no theme
  (`src/lib/theme-presentations.ts:18`), pinned by
  `src/lib/theme-presentations.test.tsx:194` and
  `src/lib/definition-of-done.test.ts:138`.
- **Tokens + skins are one layer.** Together they are the single base
  presentation layer every registry presentation renders on: tokens feed
  CSS variables, `skin` picks a style key inside a closed vocabulary.
  Per-widget markup differences belong to the registry, not to new
  tokens or new skins.

### Presentation registry — the theme system

`src/lib/theme-presentations.ts` is an opaque two-level Map
(`themeKey → widgetType → Component`) that names no theme and branches
on no theme (pinned by `src/lib/theme-presentations.test.tsx:194`):

- **Claim** (`:35`): theme modules call `registerThemePresentation`
  (typically from their own module init). First registration wins —
  duplicates warn and are ignored (`:57`). Registration never throws;
  invalid input warns and returns.
- **Resolve** (`:72`): `resolveThemePresentation(themeKey, widgetType,
fallback)` returns the registered presentation or the
  caller-supplied fallback. Unknown, null, and missing keys fall back
  instead of leaking another theme's brand (`:78`); resolution never
  throws. Test-only reset at `:86` (isolates suites).
- **Proof** (`src/lib/theme-presentations.test.tsx:137`, `:162`): the
  same section object renders through two registered presentations with
  different markup and identical data — directly and through the
  `SectionRenderer` lookup path — without mutating the shared section.

Studio note: the builder token panel takes the installed theme key for
one purpose only — offering that theme's merchant-pickable variation
list (`src/components/builder/TokenEditor.tsx:225`, fed by the studio
host's `VARIATIONS_BY_THEME_KEY` in
`src/routes/_authenticated/dashboard/builder.tsx:130`, passed at
`src/routes/_authenticated/dashboard/builder.tsx:2337`). It is
editor chrome, not a renderer, and carries the same no-compare /
no-switch / no-widget-resolution guardrails
(`src/lib/definition-of-done.test.ts:179`).

### Community registry — Class A sandboxed, Class B themeable

`src/lib/plugin-theme-contract.ts` is the theme-safe contract (Class B),
mirroring the widget registry's first-wins / never-throw / fallback-safe
rules (`src/lib/plugin-theme-contract.ts:22`):

- **Class A (`isolated`):** the widget declares no `themeable` contract. Its
  bundle owns arbitrary UI inside the null-origin `WidgetSandbox` frame;
  resolution returns `sandbox` and the PluginBlock renders the exact same
  island (`src/lib/plugin-theme-contract.ts:6`,
  `src/lib/plugin-manifest.ts:258`).
- **Class B (`themeable`):** the plugin declares the versioned contract
  (schema/data/actions/slots/states,
  `src/lib/plugin-theme-contract.ts:38`); the theme dresses it through
  `registerCommunityPresentation`
  (`src/lib/plugin-theme-contract.ts:165`), resolved by
  `resolveCommunityPresentation` (`:208`) and decided at the single
  `resolveCommunityRender` point (`:266`): blocked → placeholder, Class A →
  `sandbox`, themeable + dressed → `theme`, themeable + undressed → generic
  sandboxed `island`. Unknown themes never resolve to another theme's brand.
  Pinned by `src/lib/plugin-theme-contract.test.tsx:249` (Class A stays
  sandbox), `:261` (undressed → island), `:285` (dressed → theme).
- **Round-trip:** a `plugin_block` install persists through save without loss
  and renders on both themes without brand leak
  (`src/lib/builder-themes.contract.test.tsx:82`).

### Chrome surfaces — header shell, menu, announcement, footer

Chrome is presentation claimed through the same registries, not a second
theme system:

- **Header shell:** each theme attaches its shell as a static on its
  registered `mega_menu` presentation
  (`src/lib/themes/songoskriti/header-presentation.tsx:777`,
  `src/lib/themes/somvabona/header-presentation.tsx:749`);
  `resolveHeaderShell` (`src/components/store/StoreHeader.tsx:316`) returns
  it, or `GenericHeaderShell` (`src/components/store/StoreHeader.tsx:840`)
  when the theme registers none. Unknown theme keys fall back to generic,
  never to another brand
  (`src/lib/platform-acceptance.test.tsx:487`).
- **Menu:** dashboard-designed menus win whenever a location is claimed;
  `shapeStoreMenus` (`src/lib/menus/menu.ts:427`) resolves first-claimant
  wins, `selectMobileMenu` (`:446`) falls back to header, `rebaseMenuHref`
  (`:458`) rebases onto the path host, `toggleLocation` (`:476`) drives
  assign/unassign. The fallback tree and its বাংলা twin table live in
  neutral shared code (`HEADER_FALLBACK_MENU` in
  `src/lib/header-copy.ts:21`, `HEADER_MENU_BN` in `:185`) and cover the
  fallback only — dashboard nodes render as-authored in every locale.
  Pinned by `src/lib/builder-chrome.contract.test.tsx:79` (assign → render),
  `:282` (bn integrity).
- **Announcement / footer:** the shared header slot carries one announcement
  edit to every template (`:158`); one global footer block resolves into
  every template footer via `resolveGlobalRef`
  (`src/lib/builder-ast.ts:6555`), degrading to a labelled placeholder when
  deleted (`src/lib/builder-chrome.contract.test.tsx:197`). Header language
  switch is geometry-intact (`:128`); mobile widths pin the breakpoint ranges
  (`src/lib/responsive.ts:11`, `:154`, asserted in
  `src/lib/builder-chrome.contract.test.tsx:239-246`).
- **Menu replacement contract:** a plugin may fill rows (Shape 1) or swap a
  slot's full nav renderer (Shape 2), but the swap wins only behind BOTH the
  `replace_menus` scope AND explicit review approval (`decideMenuRenderer`
  in `src/lib/plugin-manifest.ts:102`); every other outcome — unclaimed,
  unapproved, scope-denied, renderer throw — renders the theme default
  fail-open (`renderMenuWithFallback` in `:134`, `resolveMenuSwapRows` in
  `:207`, `selectPluginMenuRenderer` in
  `src/lib/plugin-menu-renderers.ts:120` with the `PluginMenuBoundary`
  fallback in `:179`).

### Tokens — base layer, styling channel (not a theme system)

Shape: `ThemeTokens` in `src/lib/builder-ast.ts:6629` (19 required keys, plus
optional `timezone` / `allowCustomerTimezone`). Published tokens reach the
storefront as CSS variables on the store root, and theme CSS may only read
`var(--theme-*)` (see the token-only CSS gate below).

| Token             | Songoskriti (`src/lib/themes/songoskriti/tokens.ts:9`) | Somvabona (`src/lib/themes/somvabona/tokens.ts:14`)    |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `brand`           | `#1a1a1a`                                              | `#7C2A1A`                                              |
| `accent`          | `#8B4513`                                              | `#B95A38`                                              |
| `surface`         | `#faf9f7`                                              | `#FBF6EE`                                              |
| `ink`             | `#1a1a1a`                                              | `#2E2620`                                              |
| `radius`          | `0px` (sharp, fashion-editorial)                       | `4px`                                                  |
| `fontDisplay`     | `Playfair Display`                                     | `Playfair Display` (campaign headlines only)           |
| `fontBody`        | `Inter`                                                | `Inter`                                                |
| `container`       | `1320px`                                               | `1320px`                                               |
| `density`         | `comfortable`                                          | `comfortable`                                          |
| `typeScale`       | `default`                                              | `default`                                              |
| `spaceUnit`       | `16px`                                                 | `16px`                                                 |
| `shadow`          | `soft`                                                 | `soft`                                                 |
| `motion`          | `subtle`                                               | `subtle`                                               |
| `digits`          | `latin`                                                | `latin`                                                |
| `locale`          | `en`                                                   | `en`                                                   |
| `currencyDisplay` | `symbol`                                               | `symbol`                                               |
| `fontPairing`     | `editorial-serif`                                      | `editorial-serif`                                      |
| `dark`            | `null` (light-only)                                    | designed set (`src/lib/themes/somvabona/tokens.ts:32`) |
| `globals`         | `DEFAULT_GLOBALS`                                      | `DEFAULT_GLOBALS`                                      |

Both themes keep bilingual EN/BN inline props on every user-facing string and a
BDT-first money display (symbol, Latin digits).

### Skins — base layer, style keys (not a second theme system)

Skins are the second half of the same base layer: a closed style-key
vocabulary on top of tokens, never a parallel theme system. Core
vocabulary and core defaults live in `src/lib/builder-ast.ts:738`
(`WIDGET_SKINS`) and `src/lib/builder-ast.ts:756` (`DEFAULT_WIDGET_SKIN`).
Every skinnable widget gains a `skin` select field in the style panel via
`SKIN_FIELD` (`src/lib/builder-ast.ts:787`); the first option is the documented
default. Unknown or empty values resolve to the widget default through
`resolveSkin` (`src/lib/builder-ast.ts:777`) — never a crash,
never empty. Skin values are style keys, never copy, so they carry no `_bn`
twins (bilingual props are declared per widget in `BITEXT_FIELDS`,
`src/lib/builder-ast.ts:5781`).

| Widget          | Core vocab (first = core default) | Songoskriti default                           | Somvabona default |
| --------------- | --------------------------------- | --------------------------------------------- | ----------------- |
| `product_rail`  | `editorial`, `compact`, `minimal` | `editorial`                                   | `compact`         |
| `hero_carousel` | `split`, `fullbleed`, `minimal`   | `split`                                       | `fullbleed`       |
| `testimonials`  | `carousel`, `wall`, `single`      | `wall`                                        | `carousel`        |
| `product_grid`  | `cards`, `rows`                   | `cards`                                       | `rows`            |
| `urgency_rail`  | `editorial`, `compact`, `minimal` | — (shares the `product_rail` shape by design) | `compact`         |

Theme defaults merge **under** authored props: merchant inspector values always
win (`withSongoskritiDefaults` in `src/lib/themes/songoskriti/skins.ts:109`,
`withSomvabonaWidgetDefaults` in `src/lib/themes/somvabona/skins.ts:113`).
Theme-side vocab sets: `SONGOSKRITI_SKIN_SETS`
(`src/lib/themes/songoskriti/skins.ts:35`), `SONGOSKRITI_WIDGET_DEFAULTS`
(`src/lib/themes/songoskriti/skins.ts:52`), `SOMVABONA_WIDGET_DEFAULTS`
(`src/lib/themes/somvabona/skins.ts:40`).

### Homepage composition — what ships

Songoskriti ships a 21-section homepage with `hero_carousel` first
(`src/lib/themes/songoskriti/homepage.ts:31`): `hero_carousel`,
`department_grid`, `product_rail`, `craft_story`, `product_rail`,
`split_feature`, `product_rail`, `recently_viewed`, `finder_row`,
`split_feature`, `product_rail`, `product_rail`, `split_feature`,
`collection_story`, `product_rail`, `craft_story`, `ugc_gallery`,
`testimonials`, `split_feature`, `trust_footer`, `store_locator`.

Somvabona ships a 12-section homepage on 11 distinct types (the urgency rail
doubles): `announcement_bar`, `hero_carousel`, `trust_marquee`,
`circle_categories`, `price_buckets`, `urgency_rail` × 2, `occasion_matrix`,
`recently_viewed`, `store_locator`, `craft_story`, `testimonials`
(`src/lib/themes/somvabona/homepage.ts:22`).

### Studio twin parity contract

Every `SECTION_CATALOG` entry in `builder-ast` must resolve in the studio
`WIDGET_BY_KEY` map (`src/lib/studio/catalog.ts:2701`) so it stays editable in
the studio. Defaults mirror the base defaults 1:1 — including the `skin`
default for skinnable types (first-option convention) and an empty `_bn` twin
for every `BITEXT_FIELDS` key (`src/lib/builder-ast.ts:5781`).

- Intentional exclusions only: `page_content` (context slot, zero fields) and
  `plugin_block` (covered by the `app-block` twin) — see the exclusion note in
  `src/lib/studio/catalog.ts:2457`.
- Account-template twins are context-gated: `orders_list` and `profile_card`
  (base group `commerce`, template `account`), with bitext kinds mirroring the
  base fields; neither type is skinnable, so neither carries a `skin` key.
- Thin twins (`finder_row`, `testimonials`, `trust_footer`, `trust_marquee`,
  `price_buckets`, `occasion_matrix`, `urgency_rail`, plus the account twins)
  carry the full base content schema and the documented default skin where
  skinnable.
- Pinned by the `studio twin parity` suite in `src/lib/studio/catalog.test.ts:843`.

### Persist-shape rule

Persisted props are rebuilt from catalog fields only — a theme or editor can
never smuggle unknown props onto a node:

- `parseSection` (`src/lib/builder-ast.ts:7177`) rebuilds the props object
  field-by-field (`coerceProp` in `src/lib/builder-ast.ts:7251`); each value
  passes through `coerceProp` against its field schema, unknown keys are
  dropped, and breakpoint overrides accept only responsive-capable fields
  (`src/lib/builder-ast.ts:7289`).
- `withThemeWidgetDefaults` (`src/lib/builder-ast.ts:873`) merges theme
  defaults only for catalog-known keys (base defaults plus field keys).

### Dashboard-menu data flow

Dashboard-designed menus win whenever a menu location is claimed; the shared
fallback tree covers theme-shaped stores only, and generic stores keep prior
behavior exactly — empty when no menu claims the location
(`assembleHeaderData` in `src/components/store/StoreHeader.tsx:156`,
fallback selection in `:172`):

- `menus.header` / `selectMobileMenu(menus)` (mobile selection in
  `src/lib/menus/menu.ts:446`) are preferred; the fallback is the neutral
  `HEADER_FALLBACK_MENU` (`src/lib/header-copy.ts:21`, re-exported for
  compatibility as `SONGOSKRITI_MEGA_MENU` from
  `src/lib/themes/songoskriti/header-fallback.ts:16`). Generic stores keep
  prior behavior exactly — empty when no menu claims the location.
- The Bangla twin table `HEADER_MENU_BN`
  (`src/lib/header-copy.ts:185`, via `headerMenuLabel` in `:233`) covers the
  fallback tree only. Dashboard nodes carry no `_bn` field and render
  as-authored in every locale.

### Preview engine and focus links

In-preview navigation maps demo links onto the preview's own template tabs so
every tap shows authored demo content; the module is theme-agnostic by design
(it never names a theme — themes plug in through the `PreviewThemeSource`
port). Key entry points in `src/lib/theme-preview-nav.ts`:

- `previewTargetForHref` (`:51`) and `previewTemplateForHref` (`:100`) resolve a
  link to a template tab; `previewClickAction` (`:109`) and
  `handlePreviewCanvasClick` (`:143`) keep taps inside the frame, while
  unmapped links (external, `tel:`, `mailto:`, anchors) keep default browser
  behavior. Account/sign-in paths are blocked (`isPreviewBlockedHref`, `:46`).
- Focus links use the `?focus=` contract — never `?slug=`
  (`:228`) — parsed by `validateThemePreviewSearch` (`:255`), which also
  carries the template plus the raw search query for tab switches
  (`previewSearchForSwitch`, `:234`).
- `resolveDemoFocus` (`:474`) matches the focus slug against the demo catalog
  (collections, categories, products); `applyDemoFocus` (`:515`) retargets the
  first heading, the first collection-sourced rail, and known-art product
  media, leaving the authored AST untouched. Templates a theme does not author
  get a generic engine-synthesized demo body (`assemblePreviewTemplates`,
  `:377`; `resolveThemePreview`, `:404`), so no link lands on an empty page.

### Token-only CSS gate

Theme skin stylesheets are token-only: every value reads `var(--theme-*)`;
washes use `color-mix()` over theme tokens, so a merchant re-tint re-skins
every rule automatically. Motion collapses under `prefers-reduced-motion`.
Enforced per theme by test:

- Songoskriti: `stays token-driven: theme vars only, no hex literals` in
  `src/lib/themes/songoskriti/skins.test.ts:182` (every default skin keyed off
  `[data-widget]` + `[data-skin]`, reduced-motion asserted alongside).
- Somvabona: `is token-driven: no hex literals or raw colour utilities` in
  `src/lib/themes/somvabona/skins.test.ts:166` (asserts `var(--theme-brand)`,
  `var(--theme-surface)`, `var(--theme-ink)`, `var(--theme-accent)`).

### History map — where each superseded doc went

| Superseded doc              | Content now lives                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme-runtime.md`          | Publish pipeline, preview isolation, failure table: Purpose/State machine/Failure sections above; token channel and preview engine in the theme reference                                   |
| `theme-registry.md`         | Install/update/rollback lifecycle, pins, revisions: Phase C, Studio UI, and Persist-shape sections above                                                                                    |
| `themes-catalog.md`         | Official theme visuals: Tokens and Skins tables above (planning-only catalog copy retired in favor of built values)                                                                         |
| `theme-authoring-export.md` | Fonts, export, coded-theme SDK: stays a TODO companion; the shipped subset (global widgets, token-only styling, no `themeKey` branches) is stated in the Skins and Token-only gate sections |
| `sections-templates.md`     | Slots, templates, AST shape: Studio twin parity and Persist-shape sections above; scheduling surfaces live in [the publishing contract](publishing.md)                                      |
