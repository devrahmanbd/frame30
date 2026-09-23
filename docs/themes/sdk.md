# Theme SDK (integrator reference)

Author guide: `./creation.md`. This file is the integrator contract: server
functions with input shapes, tables with key columns, the registry/seed
pipeline, the marketplace flow, homepage-as-page, the error catalogue, and
versioning/rollback/schedules. Only APIs read in this repo are listed.

## 1. Server functions inventory

Thin `createServerFn` wrappers (typed RPC boundary only) → `*.server.ts`
implementations. Merchant scope resolves via `currentMerchantId`
(`src/lib/themes.functions.ts:7-10`,
`src/lib/themes/appearance.functions.ts:7-10`,
`src/lib/marketplace.functions.ts:8-11`).

### Appearance desk — `src/lib/themes/appearance.functions.ts`

| Function (`:line`) | Method / permission | Input | Server (`src/lib/themes/appearance.server.ts`) |
|---|---|---|---|
| `themesWorkspaceFn` (`:15-23`) | GET, `themes.read` | — | `loadThemesWorkspace` (`:108-147`) |
| `themeInstallFn` (`:25-36`) | POST, `themes.update` | `{ key: string(1-64) }` | `installCatalogTheme` (`:174-297`) |
| `themeActivateFn` (`:38-49`) | POST, `themes.update` | `{ id: uuid }` | `activateTheme` (`:418-485`, flag+pointer flip in one statement) |
| `themeDeleteFn` (`:51-62`) | POST, `themes.update` | `{ id: uuid }` | `deleteTheme` (`:487-546`) |
| `themeFlagsFn` (`:64-85`) | POST, `themes.update` | `{ id: uuid, autoUpdate?: boolean, favourite?: boolean, name?: string(≤80) }` | `setThemeFlags` (`:548-568`) |
| `themeCatalogFavouriteFn` (`:87-100`) | POST, `themes.update` | `{ key: string(1-64), favourite: boolean }` | `setCatalogFavourite` (`:571-594`) |

### Builder workspace / versions — `src/lib/themes.functions.ts`

| Function (`:line`) | Permission | Input | Server (`src/lib/themes.server.ts`) |
|---|---|---|---|
| `builderWorkspaceFn` (`:15-22`) | `themes.read` | `{ previewThemeId?: string }` | `loadWorkspace` (`:167-252`) |
| `builderAutosaveFn` (`:24-40`) | `themes.update` | `{ themeId: uuid, templates: unknown, tokens: unknown, revision: int 0-1e6 }` | `autosave` (`:311-335`) → RPC `theme_autosave` |
| `builderCommitFn` (`:42-58`) | `themes.update` | `{ themeId: uuid, templates, tokens, note?: string(≤160) }` | `commitVersion` (`:338-359`) → RPC `theme_commit` |
| `builderPublishFn` (`:60-76`) | `themes.publish` | `{ themeId: uuid, templates, tokens, note?: string(≤160) }` | `publishVersion` (`:382-448`) → gates + `theme_commit` + `theme_publish` |
| `builderRollbackFn` (`:78-87`) | `themes.update` | `{ versionId: uuid }` | `rollbackVersion` (`:450-478`) → RPC `theme_rollback` |
| `builderScheduleFn` (`:89-105`) | `themes.update` | `{ themeId: uuid, versionId: uuid\|null, action: "publish"\|"unpublish", runAt: datetime }` | `scheduleTheme` (`:480-498`) → RPC `theme_schedule_set` |
| `builderCancelScheduleFn` (`:107-116`) | `themes.update` | `{ scheduleId: uuid }` | `cancelSchedule` (`:500-508`) → RPC `theme_schedule_cancel` |
| `builderRegistryFn` (`:118-123`) | `themes.read` | — | `listRegistry` (`:553-601`) |
| `builderInstallFn` (`:125-144`) | `themes.update` | `{ key: string(≤60), overwriteDraft?: boolean }` | `installRegistryTheme` (`:647-700`) → RPC `theme_install_preset` |
| `builderPresetSwapFn` (`:146-160`) | `themes.update` | `{ key: string(≤60), templates: unknown }` | `previewPresetSwap` (`:708-738`) |
| `builderUpdatePreviewFn` (`:162-171`) | `themes.read` | `{ key?: string(≤60) }` | `previewThemeUpdate` |
| `builderUpdateApplyFn` (`:173-188`) | `themes.update` | `{ key: string(≤60), mode: "adopt"\|"keep_mine", expectedRevision: int }` | `applyThemeUpdate` |
| `builderRegistryVersionFn` (`:291-296`) | none (GET) | — | `registryVersionInfo` (`src/lib/registry-version.ts`) |

