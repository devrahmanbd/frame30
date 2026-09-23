# Framique — Cloud SaaS CMS Weak-Foundation Report (Sept 18, 2026)

> **Mandate**: proper cloud SaaS CMS like Shopify, WordPress-grade user journey + UX.
> **Method**: `/code-review` + 3 parallel explore subagents + live WordPress audit via Chrome MCP (`http://maxwilliam.shop/wp-admin`, user `maxw`).
> **Repo rules**: `AGENTS.md` (no dead buttons, no fabricated counts, `[A]` needs deny+replay+audit), `BUILD.md` Tier 0, `SYSTEM.md` §4.2/§10.
> **Status of `TODO.md` domain item**: already tracked as §2.1 + §2.2 + `BUILD.md` §0.5 — this report does **not** duplicate it, it adds the 20+ sibling gaps found in the same sweep.

---

## 0. Live WordPress reference (verified this session, NOT from memory)

Logged in via `/wp-login.php` → `/wp-admin/` (WP 7.1 per footer).

### Dashboard (`/wp-admin/`)

- Left `#adminmenu`: Dashboard, Updates, Elementor (Home, Editor, Theme Builder, Submissions, Connect, Upgrade), Posts (All, Add, Categories, Tags), Media (Library, Add), Pages (All, Add), Comments (1 in moderation), **Appearance (Themes, Editor, Fonts)**, **Plugins (Installed Plugins, Add Plugin)**, Users (All, Add, Profile), Tools (Available, Import, Export, Site Health, Export/Erase Personal Data, Theme/Plugin File Editor), Settings (General, Connectors, Writing, Reading, Discussion, Media, Permalinks, Privacy), Collapse button.
- Top toolbar: About WP, site name, `⌘K command palette`, comments bubble, `+ New`, user `Howdy, maxw`.
- Main: Welcome panel (Add new page / Open site editor / Edit styles), Elementor Overview (Create New Page, Recently Edited, News), Site Health (Good + 4 items), At a Glance (1 post, 1 page, 1 comment, theme Twenty Twenty-Five), Activity (Recently Published + Recent Comments with Approve/Reply/Edit/Spam/Trash), Quick Draft, Events (WordCamp Sylhet 2026).

### Themes (`/wp-admin/themes.php`, 3 found)

- Active card: `Active: Twenty Twenty-Five` + primary **Customize** (`site-editor.php?return=...`).
- Inactive cards: **Activate** (`themes.php?action=activate&stylesheet=...&_wpnonce=...`) + **Live Preview** (`site-editor.php?wp_theme_preview=...&return=...`); **Delete** lives in Theme Details modal.
- Header: **Add Theme** → `theme-install.php`, search installed themes box.

### Plugins (`/wp-admin/plugins.php`, 1 installed: Elementor 4.2.4)

- Views: All (1) | Active (1) | Auto-updates Disabled (1). Search box.
- Bulk: Activate, Deactivate, Update, Delete, Enable/Disable Auto-updates + Apply (top + bottom).
- Row: checkbox, `Settings | Deactivate | Get Pro`, Description, Version/By, View details / Docs / Videos, Enable auto-updates toggle.
- Header: **Add Plugin** → `plugin-install.php`.

### WP journey invariants Framique must copy

1. Appearance + Plugins are **first-class top-level** with submenus — never buried under Content/More.
2. Every installed theme: Activate + Live Preview + Delete (Delete blocked while active). Install → Activate → Activated/Customize state machine.
3. Installed Plugins is a **table** with All/Active/Inactive views, bulk actions, per-row Activate|Deactivate|Settings|Delete.
4. `Customize / site-editor` always opens **in context of a theme** (active or `?wp_theme_preview=`), with return URL.
5. Command palette (`⌘K`), Screen Options, Help, collapse menu, At-a-Glance counts are real queries — never fixtures.

---

## 1. P0 — Theme / Plugin / Marketplace lifecycle (WP `themes.php` parity broken)

### WF-01 — Two install paths, only one writes the ledger [P0]

