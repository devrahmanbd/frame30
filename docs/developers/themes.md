# Build a third-party theme

Last verified 2026-09-26 against HEAD. This guide covers the full path
from a blank folder to an accepted theme submission. For authoring
internals read [the theme authoring reference](../themes/creation.md);
for runtime behavior (token channel, preview engine, persist shape, twin
parity) read [the builder runtime guide](../04-builder/README.md); for
the integrator contract (server functions, tables, registry pipeline)
read [the theme SDK](../themes/sdk.md); for package gates read [the
theme package spec](../themes/packages.md). This guide links to those
references instead of restating them.

## Copy the starter theme first

The fastest path is `examples/starter-theme/`, a minimal working theme
that demonstrates every contract below: `tokens.ts` holds
`STARTER_TOKENS`, `skins.ts` holds the closed vocabularies plus the
defaults-under-authored-props merge, `homepage.ts` holds header,
homepage, and footer builders, `preview.ts` implements the preview port,
`skins.css` stays token-only, and `starter-theme.test.ts` pins the five
gates (brand tokens, skin defaults, token-driven CSS, studio twin
parity, persist round trip). Copy the folder, rename the `STARTER_*`
exports, and change the values. The starter is not registered in
`src/lib/preview-sources.ts:14`, so it never affects the shipped
preview.

## Set brand tokens through ThemeTokens

Tokens are the only styling channel. The shape is `ThemeTokens` in
`src/lib/builder-ast.ts:6274` (19 required keys plus optional
`timezone` / `allowCustomerTimezone`), parsed by `parseTokens` in
`src/lib/builder-ast.ts:6396` and emitted as CSS variables by
`tokensToCss` in `src/lib/builder-ast.ts:6519`. Start from
`DEFAULT_TOKENS` in `src/lib/builder-ast.ts:6329`, then lock the two
shipped themes' columns as reference:

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

Both themes keep `fontPairing: editorial-serif` from `FONT_PAIRINGS` in
`src/lib/builder-ast.ts:6311`, and both seed `globals` from
`DEFAULT_GLOBALS` in `src/lib/theme-globals.ts:32`. Globals are the
merchant-editable palette; bindings are stored as `var(--fq-g-<id>)`
references built by `globalRef` in `src/lib/theme-globals.ts:58` and
emitted by `globalsToCss` in `src/lib/theme-globals.ts:138`. Change
brand, accent, surface, ink, and the layout knobs; keep bilingual
EN/BN inline props on every user-facing string and BDT-first money
display (symbol, Latin digits).

## Choose skins from the closed vocabulary

The core lane owns the `skin` prop: every skinnable widget gains a
**Skin** select field in the style panel via `SKIN_FIELD` in
`src/lib/builder-ast.ts:649`, with the closed vocabulary in
`WIDGET_SKINS` in `src/lib/builder-ast.ts:600` and the core default in
`DEFAULT_WIDGET_SKIN` in `src/lib/builder-ast.ts:618`. The first option
is the documented default. Unknown or empty values resolve to the
widget default through `resolveSkin` in
`src/lib/builder-ast.ts:639` — never a crash, never empty. Skin values
are style keys, never copy, so they carry no `_bn` twins.

| Widget          | Core vocab (first = core default) | Songoskriti default | Somvabona default |
| --------------- | --------------------------------- | ------------------- | ----------------- |
| `product_rail`  | `editorial`, `compact`, `minimal` | `editorial`         | `compact`         |
| `hero_carousel` | `split`, `fullbleed`, `minimal`   | `split`             | `fullbleed`       |
| `testimonials`  | `carousel`, `wall`, `single`      | `wall`              | `carousel`        |
| `product_grid`  | `cards`, `rows`                   | `cards`             | `rows`            |
| `urgency_rail`  | `editorial`, `compact`, `minimal` | — (core default)    | `compact`         |

Theme-side sets live in `SONGOSKRITI_SKIN_SETS` in
`src/lib/themes/songoskriti/skins.ts:35` with defaults in
`src/lib/themes/songoskriti/skins.ts:52`, and in
`SOMVABONA_WIDGET_DEFAULTS` in
`src/lib/themes/somvabona/skins.ts:40`. Wire them with
`withSongoskritiDefaults` in
`src/lib/themes/songoskriti/skins.ts:109` or
`withSomvabonaWidgetDefaults` in
`src/lib/themes/somvabona/skins.ts:113`: defaults merge **under**
authored props, so an explicit `skin` in the inspector always wins. The
shared helper behind both is `withThemeWidgetDefaults` in
`src/lib/builder-ast.ts:735`, which only merges catalogue-known keys so
a theme can never smuggle unknown props onto a node.