### Demo imports — `src/lib/themes.functions.ts:190-288`

| Function (`:line`) | Input | Service (`src/lib/theme-imports.server.ts`) |
|---|---|---|
| `builderDemoImportFn` (`:192-201`) | `{ themeKey: string(1-64) }` | `importDemoContent` (`src/lib/themes.server.ts`) |
| `importPreflightFn` (`:208-217`) | `{ themeKey }` | `importPreflight` (`:108-159`) — read-only |
| `importThemeSlidesFn` (`:219-228`) | `{ themeKey }` | `importThemeSlides` (`:273-309`) → RPC `import_theme_slides` |
| `importThemeMediaFn` (`:230-239`) | `{ themeKey, overwrite?: boolean }` | `importThemeMedia` (`:315-360`) → RPC `import_theme_media` |
| `importThemeProductsFn` (`:241-258`) | `{ themeKey, overwrite?: boolean }` (+ catalog) | `importThemeProducts` (`:367-414`) → RPC `import_theme_products` |
| `importThemePostsFn` (`:260-269`) | `{ themeKey, overwrite?: boolean }` | `importThemePosts` (`:420-465`) → RPC `import_theme_posts` |
| `importThemeAllFn` (`:271-280`) | `{ themeKey, overwrite?: boolean }` | `importThemeAll` (`:471-522`) — slides → media → products → posts |
| `builderDemoPurgeFn` (`:282-288`) | — | `purgeDemoContent` (tenant-scoped, `is_demo` flags) |

### Marketplace — `src/lib/marketplace.functions.ts`

| Function (`:line`) | Input notes |
|---|---|
| `marketCatalogFn` (`:15-25`) | GET — `{ merchantId, appVersion, themes, widgets, installs, themeStates }` from `listCatalog` (`src/lib/marketplace.server.ts:34-121`) |
| `marketInstallFn` (`:27-149`) | `{ kind: "theme"\|"widget", listingId (uuid or preset:<key>), trial, idempotencyKey(8-80), versionId?, grantedScopes[] }` — builtin theme path calls `installBuiltinTheme` (`:78-98`); replay on re-click (`:59-77`) |
| `marketInstallStatusFn` (`:151-171`) | `{ installId: uuid, status: "paused"\|"installed"\|"rolled_back" }` |
| `marketBulkInstallsFn` (`:178-198`) | `{ installIds: uuid[1-50], action: "enable"\|"pause"\|"delete" }` — per-row, one bad row never aborts the batch |
| `marketPreviewTokenFn` (`:205-232`) | `{ themeId: uuid }` → `{ url: /store/<slug>?preview_token=…, expiresAt }` |
| `marketUninstallThemeFn` (`:235-250`) | `{ installId: uuid }` → `uninstallBuiltinTheme` |
| `marketUninstallWidgetFn` (`:253-268`) | `{ installId: uuid }` → `uninstallWidgetInstall` |
| `marketMineFn` / `marketSaveListingFn` / `marketListingStatusFn` (`:270-332`) | Seller surface (`listMine`, `saveListing`, `sellerTransition`) |
| `marketModerationFn` / `marketModerateFn` (`:334-361`) | Platform-admin gated via `isPlatformAdmin` (`src/lib/marketplace.server.ts:212-219`) |

Form/newsletter RPCs themes consume: `submitContactFn`
(`src/lib/contact.functions.ts:4-24`), `subscribeNewsletterFn` /
`verifyNewsletterFn` / `unsubscribeNewsletterFn`
(`src/lib/newsletter.functions.ts:13-50`).

## 2. Database tables + key columns

Column names below come from the `SELECT` lists and write payloads in code
(DDL lives in `supabase/migrations/`; the engine routines in
`20260917210000_phase2e_theme_engine.sql`).