- `src/lib/themes/appearance.server.ts:148-172` (`installCatalogTheme`: direct `store_themes` insert, `is_active:false`, no ledger, `source_install_id=NULL`) vs `src/lib/marketplace-install.server.ts:315-363` (`installBuiltinTheme`: RPC `marketplace_install_preset` + `marketplace_installs` + link).
- Callers: `appearance.functions.ts:22-32` (`themeInstallFn`) from `ThemesScreen.tsx:91-102,237` and `ThemePreviewSplit.tsx:61` + `ThemesScreen.tsx:185-195`; vs `marketplace.functions.ts:69-88` (`marketInstallFn`).
- Effect: `listCatalog.themeStates` (`marketplace.server.ts:60-66`, joins only via `source_install_id`) is blind to Appearance installs; `loadThemesWorkspace` (`appearance.server.ts:106-130`, matches by `source_listing_slug`) ignores ledger status. Same key installed twice → divergent shapes.
- Fix: single `installTheme` server path that always creates inactive `store_themes` + ledger row (per `AGENTS.md` TOP PRIORITY). Retire the direct-insert branch.

### WF-02 — `status='removed'` violates Postgres enum [P0, crash on real DB]

- `marketplace-install.server.ts:390-394` writes `removed`; enum is `installed|trial|paused|rolled_back` (`supabase/baseline_parts/part1.sql:26`, `generated_baseline.sql:26`). Test `marketplace-lifecycle.test.ts:127` passes only on fakeDb.
- Fix: migration adding `removed` (or terminal `uninstalled`), keep delete-then-retire order atomic.

### WF-03 — Non-builtin theme installs never create `store_themes` → Activate/Delete dead [P0]

- `marketplace-install.server.ts:46-145` (`installListing`: ledger + `install_count` bump, then `applyTheme` only); `applyTheme:147-154` calls `market_apply_theme_install` RPC which **does not exist** in any migration (only a comment ref in `20260917220000_phase2f*`).
- UI `dashboard/marketplace/index.tsx:360-384` renders Activate/Delete only from `themeStateBySlug`/`liveInstall` (needs `source_install_id`).
- Fix: implement the RPC (or direct inactive-row insert per WF-01) for `kind=theme` third-party listings; add missing-migration CI check.

### WF-04 — Live Preview is fake: `?preview_theme=` never consumed [P0, WP Customizer parity]

- Builder: `appearance.ts:313-321` builds `/store/<slug>?preview_device=&preview_theme=`; `ThemePreviewSplit.tsx:60,186-190` iframes it.
- Consumer: `store.$slug.index.tsx:20-25` → `getStorefront({slug})` (`storefront.functions.ts:11-26`, zod `{slug}` only) → `loadStorefront` → `loadPublished(merchant.id,"index")` (`storefront.server.ts:159-192`, active theme only). Device toggle only changes iframe `maxWidth` (`181-184`).
- Fix: `preview_theme_id` loader path (`/dashboard/builder?preview_theme_id=:id` per TODO P0) that resolves inactive theme in isolation, read-only, no publish side-effects.

### WF-05 — Plugin Delete exists server-side, zero UI [P0]

- Server `plugins.functions.ts:63-70` (`pluginUninstallFn` → `uninstallPlugin:156-164`, deletes `plugin_state` only) has **zero component imports** (grep). `InstalledApps.tsx:1-74` + `PluginSettingsForm.tsx:16-69` expose Settings + enabled toggle only.
- Server also leaves `marketplace_installs` untouched (no terminal status) and no widget reconciliation.
- Fix: per-row Delete + confirm in Installed table (WP parity), wire `pluginUninstallFn`, retire ledger row.

### WF-06 — Widgets can Pause/Restore but never Uninstall [P0]

- `marketplace-install.server.ts:174-212` + `marketplace.functions.ts:137-151` expose `paused|installed|rolled_back` only. Marketplace UI `index.tsx:375-384,416-424,432-469` wires Delete + `ConfirmDialog` + `marketUninstallThemeFn` for `kind==="theme"` only; no `marketUninstallWidgetFn`.
- Fix: widget uninstall path (delete `plugin_state` + terminal ledger).

### WF-07 — Activate forks the wrong draft; REST diverges [P0]

