# Theme Packages (third-party developer spec)

Last verified: 2026-10-22 @ 0a794b549315

Verification scope (2026-10-22): the manifest gate, the template-key list, the
API range and the `archive` floor were read against the shipped code at
`0a794b549315`; `node scripts/doc-gate.mjs` reports 0 findings, and the
repository's own test suite passes apart from three pre-existing,
environment-bound failures recorded in the phase-3 evidence record. Line pins
are working-tree lines: the pins this pass wrote or corrected point at the
declaration that owns the block, and older pins elsewhere in these documents
are best-effort pointers that may have drifted with the code.

> **NOTE — validator built; spec field names mapped below.** The validator
> module now exists (`src/lib/theme-package.ts`): the canonical gate is
> `validateThemeManifest`, and the spec name `validateThemePackage` is a
> true alias of it (one implementation). Package installs flow through
> `parseTokens`/`parseTemplates`
> (`src/lib/builder-ast.ts`) at
> `src/lib/marketplace-install.server.ts:876-881` (inside `materializeListingTheme`).
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

## Which distribution lane?

Theme distribution has three lanes — pick one before building:

| Lane                                | You ship                                                              | Gate                     | Install / activation                             | Full spec                                                                     |
| ----------------------------------- | --------------------------------------------------------------------- | ------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Official source themes              | nothing — Framique builds them in-repo                                | none (trusted source)    | catalogue install (`installCatalogTheme`)        | [creation.md](./creation.md)                                                  |
| Declarative ZIP theme (this page)   | `theme.json` + tokens/templates; no executable code                   | `validateThemeManifest`  | `installPackage` theme lane → publish → activate | this page; [contract.md](../packages/contract.md)                             |
| Reviewed executable theme (Level B) | `dev.theme.json` + JS/CSS bundle; code runs only in the runtime frame | `validateDevThemeBundle` | review store → per-version activation            | [level-b.md](./level-b.md); authority: [contract.md](../packages/contract.md) |

Official themes are not ZIP packages. <!-- doc-gate-ok: deliberate negative reference -->

## Manifest fields