| Table | Key columns | Notes |
|---|---|---|
| `store_themes` | `id, merchant_id, name, is_active, source_listing_slug, source_version, source_install_id, screenshot_url, author, description, tags, auto_update, favourite, published_version_id, installed_at, created_at, updated_at` | One row per installed theme, exactly one `is_active` per merchant. Read list: `src/lib/themes/appearance.server.ts:39-58`. `installed_at` has no DB default — always write it (`:204-208`). |
| `theme_versions` | `id, merchant_id, theme_id, version (int), status ("draft"\|"published"), note, label, templates, tokens, ast, published_at, rollback_of, source_registry_key, source_registry_version, created_by, created_at` | Immutable snapshots; reads at `src/lib/themes.server.ts:176-196`, writes at `src/lib/themes/appearance.server.ts:217-240` and RPC `theme_commit`/`theme_publish`. |
| `theme_drafts` | `merchant_id, theme_id, revision (monotonic), templates, tokens, updated_at, updated_by` | Autosave is last-writer-wins on `revision` (`theme_autosave`, `supabase/migrations/20260917210000_phase2e_theme_engine.sql:14-51`). |
| `theme_audit` | `merchant_id, theme_id, actor, action, before, after` | Append-only rows on installed/activated/deleted (`src/lib/themes/appearance.server.ts:288-295`, `:453-460`, `:542-549`). |
| `theme_registry` | `key, name_en, name_bn, summary_en, summary_bn, category, version, preset {tokens, templates}, active, sort_order` | Catalogue source; read at `src/lib/themes.server.ts:556-562`; seeded idempotently (see §3). |
| `theme_schedules` | `id, theme_id, action ("publish"\|"unpublish"), run_at, state, version_id, last_error` | Read at `src/lib/themes.server.ts:190-194`; set/cancel via `theme_schedule_set` / `theme_schedule_cancel`. |
| `theme_catalog_favourites` | `merchant_id, theme_key` | Star/unstar (`src/lib/themes/appearance.server.ts:576-599`). |
| `marketplace_themes` / `marketplace_widgets` | `id, seller_merchant_id, name, slug, description, vendor_name, thumbnail_url, category, version, compatible_versions, price_minor_int, currency_code, trial_allowed, status, manifest, version_history, install_count, rating_sum, rating_count, created_at` | `LISTING_COLUMNS`, `src/lib/marketplace.server.ts:19-20`. |
| `marketplace_installs` | `id, merchant_id, kind ("theme"\|"widget"), theme_id, widget_id, listing_slug, listing_name, version, price_minor_int, currency_code, is_trial, status ("installed"\|"trial"\|"paused"\|"removed"\|"rolled_back"), idempotency_key, started_at, expires_at, created_at` | Ledger; built-in theme insert at `src/lib/marketplace-install.server.ts:480-498`; terminal status `removed` on uninstall (`:552-556`). |

**Published-pointer coherence rule** (non-negotiable): the storefront
renders only the version named by `store_themes.published_version_id` with
`theme_versions.status = "published"`
(`src/lib/themes/appearance.server.ts:299-309`). Activation adopts a valid
pointer, else the newest *published* version — never `MAX(version)`, never
a draft (`:310-349`). Publish moves the pointer (`theme_publish`,
`.../20260917210000_phase2e_theme_engine.sql:96-120`); delete cascades
drafts + versions and retires the ledger row (`:492-551`).

## 3. Registry + seed pipeline

1. **Author in code.** Presets in `src/lib/theme-presets.ts` (`SPECS`
   `:421-778`, `THEME_PRESETS` `:785-788`); blueprints in
   `src/lib/theme-blueprints.ts`; metadata floor in
   `src/lib/themes/catalog-meta.ts:30-233`.
2. **Generate the migration** (never hand-edit the output):
   ```bash
   bun scripts/seed-theme-registry.ts > supabase/migrations/<timestamp>_theme_registry_seed.sql
   ```
   Generator: `scripts/seed-theme-registry.ts:1-55`; curated keys at `:16`
   (`supershop`, `clothing-heritage`).
3. **Apply live as `supabase_admin`** (script header `:11-12`). The
   generated migration enforces a unique key then upserts
   (`supabase/migrations/20260922090000_theme_registry_seed.sql:5-17`):
   ```sql
   INSERT INTO public.theme_registry
     (key, name_en, name_bn, summary_en, summary_bn, category, version, preset, active, sort_order)
   VALUES (...) ON CONFLICT (key) DO UPDATE SET ...;
   ```
4. **Runtime read** (`src/lib/themes.server.ts:553-601`): cached
   (`theme-registry:v3`, 300s); code presets are the floor, SQL rows
   override metadata of keys they name; empty/unreachable registry degrades
   to the floor — except demo imports, which need SQL rows.
5. **Package validation** (`registryPackage`, `:609-639`): lint errors or
   builder-API incompatibility (`PRESET_API_RANGE`,
   `checkApiCompatibility`) reject the install with
   `builder.registry_invalid`.