- `appearance.server.ts:179-204` flips `is_active` then `installRegistryTheme(...,source_listing_slug,true)` → `themes.server.ts:507-531` → RPC `theme_install_preset` (`20260917200000_phase2d_theme_install_preset.sql:34-44`) picks `ORDER BY is_active DESC, created_at ASC LIMIT 1` (active-or-oldest, **not** the `themeId` being activated).
- REST `rest-gateway.server.ts:505-530` flips flags with no fork at all; storefront reads versions/drafts (`loadPublished`), so API-activated theme may not render.
- Fix: fork by explicit `themeId`; single activate implementation shared by UI + REST; contract test asserting published AST follows `is_active`.

### WF-08 — Idempotency key `Date.now()` defeats replay guard [P0, double-charge]

- `marketplace/index.tsx:123-132` mints `${listing.id}-${trial?"trial":"buy"}-${Date.now()}` per click; server replay check is key equality (`marketplace-install.server.ts:51-57`). Double-click → duplicate ledger + double `install_count` (`130-133`) + double debit. Builtin path uses separate slug check (`marketplace.functions.ts:50-67`) — inconsistent.
- Fix: stable key per (merchant, listing, intent) minted once per dialog open; disable-while-pending; dedupe test.

---

## 2. P0 — SaaS hosting / tenant-isolation abuse surface (user-reported `framique.qubickle.com/clients_website`)

> `TODO.md` §2.1–§2.2 + `BUILD.md` §0.5 already track subdomain + onboarding + edge-cache. The below are the **sibling flaws in the same surface** — fix together or the subdomain move alone does not close abuse.

### WF-09 — Shared-cache serves cart/checkout/account/order as `public` — cross-shopper PII leak [P0, critical]

- `server.ts:119-129` caches **any** `GET 200 text/html` under `isStorefrontPath` (`storefront-cache.ts:79-81`, matches `/store/:slug/cart|checkout|account|order|track|search`); headers `public, s-maxage=60, stale-while-revalidate=300`, `vary: accept-language` only (`88-95`). Always called with `null` (`server.ts:127`), so documented `etag tv-...` never emitted.
- Fix: cache only anonymous template docs (index/product/collection/page); `private, no-store` on cart/checkout/account/order; add `Vary: Cookie, Host`; key by tenant+version.

### WF-10 — `localhost` substring bypass kills HTTPS + CSRF [P0]

- `server.ts:159` `hostname.includes("localhost")` gates HTTPS-301 skip (`161`) + CSRF skip (`175,186,194`). `localhost.evil.com` / `mylocalhost.com` → plaintext + no origin check.
- Fix: exact `=== "localhost"` + loopback/`*.local` allowlist, never substring.

### WF-11 — CSRF fail-open on `/api/*` without Origin [P0]

- `server.ts:166-198`: non-`/api/public` + non-`/api/canary-alert` checked only if Origin/Referer present; `else if (!isLocalhost && !pathname.startsWith("/api/")) 403` → any `POST /api/...` **without** headers passes. `/api/public/*` + `/api/canary-alert` skip entirely (`233-244` processes Prometheus webhook with no visible signature).
- Fix: tenant-aware validator (platform domain + verified custom domain + registered `<slug>.framique.store`), require Origin **or** token on mutations; sign canary webhook. (Already in TODO §2.5 — keep.)

### WF-12 — No Host-based tenancy; SYSTEM §4.2 promise is aspirational [P0]

- All loaders resolve by path slug only (`storefront.server.ts:69-76,99-107,159-168,248-256`; `storefront.functions.ts:11-26`). Routes are `store.$slug.*` only; no `<slug>.framique.store` handler, no Host→merchant rewrite in `server.ts` (only canary headers `tenant-canary.server.ts:142-156`). Onboarding `onboarding.tsx:123-243` is 3 steps (name → slug `.store.framique.com:190` → plan), **no domain step** → `DOMAIN_EDGE_HOOK_URL` unset parks domains in `issuing_cert` forever (`domains.server.ts:413-444`).
- Fix: wildcard subdomain + Host rewrite + onboarding domain step with Skip (TODO §2.1 as specified by user: prompt + CNAME to `edge.framique.app` + Skip to free subdomain + Settings › Domains later). Also fix `SYSTEM.md:117-124` until shipped.

