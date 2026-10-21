# Build a third-party theme

Last verified: 2026-10-22 @ 0a794b549315

Verification scope (2026-10-22): the template list, the customisable
surfaces, the placement rules, the presentation rules, the preview contract
and the platform-controlled actions were read against the shipped code at
`0a794b549315`; `node scripts/doc-gate.mjs` reports 0 findings, and the
repository's own test suite passes apart from three pre-existing,
environment-bound failures recorded in the phase-3 evidence record. Line pins
are working-tree lines: the pins this pass wrote or corrected point at the
declaration that owns the block, and older pins elsewhere in these documents
are best-effort pointers that may have drifted with the code.

This guide covers the full path from a blank folder to an accepted theme
submission.

## Two distribution models (Frame30)

Framique ships two distinct distribution models that share runtime
contracts (tenant isolation, validation, audit) but not packaging:

- **Official themes** (Songoskriti, Somvabona) are first-party source in
  this repo, registered in `src/lib/themes/builtin-themes.ts` and rendered
  through their trusted source modules. Installing one initializes the
  merchant's theme records from the source definition — no ZIP is built,
  installed, or downloadable. Image URLs stay source-form (`/ph/<theme>/`);
  package-relative `assets/` refs exist only inside ZIP payloads.
- **Custom themes** (this guide) are merchant/community ZIP packages:
  Upload → archive validation → manifest/API validation → security checks
  → isolated installation → sandboxed preview → merchant approval →
  activation, enforced by `src/lib/package-zip.ts` and the install
  pipeline. Failed uploads never touch the active theme or another tenant.

For authoring
internals read [the theme authoring reference](../themes/creation.md);
for runtime behavior (token channel, preview engine, persist shape, twin
parity) read [the builder runtime guide](../04-builder/README.md); for
the integrator contract (server functions, tables, registry pipeline)
read [the theme SDK](../themes/sdk.md); for package gates read [the
theme package spec](../themes/packages.md). This guide links to those
references instead of restating them.

## Pick your entry point

Two third-party lanes exist and they never mix. Pick the declarative
data-only lane when tokens, templates, and stylesheets are enough; pick the
reviewed executable lane ([Level B](../themes/level-b.md)) only when the
theme must ship executable code. The three-lane taxonomy — source themes,
data-only ZIPs, Level B bundles — is canonical in
[the package contract](../packages/contract.md), and this table is the
chooser:

|                      | Data-only theme (ZIP)                                                                 | Level B executable theme                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| You ship             | `theme.json` + tokens/templates/styles; no executable code                            | `dev.theme.json` + a JS/CSS bundle, assembled with `node scripts/build-dev-theme.mjs`                                                                                                                                                                     |
| Gate                 | `validateThemeManifest` (`src/lib/theme-package.ts:312`)                              | `validateDevThemeBundle` (`src/lib/dev-theme-bundle.ts:599`)                                                                                                                                                                                              |
| Compatibility        | `api` inside `^3.0.0` — and `>= 3.1.0` if the package declares the `archive` template | `runtime` pinned exactly to `DEV_THEME_RUNTIME_VERSION` (`src/lib/dev-theme-manifest.ts:22`)                                                                                                                                                              |
| Review               | install-pipeline gates, then publish from the Themes screen                           | fingerprint-bound review store, `createDevThemeReleaseStore` (`src/lib/dev-theme-review.ts:276`): submit → review → publish                                                                                                                               |
| Install / activation | install → merchant approval → activation                                              | install never activates; activation is per version and fingerprint (`installReviewedThemeBundle`, `src/lib/dev-theme-bundle-install.ts:543`; `activateDevThemeInstall`, `src/lib/dev-theme-activate.ts:377`)                                              |
| Runtime              | AST + tokens in the page DOM                                                          | `ThemeRuntime` iframe only (`src/components/theme-runtime/ThemeRuntime.tsx:187`): `sandbox="allow-scripts"` (`src/components/theme-runtime/ThemeRuntime.tsx:59`), null origin, `default-src 'none'` (`src/components/theme-runtime/ThemeRuntime.tsx:105`) |
| Start here           | This guide                                                                            | [The Level B lane](../themes/level-b.md)                                                                                                                                                                                                                  |