Current curated offer: only `supershop` + `clothing-heritage` are listed —
enforced in `listCatalog` (`src/lib/marketplace.server.ts:103-116`, sellers always see their own listings via the `mine` exemption) and in
`VISIBLE_THEME_KEYS` (`src/lib/themes/appearance.ts:268-271`), with the
active theme always exempt (`visibleInstalled`, `:274-278`).

## 4. Marketplace flow (listing → install ledger → activate → audit)

1. **Listing.** `listCatalog()` (`src/lib/marketplace.server.ts:34-121`)
   returns official built-ins first (`builtinThemes`, `:129-164`: synthetic
   rows `preset:<key>`, price 0, no trial) plus active third-party rows,
   filtered to `VISIBLE_THEME_KEYS`; `themeStates` links installed rows via
   `source_install_id`/`source_listing_slug` (name fallback `:71-98`).
2. **Install ledger.** `marketInstallFn`
   (`src/lib/marketplace.functions.ts:27-149`):
   builtin-theme installs call `installBuiltinTheme()`
   (`src/lib/marketplace-install.server.ts:456-511`) → RPC
   `marketplace_install_preset` + **`marketplace_installs` insert**
   (`status: "installed"`, `idempotency_key`) + `store_themes` linkage
   (`source_install_id`, `source_listing_slug`). The Appearance-desk path
   `installCatalogTheme()` writes the same five pieces (theme row +
   version 1 `published` + draft + ledger + linkage + audit,
   `src/lib/themes/appearance.server.ts:166-297`). Re-clicks replay the
   original install instead of stacking rows (`marketplace.functions.ts:59-77`).
3. **Activate.** Separate explicit step (WordPress parity,
   `marketplace.functions.ts:78-81`): `themeActivateFn({ id })` →
   `activateTheme()` — guard → clear other flags → set active → repair
   pointer → `theme.activated` audit → `purgeStorefront("publish")` →
   registry refresh with `overwrite=false`
   (`src/lib/themes/appearance.server.ts:418-490`).
4. **Audit rows.** Every install/activation/deletion appends to
   `theme_audit` (`theme.installed` `:288-295`, `theme.activated`
   `:453-460`, `theme.deleted` `:542-549`); uninstall retires the ledger
   row to `removed` (`marketplace-install.server.ts:552-556`,
   `appearance.server.ts:518-534`).

Install → publish → activate sequence (copy-pasteable):

```ts
import { themeInstallFn, themeActivateFn } from "@/lib/themes/appearance.functions";
import { builderPublishFn } from "@/lib/themes.functions";

const { id, alreadyInstalled } = await themeInstallFn({ key: "clothing-heritage" });
await builderPublishFn({ themeId: id, templates, tokens, note: "Release 1.0.0" });
await themeActivateFn({ id }); // { id, applied }
```

## 5. Homepage-as-page

- **Designation.** `merchant_settings.setup_steps.homepage_page_id`
  (a `storefront_pages` UUID) marks the merchant-chosen homepage.
  Resolution (`resolveHomepageSlug`,
  `src/lib/storefront.server.ts:531-538`, called at `:455-458`): non-UUID → `null`; published +
  not-trashed + not-deleted → slug; anything else → `null` and the `/`
  route falls back to the theme `index` template. Set from the
  Pages list (`src/lib/content-desk.server.ts:773-786`).
- **Rendering.** `StoreHomepage`
  (`src/components/store/StoreHomepage.tsx:18-99`): same chrome and theme
  tokens as ordinary pages via `ThemeChrome` (`template="page"`, `:81-94`);
  builder pages render `StudioNodes` (`:51-55`), markdown pages render the
  title/excerpt header + escaped HTML (`:41-50`, `:57-67`); dashboard
  footer menus appended when claimed (`:95-96`).
- **Builder editing loop.** `loadWorkspace`
  (`src/lib/themes.server.ts:167-252`): newest draft wins over newest
  version over empty defaults; returns `{ theme, templates, tokens,
  revision, versions, schedules, issues, isPreview }`. Edits autosave with
  monotonic `revision` (`autosave`, `:311-335`), snapshot with
  `commitVersion` (`:338-359`), go live with `publishVersion`
  (`:382-448`).

## 6. Error catalog

`ThemeDeskError` (`src/lib/themes/appearance.server.ts:29-37`) carries
`code`; `BuilderError` (`src/lib/themes.server.ts:38-46`) likewise.
`ImportError` (`src/lib/theme-imports.server.ts:15-23`) wraps RPC failures.