### WF-13 — Legacy SVG path: unsanitized upload served as executable `image/svg+xml inline` [P0, stored XSS]

- `media.server.ts:93-131` writes SVG bytes with no `sanitiseSvg` (only `library.server.ts:123-128` has it); served `inline` with only `nosniff` (`api/public/media/$.ts:21,53-61`). Upload is base64 JSON (`media.functions.ts:20-40`, 7.5 MB cap, sync `atob` loop `media.server.ts:151-157`) — event-loop block + no magic-byte check.
- Fix: route all SVG via `sanitiseSvg`, serve as `attachment`/sandboxed, presigned direct-to-storage uploads (TODO §2.3).

### WF-14 — Advertised CSP+nonce never sent; merchant JS runs in storefront origin [P0, skimming]

- `custom-code.ts:486-506` defines `buildCsp`/`newNonce` (`474-480`); `server.ts:77-89` sends only `nosniff/referrer/SAMEORIGIN` — no CSP header. `CustomCode.tsx:39-62` appends `code.js` as live script; `reviewJs:249-271` is regex-deny (bypass via `globalThis['ev'+'al']`, `constructor.constructor`, `import()`); `body` allows `https:` iframes with no `sandbox` (`384`).
- Fix: send CSP + nonce, sandbox body iframes / isolate custom JS like `html` widget `sandboxSrcDoc` (`444-457`); restrict checkout/payment to allowlisted analytics (TODO §2.4).

### WF-15 — `verify-sni` is an unauthenticated DB oracle [P1]

- `api/public/domains/verify-sni.ts:17-82` `GET ?host=` → DB lookup, no rate-limit/token (unlike `callback.ts:52-68` HMAC), `Cache-Control: public, max-age=60`. Distinguishes unregistered/pending/active; per-SNI DB hit; global ingress limit fail-open on Redis error (`server.ts:202-218`).
- Fix: `enforceRateLimit` + negative cache + quota/backoff (TODO §2.6).

### WF-16 — Edge/cert defaults guarantee stuck domains [P1]

- `domains.server.ts:59-66` defaults `cname=edge.framique.app`, `ips=[]` → apex never verifies (`domains.ts:132-167`); empty bearer `421-431` + `callback.ts:52-53` 404 → permanent `issuing_cert`; `sweepDomains:667-679` never re-polls `issuing_cert`; `renewing:717` is not a valid `DomainStatus` (`domains.ts:43-50`) → `illegal_transition` (`118-122`).
- Fix: require env at boot, sweep `issuing_cert`, valid status machine, operator alert on stuck.

---

## 3. P1 — Sidebar / Builder / Auth (WP `#adminmenu` + Gutenberg parity)

### WF-17 — No Appearance/Plugins top-level; Commerce-first taxonomy [P1]

- `console-nav.ts:86-533` has 8 groups (dashboard, orders, products, customers, content, marketing, money, settings). WP Appearance (Themes/Customize/Menus) is flattened into `Content:290-363` (`Pages/Posts/Media/Menus/SEO/Themes & apps` as tabs; `Themes:342-347` + `Page builder:348-354` buried in `more`). No `Plugins` group, no `/dashboard/plugins` route (glob empty); plugins only as builder `WidgetTray` data (`builder.tsx:174-179`).
- `openCustomize` (`ThemesScreen.tsx:126`) jumps context-free to `/builder`; inactive cards hide Activate/Preview on hover (`ThemeCard.tsx:68-82,109-115`).
- Fix: elevate Appearance (Themes, Customize, Menus) + Plugins (Installed, Add New) to top-level per `AGENTS.md` P1 + TODO P1; single nav source of truth; no URL-only routes.

### WF-18 — No accordion submenus, no collapsed flyouts [P1]