Lane separation is enforced in both directions: executable bytes in a ZIP
fail `assetManifest[].path.executable`, and a `theme.json` inside a
Level B bundle fails `bundle.wrong_lane`. Compatibility is declared, not
negotiated: keep the data-only `api` inside `^3.0.0`, and pin the Level B
`runtime` exactly — ranges and future pins are rejected, and activation
re-checks the pin before anything goes live. Security posture mirrors the
extension boundary: nothing runs outside the frame described in
[the sandbox boundary](security-sandbox.md), with the theme-specific limits
in [the theme runtime limits](../theme-runtime/limits.md).
[The theme SDK](../themes/sdk.md) is the integrator contract for the theme
surface, and `node scripts/build-dev-theme.mjs` assembles the Level B bundle
bytes whose fingerprint round-trips through the review store.

The third case — Framique's own source themes — is not an upload lane at all:
Songoskriti is source-owned official, not a downloadable template to upload as a package. <!-- doc-gate-ok: deliberate negative reference -->

## Theme widgets are universal in the editor

The studio follows one platform rule: **theme = dress, widget = body**
(`src/lib/widget-presentation.ts:25`). Widgets are global; a theme never owns
one. Registering a presentation (`registerThemePresentation`,
`src/lib/theme-presentations.ts:97`) only claims how the owning theme _dresses_
a widget — including theme-claimed widgets such as Songoskriti's
`theme:songoskriti/ornament` — and never gates the widget away from any other
theme.

What to rely on as a theme author:

- The [widget tray](../04-builder/README.md) lists theme widgets under
  **every** active theme; merchants insert and save them like any builtin
  (`resolveExtensionTrayEntries`,
  `src/components/builder/studio/StudioBuilder.tsx:836`).
- Only the owning theme's presentation dresses the render (`isThemeOwner`,
  `src/lib/widget-presentation.ts:575`). Under any other theme the widget
  renders its registered universal body (`registerGenericPresentation`,
  `src/lib/theme-presentations.ts:1006`, resolution
  `resolveGenericPresentation`, `src/lib/theme-presentations.ts:1038`), or
  fails closed to the placeholder when no body is registered — the
  "Widget preview unavailable" notice is retired for registered components.
- Presentations stay first-wins and warn-only on duplicates
  (`src/lib/theme-presentations.ts:103`), so a foreign claim can never crash
  a render or leak another theme's brand.

The dress rules themselves — tokens, skins, claims — are the rest of this
guide; the full reference lives in
[the theme authoring reference](../themes/creation.md).

## What a third-party theme can customise, and what it cannot

### The ten template keys a theme may ship

A theme may ship **any subset** of the ten supported keys — it ships the
templates it defines, and a key it does not ship falls back to the platform's
own surface. The keys are `TEMPLATE_KEYS`
(`src/lib/builder-ast.ts:46-61`):

| key          | the surface                                                  | customisable?                                                       |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `index`      | the landing page                                             | yes                                                                 |
| `product`    | the product detail                                           | yes — the frame around the route's product, variants and price      |
| `collection` | the product collection                                       | yes — the band, the toolbar, the pager; **not** the grid            |
| `search`     | the search results                                           | yes — the toolbar, the chips, the pager; **not** the results block  |
| `cart`       | the cart                                                     | yes — the arrangement and labels around the platform's cart widgets |
| `checkout`   | the checkout                                                 | yes — the frame only; **never** a form, an input or a price         |
| `account`    | the shopper's account                                        | yes — the frame around the route's dashboard                        |
| `page`       | a merchant's CMS page                                        | yes — the frame the merchant's own record sits in                   |
| `blog`       | the blog listing **and** the article detail, as two variants | yes — `blog_listing` and `blog_article`                             |
| `archive`    | the content archive — a category, a tag, an author           | yes — `archive_category`, `archive_tag`, `archive_author`           |

