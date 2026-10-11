# Package contract (canonical)

Last verified: 2026-10-07 @ 8ec9abda

This document is the **one canonical package contract** for themes and
plugins. Format, manifest, lifecycle, sandbox, versioning, rollback,
uninstall, and tenant isolation are defined here. Detail guides link
here instead of restating it:

- Theme validator detail: [`docs/themes/packages.md`](../themes/packages.md)
- Theme install/publish pipeline:
  [`docs/themes/sdk.md`](../themes/sdk.md)
- Plugin build path:
  [`docs/developers/plugins.md`](../developers/plugins.md)
- Sandbox boundary:
  [`docs/developers/security-sandbox.md`](../developers/security-sandbox.md)
- Versioning and publishing:
  [`docs/developers/versioning-publishing.md`](../developers/versioning-publishing.md)

Every behavioral claim carries a `file:line` pin verified at HEAD. A pin
is a promise a reviewer can open the file and see the claim. Anything
without a code pin is labeled **prose-only** or **TBD** and collected in
[§13](#13-explicit-gaps-tbd-not-implementable-from-this-doc).

## 0. What a package is — and what is not one

A custom package is a merchant/community `.zip` archive installed through
one pipeline, `installPackage`
(`src/lib/package-install.server.ts:535`), with kind `"theme"` or
`"plugin"`. Official (Framique-built) themes and plugins are **not**
packages: they are trusted source code in this repo, registered in
`src/lib/themes/builtin-themes.ts:15` (themes) and
`src/lib/official-plugins.ts:39` (plugins), installed from their source
definitions with no ZIP construction and no archive transport. Both paths
share runtime contracts — tenant authorization, ledger, audit, lifecycle
guarantees — but never packaging internals
(`installOfficialTheme`, `src/lib/themes/appearance.server.ts:354`;
`installOfficialPlugin`, `src/lib/official-plugins.server.ts:182`).

## 1. Format (ZIP layout)

Archive handling is `src/lib/package-zip.ts`:

- Parse entries: `parseZip` (`src/lib/package-zip.ts:156`).
- Extract files: `extractPackageFiles` (`src/lib/package-zip.ts:311`).
- Manifest file name per kind: `manifestNameFor`
  (`src/lib/package-zip.ts:361`) — `theme.json` for themes,
  `plugin.json` for plugins.
- Layout gate per kind: `validatePackageLayout`
  (`src/lib/package-zip.ts:381`).
- Dangling file references fail the install: `collectBrokenAssetRefs`
  (`src/lib/package-zip.ts:452`), enforced at
  `src/lib/package-install.server.ts:574` (themes) and
  `src/lib/package-install.server.ts:832` (plugins).

Archive caps (`src/lib/package-zip.ts:33-37`):

| Cap                                       | Value  | Pin                         |
| ----------------------------------------- | ------ | --------------------------- |
| Archive bytes (`PKG_MAX_ARCHIVE_BYTES`)   | 32 MB  | `src/lib/package-zip.ts:33` |
| File count (`PKG_MAX_FILES`)              | 500    | `src/lib/package-zip.ts:34` |
| Per-entry bytes (`PKG_MAX_ENTRY_BYTES`)   | 5 MB   | `src/lib/package-zip.ts:35` |
| Total uncompressed                        | 50 MB  | `src/lib/package-zip.ts:36` |
| Manifest bytes (`PKG_MAX_MANIFEST_BYTES`) | 512 KB | `src/lib/package-zip.ts:37` |

Strict entries (`parseZip`, `src/lib/package-zip.ts:206-264`):

- `__MACOSX` path segments are `zip.unsafe_path`
  (`src/lib/package-zip.ts:138`); symlinks are `zip.symlink`
  (`src/lib/package-zip.ts:238`); device nodes, fifos, and sockets are
  `zip.special_file` (`src/lib/package-zip.ts:250`).
- Exact-duplicate file entries are `zip.duplicate_entry`
  (`src/lib/package-zip.ts:258-264`).
- Dotfiles (`.DS_Store`, `._*` resource forks) are omitted at extract
  and never reach validators or installs
  (`src/lib/package-zip.ts:353`).

Per-merchant storage quota is plan-tiered: persisted usage plus incoming
bytes must fit the merchant's plan cap from `ASSET_QUOTA_BY_PLAN`
(`src/lib/package-store.server.ts:62`), summed by `merchantAssetBytes`
(`src/lib/package-store.server.ts:115`). The plan comes from
`merchantPlanKey` (`src/lib/package-store.server.ts:83`, `subscriptions`
lookup, missing/unknown reads as `launch`) via `assetQuotaForPlan`
(`src/lib/package-store.server.ts:70`) and `quotaForMerchant`
(`src/lib/package-store.server.ts:106`); plans are `BillingPlanKey`
(`src/lib/entitlements.ts:24`). Both `installPackage` lanes check before
any write via `assertStorageQuota`
(`src/lib/package-install.server.ts:100-114`, failing with
`package.over_quota`; theme lane at `:698`, plugin lane at `:1068`).
The upload lane refuses the same way with `theme.upload_quota`
(`src/lib/themes/appearance.server.ts:841-843`) and refuses dangling
asset refs with `theme.upload_manifest`
(`src/lib/themes/appearance.server.ts:824-830`). Replays write nothing
and skip the quota check.

| Plan         | Asset quota (`ASSET_QUOTA_BY_PLAN`) | Pin                                 |
| ------------ | ----------------------------------- | ----------------------------------- |
| `launch`     | 1 GiB (`MERCHANT_ASSET_QUOTA_BYTES`, `src/lib/package-store.server.ts:53`) | `src/lib/package-store.server.ts:63` |
| `growth`     | 5 GiB                               | `src/lib/package-store.server.ts:64` |
| `business`   | 20 GiB                              | `src/lib/package-store.server.ts:65` |
| `enterprise` | 100 GiB                             | `src/lib/package-store.server.ts:66` |

Values are owner-tunable; unknown/blank plans fail closed to launch.

External-URL inventory: `inventoryExternalUrls`
(`src/lib/package-review.ts:50`) extracts the sorted unique absolute
`http(s)` URLs from package text files for consent screens and audit
rows. Install audits carry it (`src/lib/themes/appearance.server.ts:571`
for catalogue installs, `:1010` for uploads), and `InstallConsent`
lists it (`src/components/marketplace/InstallConsent.tsx:17`,
`:76-85`).

A plugin ZIP built by the platform carries root `plugin.json` plus one
data-only locale file per shipped dictionary
(`exportPluginManifestZip`, `src/lib/plugin-package.ts:189`).

## 2. Manifest

Strict validation is the mandatory default. `resolveValidator`
dispatches per kind to `pkg1ThemeValidator` (themes) /
`pkg1PluginValidator` (plugins) unless a caller passes an explicit
per-call validator or a process-wide override
(`src/lib/package-install.server.ts:189-208`). `stubManifestValidator`
(`src/lib/package-install.server.ts:100`) is explicit opt-in for tests
only — never the default path.

### 2.1 Theme manifest

Gate: `validateThemeManifest` (`src/lib/theme-package.ts:280`).
Malformed input fails closed with `manifest.invalid`
(`src/lib/theme-package.ts:283`, `src/lib/theme-package.ts:551`).
Spec alias `validateThemePackage` is the same function
(`src/lib/theme-package.ts:560`).

Key rules (full gate list in
[`docs/themes/packages.md`](../themes/packages.md); pins below are the
enforcement sites):

| Rule                                                                                                                                                                                                                                                               | Pin                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Slug `key` matches `THEME_KEY_RE` (`src/lib/theme-package.ts:54`)                                                                                                                                                                                                  | `src/lib/theme-package.ts:290-293` |
| Bilingual `name` / `nameBn` required; over-length (`MAX_NAME_LEN`, `src/lib/theme-package.ts:224`) and executable text (`EXECUTABLE_RE`, `src/lib/theme-package.ts:193`) rejected                                                                                  | `src/lib/theme-package.ts:296-308` |
| Strict semver via `parseSemver` (`src/lib/marketplace-scopes.ts:155`)                                                                                                                                                                                              | `src/lib/theme-package.ts:311-313` |
| `api` caret / `>=a <b` range covering the running builder via `satisfiesApiRange` (`src/lib/plugin-manifest.ts:311`; range `THEME_API_RANGE = ^3.0.0`, `src/lib/theme-package.ts:51`)                                                                              | `src/lib/theme-package.ts:316-320` |
| `templates` non-empty duplicate-free subset of `TEMPLATE_KEYS`                                                                                                                                                                                                     | `src/lib/theme-package.ts:357-376` |
| `supportedWidgets` entries exist in `WIDGET_TYPES` (`src/lib/widget-registry.ts:951`)                                                                                                                                                                              | `src/lib/theme-package.ts:378-400` |
| `pluginDependencies` are `plugin:{id}` / `plugin:{id}/{widget}` refs plus exact / caret / pair ranges                                                                                                                                                              | `src/lib/theme-package.ts:402-433` |
| `presentationSurfaces` non-empty duplicate-free subset of `PRESENTATION_SURFACES` (`src/lib/theme-package.ts:68`)                                                                                                                                                  | `src/lib/theme-package.ts:435-458` |
| `locales` non-empty duplicate-free subset of `THEME_LOCALES` (`src/lib/theme-package.ts:78`)                                                                                                                                                                       | `src/lib/theme-package.ts:460-479` |
| `assetManifest` portable relative path + lowercase sha256 (`SHA256_RE`, `src/lib/theme-package.ts:221`); traversal rejected by `assetPathIssue` (`src/lib/theme-package.ts:261`); executables rejected by `EXECUTABLE_ASSET_EXTS` (`src/lib/theme-package.ts:202`) | `src/lib/theme-package.ts:481-508` |
| `capabilities` closed read-only allowlist `THEME_CAPABILITIES` (`src/lib/theme-package.ts:104`, subset of `SCOPES`, `src/lib/marketplace-scopes.ts:24`); `render_storefront` mandatory                                                                             | `src/lib/theme-package.ts:510-526` |

The pipeline adapter maps `key` to slug and `plugin:` refs to bare
slugs the dependency checker resolves against the ledger
(`pkg1ThemeValidator`, `src/lib/package-install.server.ts:159`).

Template keys are `TEMPLATE_KEYS`
(`src/lib/builder-ast.ts:47-60`): `index`, `product`, `collection`,
`account`, `page`, `blog`, `cart`, `checkout`, `search`. Route-headed
templates (`product`, `collection`, `account`, `page`, `blog`,
`search`) get their `<h1>` from the route and must not contain a
claimant; every other shipped template must contain exactly one
(`ROUTE_H1_TEMPLATES`, `src/lib/builder-ast.ts:62-75`).

### 2.2 Plugin manifest

Gate: `parseManifest` (`src/lib/plugin-manifest.ts:393`) — the single
gate the review pipeline, the install flow, and the host share.
Pipeline adapter: `pkg1PluginValidator`
(`src/lib/plugin-package.ts:245`). Export gate: `gateExportManifest`
re-runs `parseManifest` plus the bundle gate `validateBundle`
(`src/lib/plugin-package.ts:165`).

Field rules (see [`docs/developers/plugins.md`](../developers/plugins.md)
for the walkthrough):

| Field             | Rule                                                                                                         | Pin                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `id`              | `^[a-z][a-z0-9-]{2,39}$`                                                                                     | `src/lib/plugin-manifest.ts:292,401`                                     |
| `version`         | strict semver digits                                                                                         | `src/lib/plugin-manifest.ts:311,404`                                     |
| `api`             | `^3.0.0` or `>=3.0.0 <4.0.0`; running builder `BUILDER_API_VERSION = "3.1.0"`                                | `src/lib/plugin-manifest.ts:18-29`, `src/lib/plugin-manifest.ts:311-330` |
| `permissions`     | closed `SCOPES` vocabulary (`src/lib/marketplace-scopes.ts:24`); widgets present require `render_storefront` | `src/lib/plugin-manifest.ts:265`                                         |
| `widgets[].slots` | `header` / `main` / `footer` or menu slot                                                                    | `src/lib/plugin-manifest.ts:26,43`                                       |
| `widgets[].entry` | no `eval(` / `import(` / `new Function`                                                                      | `src/lib/plugin-manifest.ts:446-452`                                     |
| `hooks`           | only `cart.calculate`, `checkout.validate`, `order.created`, `product.saved`                                 | `src/lib/plugin-manifest.ts:35`                                          |
| `budget`          | `jsKb <= 120`, `mainThreadMs <= 50` (`PLUGIN_BUDGET`, `src/lib/plugin-manifest.ts:32`)                       | `src/lib/plugin-manifest.ts:515-522`                                     |
| `settings`        | schema-coerced, unknown keys dropped; `defaultSettings` supplies defaults                                    | `src/lib/plugin-manifest.ts:567-582`                                     |

Permission widening is detected by `permissionDiff`
(`src/lib/plugin-manifest.ts:554`) and needs a fresh consent screen.

## 3. Lifecycle (custom packages: one pipeline)

### 3.1 Theme install

`installPackage` with `kind: "theme"`
(`src/lib/package-install.server.ts:535`):

1. `.zip` name + idempotency key required
   (`src/lib/package-install.server.ts:545-550`).
2. Archive → layout → manifest → dependency/API → broken-ref checks
   (`src/lib/package-install.server.ts:554-580`).
3. API compatibility: `checkApiCompatibility`
   (`src/lib/registry-version.ts:30`), enforced at
   `src/lib/package-install.server.ts:569`.
4. Dependencies resolve against the install ledger
   (`assertDependencies`, `src/lib/package-install.server.ts:768`).
5. Immutable artifact identity: `artifactIdFor` sha256
   (`src/lib/package-install.server.ts:222`).
6. Committed idempotency keys replay, never stack
   (`src/lib/package-install.server.ts:586-622`).
7. Same manifest slug = same package line; non-forward versions throw
   `package.bad_version` (`src/lib/package-install.server.ts:624-637`).
   Forward movement is `isForwardVersion`
   (`src/lib/marketplace-scopes.ts:169`).
8. Writes: `store_themes` row + `theme_versions` row (`status:
"draft"`) + draft (`upsertDraft`,
   `src/lib/package-install.server.ts:317`) + per-version namespaced
   assets + ledger row + audit (`package.installed` /
   `package.updated`, `src/lib/package-install.server.ts:750`).
9. Update re-consent: a new version that adds external hosts or
   custom HTML over the installed line fails with
   `package.consent_required` unless every addition is covered by
   exact match in `consentScopes`
   (`src/lib/package-install.server.ts:571`). Widening is
   `diffCapabilities` (`src/lib/package-review.ts:168`), coverage is
   `coversWidening` (`src/lib/package-review.ts:90`), enforced at
   `src/lib/package-install.server.ts:730-738`. Fresh installs (no
   previous version) and non-widening updates pass untouched.

### 3.2 Plugin install

`installPluginPackage` via the same `installPackage` entry
(`src/lib/package-install.server.ts:803`): same name/key/archive/
manifest/API/dependency/broken-ref gates, then assets-before-ledger
(K3 atomicity: failed asset saves compensate the prefix before the
error propagates, `src/lib/package-install.server.ts:860-880`),
ledger insert with `artifact_checksum` / `artifact_version` /
`artifact_pinned: "upload"`
(`src/lib/package-install.server.ts:882-904`), and audit-compensated
transactions (`src/lib/package-install.server.ts:905-928`).

Plugin history is successive ledger rows, not `theme_versions`
(`src/lib/package-install.server.ts:529-533`).

Update re-consent: a new version that adds manifest permissions over
the installed `plugin_state` row fails with
`package.consent_required` unless every addition (`perm:<scope>` by
exact match) is covered in `consentScopes`
(`src/lib/package-install.server.ts:571`). Widening is
`diffCapabilities` (`src/lib/package-review.ts:168`), coverage is
`coversWidening` (`src/lib/package-review.ts:90`), enforced at
`src/lib/package-install.server.ts:1092-1100`. Fresh installs (no
row) and non-widening updates pass untouched.

### 3.3 Official catalogue (source model, separate path)

- Official themes: exactly `songoskriti`, `somvabona`
  (`OFFICIAL_THEME_KEYS`, `src/lib/themes/builtin-themes.ts:15`;
  UI-order mirror at `src/lib/themes/appearance.ts:71`).
- Official plugins: exactly `product-reviews`, `store-analytics`,
  `whatsapp-chat` (`OFFICIAL_PLUGIN_KEYS`,
  `src/lib/official-plugins.ts:39`).
- Official theme install initializes tenant rows from the registered
  source definition through `installCatalogTheme`
  (`src/lib/themes/appearance.server.ts:391`) — no ZIP, no
  `installPackage`; the ledger carries the `official:<key>` provenance
  pin at insert (`installOfficialTheme`,
  `src/lib/themes/appearance.server.ts:354`).
- Official plugin install is `installPackage` (kind `"plugin"`,
  `pkg1PluginValidator`) over source-built bytes plus the same
  `official:<key>` stamp and the host projection (`upsertPlugin`) with
  compensation on failure (`installOfficialPlugin`,
  `src/lib/official-plugins.server.ts:182`): the pipeline here is the
  shared security contract (sandbox, capabilities, lifecycle), not a
  shared distribution mechanism — no official plugin ZIP is checked in
  or downloadable.
- Artifact pins are `official:<key>`
  (`officialPinFor`, `src/lib/themes/appearance.ts:83`;
  `officialPluginPinFor`, `src/lib/official-plugins.ts:52`).
- Artifact pins are `official:<key>`
  (`officialPinFor`, `src/lib/themes/appearance.ts:83`;
  `officialPluginPinFor`, `src/lib/official-plugins.ts:52`).
- Catalogue rows carry the serializable artifact ref only (checksum +
  version + file name + pin); bytes never leave the server
  (`OfficialArtifactRef`, `src/lib/themes/appearance.ts:99`;
  `OfficialPluginArtifactRef`, `src/lib/official-plugins.ts:68`).
- `VISIBLE_THEME_KEYS` remains an empty set at HEAD
  (`src/lib/themes/appearance.ts:360`); curated offer comes from the
  official catalogue sections (`sectionCatalogue`,
  `src/lib/themes/appearance.ts:126`), not from that set.

### 3.4 Enable / disable (plugins)

`setPluginPackageEnabled`
(`src/lib/package-install.server.ts:941`): ledger status flip
`installed` ⇄ `paused` plus audit (`package.enabled` /
`package.disabled`). Reads fold merchant flag, suspensions, and the
platform kill switch into one `enabled` value
(`src/lib/plugins.server.ts:76`).

Flagged-enable approval: `setPluginEnabled`
(`src/lib/plugins.server.ts:302-350`) scans the installed manifest
with `scanPackage` (`src/lib/package-scan.ts:62`); a `flagged`
verdict (secrets, script-bearing SVG) refuses enabling with
`plugin.approval_required`
(`src/lib/plugins.server.ts:346`) until the merchant records
`approvePluginVersion` for that exact plugin id + manifest version
(`src/lib/plugins.server.ts:383`), audited as `plugin.approved`
(`src/lib/plugins.server.ts:404`). Disabling is always safe and
never needs approval.

### 3.5 Consent, suspend, kill switch

- Grants must be a subset of the manifest permissions; widening needs
  fresh consent (`plugin_consent_required`,
  `src/lib/plugins.server.ts:138-154`,
  `permissionDiff`, `src/lib/plugin-manifest.ts:554`).
- `suspendPlugin` / `resumePlugin`
  (`src/lib/plugin-lifecycle.server.ts:42-90`) record a reason and
  audit the transition. Suspend is idempotent.
- Platform kill switch is global per plugin id
  (`setPluginKillSwitch`, `src/lib/plugins.server.ts:342`);
  engaging auto-suspends every install with reason `kill_switch`;
  releasing never auto-resumes.

## 4. Sandbox

- Every widget renders inside a null-origin iframe without
  `allow-same-origin`: no host DOM, no cookies, no same-origin
  storage (`WidgetSandbox`,
  `src/components/marketplace/WidgetSandbox.tsx:157`).
- Frame policy is `default-src 'none'` (with inline script/style for
  the shipped bundle): no fetch, XHR, WebSockets, images, or remote
  scripts
  (`src/components/marketplace/WidgetSandbox.tsx:132`).
- The only channel out is `window.framique.call(method, params)`,
  authorized per message by `authorizeWidgetCall`
  (`src/lib/marketplace-scopes.ts:341`) against the merchant-granted
  scopes. The allow-list is `WIDGET_API`
  (`src/lib/marketplace-scopes.ts:260`), including `menus.list`
  behind `read_menus`.
- Denials (`sandbox.malformed`, `sandbox.unknown_method`,
  `sandbox.scope_denied`) surface as a blocked-call notice, never a
  crash (`src/components/marketplace/WidgetSandbox.tsx:73-95`,
  `src/components/marketplace/WidgetSandbox.tsx:249-260`).
- Bundle gates: no dynamic code (`bundle.dynamic_code`,
  `src/lib/marketplace-scopes.ts:219-233`), bundle ≤ 512 KB
  (`MAX_BUNDLE_BYTES`, `src/lib/marketplace-scopes.ts:199`), entry
  string ≤ 200 KB, and inside `PLUGIN_BUDGET`
  (`src/lib/plugin-manifest.ts:31-32`).
- Server hooks are queued outbound POSTs to `hooksUrl`, never
  in-process code; required scopes in `HOOK_SCOPE`
  (`src/lib/scope-adapter.ts:35`); 800 ms timeout, per-plugin
  breaker after 3 failures, queued retry, idempotent delivery header,
  HMAC signature when `PLUGIN_HOOK_SECRET` is set (see
  [`docs/developers/plugins.md`](../developers/plugins.md#subscribe-to-server-hooks-that-cannot-break-checkout)).

## 5. Versioning

- Strict semver digits (`parseSemver`,
  `src/lib/marketplace-scopes.ts:155`).
- New submissions move strictly forward (`isForwardVersion`,
  `src/lib/marketplace-scopes.ts:169`); non-forward marketplace
  versions throw `market_version_not_forward`
  (`src/lib/marketplace-vault.server.ts:124`); identical bytes
  return the existing row
  (`src/lib/marketplace-vault.server.ts:108-121`).
- Breaking scope additions belong on a major bump
  (`src/lib/marketplace-scopes.ts:175-181`).
- Theme resubmissions bump `version` every time, rejections included;
  `key` is never renamed after first publish.
- Compatibility: declare `api: "^3.0.0"` (or `>=3.0.0 <4.0.0`);
  anything else is rejected
  (`src/lib/plugin-manifest.ts:311-330`). Incompatible installs
  resolve as `incompatible` with a labeled placeholder
  (`src/lib/plugin-manifest.ts:670-678`).
- Live payload ceilings are `AST_LIMITS`
  (`src/lib/builder-ast.ts:7419`): serialized templates + tokens ≤
  512_000 chars, ≤ 60 sections per slot (`MAX_SECTIONS_PER_SLOT`,
  `src/lib/builder-ast.ts:7416`), ≤ 300 nodes per template
  (`MAX_NODES_PER_TEMPLATE`, `src/lib/builder-ast.ts:405`), depth ≤ 6
  (`MAX_TREE_DEPTH`, `src/lib/builder-ast.ts:404`), enforced by
  `assertPayloadWithinLimits` (`src/lib/builder-ast.ts:7450`).

## 6. Publish, preview, activate

Installed artifacts are authoritative (K2). Source fallbacks are
removed — missing artifacts fail closed, never render a silent wrong
theme.

- Publish payload: explicit input wins; otherwise the newest
  `theme_versions` row supplies the payload. No usable input and no
  usable artifact throws `builder.artifact_missing`
  (`resolvePublishPayload`, `src/lib/themes.server.ts:444-464`).
- Publish path: lint errors per template
  (`src/lib/themes.server.ts:611-615`), translation gate (≥90%
  বাংলা via `TRANSLATION_PUBLISH_FLOOR`,
  `src/lib/builder-guardrails.ts:148`, wired at
  `src/lib/themes.server.ts:616-619`), font/contrast gates, then
  `theme_publish` RPC moves `store_themes.published_version_id`
  (`publishVersion`, `src/lib/themes.server.ts:590`).
- Preview reads an owned version without touching the live pointer
  (`previewPackage`, `src/lib/package-install.server.ts:1157`).
- Preview resolution with merchant context (array, even empty) comes
  only from the installed set; uninstalled keys fail closed to null
  (`previewSourceFor`, `src/lib/preview-sources.ts:126`;
  `previewSourceKeys`, `src/lib/preview-sources.ts:145`;
  `resolveThemePreview`, `src/lib/theme-preview-nav.ts:412`). Legacy
  null/undefined callers (build tooling) still resolve source statics.
- Gallery listing with merchant context lists installed keys only;
  legacy callers list catalogue keys (`galleryKeys`,
  `src/lib/themes/appearance.ts:384`).
- Activation flips `is_active` plus the published pointer and audits
  (`activatePackage`, `src/lib/package-install.server.ts:1178`;
  theme lane `activateTheme`,
  `src/lib/themes/appearance.server.ts:1227-1298`).
- Flagged-activation approval: `activateTheme` scans the
  about-to-go-live version with `scanPackage`
  (`src/lib/package-scan.ts:62`) via `assertVersionApproved`
  (`src/lib/themes/appearance.server.ts:1177`); a `flagged` verdict
  (secrets, script-bearing SVG) refuses activation with
  `theme.approval_required`
  (`src/lib/themes/appearance.server.ts:1213`, wired at `:1243`)
  until the merchant records `approveThemeVersion`
  (`src/lib/themes/appearance.server.ts:1133`), audited as
  `theme.approved` (`src/lib/themes/appearance.server.ts:1159`).
  Approval binds to the version's template content hash, so changed
  content needs fresh approval; clean versions pass untouched.

Minimal install → publish → activate (theme):

```ts
import { installPackage } from "@/lib/package-install.server";
import { publishVersion } from "@/lib/themes.server";
import { activateTheme } from "@/lib/themes/appearance.server";

const installed = await installPackage(db, merchantId, {
  kind: "theme",
  fileName: "acme-pack.zip",
  bytes,
  idempotencyKey: `upload:${merchantId}:acme-pack:1.0.0`,
});
await publishVersion(db, merchantId, {
  themeId: installed.packageId,
  templates,
  tokens,
});
```

## 7. Rollback (last-good)

History is append-only. Rollback mints a new version/row carrying the
target's content — never a pointer rewind.

- Themes: `rollbackPackage`
  (`src/lib/package-install.server.ts:1222`) mints a new
  `theme_versions` row with `rollback_of`, moves the published
  pointer, upserts the draft, audits `package.rolled_back`. Builder
  lane equivalent: `rollbackVersion`
  (`src/lib/themes.server.ts:702`) via the `theme_rollback` RPC plus
  `restoreCustomCode` and `purgeStorefront("rollback")`.
- Plugins: `rollbackPluginPackage`
  (`src/lib/package-install.server.ts:1016`) mints a new ledger row
  carrying the target's immutable artifact identity with
  `previous_snapshot.rollback_of` plus a `package.rolled_back` audit
  row; sibling live rows park to `paused` so exactly one row stays
  live; content equality holds structurally because plugin assets are
  immutable under `plugins/<slug>/<artifact8>/…`.
- The published pointer is last-good by construction: a failed publish
  never moves it.

```ts
import {
  rollbackPackage,
  rollbackPluginPackage,
} from "@/lib/package-install.server";

await rollbackPackage(db, merchantId, themeId, targetVersionId, actorId);
await rollbackPluginPackage(db, merchantId, targetInstallId, actorId);
```

## 8. Uninstall

- Themes: `uninstallPackage`
  (`src/lib/package-install.server.ts:1282`). Refuses the active theme
  (`package.active`); deletes namespace-scoped version assets, drafts,
  versions; retires ledger rows to `removed`; deletes the theme row;
  audits `package.uninstalled`.
- Plugins: `uninstallPluginPackage`
  (`src/lib/package-install.server.ts:1329`). Already-`removed` rows
  are a safe no-op; wipes the ledger-slug asset namespace plus the
  checksum-attributable manifest-slug namespace; ledger row goes to
  terminal `removed`; audits `package.uninstalled`.

```ts
import {
  setPluginPackageEnabled,
  uninstallPluginPackage,
} from "@/lib/package-install.server";

await setPluginPackageEnabled(db, merchantId, installId, false, actorId);
await uninstallPluginPackage(db, merchantId, installId, actorId);
```

## 9. Tenant isolation

- Every pipeline entry asserts the tenant first: `assertTenantId`
  (`src/lib/tenant-scope.ts:44`), called at
  `src/lib/package-install.server.ts:541`,
  `src/lib/package-install.server.ts:943`,
  `src/lib/package-install.server.ts:1023`,
  `src/lib/package-install.server.ts:1162`,
  `src/lib/package-install.server.ts:1179`,
  `src/lib/package-install.server.ts:1229`,
  `src/lib/package-install.server.ts:1288`, and
  `src/lib/package-install.server.ts:1335`.
- All reads/writes predicate on `merchant_id`; cross-merchant ids read
  as `package.not_found` (e.g.
  `src/lib/package-install.server.ts:268-284`,
  `src/lib/package-install.server.ts:286-302`).
- Asset namespaces isolate by construction: themes under
  `themes/<version-id>/assets/…` (`themeVersionPrefix`,
  `src/lib/package-store.server.ts:42`); plugins under
  `plugins/<slug>/<artifact8>/assets/…` (`pluginVersionPrefix`,
  `src/lib/package-store.server.ts:49`). Uninstall and rollback wipe
  only the merchant's own namespace.
- Ledger provenance (`artifact_checksum` / `artifact_version` /
  `artifact_pinned`) degrades on pre-migration DBs: missing-column
  failures retry without artifact columns and readers treat NULL as
  legacy-unknown (`insertInstallLedger` /
  `isMissingArtifactColumnError`,
  `src/lib/package-install.server.ts:380-429`).
- Credential-derived tenancy on the REST plane: `merchant_id` is never
  read from the request (`src/lib/rest-gateway.server.ts:9-11`).

## 10. Error catalogue (machine codes)

Pipeline codes (all thrown as `PackageInstallError`,
`src/lib/package-install.server.ts:60`):

| Code                         | Meaning                                                |
| ---------------------------- | ------------------------------------------------------ |
| `package.empty`              | no bytes supplied                                      |
| `package.bad_name`           | file name is not a `.zip`                              |
| `package.bad_key`            | idempotency key missing                                |
| `package.manifest_invalid`   | manifest gate rejected the archive                     |
| `package.bad_version`        | malformed or non-forward version                       |
| `package.api_incompatible`   | `api` range does not cover the running builder         |
| `package.missing_dependency` | dependency slug not installed                          |
| `package.broken_ref`         | templates reference missing files                      |
| `package.install_failed`     | row / version / ledger / asset step failed             |
| `package.install_conflict`   | ledger replay without a package row                    |
| `package.not_found`          | package / version / install not owned by this merchant |
| `package.active`             | uninstall refused on the live theme                    |
| `package.consent_required`   | update widens capabilities without covering consent
  (`src/lib/package-install.server.ts:730-738` themes,
  `:1092-1100` plugins) |
| `package.over_quota`         | persisted + incoming bytes exceed
  `MERCHANT_ASSET_QUOTA_BYTES`
  (`src/lib/package-install.server.ts:100-114`) |
| `theme.upload_quota`         | upload lane over the same quota
  (`src/lib/themes/appearance.server.ts:840-843`) |
| `theme.approval_required`    | flagged version needs a recorded `theme.approved`
  audit before activation
  (`src/lib/themes/appearance.server.ts:1213`) |
| `plugin.approval_required`   | flagged manifest needs a recorded `plugin.approved`
  audit before enabling (`src/lib/plugins.server.ts:346`) |
| `zip.duplicate_entry`        | exact-duplicate file entry in the archive
  (`src/lib/package-zip.ts:258-264`) |
| `zip.special_file`           | device node, fifo, or socket entry
  (`src/lib/package-zip.ts:250`) |

Publish/builder reasons include `builder.artifact_missing`
(`src/lib/themes.server.ts:444-464`), `builder.publish_blocked`,
`builder.registry_invalid`, and `market_materialize_failed` (see
[`docs/themes/packages.md`](../themes/packages.md#submit-flow)).
Official-catalogue reasons are `plugin.official_unknown` and
`plugin.official_unavailable`
(`src/lib/official-plugins.server.ts:137-154`).

## 11. Historical claims (bannered, not normative)

These appear in older docs or specs and do **not** describe HEAD. Do
not implement from them.

| Claim                                                                                               | Status at HEAD                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2 MB package cap / 200-sections-per-template budget (e.g. `docs/themes/creation.md` §9.2 items 1–2) | **Prose-only.** No `MAX_PACKAGE_BYTES` and no `MAX_SECTIONS_PER_TEMPLATE` exist in `src/` (verified by search). Live ceilings are §5 (`AST_LIMITS` + ZIP caps in §1).                                                                                                                                        |
| Preview/gallery union semantics (source keys first, installed appended; source wins collisions)     | **Retired by K2.** Installed sets are authoritative; collisions shadow source; empty merchant sets list nothing (`src/lib/preview-sources.ts:126-145`, `src/lib/themes/appearance.ts:384`).                                                                                                                  |
| Publish falls back to the source package when no artifact exists                                    | **Removed by K2.** Fails closed with `builder.artifact_missing` (`src/lib/themes.server.ts:444-464`).                                                                                                                                                                                                        |
| Plugin lifecycle `installing → active ⇄ suspended → uninstalling → purged` as ledger states         | **Prose-only label set.** Ledger states are `installed` / `trial` / `paused` / `removed` (plus `rolled_back` on the marketplace lane); enable/disable flips `installed` ⇄ `paused` (`src/lib/package-install.server.ts:941-970`). Suspend/resume and kill-switch reasons live in the lifecycle layer (§3.5). |
| `VISIBLE_THEME_KEYS` curates the offer / `officialThemeKeys()` returns the catalogue                | **Stale.** `VISIBLE_THEME_KEYS` is an empty set (`src/lib/themes/appearance.ts:360`); the curated Official/Community split is `sectionCatalogue` over provenance (`src/lib/themes/appearance.ts:126`).                                                                                                       |
| Exactly eight template keys (no `account`)                                                          | **Stale.** `TEMPLATE_KEYS` has nine entries including `account` (`src/lib/builder-ast.ts:47-60`).                                                                                                                                                                                                            |

## 12. Worked references (compile against source)

Canonical starters (copy before writing from scratch):

- Plugin: `examples/starter-plugin/manifest.json:1-32` (valid
  manifest: `starter-hello`, semver `1.0.0`, `api: ^3.0.0`,
  `render_storefront` present, one `main`-slot widget, one hook with
  `https` `hooksUrl`, budget inside `PLUGIN_BUDGET`) with a vitest
  suite mirroring the real gates (`npx vitest run --config
examples/starter-plugin/vitest.config.ts`).
- Theme validators: `validateThemeManifest`
  (`src/lib/theme-package.ts:280`) plus the pipeline adapters
  `pkg1ThemeValidator`
  (`src/lib/package-install.server.ts:159`) and
  `pkg1PluginValidator` (`src/lib/plugin-package.ts:245`).

## 13. Explicit gaps (TBD, not inventable)

1. Downloadable official ZIPs — deliberately out (server-side bytes
   only; catalogue rows carry refs, never bytes).
2. Third official theme (no OceanBlue source exists).
3. Subscription / recurring billing for plugins (one-time + trial
   only; self-billing workaround in
   [`docs/developers/plugins.md`](../developers/plugins.md#charge-for-plugins-with-the-one-time-and-trial-rails)).
4. Reviewer identity requirements, review SLA, and structured
   rejection codes beyond `review_note`.
5. Full theme-dressing of Class A community widgets (frame isolates
   bundle DOM/CSS; token flow needs `read_shop`).
6. Schema drift rulings (developer-platform tables referenced by
   server code but absent from generated Supabase types) — for the
   owning lane to rule on.

## 14. Machine check

Pins in this doc are verifiable with one command (fails on the first
missing pin):

```sh
node -e '
const fs = require("node:fs");
const pins = [
  "src/lib/package-install.server.ts",
  "src/lib/package-zip.ts",
  "src/lib/package-store.server.ts",
  "src/lib/theme-package.ts",
  "src/lib/plugin-manifest.ts",
  "src/lib/plugin-package.ts",
  "src/lib/official-plugins.ts",
  "src/lib/official-plugins.server.ts",
  "src/lib/themes/appearance.ts",
  "src/lib/themes/appearance.server.ts",
  "src/lib/themes.server.ts",
  "src/lib/marketplace-scopes.ts",
  "src/lib/tenant-scope.ts",
  "src/lib/registry-version.ts",
  "src/lib/builder-ast.ts",
  "src/lib/builder-guardrails.ts",
  "src/lib/preview-sources.ts",
  "src/lib/theme-preview-nav.ts",
  "src/components/marketplace/WidgetSandbox.tsx",
];
for (const p of pins) fs.accessSync(p, fs.constants.R_OK);
console.log("pins: " + pins.length + " files present");
'
```