- `AdminShell.tsx:113-168` renders 8 flat links ("Shopify-style… Sub-pages are not repeated" comment). Collapsed rail `486-510` is icon + `title` tooltip only. Sub-pages are page-level `SectionTabs:230-314` + `MoreMenu:170-227`, not a sidebar tree. Highlight `isActive:109-111` is group-prefix only (no `current-menu-parent` expansion).
- Fix: accordion in open sidebar + hover flyouts in rail, `current` propagation, matching WP `#adminmenu`.

### WF-19 — Capability gating is affordance-only on theme/plugin paths [P1, authz hole]

- `console-nav.ts:4-7` + `use-membership.ts:76-84` admit client-only filtering. `themes.functions.ts:15-174` + `plugins.functions.ts:14-60` use **only** `requireSupabaseAuth` (+ `currentMerchantId`), while `content-desk/editor/global-blocks/search-console` attach `requirePermission`. Nav hides by `themes.read` but server never asserts it.
- Fix: add `requirePermission("themes.read/update")` etc. to every theme/plugin fn.

### WF-20 — Two page systems, one stub-backed [P1]

- Real: `dashboard/builder.tsx` (autosave `256-262`, status `938-946`, undo/redo `965-980`, commit `751-763`, publish `765-777`, history/rollback/schedule `779-815,1587-1621`, themes panel `1623-1797`) + `EditorShell.tsx:126-137,328-336` (draft/publish/revisions/restore/schedule via `useEditorDoc.ts:157-168`, `DocumentPanel`, `content/editor.tsx:20,100-115` `?editor=builder` = "Edit with Page Builder").
- Stub: legacy `dashboard/pages.tsx:22-41` (no permission, `isPublished` boolean + `archivePageFn` only) imports `page-builder.ts:12-20,157-169` headed `// Stub — full implementation was not committed` (`1-3`), `starterDoc:91` is `any`-cast, yet exposes a "Page builder" toggle (`279-291,428-430`).
- Fix: retire/re-route legacy desk; Pages table gets "Edit with Page Builder" loading real AST (TODO P1); schedule form must allow version pick (currently hardcodes `versions[0]:792-793`).

### WF-21 — B2C/B2B + route guards are client-side [P1]

- No `/admin` (glob empty; only `robots.txt` + `auth.tsx:53-85` `landingFor` which rejects `/root|/admin` prefixes; console root is `/dashboard`). Signup `registerMerchantFn` (`identity.server.ts:398-418`) sets no `account_type`/merchant row; store comes later via `create_store` (`onboarding.tsx:84-93`) — signup alone never escalates (good), but console rejects `account_type==="customer"` in two client spots (`auth.tsx:133-144`, `dashboard.tsx:21-25`) while nothing sets it on storefront signup (`store.$slug.account.tsx:57-62` shares session) and OAuth (`auth.tsx:277-291`) lands in onboarding by default.
- All guards client-side (`ssr:false`: `_authenticated/route.tsx:5`, `root.tsx:18`; `supabase.auth.getUser()` in `beforeLoad`; tenant from `localStorage fq.active_merchant_id` `use-merchant.ts:60-70`).
- `/root` is **not** broken (`root.tsx:17-60`, `root/index.tsx:4-6`, `RootLayout:74-103`) — but `root.tsx:26-30` + `root/login.tsx:50-54` do client `platform_admins` SELECT (migration `20260909194000:6-8` revokes write only; SELECT policy unclear → oracle or wasted round-trip + error oracle `login.tsx:74-76`).
- Fix: server `beforeLoad`/loaders with `requireSupabaseAuth` + membership; set `account_type` server-side; delete client `platform_admins` SELECT, rely on `platformIsAdminFn` + DENY SELECT + test.

---

## 4. P2 — Polish / trust (violates repo rules today)