## Claim widget presentations through the registry

Tokens and skins above are one base layer — they change how every
widget looks, never what markup a widget emits. When a theme needs
different markup for a widget, it claims a `themeKey × widgetType`
presentation through the registry instead of forking the renderer:

- Claim pairs from the theme's own module init with
  `registerThemePresentation` in
  `src/lib/theme-presentations.ts:35`. First registration wins;
  duplicates warn and are ignored
  (`src/lib/theme-presentations.ts:57`). Registration never throws.
- The engine resolves the presentation first and falls back to the
  existing `resolveWidgetComponent` result when nothing is registered
  (`src/components/builder/SectionRenderer.tsx:272`, over
  `src/components/builder/theme-widgets.ts:45`), so unregistered
  pairs render exactly as before.
- Resolution never throws and never leaks another theme's brand:
  unknown, null, and missing keys return the fallback
  (`src/lib/theme-presentations.ts:72`, fallback at
  `src/lib/theme-presentations.ts:78`). The same-section /
  two-presentations proof lives in
  `src/lib/theme-presentations.test.tsx:137` (direct) and
  `src/lib/theme-presentations.test.tsx:162` (engine path).
- Shared code names no theme and branches on no theme
  (`src/lib/theme-presentations.test.tsx:194`), and the DoD suite pins
  the same rule for every builder renderer
  (`src/lib/definition-of-done.test.ts:138`). The one exemption is the
  studio token panel, which takes the installed theme key only to offer
  that theme's variation list
  (`src/components/builder/TokenEditor.tsx:229`) — editor chrome, never
  a storefront fork.

## Compose the homepage hero-first

Build the homepage as one function returning `Section[]`, wrapped so
theme skin defaults merge under authored props. Songoskriti builds
`buildHomepageMain` in `src/lib/themes/songoskriti/homepage.ts:23`
(first section at `src/lib/themes/songoskriti/homepage.ts:31`) and
ships a 21-section homepage opening on `hero_carousel`; Somvabona
builds `buildHomepageMain` in
`src/lib/themes/somvabona/homepage.ts:22` and ships a 12-section
homepage on 11 distinct types. The section shape is `Section` in
`src/lib/builder-ast.ts:306`, built through the `SectionBuilder`
callback in `src/lib/builder-ast.ts:336`; always construct through the
shared factory `sectionFactory` in `src/lib/theme-section.ts:61` so ids
stay unique and বাংলা props fill from a dictionary.

Three rules govern every template:

- The first section owns the H1 claim. `hero_carousel` is a
  heading-claiming widget (`src/lib/builder-ast.ts:4657`); route-headed
  templates (`product`, `collection`, `account`, `page`, `blog`,
  `search` in `src/lib/builder-ast.ts:68`) get theirs from the route
  and must not contain one. `lintTemplate` in
  `src/lib/builder-ast.ts:7288` enforces both directions.
- Every widget must sit in a legal slot. Templates are `{ header,
main, footer }` (`ThemeAst` in `src/lib/builder-ast.ts:341`) over the
  keys in `TEMPLATE_KEYS` in `src/lib/builder-ast.ts:46`; each
  catalogue entry declares its slots (for example `banner` allows
  header and main, `footer_sitemap` allows footer only). An illegal
  slot parses to a placeholder, never a crash.
- Props are flat scalars plus repeatable `PropRow[]` arrays (`PropValue`
  in `src/lib/builder-ast.ts:298`), capped at `MAX_ARRAY_ROWS = 24` in
  `src/lib/builder-ast.ts:300` with trees capped at `MAX_TREE_DEPTH`
  and `MAX_NODES_PER_TEMPLATE` in `src/lib/builder-ast.ts:303-304`. Never
  invent a prop — copy the key from the catalogue entry (`CatalogEntry`
  in `src/lib/builder-ast.ts:485`, lookup via `catalogEntry` in
  `src/lib/builder-ast.ts:6250`).

## Keep skins.css token-only

Theme skin stylesheets read only `var(--theme-*)`, keyed off the
renderer's `[data-widget]` + `[data-skin]` attributes. Washes use
`color-mix()` over theme tokens, so a merchant re-tint re-skins every
rule automatically; motion rules collapse under
`prefers-reduced-motion`. See `src/lib/themes/songoskriti/skins.css`
and `src/lib/themes/somvabona/skins.css`. The gate is enforced per
theme by test: `stays token-driven: theme vars only, no hex literals`
in `src/lib/themes/songoskriti/skins.test.ts:182`, and `is
token-driven: no hex literals or raw colour utilities` in
`src/lib/themes/somvabona/skins.test.ts:167`. A submission whose
stylesheet contains a hex literal fails the gate.

