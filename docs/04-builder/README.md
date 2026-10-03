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

Ten official themes now ship a complete template hierarchy (`index`, `product`,
`collection`, `page`, `blog`, `cart`, `checkout`), each with header/main/footer
slots, responsive breakpoint overrides and the context widgets the template
requires.

- Source of truth: `src/lib/theme-presets.ts` (typed, version `2.0.0`).
  `theme_registry` holds catalogue metadata only, so SQL and runtime cannot drift.
- Install path: `theme_install_preset(_merchant_id, _key, _preset)` — the server
  parses and lints the package before the RPC writes a draft version; any lint
  error rejects the install and the merchant keeps their last-good theme.
- Guard rails: `src/lib/theme-presets.test.ts` asserts token validity, template
  completeness, lossless AST parsing, unique section ids and a clean lint for
  every theme and every template.

---

## Authoritative theme reference (merged from built code)

The sections below replace the overlapping planning docs listed in the banner.
All values match HEAD; stale planning brand locks are void.

### Tokens — the only styling channel

Shape: `ThemeTokens` in `src/lib/builder-ast.ts:6274` (19 required keys, plus
optional `timezone` / `allowCustomerTimezone`). Published tokens reach the
storefront as CSS variables on the store root, and theme CSS may only read
`var(--theme-*)` (see the token-only CSS gate below).

| Token             | Songoskriti (`src/lib/themes/songoskriti/tokens.ts:9`) | Somvabona (`src/lib/themes/somvabona/tokens.ts:14`) |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------- |
| `brand`           | `#1a1a1a`                                              | `#7C2A1A`                                           |
| `accent`          | `#8B4513`                                              | `#B95A38`                                           |
| `surface`         | `#faf9f7`                                              | `#FBF6EE`                                           |
| `ink`             | `#1a1a1a`                                              | `#2E2620`                                           |
| `radius`          | `0px` (sharp, fashion-editorial)                       | `4px`                                               |
| `fontDisplay`     | `Playfair Display`                                     | `Playfair Display` (campaign headlines only)        |
| `fontBody`        | `Inter`                                                | `Inter`                                             |
| `container`       | `1320px`                                               | `1320px`                                            |
| `density`         | `comfortable`                                          | `comfortable`                                       |
| `typeScale`       | `default`                                              | `default`                                           |
| `spaceUnit`       | `16px`                                                 | `16px`                                              |
| `shadow`          | `soft`                                                 | `soft`                                              |
| `motion`          | `subtle`                                               | `subtle`                                            |
| `digits`          | `latin`                                                | `latin`                                             |
| `locale`          | `en`                                                   | `en`                                                |
| `currencyDisplay` | `symbol`                                               | `symbol`                                            |
| `fontPairing`     | `editorial-serif`                                      | `editorial-serif`                                   |
| `dark`            | `null` (light-only)                                    | `null` (light-only)                                 |
| `globals`         | `DEFAULT_GLOBALS`                                      | `DEFAULT_GLOBALS`                                   |

Both themes keep bilingual EN/BN inline props on every user-facing string and a
BDT-first money display (symbol, Latin digits).

### Skins — closed vocabularies and defaults

Core vocabulary and core defaults live in `src/lib/builder-ast.ts:600`
(`WIDGET_SKINS`) and `src/lib/builder-ast.ts:618` (`DEFAULT_WIDGET_SKIN`).
Every skinnable widget gains a `skin` select field in the style panel via
`SKIN_FIELD` (`src/lib/builder-ast.ts:649`); the first option is the documented
default. Unknown or empty values resolve to the widget default — never a crash,
never empty. Skin values are style keys, never copy, so they carry no `_bn`
twins (bilingual props are declared per widget in `BITEXT_FIELDS`,
`src/lib/builder-ast.ts:5545`).

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
`WIDGET_BY_KEY` map so it stays editable in the studio. Defaults mirror the
base defaults 1:1 — including the `skin` default for skinnable types
(first-option convention) and an empty `_bn` twin for every `BITEXT_FIELDS`
key (`src/lib/studio/catalog.ts:2418`).

- Intentional exclusions only: `page_content` (context slot, zero fields) and
  `plugin_block` (covered by the `app-block` twin).
- Account-template twins are context-gated: `orders_list` and `profile_card`
  (base group `commerce`, template `account`), with bitext kinds mirroring the
  base fields; neither type is skinnable, so neither carries a `skin` key.
- Thin twins (`finder_row`, `testimonials`, `trust_footer`, `trust_marquee`,
  `price_buckets`, `occasion_matrix`, `urgency_rail`, plus the account twins)
  carry the full base content schema and the documented default skin where
  skinnable.