| Field       | Rules                                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`       | 1–60 chars, slug (`[a-z0-9-]`). Never renamed after publish.                                                                                                                                                                                                                                        |
| `nameEn`    | English display name (required).                                                                                                                                                                                                                                                                    |
| `nameBn`    | Bengali display name (required).                                                                                                                                                                                                                                                                    |
| `summaryEn` | English one-line summary (required).                                                                                                                                                                                                                                                                |
| `summaryBn` | Bengali one-line summary (required).                                                                                                                                                                                                                                                                |
| `category`  | Storefront category, e.g. `fashion` (required).                                                                                                                                                                                                                                                     |
| `version`   | Semver (`1.0.0`). Bump on every resubmission.                                                                                                                                                                                                                                                       |
| `api`       | Builder API range. Must fall inside `^3.0.0` (major 3); anything else is rejected to avoid version skew. **A package that declares `archive` in `templates` must declare a range whose lower bound is `>= 3.1.0`** — see [The `archive` key and the API floor](#the-archive-key-and-the-api-floor). |
| `sortOrder` | Marketplace ordering weight (default `50`).                                                                                                                                                                                                                                                         |
| `tokens`    | Token bag accepted by `parseTokens`.                                                                                                                                                                                                                                                                |
| `templates` | Template map accepted by `parseTemplates`. Unknown route keys are dropped — packages cannot invent routes. The declared subset is checked against the **ten** supported template keys (`src/lib/builder-ast.ts:46-61`).                                                                             |

## Gates — enforced by `validateThemeManifest` (`src/lib/theme-package.ts:312`)

The validator checks the manifest shape only (fail-closed: malformed input
returns `manifest.invalid` at `src/lib/theme-package.ts:314-316,612-614`).
Each check below pins the code that performs it. Payload and template-content
checks live in later pipeline stages — see the next section — and the
spec-only budgets live under Aspirational.

1. **Slug:** `key` matches `THEME_KEY_RE` (`src/lib/theme-package.ts:59`),
   checked at `:323-328`.
2. **Bilingual names:** `name` / `nameBn` are both required
   (`src/lib/theme-package.ts:330-338`); over-length and executable text are
   rejected (`MAX_NAME_LEN` at `:258`, `EXECUTABLE_RE` at `:227`).
3. **Version:** strict semver via `parseSemver`
   (`src/lib/marketplace-scopes.ts:158`), checked at
   `src/lib/theme-package.ts:340-343`.
4. **API compatibility:** `api` must be a caret / `>=a <b` range covering the
   running builder via `satisfiesApiRange`
   (`src/lib/plugin-manifest.ts:463`; range `THEME_API_RANGE = ^3.0.0` at
   `src/lib/theme-package.ts:56`), checked at
   `src/lib/theme-package.ts:345-350`.
5. **Templates subset:** `templates` is a non-empty, duplicate-free subset of
   `TEMPLATE_KEYS` (`src/lib/builder-ast.ts:46-61`), checked at
   `src/lib/theme-package.ts:385-404`. Unknown keys are rejected — packages
   cannot invent routes. **A package that declares `archive` is additionally
   held to the API floor** — see the next section.
6. **Catalog widgets:** every `supportedWidgets` entry must exist in
   `WIDGET_TYPES` (`src/lib/widget-registry.ts:1001`, `SectionType` in
   `src/lib/builder-ast.ts:217`), checked at
   `src/lib/theme-package.ts:420-445`. Unknown widget types are rejected.
7. **Plugin refs:** `pluginDependencies` must be `plugin:{id}` /
   `plugin:{id}/{widget}` refs (`src/lib/theme-package.ts:184-187`,
   shapes from `pluginWidgetKey` / `parsePluginWidgetKey` at
   `src/lib/plugin-manifest.ts:425-437`) plus an exact / caret / pair version
   range, checked at `src/lib/theme-package.ts:447-475`.
8. **Surfaces:** `presentationSurfaces` is a non-empty, duplicate-free subset
   of the closed `PRESENTATION_SURFACES`
   (`src/lib/theme-package.ts:73`), checked at `:477-501`.
9. **Locales:** `locales` is a non-empty, duplicate-free subset of the closed
   `THEME_LOCALES` (`src/lib/theme-package.ts:83`), checked at `:503-519`.
10. **Assets:** `assetManifest` entries need a portable relative path plus a
    lowercase sha256 (`SHA256_RE` at `src/lib/theme-package.ts:255`),
    checked at `:521-548`. Traversal / absolute paths are rejected by
    `assetPathIssue` (`:292`), and executable extensions by
    `EXECUTABLE_ASSET_EXTS` (`:236`).
11. **Capabilities:** closed read-only allowlist `THEME_CAPABILITIES`
    (`src/lib/theme-package.ts:109`, subset of `SCOPES` at
    `src/lib/marketplace-scopes.ts:26`); unknown scopes are rejected,
    non-allowlisted scopes are `capabilities.forbidden:*`, and
    `render_storefront` is mandatory — all at
    `src/lib/theme-package.ts:550-566`.
12. **No executable text:** manifest free-text (`name`, `nameBn`, `author`,
    `description`, `descriptionBn`) is scanned with `EXECUTABLE_RE`
    (`src/lib/theme-package.ts:227`), enforced at
    `:331,337,360,369,376,380`. A present-but-untranslated `description`
    only warns (`description.bn_missing` at `:383`) — it does not fail.

Spec alias: `validateThemePackage` is the same function
(`src/lib/theme-package.ts:611`).

## The `archive` key and the API floor

The `archive` template key (the content archive — a category, a tag or an
author's articles) landed in the **3.1.0** line of the builder API: the
running builder version is `BUILDER_API_VERSION = "3.1.0"`
(`src/lib/plugin-manifest.ts:32`). The archive key is therefore **additive**,
and the API range itself does **not** move:

- `THEME_API_RANGE` stays `^3.0.0` (`src/lib/theme-package.ts:56`). It is
  documentation only — no code reads the constant; the live gate is
  `satisfiesApiRange` (`src/lib/plugin-manifest.ts:463`) against the running
  `3.1.0`.
- A package that **does not** declare `archive` in `templates` is
  **unaffected**: `satisfiesApiRange("^3.0.0")` is true against `3.1.0`
  (same major, the running version is above the range's floor), so every
  existing third-party package keeps installing exactly as it does today.
- A package that **does** declare `archive` must declare an `api` range whose
  **lower bound is `>= 3.1.0`**. The two admitted range shapes are `^a.b.c`
  (which floors at `a.b.c`) and `>=a.b.c <d.e.f` (which floors at `a.b.c`) —
  the two shapes `apiRangeFloor` (`src/lib/theme-package.ts:211-218`) reads. A
  package that declares `archive` while claiming a lower floor is
  **rejected** with the stable reason code
  **`templates.archive_requires_api`**
  (`src/lib/theme-package.ts:405-418`).

In one glance:

| Declared `templates` | Declared `api`   | Verdict                                              |
| -------------------- | ---------------- | ---------------------------------------------------- |
| no `archive`         | `^3.0.0`         | accepted — unchanged from today                      |
| no `archive`         | `^4.0.0`         | rejected — `api_incompatible` (unchanged from today) |
| `archive`            | `^3.0.0`         | rejected — `templates.archive_requires_api`          |
| `archive`            | `^3.1.0`         | accepted                                             |
| `archive`            | `>=3.1.0 <4.0.0` | accepted                                             |

The rule is checked inside `validateThemeManifest`, so it applies to the
manifest-validation lane of the ZIP theme package. The install lane's own API
check (`checkApiCompatibility`, `src/lib/registry-version.ts:30`) is unchanged
and still decides whether the running builder covers the declared range.

## Template / payload gates — enforced elsewhere, NOT by the validator

These run in the install / publish pipeline, never inside
`validateThemeManifest` (which has no `parseTemplates` / `parseTokens` /
`lintTemplate` call). At HEAD no install or publish path calls
`validateThemeManifest` — the wiring below is the live enforcement.

- **AST parse:** `parseTemplates` / `parseTokens`
  (`src/lib/builder-ast.ts`) run in the marketplace materialization at
  `src/lib/marketplace-install.server.ts:876-881` (inside
  `materializeListingTheme`, `:864`); parse failure throws
  `market_materialize_failed` (`:883`). Registry reads parse the same
  way at `src/lib/themes.server.ts:267-275`. Listing-manifest structure on
  the ledger path is gated separately by `validateBundle`
  (`src/lib/marketplace-scopes.ts:219`) at
  `src/lib/marketplace-install.server.ts:465-466`.
- **Lint errors:** `lintTemplate` (`src/lib/builder-ast.ts:8397`) errors
  block publish at `src/lib/themes.server.ts:921` (and the per-template
  loop at `:859-865`) and block registry updates at `:1722`.
- **Single-H1:** the duplicate-claimant error is
  `src/lib/builder-ast.ts:8543-8551` (route-aware zero-claimant hint at
  `:8446-8449`; route-supplied templates at `:72-86`). Enforced at the same
  publish / update call sites above, not by the validator.
- **bn coverage:** the ≥90% বাংলা floor is `TRANSLATION_PUBLISH_FLOOR = 90`
  (`src/lib/builder-guardrails.ts:148`) via `translationGate` (`:166-179`),
  wired into publish at `src/lib/themes.server.ts:924-926` and composed in
  `composePublishGate` at `:946`.
- **Executable URLs in props:** blocked by the parse-time sanitiser —
  `javascript:` / `data:` / `vbscript:` and protocol-relative URLs rejected
  (`src/lib/builder-ast.ts:7461-7472`), `SAFE_HREF` at `:7473`,
  `safeEmbedUrl` at `:7484-7499`, text stripping at `:7462-7471`. The
  validator's executable ban covers manifest free-text and asset extensions
  only (see gate 10 / 12 above).
- **Payload ceilings:** the live caps are `AST_LIMITS`
  (`src/lib/builder-ast.ts:7965-7975`): serialized templates + tokens
  ≤ 512_000 chars (`maxPayloadChars` at `:7968`), ≤ 60 sections per slot
  (`MAX_SECTIONS_PER_SLOT` at `:7962`), ≤ 300 nodes per template
  (`MAX_NODES_PER_TEMPLATE` at `:410`), depth ≤ 6 (`MAX_TREE_DEPTH` at
  `:409`) — enforced by `assertPayloadWithinLimits` at `:7996-8007` and by
  truncation / slicing in `parseAst` (`:8009`, `:8020`).

## Archive / quota / scan gates — enforced elsewhere, NOT by the validator

These run in `parseZip` / the install and upload lanes, never inside
`validateThemeManifest`:

- **Strict entries** (`parseZip`, `src/lib/package-zip.ts:157`):
  `__MACOSX` segments are `zip.unsafe_path` (`:109-140`), symlinks are
  `zip.symlink` (`:235`), device nodes / fifos / sockets are
  `zip.special_file` (`:247`), exact-duplicate file entries are
  `zip.duplicate_entry` (`:258-264`). Dotfiles (`.DS_Store`, `._*`
  resource forks) are omitted at extract (`:353`).
- **Storage quota:** persisted usage plus incoming bytes must fit
  `MERCHANT_ASSET_QUOTA_BYTES` (1 GiB,
  `src/lib/package-store.server.ts:53`), summed by `merchantAssetBytes`
  (`:115`) and checked before any write (`assertStorageQuota`,
  `src/lib/package-install.server.ts:109-124`, failing with
  `package.over_quota`; upload lane refuses with `theme.upload_quota`,
  `src/lib/themes/appearance.server.ts:870`). Dangling asset refs
  fail the upload lane closed (`:824`).
- **External-URL inventory:** `inventoryExternalUrls`
  (`src/lib/package-review.ts:128`) feeds consent screens and install
  audits (`src/lib/themes/appearance.server.ts:571,1010`).
- **Update re-consent:** a version that adds external hosts or custom
  HTML fails with `package.consent_required` unless `consentScopes`
  covers every addition (`diffCapabilities`,
  `src/lib/package-review.ts:240`; `coversWidening`, `:156`; enforced
  at `src/lib/package-install.server.ts:1027`).
- **Flagged-activation approval:** a scan-flagged version
  (`scanPackage`, `src/lib/package-scan.ts:133`) activates only with a
  recorded `theme.approved` audit (`approveThemeVersion`,
  `src/lib/themes/appearance.server.ts:1166`; gate at `:1282`),
  else `theme.approval_required`.

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
`src/lib/themes.server.ts:921-960` and [the SDK registry
pipeline](./sdk.md)). Staff approve or reject with a note. Validator
rejections carry the `validateThemeManifest` reason codes; publish rejections
carry the pipeline codes (`builder.publish_blocked`,
`builder.registry_invalid`, `market_materialize_failed`) — the two sets are
not 1:1. Install and activation carry their own gates on top:
capability-widening updates need re-consent
(`package.consent_required`) and scan-flagged versions need a recorded
approval before activation (`theme.approval_required`) — see the
section above.