## Mirror every widget in the studio catalog

Every catalogue entry must resolve in the studio `WIDGET_BY_KEY` map
in `src/lib/studio/catalog.ts:2636` so it stays editable in the
studio. Defaults mirror the base defaults 1:1, including the `skin`
default for skinnable types and an empty `_bn` twin for every
`BITEXT_FIELDS` key. The contract is documented at
`src/lib/studio/catalog.ts:2418` and pinned by the `studio twin
parity` suite in `src/lib/studio/catalog.test.ts:837`. Intentional
exclusions only: `page_content` (context slot, zero fields) and
`plugin_block` (covered by the `app-block` twin). Before submitting,
resolve every type the theme emits through `catalogEntry` — an
unresolvable type is uneditable in the studio and fails review.

Persisted props are rebuilt from catalog fields only: `parseSection`
in `src/lib/builder-ast.ts:6822` rebuilds props field-by-field in
`src/lib/builder-ast.ts:6890`, drops unknown keys, and rides the বাংলা
sibling along in `src/lib/builder-ast.ts:6904`. A new `skin` value or
custom prop needs its catalogue field first, or the round trip drops
it. Verify with a JSON serialize-and-parse pass that skins and twins
survive, as the starter suite does.

## Wire the preview source

Theme previews render through a theme-agnostic engine: the theme only
implements the `PreviewThemeSource` port in
`src/lib/theme-preview-nav.ts:283`, and the registry wires it in.
Implement `songoskritiPreviewSource()` in
`src/lib/themes/songoskriti/preview.ts:40` (Somvabona mirrors it in
`src/lib/themes/somvabona/preview.ts:20`): `{ key, themeName, author,
tokens, header, footer, main }`, where `main(template, s)` returns the
authored demo body per template key or `null` for templates the theme
does not author. The port type lives in
`src/lib/theme-preview-nav.ts:283`. Register the source in
`src/lib/preview-sources.ts:14` — that map is the only place that
names themes for preview. The engine never imports a theme module
directly.

Unauthored templates get an engine-synthesized generic demo body via
`assemblePreviewTemplates` in `src/lib/theme-preview-nav.ts:345`
(`genericDemoMain` in `src/lib/theme-preview-nav.ts:322`), resolved per
key by `resolveThemePreview` in `src/lib/theme-preview-nav.ts:372`.
In-preview navigation maps demo links onto the preview's own template
tabs (`previewTargetForHref` in `src/lib/theme-preview-nav.ts:42`),
account and sign-in paths stay blocked (`isPreviewBlockedHref` in
`src/lib/theme-preview-nav.ts:37`), and focus links use the `?focus=`
contract, never `?slug=`.

## Write bilingual copy from the start

Only the props listed in `BITEXT_FIELDS` in
`src/lib/builder-ast.ts:5545` gain a `${key}_bn` sibling
(`product_rail` twins `heading` and `promise` in
`src/lib/builder-ast.ts:5650`; row-level copy such as slides and
testimonials is read directly by renderers). Fill twins at construction
with `withBn` in `src/lib/theme-section.ts:24` via the theme
dictionary passed to `sectionFactory`. Publishing is gated on বাংলা
coverage at or above `TRANSLATION_PUBLISH_FLOOR = 90` in
`src/lib/builder-guardrails.ts:148`: below 90 percent the publish is
blocked, so never paste English into a Bengali field. Keep BDT-first
money display (symbol, Latin digits) and never invent metrics,
ratings, or addresses in demo copy.

## Submit updates without breaking stores

Submit through the **Themes** screen with the exported package file;
the full gate list lives in [the theme package spec](../themes/packages.md)
and the worked example in
[example-studio.theme.json](../themes/example-studio.theme.json).
Publishing checks run server-side: clean `lintTemplate` per key in
`src/lib/themes.server.ts:395`, the translation gate in
`src/lib/themes.server.ts:401`, font licence and budget gates, then
`composePublishGate` from `src/lib/publish-gates.ts:262`, called at
`src/lib/themes.server.ts:419`. Publish moves
`store_themes.published_version_id` via `theme_publish` in
`src/lib/themes.server.ts:441`; rollback restores through
`theme_rollback` in `src/lib/themes.server.ts:456`. The update checklist:

1. Bump `version` with semver on every resubmission, rejections
   included. Never rename `key` after first publish.
2. Keep `api` inside `^3.0.0`.
3. Re-run the theme suites (wiring, skins, preview, twin parity)
   before exporting — a red gate now is a rejection later.
4. Confirm the persist round trip still keeps skins and `_bn` twins.
5. Confirm the preview source still returns `null`, not empty arrays,
   for unauthored templates.
