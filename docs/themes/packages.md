# Theme Packages (third-party developer spec)

> **NOTE — validator built; spec field names mapped below.** The validator
> module now exists (`src/lib/theme-package.ts`): the canonical gate is
> `validateThemeManifest`, and the spec name `validateThemePackage` is a
> true alias of it (one implementation). Package installs flow through
> `parseTokens`/`parseTemplates`
> (`src/lib/builder-ast.ts`) at
> `marketplace-install.server.ts:601-606` (inside `materializeListingTheme`).
> The validator itself checks the manifest shape only — it never calls
> `parseTemplates` / `parseTokens` / `lintTemplate`, never measures payload
> bytes, and never counts sections. Everything below is the
> preserved design spec for that module — field rules here use the
> spec names; the enforced manifest fields are mapped under Manifest
> fields. For the live install path, see
> [the SDK registry pipeline](./sdk.md).

Third-party themes ship as JSON packages: `tokens` + `templates` + manifest.
Packages are validated by `validateThemePackage` (`src/lib/theme-package.ts`),
which reuses the in-repo guards byte-identically — no raw HTML ever executes.

Spec → manifest field mapping (enforced names): `nameEn` → `name`
(required), `nameBn` → `nameBn` (required), `summaryEn` → `description`
(optional), `summaryBn` → `descriptionBn` (optional). `category`,
`sortOrder`, and `tokens` have no manifest counterpart (curation-only
metadata). The `templates` row below is the design-spec template map; the
enforced field is the declared template-key subset (`templates`).

## Manifest fields

| Field       | Rules                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `key`       | 1–60 chars, slug (`[a-z0-9-]`). Never renamed after publish.                                               |
| `nameEn`    | English display name (required).                                                                           |
| `nameBn`    | Bengali display name (required).                                                                           |
| `summaryEn` | English one-line summary (required).                                                                       |
| `summaryBn` | Bengali one-line summary (required).                                                                       |
| `category`  | Storefront category, e.g. `fashion` (required).                                                            |
| `version`   | Semver (`1.0.0`). Bump on every resubmission.                                                              |
| `api`       | Builder API range. Must fall inside `^3.0.0` (major 3); anything else is rejected to avoid version skew.   |
| `sortOrder` | Marketplace ordering weight (default `50`).                                                                |
| `tokens`    | Token bag accepted by `parseTokens`.                                                                       |
| `templates` | Template map accepted by `parseTemplates`. Unknown route keys are dropped — packages cannot invent routes. |

## Gates — enforced by `validateThemeManifest` (`src/lib/theme-package.ts:280`)

The validator checks the manifest shape only (fail-closed: malformed input
returns `manifest.invalid` at `src/lib/theme-package.ts:282-284,550-552`).
Each check below pins the code that performs it. Payload and template-content
checks live in later pipeline stages — see the next section — and the
spec-only budgets live under Aspirational.

1. **Slug:** `key` matches `THEME_KEY_RE` (`src/lib/theme-package.ts:54`),
   checked at `:290-293`.
2. **Bilingual names:** `name` / `nameBn` are both required
   (`src/lib/theme-package.ts:296-308`); over-length and executable text are
   rejected (`MAX_NAME_LEN` at `:224`, `EXECUTABLE_RE` at `:193-194`).
3. **Version:** strict semver via `parseSemver`
   (`src/lib/marketplace-scopes.ts:155`), checked at
   `src/lib/theme-package.ts:311-313`.
4. **API compatibility:** `api` must be a caret / `>=a <b` range covering the
   running builder via `satisfiesApiRange`
   (`src/lib/plugin-manifest.ts:311`; range `THEME_API_RANGE = ^3.0.0` at
   `src/lib/theme-package.ts:51`), checked at
   `src/lib/theme-package.ts:316-320`.
5. **Templates subset:** `templates` is a non-empty, duplicate-free subset of
   `TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-59`), checked at
   `src/lib/theme-package.ts:357-376`. Unknown keys are rejected — packages
   cannot invent routes.
6. **Catalog widgets:** every `supportedWidgets` entry must exist in
   `WIDGET_TYPES` (`src/lib/widget-registry.ts:951`, `SectionType` in
   `src/lib/builder-ast.ts:212`), checked at
   `src/lib/theme-package.ts:378-400`. Unknown widget types are rejected.
7. **Plugin refs:** `pluginDependencies` must be `plugin:{id}` /
   `plugin:{id}/{widget}` refs (`src/lib/theme-package.ts:178,180-181`,
   shapes from `pluginWidgetKey` / `parsePluginWidgetKey` at
   `src/lib/plugin-manifest.ts:295-306`) plus an exact / caret / pair version
   range, checked at `src/lib/theme-package.ts:402-433`.
8. **Surfaces:** `presentationSurfaces` is a non-empty, duplicate-free subset
   of the closed `PRESENTATION_SURFACES`
   (`src/lib/theme-package.ts:68-74`), checked at `:435-458`.
9. **Locales:** `locales` is a non-empty, duplicate-free subset of the closed
   `THEME_LOCALES` (`src/lib/theme-package.ts:78`), checked at `:460-479`.