Two keys carry **closed variants** — one key, two genuinely different
compositions. The vocabulary is the only place a variant may be added
(`TEMPLATE_VARIANTS`, `src/lib/template-variants.ts:55-58`): `blog` owns
`listing` and `article`; `archive` owns `category`, `tag` and `author`. A
variant key is `<base>_<suffix>` in the **same** `templates` map — no
migration, no new table — and it resolves through the same machinery: the
variant first, then the base (`resolveVariantAst`,
`src/lib/template-variants.ts:280`). A suffix outside the table is not a key
the platform routes to, so it can never be authored.

**A third-party package that declares `archive` must declare an `api` range
whose lower bound is `>= 3.1.0`** — that is the API line the key landed in.
A package that declares no `archive` is unaffected and keeps `^3.0.0`. The
rule, the two admitted range shapes and the reason code
(`templates.archive_requires_api`) are in
[the package contract](../packages/contract.md) §2.1.

### Which widgets can be placed where

Every catalogue entry declares the templates it may live on (its
`templates:` allowlist) and the slots it may occupy. The allowlist is the
contract: a widget in a template it is not allowlisted for is a
**publish-blocking** "needs data this template does not provide" error, not
a rendering surprise. Seven of the allowlist rows carry `archive` —
`breadcrumb`, `category_header`, `pagination`, `empty_state`, `blog_archive`,
`blog_terms` and `blog_pager` — because those are the widgets an archive
page may legitimately carry. `product_grid` is **not** one of them: the grid
reads the host's product slot, and an archive has none.

Two widgets are **context widgets** — they read data the route owns rather
than props the merchant sets: the account's `profile_card` and
`orders_list`, and the checkout's `cart_lines`, `cart_summary`,
`checkout_steps` and `payment_methods`. A context widget renders only where
the route granted its slot.

### How to declare presentations and properties

**Presentations** dress a shared widget for one theme. Register them with
`registerThemePresentation` (`src/lib/theme-presentations.ts:97`) from the
theme's own module; the engine resolves the registered presentation first
and falls back to the shared renderer when nothing is registered
(`src/components/builder/SectionRenderer.tsx:800`). First registration wins,
duplicates warn and are ignored, and a foreign claim can never crash a
render or leak another theme's brand.

**Properties** come from the catalogue. A widget's inspector controls are
**schema-generated** from its `fields` — the client and the server call the
same validator, so what the merchant sees is what the publish gate checks.
The closed kind vocabulary is `PROP_KINDS`
(`src/lib/widget-props.ts`); an unknown kind fails closed rather than
falling back to a free-text input. A theme never invents a prop: copy the
key from the catalogue entry, because `parseSection` rebuilds props from
catalogue fields only and **drops** an undeclared key on the round trip.

**Theme-owned widgets** are the third option, for a capability that is
genuinely unique: one `WidgetDef` with a namespaced id
(`theme:<key>/<slug>`), a closed `propsSchema` and `defaults`, registered
with `registerWidget` (`src/lib/unified-widget-registry.ts:929`). They are
universal — the def stays insertable under every active theme — and under a
foreign theme the resolution walks owner → universal body → recoverable
fallback. The full contract is in
[the widget contract](../04-builder/app-blocks.md).

### How to preview

Wire a `PreviewThemeSource` (`src/lib/theme-preview-nav.ts:403`): `{ key,
themeName, author, tokens, header, footer, main }`, where `main(template, s)`
returns the authored demo body for a template key or a **variant** key, and
`null` for templates the theme does not author. Register the source in
`src/lib/preview-sources.ts:1-42` — that map is the only place that names
themes for preview; the engine never imports a theme module directly.