- Pinned by the `studio twin parity` suite in `src/lib/studio/catalog.test.ts:837`.

### Persist-shape rule

Persisted props are rebuilt from catalog fields only — a theme or editor can
never smuggle unknown props onto a node:

- `parseSection` (`src/lib/builder-ast.ts:6822`) rebuilds the props object
  field-by-field (`src/lib/builder-ast.ts:6890`); each value passes through
  `coerceProp` against its field schema, unknown keys are dropped, and
  breakpoint overrides accept only responsive-capable fields.
- `withThemeWidgetDefaults` (`src/lib/builder-ast.ts:735`) merges theme
  defaults only for catalog-known keys (base defaults plus field keys).

### Dashboard-menu data flow

Dashboard-designed menus win whenever a menu location is claimed; the hardcoded
tree is the fallback for songoskriti-shaped stores only
(`src/components/store/StoreHeader.tsx:213`–`219`):

- `menus.header` / `selectMobileMenu(menus)` (mobile selection in
  `src/lib/menus/menu.ts:446`) are preferred; the fallback is
  `SONGOSKRITI_MEGA_MENU` (`src/components/store/StoreHeader.tsx:24`).
  Generic stores keep prior behavior exactly — empty when no menu claims the
  location.
- The Bangla table `SONGOSKRITI_MENU_BN`
  (`src/components/store/StoreHeader.tsx:134`) covers the hardcoded fallback
  tree only. Dashboard nodes carry no `_bn` field and render as-authored in
  every locale.

### Preview engine and focus links

In-preview navigation maps demo links onto the preview's own template tabs so
every tap shows authored demo content; the module is theme-agnostic by design
(it never names a theme — themes plug in through the `PreviewThemeSource`
port). Key entry points in `src/lib/theme-preview-nav.ts`:

- `previewTargetForHref` (`:42`) and `previewTemplateForHref` (`:91`) resolve a
  link to a template tab; `previewClickAction` (`:100`) and
  `handlePreviewCanvasClick` (`:134`) keep taps inside the frame, while
  unmapped links (external, `tel:`, `mailto:`, anchors) keep default browser
  behavior. Account/sign-in paths are blocked (`isPreviewBlockedHref`, `:37`).
- Focus links use the `?focus=` contract — never `?slug=`
  (`:219`) — parsed by `validateThemePreviewSearch` (`:246`), which also
  carries the template plus the raw search query for tab switches
  (`previewSearchForSwitch`, `:225`).
- `resolveDemoFocus` (`:411`) matches the focus slug against the demo catalog
  (collections, categories, products); `applyDemoFocus` (`:451`) retargets the
  first heading, the first collection-sourced rail, and known-art product
  media, leaving the authored AST untouched. Templates a theme does not author
  get a generic engine-synthesized demo body (`assemblePreviewTemplates`,
  `:345`; `resolveThemePreview`, `:372`), so no link lands on an empty page.

### Token-only CSS gate

Theme skin stylesheets are token-only: every value reads `var(--theme-*)`;
washes use `color-mix()` over theme tokens, so a merchant re-tint re-skins
every rule automatically. Motion collapses under `prefers-reduced-motion`.
Enforced per theme by test:

- Songoskriti: `stays token-driven: theme vars only, no hex literals` in
  `src/lib/themes/songoskriti/skins.test.ts:182` (every default skin keyed off
  `[data-widget]` + `[data-skin]`, reduced-motion asserted alongside).
- Somvabona: `is token-driven: no hex literals or raw colour utilities` in
  `src/lib/themes/somvabona/skins.test.ts:167` (asserts `var(--theme-brand)`,
  `var(--theme-surface)`, `var(--theme-ink)`, `var(--theme-accent)`).

### History map — where each superseded doc went

| Superseded doc              | Content now lives                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme-runtime.md`          | Publish pipeline, preview isolation, failure table: Purpose/State machine/Failure sections above; token channel and preview engine in the theme reference                                   |
| `theme-registry.md`         | Install/update/rollback lifecycle, pins, revisions: Phase C, Studio UI, and Persist-shape sections above                                                                                    |
| `themes-catalog.md`         | Official theme visuals: Tokens and Skins tables above (planning-only catalog copy retired in favor of built values)                                                                         |
| `theme-authoring-export.md` | Fonts, export, coded-theme SDK: stays a TODO companion; the shipped subset (global widgets, token-only styling, no `themeKey` branches) is stated in the Skins and Token-only gate sections |
| `sections-templates.md`     | Slots, templates, AST shape: Studio twin parity and Persist-shape sections above; scheduling surfaces live in [the publishing contract](publishing.md)                                      |