- **WF-22 — Fabricated theme ratings/installs**: `catalog-meta.ts:23-121` hardcodes `4.4–4.9` / `2600–12800`; `appearance.server.ts:109-130` never reads real counts (comment claims override); `AddThemeScreen.tsx:262-266` renders as fact; Popular sort `appearance.ts:200-211` is fixture order. Widgets file (`builtin-plugins.ts:356-360`) does "Honest zeros" — themes must match. Violates `AGENTS.md` TOP PRIORITY.
- **WF-23 — Upload Theme dead end**: `AddThemeScreen.tsx:272-337` validates zip client-side only (`appearance.ts:262-279`), success copy mentions media library, zero server path (no `themeUploadFn`/storage). Violates "no action button without working server path".
- **WF-24 — No audit rows for theme/plugin lifecycle**: `appearance.server.ts:147-218`, `marketplace-install.server.ts:46-212,315-396`, `plugins.server.ts:71-164` write zero audit; `theme_audit` table (`types.ts:8777`) has no writer. `[A]` requires actor/before/after/reason.
- **WF-25 — Preview ‹ › pools catalogue only**: `ThemesScreen.tsx:151-166` steps `catalogue`; custom/installed-only (`key=null`, `appearance.ts:13-15,291-301`) breaks. Details stepping (`168-172`) correctly uses `installed`.
- **WF-26 — Tenant canary leaks + spoofing**: `server.ts:131-150` echoes `x-framique-tenant-id` on every shopper response; `tenant-canary.server.ts:111-169,299-311` trusts `X-Merchant-Id/X-Store-Slug/X-Tenant-Id`, `?merchant_id/store_slug`, cookies, and unconditional `X-Framique-Slot-Override: green|blue`. Fix: auth-gate override, stop echoing IDs.
- **WF-27 — Gates with no enforcer**: `1.9` CI gate green locally but `.github/workflows/gates.yml` missing (BUILD `~` line) — nothing enforces per push.

---

## 5. Remediation order (maps to TODO/BUILD — do not re-plan elsewhere)

1. **SaaS isolation first** (WF-09–12,16): subdomain + Host rewrite + onboarding domain step (Skip → free subdomain → Settings › Domains) + cache scoping + CSRF tenant-awareness. Unblocks everything Shopify-like.
2. **Theme/plugin correctness** (WF-01–08): single install path (inactive + ledger), enum migration, third-party row creation, real preview route, plugin/widget Delete, correct fork, stable idempotency.
3. **Nav + authz** (WF-17–19,21): Appearance/Plugins top-level + accordion/flyouts + `requirePermission` on theme/plugin fns + server guards + persona hardening.
4. **Builder dedupe** (WF-20): kill stub desk, Pages "Edit with Page Builder" on real AST.
5. **Trust/polish** (WF-22–27): honest zeros, upload path or remove button, audit writers, preview stepping, canary header hygiene, CI gates workflow.

Every `[A]` fix ships with deny + replay + audit assertion per `AGENTS.md` Testing section before ticking `BUILD.md` §0.

---

## Appendix — Files touched by this audit (evidence index)

- Chrome: `/wp-admin/` (dashboard), `/wp-admin/themes.php` (3 themes, Customize/Activate/Preview), `/wp-admin/plugins.php` (Elementor row, bulk, views).
- Repo: `src/lib/console-nav.ts`, `src/components/admin/AdminShell.tsx`, `src/lib/themes/appearance.server.ts`, `appearance.ts`, `appearance.functions.ts`, `catalog-meta.ts`, `src/lib/marketplace-install.server.ts`, `marketplace.server.ts`, `marketplace.functions.ts`, `src/lib/plugins.server.ts`, `plugins.functions.ts`, `src/lib/storefront-cache.ts`, `src/server.ts`, `src/lib/storefront.server.ts`, `storefront.functions.ts`, `src/routes/store.$slug.index.tsx`, `src/routes/_authenticated/onboarding.tsx`, `dashboard/marketplace/index.tsx`, `dashboard/builder.tsx`, `dashboard/pages.tsx`, `content/editor.tsx`, `src/components/admin/themes/*`, `src/components/marketplace/InstalledApps.tsx`, `src/lib/media.server.ts`, `media.functions.ts`, `src/components/store/CustomCode.tsx`, `src/lib/custom-code.ts`, `src/lib/domains.ts`, `domains.server.ts`, `api/public/domains/verify-sni.ts`, `api/public/media/$.ts`, `src/lib/tenant-canary.server.ts`, `src/lib/rest-gateway.server.ts`, `TODO.md` §2.1–2.2, `BUILD.md` §0/§1.9, `SYSTEM.md` §4.2.