The preview host renders **every authored composition** over the theme's own
labelled demo data, and it agrees with the storefront by construction: the
same AST, the same linter and the same context slots serve both. The
preview's action policies are closed — navigation maps onto the preview's
own template tabs, account and sign-in paths are blocked, and `?focus=`
links resolve to demo rows. A preview never writes, never signs anyone in
and never reaches the merchant's live data.

### Which actions stay platform-controlled

Always, on every surface:

- **Search** — the query execution, the tenant scope and the result limit.
- **Cart and checkout** — the prices, the discounts, the stock, the totals,
  the order state and the payment rails. The theme's checkout body
  contributes no form and no input element.
- **Account** — the session, the shopper's own overview, the tab state and
  every write.
- **Publication** — the publication status and the permissions.
- **Extensions** — the sandbox, the capabilities and the bridge
  authorisation.

A theme may present all of them and may not authorise any of them.

## Copy the starter theme first

The fastest path is `examples/starter-theme/`, a minimal working theme
that demonstrates every contract below: `tokens.ts` holds
`STARTER_TOKENS`, `skins.ts` holds the closed vocabularies plus the
defaults-under-authored-props merge, `homepage.ts` holds header,
homepage, and footer builders, `preview.ts` implements the preview port,
`skins.css` stays token-only, and `starter-theme.test.ts` pins the five
gates (brand tokens, skin defaults, token-driven CSS, studio twin
parity, persist round trip). Copy the folder, rename the `STARTER_*`
exports, and change the values. The starter is not an official built-in
(`src/lib/themes/builtin-themes.ts:15`), so it never affects the shipped
preview.

## Set brand tokens through ThemeTokens

Tokens are the only styling channel. The shape is `ThemeTokens` in
`src/lib/builder-ast.ts:7089` (19 required keys plus optional
`timezone` / `allowCustomerTimezone`), parsed by `parseTokens` in
`src/lib/builder-ast.ts:7211` and emitted as CSS variables by
`tokensToCss` in `src/lib/builder-ast.ts:7353`. Start from
`DEFAULT_TOKENS` in `src/lib/builder-ast.ts:7144`, then lock the two
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
`src/lib/builder-ast.ts:7126`, and both seed `globals` from
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
`src/lib/builder-ast.ts:871`, with the closed vocabulary in
`WIDGET_SKINS` in `src/lib/builder-ast.ts:822` and the core default in
`DEFAULT_WIDGET_SKIN` in `src/lib/builder-ast.ts:840`. The first option
is the documented default. Unknown or empty values resolve to the
widget default through `resolveSkin` in
`src/lib/builder-ast.ts:861` — never a crash, never empty. Skin values
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
`src/lib/themes/somvabona/skins.ts:46`. Wire them with
`withSongoskritiDefaults` in
`src/lib/themes/songoskriti/skins.ts:109` or
`withSomvabonaWidgetDefaults` in
`src/lib/themes/somvabona/skins.ts:119`: defaults merge **under**
authored props, so an explicit `skin` in the inspector always wins. The
shared helper behind both is `withThemeWidgetDefaults` in
`src/lib/builder-ast.ts:957`, which only merges catalogue-known keys so
a theme can never smuggle unknown props onto a node.

## Claim widget presentations through the registry

Tokens and skins above are one base layer — they change how every
widget looks, never what markup a widget emits. When a theme needs
different markup for a widget, it claims a `themeKey × widgetType`
presentation through the registry instead of forking the renderer:

- Claim pairs from the theme's own module init with
  `registerThemePresentation` in
  `src/lib/theme-presentations.ts:97`. First registration wins;
  duplicates warn and are ignored
  (`src/lib/theme-presentations.ts:122`). Registration never throws.