10. **Assets:** `assetManifest` entries need a portable relative path plus a
    lowercase sha256 (`SHA256_RE` at `src/lib/theme-package.ts:221`),
    checked at `:481-508`. Traversal / absolute paths are rejected by
    `assetPathIssue` (`:261-277`), and executable extensions by
    `EXECUTABLE_ASSET_EXTS` (`:202-219`).
11. **Capabilities:** closed read-only allowlist `THEME_CAPABILITIES`
    (`src/lib/theme-package.ts:104-110`, subset of `SCOPES` at
    `src/lib/marketplace-scopes.ts:24`); unknown scopes are rejected,
    non-allowlisted scopes are `capabilities.forbidden:*`, and
    `render_storefront` is mandatory — all at
    `src/lib/theme-package.ts:510-526`.
12. **No executable text:** manifest free-text (`name`, `nameBn`, `author`,
    `description`, `descriptionBn`) is scanned with `EXECUTABLE_RE`
    (`src/lib/theme-package.ts:193-194`), enforced at
    `:301,308,329,340,347,351`. A present-but-untranslated `description`
    only warns (`description.bn_missing` at `:354-355`) — it does not fail.

Spec alias: `validateThemePackage` is the same function
(`src/lib/theme-package.ts:560`).

## Template / payload gates — enforced elsewhere, NOT by the validator

These run in the install / publish pipeline, never inside
`validateThemeManifest` (which has no `parseTemplates` / `parseTokens` /
`lintTemplate` call). At HEAD no install or publish path calls
`validateThemeManifest` — the wiring below is the live enforcement.

- **AST parse:** `parseTemplates` / `parseTokens`
  (`src/lib/builder-ast.ts`) run in the marketplace materialization at
  `src/lib/marketplace-install.server.ts:601-606` (inside
  `materializeListingTheme`, `:589-609`); parse failure throws
  `market_materialize_failed` (`:607-609`). Registry reads parse the same
  way at `src/lib/themes.server.ts:655-656`. Listing-manifest structure on
  the ledger path is gated separately by `validateBundle`
  (`src/lib/marketplace-scopes.ts:208`) at
  `src/lib/marketplace-install.server.ts:239-242`.
- **Lint errors:** `lintTemplate` (`src/lib/builder-ast.ts:7853`) errors
  block publish at `src/lib/themes.server.ts:430-434` and block registry
  updates at `:948-953`.
- **Single-H1:** the duplicate-claimant error is
  `src/lib/builder-ast.ts:7989-7998` (route-aware zero-claimant hint at
  `:7904-7910`; route-supplied templates at `:68-75`). Enforced at the same
  publish / update call sites above, not by the validator.
- **bn coverage:** the ≥90% বাংলা floor is `TRANSLATION_PUBLISH_FLOOR = 90`
  (`src/lib/builder-guardrails.ts:148`) via `translationGate` (`:166-179`),
  wired into publish at `src/lib/themes.server.ts:437-439` and composed in
  `composePublishGate` at `:455-456`.
- **Executable URLs in props:** blocked by the parse-time sanitiser —
  `javascript:` / `data:` / `vbscript:` and protocol-relative URLs rejected
  (`src/lib/builder-ast.ts:6960-6971`), `SAFE_HREF` at `:6994`,
  `safeEmbedUrl` at `:7005-7018`, text stripping at `:6983-6992`. The
  validator's executable ban covers manifest free-text and asset extensions
  only (see gate 10 / 12 above).
- **Payload ceilings:** the live caps are `AST_LIMITS`
  (`src/lib/builder-ast.ts:7419-7428`): serialized templates + tokens
  ≤ 512_000 chars (`maxPayloadChars` at `:7422`), ≤ 60 sections per slot
  (`MAX_SECTIONS_PER_SLOT` at `:7416`), ≤ 300 nodes per template
  (`MAX_NODES_PER_TEMPLATE` at `:405`), depth ≤ 6 (`MAX_TREE_DEPTH` at
  `:404`) — enforced by `assertPayloadWithinLimits` at `:7450-7461` and by
  truncation / slicing in `parseAst` (`:7466,7472`).

## Aspirational — NOT enforced anywhere (do not cite as validator errors)

No `MAX_PACKAGE_BYTES` (2 MB cap) and no `MAX_SECTIONS_PER_TEMPLATE`
(200-section budget) exist in `src/` — verified by search, no matches. Do
not document them as enforced until an implementation lands. Likewise,
validator-level `lintTemplate` / single-H1 / bn ≥ 0.9 gates do not exist:
those checks run only at the publish / update stages pinned above.

## Submit flow

Build in the builder → Export package → submit via the Themes screen.
Review checks the `validateThemeManifest` errors above plus, separately, the
publish pipeline gates (lint, translation, font, contrast — see
`src/lib/themes.server.ts:430-456` and [the SDK registry
pipeline](./sdk.md)). Staff approve or reject with a note. Validator
rejections carry the `validateThemeManifest` reason codes; publish rejections
carry the pipeline codes (`builder.publish_blocked`,
`builder.registry_invalid`, `market_materialize_failed`) — the two sets are
not 1:1.