| Code | Thrown at | Meaning | Resolve |
|---|---|---|---|
| `theme.missing` | `appearance.server.ts:162` | Theme row not installed for this merchant | Install first (`themeInstallFn`) |
| `theme.unknown` | `:183` | Key not in catalogue | Check `listRegistry` / spelling |
| `theme.install_failed` | `:213`, `:238`, `:277` | Row/version/draft/ledger step failed (partial rows rolled back) | Retry install; check logs |
| `theme.unpublished` | `:381`, `:402` | No publishable version to go live with | `builderPublishFn` before `themeActivateFn` |
| `theme.active` | `:500` | Delete refused on the live theme | Activate another theme first |
| `builder.registry_missing` | `themes.server.ts:658`, `:717` | Key not in registry | Seed registry (§3) |
| `builder.registry_invalid` | `:625`, `:724` | Package failed lint/API validation | Fix template errors, check `api` range |
| `builder.publish_blocked` | `:427` | Lint / translation / font / contrast gates failed (first 5 joined) | Fix listed issues; see `./creation.md` §7 |
| `builder.theme_missing` / `builder.version_missing` | SQL `theme_autosave`/`theme_commit`/`theme_publish` | Bad theme/version id | Reload workspace, use live ids |
| `auth.required` / `forbidden` | every `SECURITY DEFINER` RPC | No session / not an active member or admin | Sign in; check `merchant_members` |
| `market_listing_not_found` | `marketplace-install.server.ts:464` | Builtin key unknown | Use a catalogue key |
| `market_install_failed` | `:477`, `:498` | RPC or ledger insert failed | Retry with a fresh `idempotencyKey` |
| `market_install_not_found` / `market_theme_not_linked` | `:530`, `:547` | Ledger row / theme linkage missing | Reinstall; check `themeStates` |
| `market_forbidden` | `marketplace.functions.ts:359`, `:444` | Non-admin moderation attempt | Platform admin only |
| `market_trial_not_allowed` | `:55` | Trial on a builtin | Install without `trial` |
| Import `status: "noop"` | `theme-imports.server.ts:31-38` | Skipped, not failed (`no_theme`, `blueprint_not_found`, `no_slides_in_blueprint`, `slides_already_exist`) | Seed registry / pick a theme with slides / pass `overwrite: true` after preflight |

## 7. Versioning + rollback + schedules API summary

- **Autosave** `builderAutosaveFn({ themeId, templates, tokens, revision })`
  → `theme_autosave` RPC: missing draft accepts `revision >= 0`; otherwise
  only `revision > stored` applies (`.../20260917210000_phase2e_theme_engine.sql:14-51`).
  Returns `{ revision, applied }`.
- **Commit** `builderCommitFn({ themeId, templates, tokens, note?, label? })`
  → `theme_commit` RPC: identical consecutive drafts reuse the previous
  version; otherwise inserts `status: "draft"` with `version = max + 1`
  (`:53-94`). Returns `{ versionId }`.
- **Publish** `builderPublishFn` → gates (lint errors, ≥90% বাংলা via
  `translationGate(translationCoverage(templates))`
  (`src/lib/builder-guardrails.ts:166-179`,
  `src/lib/translation-coverage.ts:89`), font licence/budget, contrast —
  composed in `composePublishGate`
  (`src/lib/publish-gates.ts:262-...`)) → commit → `snapshotCustomCode` →
  `theme_publish` RPC (sets `status = "published"`, moves
  `published_version_id`) → `purgeStorefront("publish", merchantId)`
  (`src/lib/themes.server.ts:382-448`). Permission: `themes.publish`.
- **Rollback** `builderRollbackFn({ versionId })` → `theme_rollback` RPC
  (new version id) + `restoreCustomCode` + `purgeStorefront("rollback")`
  (`:450-478`). Returns `{ versionId: newId }`.
- **Schedules** `builderScheduleFn({ themeId, versionId|null, action,
  runAt })` → `theme_schedule_set` (returns `{ id }`);
  `builderCancelScheduleFn({ scheduleId })` → `theme_schedule_cancel`
  (returns `{ ok: true }`) (`:480-508`). Workspace lists the queue
  (`theme_schedules` select, `:190-194`).
- **Coherence.** Publish/rollback purge only the tenant scope
  (`purgeStorefront`, `:370-379`); activation awaits the purge so the
  storefront never serves a stale theme
  (`src/lib/themes/appearance.server.ts:462-470`).