- The engine resolves the presentation first and falls back to the
  existing `resolveWidgetComponent` result when nothing is registered
  (`src/components/builder/SectionRenderer.tsx:800`, over
  `src/components/builder/theme-widgets.ts:73`), so unregistered
  pairs render exactly as before.
- Resolution never throws and never leaks another theme's brand:
  unknown, null, and missing keys return the fallback
  (`src/lib/theme-presentations.ts:148`, fallback at
  `src/lib/theme-presentations.ts:151`). The same-section /
  two-presentations proof lives in
  `src/lib/theme-presentations.test.tsx:137` (direct) and
  `src/lib/theme-presentations.test.tsx:162` (engine path).
- Shared code names no theme and branches on no theme
  (`src/lib/theme-presentations.test.tsx:194`), and the DoD suite pins
  the same rule for every builder renderer
  (`src/lib/definition-of-done.test.ts:147`). The one exemption is the
  studio token panel, which takes the installed theme key only to offer
  that theme's variation list
  (`src/routes/_authenticated/dashboard/builder.tsx:137`; the map reaches `TokenEditor` as `variations[]` at `src/routes/_authenticated/dashboard/builder.tsx:2645`) — editor chrome, never
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
`src/lib/builder-ast.ts:412`, built through the `SectionBuilder`
callback in `src/lib/builder-ast.ts:518`; always construct through the
shared factory `sectionFactory` in `src/lib/theme-section.ts:61` so ids
stay unique and বাংলা props fill from a dictionary.

Three rules govern every template:

- The first section owns the H1 claim. `hero_carousel` is a
  heading-claiming widget (`src/lib/builder-ast.ts:4981`); route-headed
  templates (`product`, `collection`, `account`, `page`, `blog`,
  `search`, `archive` in `src/lib/builder-ast.ts:72`) get theirs from the
  route and must not contain one. `lintTemplate` in
  `src/lib/builder-ast.ts:8397` enforces both directions.
- Every widget must sit in a legal slot. Templates are `{ header,
main, footer }` (`ThemeAst` in `src/lib/builder-ast.ts:523`) over the
  keys in `TEMPLATE_KEYS` in `src/lib/builder-ast.ts:46`; each
  catalogue entry declares its slots (for example `banner` allows
  header and main, `footer_sitemap` allows footer only). An illegal
  slot parses to a placeholder, never a crash.
- Props are flat scalars plus repeatable `PropRow[]` arrays (`PropValue`
  in `src/lib/builder-ast.ts:404`), capped at `MAX_ARRAY_ROWS = 24` in
  `src/lib/builder-ast.ts:406` with trees capped at `MAX_TREE_DEPTH`
  and `MAX_NODES_PER_TEMPLATE` in `src/lib/builder-ast.ts:409-410`. Never
  invent a prop — copy the key from the catalogue entry (`CatalogEntry`
  in `src/lib/builder-ast.ts:707`, lookup via `catalogEntry` in
  `src/lib/builder-ast.ts:7065`).

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
`src/lib/themes/somvabona/skins.test.ts:166`. A submission whose
stylesheet contains a hex literal fails the gate.

## Mirror every widget in the studio catalog

Every catalogue entry must resolve in the studio `WIDGET_BY_KEY` map
in `src/lib/studio/catalog.ts:1756` so it stays editable in the
studio. Defaults mirror the base defaults 1:1, including the `skin`
default for skinnable types and an empty `_bn` twin for every
`BITEXT_FIELDS` key. The contract is documented at
`src/lib/studio/catalog.ts:1595` and pinned by the `studio twin
parity` suite in `src/lib/studio/catalog.test.ts:843`. Intentional
exclusions only: `page_content` (context slot, zero fields) and
`plugin_block` (covered by the `app-block` twin). Before submitting,
resolve every type the theme emits through `catalogEntry` — an
unresolvable type is uneditable in the studio and fails review.

Persisted props are rebuilt from catalog fields only: `parseSection`
in `src/lib/builder-ast.ts:7670` rebuilds props field-by-field in
`src/lib/builder-ast.ts:7745`, drops unknown keys, and rides the বাংলা
sibling along in `src/lib/builder-ast.ts:7756`. A new `skin` value or
custom prop needs its catalogue field first, or the round trip drops
it. Verify with a JSON serialize-and-parse pass that skins and twins
survive, as the starter suite does.

## Wire the preview source

Theme previews render through a theme-agnostic engine: the theme only
implements the `PreviewThemeSource` port in
`src/lib/theme-preview-nav.ts:403`, and the registry wires it in.
Implement `songoskritiPreviewSource()` in
`src/lib/themes/songoskriti/preview.ts:70` (Somvabona mirrors it in
`src/lib/themes/somvabona/preview.ts:29`): `{ key, themeName, author,
tokens, header, footer, main }`, where `main(template, s)` returns the
authored demo body per template key or `null` for templates the theme
does not author. Installed merchant themes resolve from their installed
artifact content (`previewSourceFor`, `src/lib/preview-sources.ts:139`;
installed branch at `src/lib/preview-sources.ts:149`), official themes
resolve from the built-in registry (`src/lib/themes/builtin-themes.ts:33`),
and static sources exist for tests and build tooling
(`registerStaticPreviewSource`, `src/lib/preview-sources.ts:44`). The
engine never imports a theme module directly.

Unauthored templates get an engine-synthesized generic demo body via
`assemblePreviewTemplates` in `src/lib/theme-preview-nav.ts:496`
(`genericDemoMain` in `src/lib/theme-preview-nav.ts:473`), resolved per
key by `resolveThemePreview` in `src/lib/theme-preview-nav.ts:572`.
In-preview navigation maps demo links onto the preview's own template
tabs (`previewTargetForHref` in `src/lib/theme-preview-nav.ts:59`),
account and sign-in paths stay blocked (`isPreviewBlockedHref` in
`src/lib/theme-preview-nav.ts:54`), and focus links use the `?focus=`
contract, never `?slug=`.

## Write bilingual copy from the start

Only the props listed in `BITEXT_FIELDS` in
`src/lib/builder-ast.ts:5883` gain a `${key}_bn` sibling
(`product_rail` twins `heading` and `promise` in
`src/lib/builder-ast.ts:5988`; row-level copy such as slides and
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
`src/lib/themes.server.ts:921`, the translation gate in
`src/lib/themes.server.ts:924-926`, font licence and budget gates, then
`composePublishGate` from `src/lib/publish-gates.ts`, called at
`src/lib/themes.server.ts:946`. Publish moves
`store_themes.published_version_id` via `theme_publish` in
`src/lib/themes.server.ts:1003`; rollback restores through
`theme_rollback` in `src/lib/themes.server.ts:1043`. The update checklist:

1. Bump `version` with semver on every resubmission, rejections
   included. Never rename `key` after first publish.
2. Keep `api` inside `^3.0.0` — and, if the package declares the
   `archive` template, declare a range whose lower bound is `>= 3.1.0`
   (the reason code is `templates.archive_requires_api`).
3. Re-run the theme suites (wiring, skins, preview, twin parity)
   before exporting — a red gate now is a rejection later.
4. Confirm the persist round trip still keeps skins and `_bn` twins.
5. Confirm the preview source still returns `null`, not empty arrays,
   for unauthored templates.
6. Expect re-consent on widening updates: a version that adds
   external hosts or custom HTML over the installed line fails with
   `package.consent_required` unless the update covers every addition
   (`src/lib/package-install.server.ts:1027`).
7. Expect an approval gate on flagged content: activation of a
   scan-flagged version is refused with `theme.approval_required`
   until the merchant records `approveThemeVersion`
   (`src/lib/themes/appearance.server.ts:1166`), audited as
   `theme.approved`.
