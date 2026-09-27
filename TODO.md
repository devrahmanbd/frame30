# Framique Master Execution Plan & Design/SEO Audit (TODO.md)

> **Status**: Living Execution Blueprint  
> **Semrush API Key**: `[REDACTED_BY_SECURITY_POLICY]`  
> **Target Standards**: `DESIGN.md`, Hallmark Skill Guidelines, OKLCH Comfort Contrast, Google Search Essentials, WCAG 2.1 AAA

---

## ✅ FINAL PRIORITY LIST (Sept 18, 2026 — the single ordered backlog; detail lives in the sections below)

### P0 — Security first (blocks everything else)

- [x] **Contained exposure**: frame30 + frame29 flipped private (both carried live `.env`); redacted OpenRouter key confirmed placeholder-only.
- [x] **Rotated Supabase JWT secret + anon/service keys** (Sept 18): new secret/keys in framebase + framique envs, stack recreated, app rebuilt (VITE keys), old keys 401, data intact (4 merchants/20 users), new `.env` committed.
- [ ] **OWNER ACTION — rotate what no CLI can**: GitHub PAT `ghp_ESXI…Cv5P` (pasted in chat + git remotes), Semrush key (TODO header + SEO docs), SMTP password (framebase env). Old Supabase keys are dead; these three are still live.
- [x] **Shared-cache PII leak** (`REPORT.md` WF-09) — FIXED this session: `isPersonalizedStorefrontPath` guard-first in `withStorefrontCache` + `private, no-store` on cart/checkout/account/order/track (both shapes); `storefront-cache.test.ts` 5/5 green.
- [x] **`localhost` substring bypass** (WF-10) — FIXED this session: `isLocalHostname` exact-match (`server.ts`); `localhost.evil.com`/`mylocalhost.com` no longer skip HTTPS + CSRF; `edge-hosts.test.ts` 3/3 green.
- [x] **B2C/B2B segregation PROVEN working** (Sept 18 live-account tests): pure customer reads nothing cross-tenant (orders/members/customers/invoices empty), platform_admins empty, writes denied + data untouched, /dashboard leaks nothing, /root neutral. Self-serve seller signup via onboarding is legitimate, not a hole.
- [x] **RLS Tier-1 lockdown live** (`20260918120000_p0_rls_lockdown.sql`): subscriptions/mfa_recovery_codes/oauth_tokens/integration_connections/payout_* /platform_snapshots/theme_favourites closed from `ALL TO public`. Verified: anon+customer read/write denied, member own-row reads intact, service paths bypass unaffected.
- [ ] **RLS Tier-2 (content/telemetry, write-side only)**: 19 remaining `ALL TO public` policies (analytics_*, revisions, nav/terms, seo_not_found_log, web_vitals_sample, theme_assets, builder_template_seo, integration_probes, url_redirects) — reads are intentional, writes need member/service scoping.
- [ ] **SVG stored-XSS via legacy media path** (WF-13): `media.server.ts` skips `sanitiseSvg`, serves `inline` — route all SVG via sanitizer, serve `attachment`/sandboxed; presigned uploads (§2.3).
- [x] **XSS allowlist PROVEN holding** (Sept 18 adversarial suite `custom-code-xss.test.ts`, 10/10 payloads neutralized: event handlers, script tags, javascript: URLs, srcdoc, form actions). Checkout/cart never render merchant code. CSP script-src emission deferred to P2 (breakage risk without staged rollout; allowlist + exclusion are the enforced controls).
- [ ] **Custom-code XSS sandbox** (§2.4: CSP + sandbox merchant HTML/JS, keep checkout/payment surfaces clean).
- [x] **CSRF check PROVEN correct** (Sept 18 live probes via public chain: forged Origin → 403, same-origin → passthrough, custom-domain simulation passes via Host forwarding; all gateway callbacks live under exempt `/api/public/*`; direct-origin access firewalled). No change needed.
- [x] **Plan-tiered domain quotas** (`domainQuotaForPlan`: launch 1 / growth 3 / business 10 / enterprise 25, fail-closed) wired into `addDomain` alongside existing `domains.write` rate limits.
- [ ] **Tenant-aware CSRF validator** (§2.5: custom domains + gateway return redirects currently risk 403s).
- [ ] **SNI/domain quotas + rate limits** (§2.6 + WF-15/WF-16: `verify-sni` unauthenticated DB oracle; `issuing_cert` never re-polled, `renewing` invalid status — rate-limit, negative cache, sweep stuck states).

### P1 — Merchant journey must work end-to-end (onboarding → dashboard → marketplace)

- [x] DONE (Sept 17–18): step-up `plan.write` block, `create_store`/`store_slug_status`, `vat_resolve`/`collection_resolve`, 9 theme-engine RPCs, `cms_entitlements` rewrite, marketplace preset+plugin bridge with replay guard, install-as-new-inactive + Activate/Delete, schema-drift repairs (phases 2b–2g).
- [x] **Marketplace out of hiding → sidebar top-level**: new `Marketplace` nav group (Themes, Widgets & Plugins with `?tab=` deep-link, Installed, Add New) — verified live in browser (group renders, widgets link lands on active widgets tab). `NavItem.search` threading added for deep-links.
- [ ] **Builder Elementor parity** (P0-builder checklist below: top-bar contract, Content/Style/Advanced tabs, Navigator, History/Revisions split, Templates library, Theme Builder conditions, publish-modal checklist).
- [ ] **WP-parity P0 remainder**: Live Preview wiring (WF-04: `?preview_theme=` dead — needs real `preview_theme_id` route), Add Theme tile, Details-modal parity, plugin **Delete** (WF-05: server exists, zero UI) + widget uninstall (WF-06), Add-New routing, bulk actions (see 🔴 block below).
- [ ] **Theme-install correctness** (WF-01/02/03/07/08): single install path (kill `installCatalogTheme` direct-insert bypass of ledger), `removed` enum migration, third-party `store_themes` row creation (missing `market_apply_theme_install` RPC), activate-by-explicit-`themeId` (RPC picks wrong draft), stable idempotency key (kill `Date.now()` per click).
- [ ] **Subdomain architecture** (§2.1: wildcard `*.framique.store`, onboarding custom-domain step, edge tenant rewrite) — sub-path hosting is a security + SEO liability.
- [ ] **Edge-cache tenant awareness** (§2.2: `isStorefrontPath` bypasses cache on custom domains — origin-crash risk under load).
- [ ] **Presigned media uploads** (§2.3: base64 RPC uploads risk V8 heap blowups + Nitro 413s).

### P2 — Console parity + growth

- [x] **WP P1 sidebar core**: collapsed rail + hover flyouts + accordion + `aria-current` already in `AdminShell` (verified); **keyboard gap closed** — flyouts now open on focus, close on blur-away/Escape.
- [ ] **WP P1 remaining**: elevate Appearance + Plugins top-level (WF-17/18), `requirePermission` on theme/plugin fns (WF-19), retire stub-backed legacy pages desk (WF-20: two page systems).
- [x] **Pages-table "Edit with Page Builder"**: verified fully wired (`rowActions` → `?editor=builder` → `EditorShell` mode switch, covered by existing test).
- [ ] **WP P2**: theme screenshot pipeline; honest-zero catalog counts (WF-22: hardcoded 4.4–4.9 ratings/2600–12800 installs violate no-fabrication rule); Upload Theme server path or remove button (WF-23); audit rows for all lifecycle mutations (WF-24); preview ‹ › pooling (WF-25); canary header hygiene (WF-26); CI gates workflow (WF-27: `.github/workflows/gates.yml` missing).
- [ ] **Design §1.4 leftovers + SEO programmatic pages** (§3 matrix is reference, execute per quarter).

### Reference (not backlog — do not action directly)

- §1 design audit (fixes applied), §2 skills stack, §3 SEO matrix, §4 page specs, §5 done phases.

---

## 🔴 TOP PRIORITY — WordPress-Parity CMS Program (Audited Sept 18, 2026)

> **Reference Target**: Live WordPress 6.8+ Dashboard (`http://maxwilliam.shop/wp-admin`, audited with credentials `maxw`).
> **Core Mandate**: Framique must deliver the exact user experience, user journey, theme/plugin/builder management systems, and sidebar architecture of WordPress.
> **Honest assessment (reviewer's note, Sept 18, 2026)**: our engine is genuinely ahead of plain WordPress — immutable theme versions with publish/rollback, autosave drafts, scheduled releases, brand tokens, global blocks, SEO drawer, consent-gated installs with replay guards. WordPress has none of that out of the box. What sucks is the _editor chrome and journeys around the engine_: no unified top bar, no Content/Style/Advanced contract, no Navigator/History split, no templates library, no conditions picker, marketplace buried under Content, preview that renders the wrong theme. **Strategy: upgrade shells, don't rebuild.** Every P0-builder (B-01–B-16) and marketplace (M-01–M-06) item below wraps something that already works — no engine rewrites.
> **Deep-dive references (local)**: WordPress core `https://wordpress.org/latest.zip`, Elementor `https://github.com/elementor/elementor`, Elementor Pro `/Users/rahman/Downloads/elementor-pro` (builder UX, Theme Builder, submissions, template hierarchy).
> **Analyzed on this machine (Sept 18, 2026 — code-proven, not marketing)**: WordPress core `/tmp/wpcore/wordpress` (themes.php, plugin-install state machine, Customizer changesets, block-editor boot), Elementor free `/tmp/elementor-free` (panel/tabs/categories, Navigator, History+Revisions, Kit/Site Settings, Templates library, maintenance, Role Manager), Elementor Pro `/Users/rahman/Downloads/elementor-pro` (+ `elementor-pro-v3.35.1.zip`, `elementor-pro_3.34.0_nf.zip`: publish modal, conditions engine, Theme Builder locations, popups, forms+submissions, global widgets, notes model).
> **Live reference**: `http://maxwilliam.shop/wp-admin` (`maxw`) — Elementor **4.2.4 free active** (Pro NOT installed): Elementor Home hub, Pages list with `Edit with Elementor` row action (`post.php?post=N&action=elementor`), full editor chrome, Templates › Saved Templates list, Theme Builder/Popups as Upgrade-gated promos.
> **Weak-foundation findings**: `REPORT.md` (WF-01–WF-27, Sept 18, 2026 code-review + 3 subagents + live WP audit). Items below marked `[REPORT WF-xx]` are proven gaps, not speculation.

### 🔍 Live WP Reference Audit Summary (`http://maxwilliam.shop/wp-admin`)

| WordPress Component                                                          | Live WP Behavior & DOM Reference (`maxw`)                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Framique Parity Implementation Target                                                                                                                           |
| :--------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sidebar Hierarchy (`#adminmenu`)**                                         | Top-level items with dashicons + collapsible `.wp-submenu`: **Dashboard**, **Posts**, **Media**, **Pages**, **Comments**, **Templates** (Elementor/Builder), **Appearance** (Themes, Editor, Fonts), **Plugins** (Installed, Add Plugin), **Users**, **Tools**, **Settings**.                                                                                                                                                                                                                        | Reorganize `console-nav.ts` to elevate **Appearance** and **Plugins** as first-class top-level CMS groups with expandable submenus and collapsed hover-flyouts. |
| **Theme Cards (`themes.php`)**                                               | Active theme highlighted with primary `Customize` button. Inactive themes provide `Activate` (`themes.php?action=activate`), `Live Preview` (`site-editor.php?wp_theme_preview=...`), and in details modal bottom-right `Delete` (`themes.php?action=delete`).                                                                                                                                                                                                                                       | Top active theme card + installed grid. Inactive cards offer direct **Activate**, **Live Preview**, and **Delete**. Active theme blocked from deletion.         |
| **Theme Directory (`theme-install.php`)**                                    | Filter tabs (`Popular`, `Latest`, `Block Themes`, `Favorites`). Uninstalled cards show `Install` + `Preview`. Once installed, button turns to `Activate` + `Live Preview`. Active card shows `Activated` (disabled) + `Customize`.                                                                                                                                                                                                                                                                   | `/dashboard/marketplace` (Themes tab) and `/dashboard/content/themes` (Add New) show dynamic button states: `Install` → `Activate` → `Activated / Customize`.   |
| **Plugins Table (`plugins.php`)**                                            | Table with views (`All`, `Active`, `Inactive`), bulk actions (`Activate`, `Deactivate`, `Delete`), row actions: Active shows `Deactivate \| Settings`; Inactive shows `Activate \| Delete`.                                                                                                                                                                                                                                                                                                          | Installed Plugins view in `/dashboard/marketplace` with tabular listing, active/inactive filters, single-click toggle actions, and delete confirmations.        |
| **Plugin Directory (`plugin-install.php`)**                                  | Extension cards with `Install Now` + `More Details`. Once clicked, installs and transitions button immediately to `Activate`. Active plugin shows `Active` badge.                                                                                                                                                                                                                                                                                                                                    | Widget/app directory on `/dashboard/marketplace` with 1-click `Install Now` transitioning to `Activate`.                                                        |
| **Visual Builder Bridge**                                                    | Appearance › Editor / Customize and Templates list link directly to the visual site builder. Pages table includes "Edit with Elementor / Builder".                                                                                                                                                                                                                                                                                                                                                   | Appearance › Customize and Pages table "Edit with Page Builder" launch `/dashboard/builder` loaded with the active storefront draft.                            |
| **Elementor Editor chrome (live 4.2.4, `post.php?post=7&action=elementor`)** | Top bar: Logo menu, Add Element, Angie AI, Post Settings, History, Design System, doc menu, Desktop/Tablet(≤1024)/Mobile(≤767) tabs, Checklist, What's New, Finder, Structure toggle, Preview Changes, Publish, Save Options. Left: Elements panel (Widgets/Components/Globals tabs + Search + Atomic/Layout/Basic/General categories). Canvas: live preview with Add New Container / Add Template / Build with AI / Drag-widget-here. Right: Structure Navigator (expand-all, nested tree, resize). | P0-builder checklist B-01–B-04/B-16 above; our `WidgetTray`/`LayerTree`/`SectionInspector`/`VersionTimeline` are the shells to upgrade.                         |
| **Templates library (live `edit.php?post_type=elementor_library`)**          | My Templates list: type tabs (Page/Section/Container/Div/Flexbox/Grid/Form/Component), search, bulk Edit/Trash/**Export**, Import Templates, Add New Template, per-row Edit/Quick edit/Trash/View/Export Kit. Editor submenu: Templates › Saved/Theme Builder (Pro)/Website Templates/Floating/Popups/Add New; Settings; Tools; Role Manager; Submissions; Fonts/Icons/Code; System Info.                                                                                                            | B-05 Templates library + M-05 Builder submenu.                                                                                                                  |
| **Elementor Home hub (live `admin.php?page=elementor-home`)**                | Site card (name, active theme, Get Hello Elementor, Go to site setup, Edit site) + tool grid grouped All/Featured/Create/Optimize/Manage (Site planner, Site logo, Global styles, Theme/Popup builders, Image optimization, Accessibility, Angie AI).                                                                                                                                                                                                                                                | Model for a merchant Home dashboard: site card + setup checklist + capability grid.                                                                             |

### P0 — Marketplace Theme Lifecycle (Install → Activate → Activated/Customize)

- [x] **Appearance Themes Grid Parity**: Content › Themes grid has Activate / Delete / Preview / Customize (`ThemesScreen.tsx` + `themeActivateFn`/`themeDeleteFn`).
- [x] **Decoupled Marketplace Install**: install creates a **new inactive** `store_themes` row (`marketplace_install_preset` routine + `installBuiltinTheme`, replay-guarded), never mutating the active draft.
  - [x] **Follow-up [REPORT WF-01]**: third-party installs now materialize their own inactive theme row + version + draft with `source_install_id` linkage when the manifest carries usable AST (else stays ledger-only as before); badges/Activate/Delete work uniformly via `themeStates`.
- [x] **Direct Activate Action**: working **Activate** button per installed marketplace card (reuses `themeActivateFn`; Active badge + storefront sync).
  - [x] **Follow-up [REPORT WF-07]**: activation no longer rewrites drafts — `activateTheme` refresh now runs with overwrite OFF (was silently destroying merchant customizations on every activation); pointer flip is the whole job, updates flow through the update mechanism.
- [x] **Live Preview Action (two complementary flows)**:
  - Builder-internal preview (friend track): `ThemeCard` hover overlay → `previewInstalled()` navigates `/dashboard/builder?preview_theme_id=:id`, consumed by builder.
  - Storefront signed-URL preview: 10-min HMAC bearer tokens (`theme-preview.server.ts`) render the merchant's draft in `ThemePreviewSplit` on marketplace cards/modal; fail-closed to published (expired/forged/cross-tenant all verified live 5/5); private/no-store + noindex on preview responses; shared-cache bypass in `server.ts`.
- [x] **Published themes actually render** (found + fixed Sept 18): `store_themes`/`theme_versions` had member-only SELECT, so anon storefronts silently fell back to default tokens everywhere. Public-read policies added (phase 2h); drafts stay member-only.
- [x] **Add Theme tile + directory button states**: filter-clearing tile on the themes grid; dynamic states Install → Activate → Activated/Customize (WP `theme-install.php` parity).
- [x] **Theme Details modal parity**: modal carries Activate/Preview/Delete (+linked-theme gating) alongside Install.
- [x] **Direct Delete Action**: working **Delete** button per installed theme (server refuses active; cascades drafts/versions; ledger → `removed` status).
  - [x] **Follow-up [REPORT WF-02] RESOLVED Sept 18**: `removed` added to the live enum; retire-then-verify probe passed (ledger row flips to `removed`, plugin row gone). Migration captured below — no atomicity gap remains.
- [x] **State-Driven Badges & Buttons**: real state on marketplace cards (`isLiveInstall` + `themeStates`).
  - [ ] **Follow-up [REPORT WF-01/WF-03]**: `paused` counts as Installed; Appearance vs Marketplace badge sources diverge (`source_listing_slug` vs `source_install_id`); third-party (non-builtin) installs never create a `store_themes` row (missing `market_apply_theme_install` RPC) so Activate/Delete never render. Badge must follow active/installed row state, not ledger presence alone.
- [ ] **Stable idempotency [REPORT WF-08]**: key minted as `${listing.id}-…-${Date.now()}` per click defeats replay guard → duplicate ledger/debit. Stable per-(merchant, listing, intent) key + disable-while-pending.

### P0 — Plugin Lifecycle (Installed Plugins Table Parity)

- [x] **Activate / Deactivate toggles + Settings form** (`InstalledApps.tsx` + `PluginSettingsForm.tsx` + `pluginToggleFn`).
- [x] **Bridged widgets**: 6 official plugins install on-demand via `upsertPlugin` (`builtin-plugins.ts`, manifests validated, honest zero counts).
- [x] **Delete Action** — SHIPPED (code-verified Sept 18): inactive-only row Delete (`InstalledApps.tsx:378-390`) + `ConfirmDialog` (`:513-531`) + bulk-delete loop (`:533-558`) → `pluginUninstallFn` & `marketUninstallWidgetFn` (ledger retired to `removed`, removes `plugin_state` row, confirm dialog).
- [x] **Widget uninstall [REPORT WF-06]**: added `marketUninstallWidgetFn` + wired into `InstalledApps` delete button and bulk actions, retiring install ledger to `removed`.
- [x] **Add New Plugin navigation** — SHIPPED: `/dashboard/plugins/new` → `/dashboard/marketplace?tab=widget` (`plugins/new.tsx:11`); route search param added (`creator.tsx`/`moderation.tsx` links fixed).
- [x] **Bulk activate/deactivate/delete** — SHIPPED (code-verified Sept 18): checkboxes + select-all, Bulk actions ▾, per-row isolation with honest partial-success toasts (no more abort-on-first-error); My-installs toolbar backed by audited `marketBulkInstallsFn` (50-cap).

### P1 — Sidebar System (WP Admin Menu Parity)

- [x] Elevate **Appearance** and **Plugins** as first-class top-level CMS groups — SHIPPED + visually verified in running browser Sept 18 (accordion groups, Collapse button, topbar all render).
- [x] Expandable accordion submenus + hover flyouts in collapsed rail, Collapse Menu button, current-section highlight (`AdminShell` — code-verified Sept 18: `expandedSections` + chevron `:142-151,257-298`; rail `hoveredGroup` flyout `:166-234`). **Keyboard access shipped**: flyouts open on focus, close on blur-away/Escape.
- [x] Server authz spot-check (Sept 18 live probes): zero client-controlled tenancy in theme/plugin/marketplace fns (scope derives from own membership); `pluginKillSwitchFn` merchant write refused live (42501, nothing written). `requirePermission` migration remains optional hardening, not a hole.
- [x] Legacy pages desk verdict: `/dashboard/pages` is NOT stub-backed (real PageBuilder + RLS-safe savePage) — but unlinked from sidebar. Keep + link, or retire; no security action needed.
- [x] Single nav source of truth — SHIPPED (code-verified Sept 18): `ADMIN_NAV` + `HIDDEN_DESTINATIONS` + `filterNav`/`permissionForPath`/`isNavActive` (`console-nav.ts:549-615`).
- [ ] Server authz parity [REPORT WF-19]: `themes.functions.ts` + `plugins.functions.ts` use only `requireSupabaseAuth` while content/editor enforce `requirePermission` — add `requirePermission("themes.read/update")` etc. so hidden-nav = refused-route.

### P1 — Page Builder Management Parity

- [x] All 9 theme-engine RPCs implemented + verified live (phase 2e).
- [x] Customize launcher exists (`openCustomize` → `/dashboard/builder`).
- [x] **Pages table action** — SHIPPED (code-verified Sept 18): `rowActions()` appends `"edit-builder"` (`content-desk.ts:196-206`), `cells.tsx:100-109` links `/dashboard/content/editor?kind=&id=&editor=builder`, `editor.tsx` passes `forceEditor` to `EditorShell`.
- [ ] **Retire stub desk [REPORT WF-20]**: legacy `dashboard/pages.tsx` (no permission gate, `isPublished` boolean only) imports stub `page-builder.ts` ("full implementation was not committed") yet exposes a builder toggle — re-route to `content/*` + `EditorShell` real AST; schedule form must allow version pick (hardcodes `versions[0]`).
- [ ] **Server-side route guards [REPORT WF-21]**: all guards client-side (`ssr:false` + `getUser()` in `beforeLoad`, tenant from `localStorage`); move to server `beforeLoad`/loaders with membership check; set `account_type` server-side (OAuth defaults to merchant onboarding); delete client `platform_admins` SELECT, rely on `platformIsAdminFn` + DENY SELECT + test.

### P0 — Visual Builder Elementor Parity (layout, workflow, panels)

> **Verdict**: our engine (autosave/commit/publish/rollback/schedules, tokens, globals, SEO drawer) is real, but the _editor chrome around it_ sucks vs live Elementor 4.2.4 (`post.php?post=7&action=elementor` on maxwilliam.shop). What exists: `WidgetTray` (`builder.tsx:1151`), `LayerTree` navigator (`:1093`), `SectionInspector` per-device (`:1550-1553`), `TokenEditor` (`:1583`), `VersionTimeline` + schedules (`:1613-1618`), autosave (`:258-260`), undo/redo, global blocks save/delete (`:557-588`), `SeoDrawer` (`:1574`), `ShortcutHelp` (`:1808`), `VisibilityRules.tsx`, `DEVICE_PRESETS` (`lib/responsive.ts`). What's missing is everything below — each item cites the Elementor source that proves the pattern.

- [ ] **B-01 Top-bar contract** (live: Logo menu, Add Element, Angie, Post Settings, History, Design System, doc-title menu, Desktop/Tablet(≤1024)/Mobile(≤767) tabs, Checklist, What's New, Finder, Structure toggle, Preview Changes, Publish, Save Options split-button). Ours scatters these across side panels — build one top bar in this order (`/tmp/elementor-free/includes/editor-templates/*`, `core/editor/loader/templates/editor-body-view.php:38-39`).
- [ ] **B-02 Panel tab contract**: tray tabs Widgets/Components/Globals beside search (`Elements` panel, live `uid 9_23-9_25`); every widget/section enforces Content/Style/Advanced + document Settings tab (`controls.php:24-36`, Pro `form.php:867,1090,1385`, `popup/document.php:159`). Our `SectionInspector` must grow the same 3-tab skeleton for every widget.
- [ ] **B-03 Navigator upgrade**: Structure panel with expand-all, nested tree, per-node indicators, empty states, resize (`navigator.php:30-93`; live right rail `uid 9_204-9_215`). `LayerTree` needs expand-all + lock/visibility indicators + resize handle.
- [ ] **B-04 History split**: session Actions (undo list) vs persisted Revisions with Discard/Save-until-dirty, author avatar + date, autosave fallback, restore (`history-panel-template.php:7-34`, `revisions-panel-template.php:7-68`, `revisions-manager.php:111-237`). `VersionTimeline` currently merges both — split them.
- [ ] **B-05 Templates library**: Saved Templates list with type tabs (Page/Section/Container/…), search/filter, bulk Edit/Trash/**Export**, Import Templates, Add New, insert-into-canvas (live `edit.php?post_type=elementor_library`; `templates.php:10-26,70-179`; `sources/local.php`). Ours has no reusable-section library at all.
- [ ] **B-06 Theme Builder (site parts × conditions)**: part types Header/Footer/Single/Archive/Search/404 (`templates-types-manager.php:34-50`) attach via Location + Include/Exclude repeater (`conditions-repeater.php:19-77`), live conflict warning with links (`conditions-manager.php:99-121`), Instances column (`:61-84`), only `publish` templates evaluate (`:385-394`). Copy the picker + conflict UX verbatim for our index/product/collection/page/blog/cart/checkout templates.
- [ ] **B-07 Preview-as-context**: "view this header as post X / archive Y" + Apply & Preview (`theme-document.php:283-347`, `preview-manager.php:57-77`). Without it, dynamic templates are uneditable — pairs with WF-04 fix.
- [ ] **B-08 Publish-modal checklist**: publish is a modal with Conditions + Settings + Preview-as screens (`panel-template.php:8-69`), footer split-button Preview Changes → Settings/Preview (`:79-96`). Replace our bare Publish button.
- [ ] **B-09 Element display conditions**: same engine as template conditions, one Advanced-tab row opening condition rows (`display-conditions/module.php:81-140`). Wire our `VisibilityRules.tsx` into the inspector exactly here.
- [ ] **B-10 Global widget lock bar**: "locked — Edit updates everywhere, or Unlink…" + empty-state onboarding copy (`global-widget/views/panel-template.php:7-33`, `module.php:233-247`). Our saveAsGlobal/removeGlobal needs this messaging.
- [ ] **B-11 Forms pipeline**: Fields (repeater) → Steps → Submit → Actions After Submit (pluggable, each injecting its own settings) → Submissions inbox with trash/CSV export (`forms/widgets/form.php:640-860`, `registrars/form-actions-registrar.php:20-23`, `submissions/component.php:69-154`). Model for our Forms surface.
- [ ] **B-12 Popups/floating (Phase 2)**: Triggers (load/scroll/click/inactivity/exit-intent/adblock) × Timing (views/sessions/frequency/referrer/role/device/browser/schedule) (`popup/display-settings/triggers.php:27-141`, `timing.php:28-309`).
- [ ] **B-13 Status discipline**: only `publish` evaluates at runtime; drafts visible via autosave preview (`conditions-manager.php:385-394`, `locations-manager.php:270-271,415-430`). Enforce for site parts so half-built headers never leak.
- [ ] **B-14 Maintenance/coming-soon**: 503 vs 200 mode + template + role excludes + admin-bar indicator (`maintenance-mode.php:23-33,104-162,282-332`).
- [ ] **B-15 Content-only design lock**: `user_can(design)` strips design fields server-side, not just hides tabs (`role-manager.php:296`, `editor-wrapper.php:19`, `content-only-save-guard.php:14-32`). Pairs with WF-19.
- [ ] **B-16 Finder ⌘K + pre-publish Checklist + shortcut map**: live top bar has all three (`uid 9_13-9_15`); our `ShortcutHelp` exists — add Finder command palette (doubles as the console-wide ⌘K WP has) and a publish Checklist gate.

### P0 — Marketplace & Themes on Sidebar (out of hiding)

> **User order**: the marketplace is buried (Content › tab + More-menu). WordPress gives Appearance (Themes, Editor, Fonts) and Plugins (Installed, Add Plugin) top-level; Elementor adds its own Editor submenu (live `uid 10_119-10_155`: Quick Start, Settings, Tools, Templates › Saved/Theme Builder/Website Templates/Floating/Popups/Add New, Role Manager, Submissions, Custom Elements, Fonts, Icons, Code, System › System Info/Element Manager/Connect, Upgrade). Copy both.

- [ ] **M-01 Top-level Marketplace group** in `console-nav.ts`: Themes, Widgets & Plugins, Installed, Add New, Upload — with accordion submenu + collapsed hover flyout (same component as P1 sidebar work). No CMS destination lives under Content › More afterward.
- [ ] **M-02 Installed Plugins table** (WP `class-wp-plugins-list-table.php:671-692,1379-1457`): views All/Active/Inactive (+Updates count), bulk Activate/Deactivate/Delete/Update/Enable-auto-updates, per-row Activate|Deactivate|Settings|Delete, auto-updates toggle column, inline update-nag row. Replaces `InstalledApps` checkbox list.
- [ ] **M-03 Install → Activate state machine** (`plugin-install.php:937-1036`, `theme-install.php:409-427`): Install Now → Activate/Network Activate/Active/Installed/Update Now/disabled-with-compat-reason. No dead buttons, ever.
- [ ] **M-04 Upload tabs**: Upload Theme (`theme-install.php:196`, `includes/theme-install.php:198-207`) + Upload Plugin (`includes/plugin-install.php:344-355`) → `Install Now`. Pairs with WF-23 (implement `themeUploadFn` or remove dropzone).
- [ ] **M-05 Builder submenu** (Elementor Editor model): Templates (Saved, Theme Builder, Add New), Settings (Site Settings/Fonts/Code), Tools (Import/Export, Element Manager, Maintenance), Submissions inbox, Role Manager. Gives every B-05/B-06/B-11 surface a sidebar home.
- [ ] **M-06 Customizer changeset parity for schedules**: auto-draft → draft/future/publish, Activate & Publish vs Publish, trash, missed-schedule recovery (`class-wp-customize-manager.php:2433-2707`, `customize.php:199-203`). Our schedule form adopts the same states.

### P2 — Polish

- [x] **Lifecycle audit rows (WF-24)**: install/activate/delete write `theme_audit` (actor/before/after); plugin install/toggle/uninstall write `activity_log` — verified live, incl. fixing a uuid-typed `resource_id` that silently swallowed plugin audits.
- [ ] **Theme screenshot pipeline**: real per-theme previews replacing placeholder blocks on marketplace cards.
- [ ] **Honest catalog counts [REPORT WF-22]**: `catalog-meta.ts` hardcodes ratings 4.4–4.9 / installs 2600–12800 rendered as fact; Popular sort is fixture order. Honest zeros like `builtin-plugins.ts` + real `install_count` ordering (no-fabrication rule).
- [ ] **Upload Theme path [REPORT WF-23]**: `AddThemeScreen` validates zip client-side only, zero server path — implement `themeUploadFn` + storage or remove the dropzone (no dead buttons).
- [ ] **Lifecycle audit rows [REPORT WF-24]**: install/activate/delete/toggle write zero audit (`theme_audit` table has no writer). Every `[A]` needs actor/before/after/reason.
- [ ] **Preview stepping [REPORT WF-25]**: ‹ › pools catalogue only, breaks custom/installed-only themes. Step the opened list.
- [ ] **Canary header hygiene [REPORT WF-26]**: stop echoing `x-framique-tenant-id` to shoppers; auth-gate `X-Framique-Slot-Override`.
- [x] **CI gates workflow [REPORT WF-27]** — SHIPPED this session: `.github/workflows/gates.yml` (typecheck + tests + contracts + secret scan + dep audit on every push/PR).

### 1. Critical Vulnerabilities & Auth Flaws (Must Fix Immediately)

- [ ] **Exposed Production Credentials:** Exposed raw SSH IPs, GitHub PATs, Supabase DB passwords, JWT Secrets, Kong API Keys, and SMTP passwords. **Action Required:** Immediate rotation of all credentials on the live server.
- [ ] **Cross-Pollination of Auth (B2C vs B2B):** A user signing up at `/auth?mode=signup` is intended to be a customer (B2C) for a store. However, because they are just a Supabase Auth User, they can navigate to `/admin`, pass the initial auth check, and trigger the `/onboarding` flow to instantly become a Merchant (B2B). There is currently no strict segregation of "Customer" vs "Merchant" at the registration level.
- [x] **`/root` Platform Owner Dashboard** — VERIFIED WORKING Sept 18 (code audit: `root.tsx` session gate + `RootLayout` owner check functional; route resolves). Residual: client-side `platform_admins` SELECT oracle — tracked under WF-21 guards item.
- [ ] **Pervasive Security Gaps:** As noted, the website is "fully full of bugs and vulnerabilities" requiring a comprehensive security audit of row-level security (RLS) policies and SSR loader guards.

### 2. 🚨 Foundational SaaS & Multi-Tenant Architecture Gaps (Audit Sept 18, 2026)

#### 2.1 Storefront Hosting & Path-Based Abuse (`framique.qubickle.com/clients_website` / `/store/$slug`)

- **Vulnerability / Architectural Flaw**:
  - Hosting merchant stores on sub-paths of the platform apex (`framique.qubickle.com/store/$slug` or `framique.qubickle.com/<clients_website>`) is an **untenable security and SaaS anti-pattern**:
    - **Origin Boundary Failure**: All stores share the same origin cookies, local storage, and session context with `framique.qubickle.com`. A single compromised store or rogue merchant script can poison browser storage or intercept credentials.
    - **Platform Reputation & Blacklisting Risk**: If a fraudulent merchant launches a scam, phishing, or counterfeit storefront at `framique.qubickle.com/store/bad-store`, Google SafeBrowsing and security filters blacklist the **entire platform apex domain**, bringing down every merchant and the marketing site.
    - **SEO Cannibalization**: Search engines treat sub-paths as subdirectories of Framique, diluting individual store ranking and brand equity.
    - **System Route Collisions**: A merchant picking a slug like `api`, `admin`, `dashboard`, `auth`, `root`, or `builder` collides with or breaks core platform routing.
- **Remediation Action Required**:
  - [ ] **Dedicated Subdomain Architecture**: Enforce wildcard DNS (`*.framique.store` / `*.framique.com`) so every merchant receives an isolated origin subdomain: `<slug>.framique.store`. Cookies, storage, and CSP are strictly isolated per tenant.
  - [x] **Custom Domain in Onboarding Flow (`src/routes/_authenticated/onboarding.tsx`)** — SHIPPED (verified Sept 18: CNAME/A table `onboarding.tsx:285`, "Skip for now — I'll connect it from Settings › Domains" `:308`):
    - Add an explicit **"Connect Custom Domain"** step during store onboarding:
      - Prompt merchant to enter their domain (e.g., `brand.com` or `shop.brand.com`).
      - Provide real-time DNS instructions: CNAME record pointing to `edge.framique.app` (or A record to edge IP).
      - Include a prominent **"Skip for now — use my free `slug.framique.store` subdomain"** button, letting them finish onboarding instantly and connect their custom domain anytime from **Settings › Domains**.
  - [ ] **Edge Request Rewriting (`src/server.ts` & OpenResty)**:
    - When traffic arrives on a custom domain (`brand.com`) or tenant subdomain (`brand.framique.store`), resolve `merchant_id` via header/cache and internally rewrite the request to the storefront handler without exposing `/store/$slug` in browser URLs.

#### 2.2 Edge Cache Bypass on Custom Domains

- **Vulnerability / Architectural Flaw**:
  - `isStorefrontPath(pathname)` in `src/lib/storefront-cache.ts` currently validates only `^\/store\/[^/]+(\/.*)?$`.
  - When requests arrive on a custom domain (`https://brand.com/` or `https://brand.com/p/product`), `pathname` is `/` or `/p/product`.
  - `isStorefrontPath` evaluates to `false`, causing **all custom domain requests to bypass the edge cache completely** and force full server-side rendering on the origin Node/Bun server. A moderate traffic spike on a single custom domain will overwhelm and crash the origin server.
- **Remediation Action Required**:
  - [x] Refactor `isStorefrontPath` and `withStorefrontCache` to inspect `x-framique-tenant-id` (or the resolved custom domain Host header) so custom domain storefront paths (`/`, `/p/*`, `/c/*`, `/pages/*`, `/cart`) receive proper edge cache headers (`s-maxage=60, stale-while-revalidate=300`) — SHIPPED (code-verified Sept 18: custom-domain branch in `isStorefrontPath` + PII guard-first `isPersonalizedStorefrontPath`; full Host→tenant edge rewrite still open under §2.1).

#### 2.3 Memory Exhaustion via Base64 Media Uploads

- **Vulnerability / Architectural Flaw**:
  - `uploadMedia` in `src/lib/media.server.ts` receives raw `base64: string` via server RPC functions (`createServerFn`).
  - Standard product images (3–8MB) expand by 33% as base64, generating 10MB+ JSON strings.
  - Concurrent file uploads serialize large strings into V8 memory, causing severe heap bloat, GC pauses, and Nitro 413 Payload Too Large failures.
- **Remediation Action Required**:
  - [x] Replace base64 RPC uploads with direct-to-storage presigned upload URLs (`createUploadSignedUrlFn`) or streaming multipart form-data. Uploads stream directly to Supabase storage without buffering through server memory. — SHIPPED (code-verified Sept 18: `createPresignedUploadUrl` `media.server.ts:155-199` + `mediaPresignedUploadFn`).

#### 2.4 Unsandboxed Custom Code Injection (Storefront XSS Risk)

- **Vulnerability / Architectural Flaw**:
  - `CustomCodeBody` and `CustomCodeSurface` (`src/components/store/CustomCode.tsx`) render raw HTML/JS injected by merchants without a sandboxed iframe or restrictive Content-Security-Policy.
  - A compromised merchant account or malicious collaborator can inject credential-stealing keyloggers or fake payment inputs into checkout and cart surfaces.
  - [REPORT WF-14] `buildCsp` + `newNonce` exist in `src/lib/custom-code.ts:474-506` but **no CSP header is ever sent** (`server.ts:77-89` sets only nosniff/referrer/SAMEORIGIN); `CustomCodeScript` appends live script with full DOM access; `reviewJs` regex-deny bypassable (`globalThis['ev'+'al']`, `constructor.constructor`, dynamic `import()`); body `https:` iframes emit no `sandbox`.
- **Remediation Action Required**:
  - [ ] Enforce strict Content-Security-Policy (CSP) headers disallowing unsafe-inline scripts on checkout and payment pages. Restrict merchant custom scripts strictly to informational/marketing pages and pre-approved analytics integrations (Google Tag Manager, Meta Pixel).
  - [ ] Send the CSP header + nonce, sandbox body iframes / isolate custom JS like the `html` widget `sandboxSrcDoc`.

#### 2.5 Multi-Tenant CSRF Mismatch on Custom Domains

- **Vulnerability / Architectural Flaw**:
  - `src/server.ts` performs CSRF validation by comparing `originHost !== host`.
  - When shoppers submit checkout or cart mutations across custom domains, reverse proxies, or external payment return redirects (e.g. bKash/Nagad gateways redirecting back to merchant domains), discrepancies between `x-forwarded-host`, `host`, and `origin` trigger `403 CSRF check failed (origin mismatch)`.
  - [REPORT WF-11] Inverse hole: any `POST /api/...` **without** Origin/Referer passes (fail-open); `/api/public/*` + `/api/canary-alert` skip checks entirely with no visible signature. [REPORT WF-10] `hostname.includes("localhost")` disables HTTPS-redirect + CSRF for `*.localhost.evil.com`.
- **Remediation Action Required**:
  - [ ] Build a tenant-aware CSRF validator that validates whether `originHost` matches either the platform domain, the tenant's verified custom domain, or the tenant's registered subdomain.
  - [ ] Require Origin or token on all mutation POSTs (fail closed); sign the canary webhook; exact-match localhost/loopback only.

#### 2.6 Domain SNI Whitelist Exhaustion & Let's Encrypt Quota Burn

- **Vulnerability / Architectural Flaw**:
  - `verify-sni.ts` checks `merchant_domains` status, but there are no strict quotas on domain creation per merchant.
  - Malicious actors can rapidly register throwaway domains to trigger edge ACME certificates requests and burn through Let's Encrypt platform rate limits.
  - [REPORT WF-15] `GET /api/public/domains/verify-sni?host=` is unauthenticated + un-rate-limited → merchant-domain enumeration oracle + per-SNI DB hit (global ingress limit fails open on Redis error). [REPORT WF-16] `issuing_cert` never re-polled by `sweepDomains`; empty `DOMAIN_EDGE_TOKEN` bearer + `callback.ts` 404 = permanent limbo; `renewing` is not a valid `DomainStatus` → `illegal_transition` crash on renewal.
- **Remediation Action Required**:
  - [x] Enforce strict plan-based custom domain quotas (e.g., Starter: 1 domain, Growth: 3 domains, Business: 10 domains) — SHIPPED (code-verified Sept 18: `PLAN_DOMAIN_QUOTA` `domains.server.ts:40-45` + SNI state-machine guard `verify-sni.ts:54-93`). Token-bucket rate limit + stuck-state sweep still open.
  - [ ] Implement rate-limiting on custom domain additions (`domain.create` bucket) and automatic DNS health check backoff.
  - [ ] `enforceRateLimit` + negative cache on `verify-sni`; require edge env at boot; sweep `issuing_cert`; fix status machine; alert on stuck domains.

#### 2.7 Shared-Cache Serves Personalized Routes as Public (Cross-Shopper PII Leak) [REPORT WF-09]

- **Vulnerability / Architectural Flaw**:
  - `withStorefrontCache` (`src/server.ts:119-129`) caches **any** `GET 200 text/html` under `isStorefrontPath` (`^\/store\/[^/]+(\/.*)?$`), matching `/store/:slug/cart|checkout|account|order/:id|track|search`, with `public, s-maxage=60, stale-while-revalidate=300` and `Vary: accept-language` only.
  - Shopper A's cart/account/order HTML sits on the shared edge for 60s (+300s stale) and is served to shopper B. `storefrontCacheHeaders(null)` is always called with `null`, so the versioned `etag` invalidation is dead code.
- **Remediation Action Required**:
  - [x] Cache only anonymous template docs (index/product/collection/page); `private, no-store` on cart/checkout/account/order — FIXED this session (guard-first + tests). Follow-up open: `Vary: Cookie, Host` + tenant+version cache keys.

#### 2.8 Legacy SVG Upload → Stored XSS [REPORT WF-13]

- **Vulnerability / Architectural Flaw**:
  - Legacy `uploadMedia` (`src/lib/media.server.ts:93-131`) accepts `image/svg+xml` and writes bytes with **no `sanitiseSvg`** (only `library.server.ts` has it); delivery (`api/public/media/$.ts`) serves SVG `inline` with only `nosniff` — script executes in platform origin when navigated to directly.
- **Remediation Action Required**:
  - [ ] Route all SVG through `sanitiseSvg`, serve as `attachment`/sandboxed, magic-byte check; presigned direct-to-storage uploads per §2.3.

### 3. Recently Fixed

- [x] **Multi-Tenant Portal Bleeding:** Enforced strict persona boundaries (Platform Admin vs Merchant vs Customer) at the server-loader level (`beforeLoad` in `admin.tsx` and `dashboard.tsx`) to prevent TanStack router state bleeding and infinite redirects.

## 1. Comprehensive Design & Architecture Audit

> **Honest Verdict after measuring all 12 public pages at phone, tablet and desktop**:  
> **Responsiveness is solid, contrast and polish are not yet at Hallmark grade.**

### 1.1 What Passes

- **Zero sideways scrolling** on every page at 375px, 768px and 1440px.
- **Buttons keep their natural size** on tablet/desktop while expanding to full width on mobile viewports.
- **Tablet shows real multi-column layouts** instead of dropping everything into an endless single-column scroll.

### 1.2 What Fails

- **Text contrast**: The Facebook blue on white measures about **4.1:1** — just under the 4.5:1 readable minimum, and it's used ~150 times (links, labels). The muted grey body text is worse, around **3.4–3.9:1**. The lime accent text on light panels is essentially unreadable.
- **Small tap targets**: 18–20 controls on Pricing, 13 on Blog and 11 on Solutions are under the 44px minimum, even on phones.
- **Two conflicting definitions of the same grid rule** exist in the stylesheet; the first one is dead code (`@utility fq-grid-field` around line 759), so some sections don't get the spacing they were designed with.
- **Eye smoothness**: The pages read as competent but busy — too many accent colours competing per screen and inconsistent vertical rhythm between sections. Hallmark-grade means fewer colours, one accent per screen, and one repeated spacing scale.

### 1.3 State of Fixes & Precision Breakdown

| Problem Area                                 | Diagnosis & Exact Fix Applied                                                                                                                                                                                                                   | Status               |
| :------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------- |
| **Facebook Blue Contrast (was ~4.1:1)**      | Swapped hardcoded blue for a slightly darker shade (`oklch(0.48 0.23 255)` / `#1360D4`, **5.2:1** on canvas) that clears the readable-contrast minimum. Routed through single token `--color-primary` / `--fq-signal` so it never drifts again. | **APPLIED & TESTED** |
| **Muted Grey Text Contrast (was 3.4–3.9:1)** | Calibrated `--color-muted-foreground` to `oklch(0.40 0.018 25)` (**5.5:1** on canvas) to clear the 4.5:1 WCAG AA readable floor.                                                                                                                | **APPLIED & TESTED** |
| **Dead Grid Rule around Line 759**           | Located dead conflicting `@utility fq-grid-field` at line 746-761 in `src/styles.css` and deleted it.                                                                                                                                           | **APPLIED & TESTED** |
| **Small Tap Targets (< 44px)**               | Enlarged GMV presets on Pricing, category filter buttons on Features, courier & destination toggles on Fulfilment, and rail presets on Payments to `min-h-[44px]`.                                                                              | **APPLIED & TESTED** |
| **Hero Responsive Layout**                   | Imposed `min-h-[75vh] lg:min-h-[680px]` desktop floor with flex centering, 2-column Split Screen at `md` (768px), and compact mobile typography clamp.                                                                                          | **APPLIED & TESTED** |

---

### 1.4 Modern Flex & Grid Layout Patterns Roadmap

We must continue streamlining all public pages using deliberate modern layout patterns:

1. **Split Screen**: Hero sections, pricing fee comparisons, and feature head-to-heads (50/50 or 60/40 balanced split).
2. **Bento Grids**: Asymmetrical 3-column and 4-column cards with mixed col-span/row-span for high visual density and engagement.
3. **Magazine Layout**: Editorial long-form reading in `/blog`, `/about`, and `/docs` with sticky sidebars, drop caps, pull quotes, and visual breaks.
4. **Container-Free Breathing Sections**: Edge-to-edge subtle gradients, generous 96px section padding, and subtle divider strokes replacing rigid card containers.
5. **Z-Pattern (Zig-Zag)**: Alternating text-left/image-right and image-left/text-right feature stories to guide natural eye movement.
6. **F-Pattern**: Scannable headings, bulleted value propositions, and bolded lead metrics for documentation and technical pages.
7. **Symmetry vs. Asymmetry**: Approximate horizontal symmetry for comparison tables; deliberate asymmetry in Bento highlights to emphasize primary value props.
8. **Mobile Touch Architecture**: Every interactive button must stretch to full width (`w-full sm:w-auto`) with a minimum 44px tap target floor (`min-h-[44px]`).

---

## 2. Integrated UI/UX, Motion & Engineering Skills Stack

Our implementation directly executes the directives from the 21 specified core design and motion skills:

1. **`claudedesignskills`**: Intentional typographic scale, rhythm hierarchy, scannable information architecture.
2. **`gsap-skills`**: Cinematic scroll-triggered choreography and pin animations.
3. **`vercel-agent-skills`**: Edge runtime optimization, streaming server components, zero-CLS layout stabilization.
4. **`shadcn-ui-mcp-server`**: Accessible Radix primitives with customized Framique tokens.
5. **`taste-skill`**: Restraint over decoration; eliminating generic AI slop and visual clutter.
6. **`ui-ux-pro-max-skill`**: High-conversion checkout flows, cognitive load reduction, micro-feedback loops.
7. **`motion-framer`**: Declarative layout animations, tab cross-fades, and responsive layout morphing.
8. **`gsap-utils`**: Interpolation, clamp, snap, and responsive breakpoint math.
9. **`gsap-performance`**: `will-change`, `transform3d`, sub-pixel rendering, and memory leak cleanup on unmount.
10. **`gsap-react`**: `useGSAP` hook lifecycle management and SSR hydration safety.
11. **`gsap-frameworks`**: Seamless integration with TanStack Router and modern reactive frameworks.
12. **`gsap-timeline`**: Coordinated multi-stage sequencing for Hero entrance and interactive demos.
13. **`gsap-scrolltrigger`**: Scroll-scrubbed progress bars, sticky pinning, and reveal-on-scroll effects.
14. **`gsap-plugins`**: Flip, Draggable, and SplitText for advanced interactive widgets.
15. **`gsap-core`**: High-performance tweening engine for smooth 60fps micro-interactions.
16. **`react-native-skills`**: Cross-platform touch-first patterns, 44px minimum tap targets, gesture feedback.
17. **`react-best-practices`**: Immutability, zero unnecessary re-renders, accessible ARIA roles.
18. **`design-taste-frontend`**: Fine-tuned spatial rhythm, micro-borders, and tactile elevation.
19. **`frontend-design`**: CSS Grid/Flex mastery, container queries, clamp typography, fluid spacing.
20. **`hallmark`**: Slop-test compliance, OKLCH comfort contrast, anti-window rules, bilingual line boxes.
21. **`anthropics-skills`**: Clear, concise, highly structured technical execution and documentation.

---

## 3. The 42 SEO Skills: Site-Wide & Page-by-Page Architecture

Equipped with Semrush API Key: `semrtkn-pat-HS2Xf0KFSqmTFHX54b57ZQ-XN9oQNgl5SPraldanWrPdNz1P-qKFlYd`.

### 3.1 The 42 SEO Disciplines Matrix

| #   | Skill Name                 | Strategic Execution for Framique                                                                        |
| :-- | :------------------------- | :------------------------------------------------------------------------------------------------------ |
| 1   | **`seo`**                  | Master technical architecture: canonical URLs, meta titles (<60 chars), meta descriptions (<155 chars). |
| 2   | **`seo-semrush`**          | Live keyword tracking, competitive position maps, domain search analytics via Semrush API key.          |
| 3   | **`seo-ahrefs`**           | Backlink profile monitoring, referring domain acquisition, anchor text hygiene.                         |
| 4   | **`seo-audit`**            | Automated crawl health: zero 4xx/5xx errors, zero broken redirect chains, clean status codes.           |
| 5   | **`seo-backlinks`**        | Digital PR strategy targeting Bangladeshi fintech, courier blogs, and merchant communities.             |
| 6   | **`seo-bing`**             | Bing Webmaster Tools setup, IndexNow instant URL submission API for new blog posts.                     |
| 7   | **`seo-cluster`**          | Topic cluster mapping: Pillar pages (Payments, Logistics) connected to deep-dive articles.              |
| 8   | **`seo-competitor-pages`** | Direct comparison hubs: "Framique vs Shopify Bangladesh", "Framique vs WooCommerce COD".                |
| 9   | **`seo-content`**          | EEAT compliance, practical merchant guides, real data points (courier rates, MFS charges).              |
| 10  | **`seo-content-brief`**    | Structured authoring templates specifying exact target keywords, entities, and heading tags.            |
| 11  | **`seo-dataforseo`**       | Localized Dhaka and divisional SERP scraping and keyword volume benchmarking.                           |
| 12  | **`seo-drift`**            | Algorithmic ranking decay detection, search intent drift alerts, and content refresh schedules.         |
| 13  | **`seo-ecommerce`**        | Multi-tenant schema: `Product`, `Offer`, `AggregateRating`, `MerchantReturnPolicy`.                     |
| 14  | **`seo-firecrawl`**        | Headless DOM crawling to ensure SSR HTML completely renders without client JS dependencies.             |
| 15  | **`seo-flow`**             | PageRank sculpting: high-equity home/pricing links flowing into high-conversion feature pages.          |
| 16  | **`seo-geo`**              | Bangladesh national & divisional targeting (`geo.region: BD-13`, `geo.placename: Dhaka`).               |
| 17  | **`seo-google`**           | Google Search Console API synchronization, core search essentials, helpful content validation.          |
| 18  | **`seo-hreflang`**         | Exact bidirectional tags: `en-BD`, `bn-BD`, and `x-default` across all bilingual marketing pages.       |
| 19  | **`seo-image-gen`**        | Generation of search-targeted infographics, data visuals, and visual guides with rich prompt alts.      |
| 20  | **`seo-images`**           | Next-gen AVIF/WebP formats, explicit `width`/`height` to avoid CLS, XML Image Sitemap.                  |
| 21  | **`seo-local`**            | Exact NAP consistency (`ORG_NAP`), Google Business Profile schema, local Dhaka office schema.           |
| 22  | **`seo-maps`**             | `GeoCoordinates` (`23.7925, 90.4078`), Gulshan/Banani map schema, local business citations.             |
| 23  | **`seo-page`**             | Single descriptive H1 per page, logical H2/H3 outline, semantic HTML5 sectioning elements.              |
| 24  | **`seo-plan`**             | 12-month commercial keyword dominance plan for e-commerce software in Bangladesh.                       |
| 25  | **`seo-profound`**         | Latent semantic entity enrichment: linking "bKash" to Central Bank regulations, "Pathao" to API nodes.  |
| 26  | **`seo-programmatic`**     | Scalable dynamic landing pages: `/solutions/courier/[district]`, `/solutions/payments/[rail]`.          |
| 27  | **`seo-schema`**           | Comprehensive JSON-LD graphs: `Organization`, `SoftwareApplication`, `FAQPage`, `BreadcrumbList`.       |
| 28  | **`seo-seranking`**        | Daily desktop and mobile SERP rank tracking across top 200 target e-commerce keywords.                  |
| 29  | **`seo-sitemap`**          | Dynamic `sitemap.xml`, version-controlled `docs.sitemap.xml`, and `blog.xml` RSS feeds.                 |
| 30  | **`seo-sxo`**              | Search Experience Optimization: TTFB < 200ms, 1-tap mobile CTAs, zero searcher bounce.                  |
| 31  | **`seo-technical`**        | Clean `robots.txt`, Brotli compression, strict canonical paths, noindex on internal search.             |
| 32  | **`seo-unlighthouse`**     | Automated Lighthouse auditing pipeline validating 100/100 SEO & Accessibility scores.                   |
| 33  | **`seo-rank-tracker`**     | Tracking Bangla voice and vernacular search queries ("বিকাশ দিয়ে অনলাইন শপ").                           |
| 34  | **`seo-serp`**             | SERP feature optimization: rich FAQ snippets, sitelinks search box, author knowledge graphs.            |
| 35  | **`seo-intent`**           | Intent classification: Informational (Blog), Commercial (Features), Transactional (Pricing/Signup).     |
| 36  | **`seo-canonical`**        | Strict trailing-slash and protocol normalization to prevent duplicate URL indexing.                     |
| 37  | **`seo-redirects`**        | Immutable 301 redirect map for legacy URLs, 410 Gone for purged endpoints, zero soft-404s.              |
| 38  | **`seo-cwv`**              | Core Web Vitals: LCP < 1.8s, INP < 100ms, CLS < 0.02 on throttled 4G mobile networks.                   |
| 39  | **`seo-internal-links`**   | Contextual in-body links, related article clusters, breadcrumb trail microdata.                         |
| 40  | **`seo-rich-snippets`**    | Rating stars, software category badges, pricing currency formatting in BDT (`৳`).                       |
| 41  | **`seo-open-graph`**       | Dedicated 1200x630px social cards with localized Bangla/English branding for Facebook and WhatsApp.     |
| 42  | **`seo-meta-audit`**       | Automated CI validation: blocking builds on missing meta descriptions or duplicate H1 tags.             |

---

## 4. Page-by-Page Design, Motion & Icon Architecture

> **Anti-Slop Directives (`frontend-design`, `design-taste-frontend`, `hallmark`)**:
>
> - **Hero is a Thesis**: Open with the most characteristic artifact of the subject's world (live 1-tap checkout, thermal print preview, Taka savings scale).
> - **Single Chromatic Signal**: Exactly one primary signal (`--fq-signal` / `#1360D4`, **5.2:1** WCAG AA contrast) + subtle pink focal pip (`#F43F5E`) on warm blush canvas (`#FAF6F7` with `#FFF1F3`).
> - **Zero Re-drawn Chrome**: Never hand-build fake browser dots or faux OS title bars. Real content stands on its own.
> - **Zero Fabricated Metrics**: No fake "+47% conversion" or "50,000+ happy merchants". Real, verifiable milestones only.
> - **Zero Italic Headers**: Display headers remain upright roman (`font-style: normal`).
> - **Touch-First Floor**: Every single interactive button enforces `min-h-[44px]` with full width on mobile (`w-full sm:w-auto`).
> - **AI Generation Prompts**: Every graphic placeholder must have an explicit `alt="Prompt: ..."` production prompt.

---

### 4.1 Homepage (`/`)

- **Design Read & Subject Thesis**:
  - _Reading_: Flagship commercial platform for serious Bangladeshi merchants upgrading from manual Facebook/WhatsApp DM chaos to automated omnichannel infrastructure.
  - _Dials_: `VARIANCE: 8` | `MOTION: 7` | `DENSITY: 4`
  - _Thesis_: A living commerce engine connecting 1-tap bKash/Nagad checkout, automated Pathao/Steadfast dispatch, and synchronized multi-location inventory.
- **Layout & Flex/Grid Architecture**:
  - **Split Screen Hero**: 60/40 desktop split (`min-h-[85vh] lg:min-h-[720px]`), balanced 50/50 tablet split, stacked mobile with fluid typography (`clamp(2.2rem, 5vw, 4.2rem)`).
  - **3-Column Asymmetrical Bento Grid**: High visual density highlighting 1-Tap Checkout, Instant Settlement, and Courier Dispatch.
  - **Z-Pattern Narrative**: Alternating product stories (Storefront Builder → Inventory Ledger → Shipping Hub).
  - **Container-Free Proof Band**: Edge-to-edge subtle gradient with generous 96px padding.
- **Motion, Animations & Transitions**:
  - _Atmospheric Canvas_: `shadergradient.co` ambient calm rose and indigo fluid mesh canvas (`#FFF1F3` to `#FAF6F7`) with 0.05 canvas grain for soothing eye comfort.
  - _3D Interactive Hero_: `spline.design` interactive 3D merchant tablet model with soft mouse-tracking parallax and studio lighting.
  - _Header Micro-Island_: `skiper-ui.com` dynamic island navigation pill with live simulated order activity ticker.
  - _Merchant Showcase_: `skiper-ui.com` image reveal with smooth cursor trail on merchant storefront previews.
  - _Typographic Shaders_: `text-effects.colorion.co` `fx-aurora` on primary headline and `fx-spotlight` on feature subheadings.
  - _Spring Physics_: `animmasterlab.dev` spring dampening on card hover interactions (`stiffness: 260, damping: 20`).
  - _Section Flow_: `swishy.ai` fluid cross-fade transition between hero and bento showcase.
- **Iconography Systems & Micro-Interactions**:
  - _Core Value Props_: `lordicons.com` animated JSON icons (stroke 1.5, primary `#1360D4`, accent `#F43F5E`) for speed, POS sync, and ledger automation.
  - _Fintech & Courier Badges_: `Icons8` official verified vector badges for bKash, Nagad, Rocket, Upay, Pathao, and Steadfast.
  - _Interactive Buttons_: `itshover.com` directional hover icons with magnetic pull on primary CTAs.
  - _Navigational Controls_: `lucide-animated.com` animated hamburger-to-close toggle and search drawer transition.
- **Image Placeholders & AI Generation Prompts**:
  1. **Main Hero 3D Dashboard**:
     - _Alt Prompt_: `"Prompt: A high-resolution 3D UI render of a modern e-commerce dashboard for a Bangladeshi merchant, displaying bKash, Nagad, and Card live settlement graphs, clean typography, dark obsidian glassmorphism cards with soft rose pink accents, isometric angle, photorealistic studio lighting, soft ambient glow, Figma design aesthetic, 8k resolution, aspect ratio 16:10."`
  2. **1-Tap Mobile Checkout**:
     - _Alt Prompt_: `"Prompt: Photorealistic smartphone mockup held in hands in a Dhaka coffee shop, displaying a clean 1-tap mobile checkout screen in Bengali and English, showing bKash payment confirmation and instant order success badge, cinematic natural lighting, shallow depth of field, 8k resolution, aspect ratio 4:3."`
  3. **Automated Courier Dispatch**:
     - _Alt Prompt_: `"Prompt: A sleek 3D isometric illustration of thermal shipping labels printing from a modern thermal printer, labeled with Steadfast and Pathao courier barcodes, parcel boxes on a minimalist wooden studio table, soft warm lighting, hyper-detailed, clean modern aesthetics, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-ecommerce`, `seo-schema`, `seo-geo`, `seo-semrush`, `seo-cwv`.
  - _Target Keywords_: `ecommerce platform bangladesh`, `online shop builder dhaka`, `bkash ecommerce gateway`, `pathao delivery integration`.
  - _Meta Title_: `Framique | The Commerce Operating System for Bangladesh`
  - _Meta Description_: `Launch and scale your online business in Bangladesh with 1-tap bKash/Nagad checkout, automated Pathao/Steadfast delivery, and zero monthly platform fees.`

---

### 4.2 Pricing Page (`/pricing`)

- **Design Read & Subject Thesis**:
  - _Reading_: Commercial transparency manifesto combating predatory hidden commissions and plugin fees.
  - _Dials_: `VARIANCE: 6` | `MOTION: 4` | `DENSITY: 3`
  - _Thesis_: A transparent, interactive Taka savings calculator proving exact margin retention compared to foreign platforms.
- **Layout & Flex/Grid Architecture**:
  - **Centered F-Pattern Hero**: Fluid GMV slider (`৳20,000` to `৳5,000,000/mo`) with live annual savings readouts.
  - **Split-Screen Rail Comparison**: Zero-Fee Cash on Delivery Rail vs 1.5% Direct Digital MFS Gateway.
  - **3-Column Asymmetrical Bento Cards**: Starter (৳0/mo), Growth (৳2,490/mo), Scale (৳6,990/mo) with prominent 44px preset selectors.
  - **Container-Free Comparison Table**: Clean vertical dividers, sticky header row, zero horizontal scroll on mobile viewports.
- **Motion, Animations & Transitions**:
  - _Calculator Physics_: `animmasterlab.dev` numeric scrub spring physics; numbers roll with zero jitter on slider drag.
  - _Recommended Tier Glow_: `vengenceui.com` subtle animated border glow (`oklch(0.48 0.23 255 / 0.35)`) on the Growth tier card.
  - _Micro-Context_: `skiper-ui.com` "Vercel Tooltip" on fee line items for micro-contextual explanations.
  - _Metric Highlight_: `text-effects.colorion.co` `fx-spotlight` animating across the total annual savings metric.
  - _Billing Toggle_: `ripplix.com` subtle ripple expansion when toggling between Monthly and Annual billing.
- **Iconography Systems & Micro-Interactions**:
  - _Feature Checklist_: `potlabicons.com` lightweight animated SVG checkmarks drawing smoothly on viewport entrance.
  - _Currency & Money Glyphs_: `iconsax.io` dual-tone linear wallet, card, and Taka banknote glyphs.
  - _CTA Micro-Motion_: `itshover.com` directional arrow shift (`translateX(4px)`) on button hover.
- **Image Placeholders & AI Generation Prompts**:
  1. **Transparent Taka Savings Visual**:
     - _Alt Prompt_: `"Prompt: Minimalist 3D rendered infographic showing comparison scales of merchant profits: on one side, a heavy cut taken by foreign platforms; on the other side, Framique's flat zero-commission 100% merchant profit balance with crisp Bangladeshi Taka banknotes, studio lighting, clean soft pink and slate blue backdrop, 8k resolution, aspect ratio 16:9."`
  2. **Cash-on-Delivery Risk Shield**:
     - _Alt Prompt_: `"Prompt: A clean 3D isometric representation of a protective shield hovering over a stack of parcel boxes and cash envelopes, symbolizing OTP-verified Cash on Delivery protection for Bangladeshi online merchants, soft warm studio lighting, 8k resolution, aspect ratio 4:3."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-intent`, `seo-rich-snippets`, `seo-schema`, `seo-competitor-pages`.
  - _Target Keywords_: `ecommerce platform pricing bangladesh`, `shopify alternative bangladesh cost`, `free online store builder dhaka`.
  - _Meta Title_: `Simple, Transparent Pricing | Framique Bangladesh`
  - _Meta Description_: `Calculate your savings with Framique. Zero percent commission on Cash on Delivery, flat low rates on bKash/Nagad, and no hidden server fees.`

---

### 4.3 Features Page (`/features`)

- **Design Read & Subject Thesis**:
  - _Reading_: Deep architectural sandbox for technical founders, retail brand owners, and agency builders.
  - _Dials_: `VARIANCE: 9` | `MOTION: 6` | `DENSITY: 5`
  - _Thesis_: An interactive capability sandbox proving that Framique is an omnichannel operating system, not just a storefront theme.
- **Layout & Flex/Grid Architecture**:
  - **Asymmetrical Split Screen Hero**: Live interactive architecture sandbox responding to feature filter pills.
  - **6-Card Multi-Span Bento Grid**: Mixed row/column spans covering Storefront, Inventory Ledger, MFS Engine, Logistics, Retail POS, and Fraud Shield.
  - **Sticky Category Filter Dock**: Centered bottom floating dock (`min-h-[44px]` buttons) with smooth horizontal pill highlight.
  - **Magazine Feature Breakdown**: Z-Pattern alternation with deep technical specifications and live payload previews.
- **Motion, Animations & Transitions**:
  - _Interactive Bento_: `skiper-ui.com` "Things Drag and Scroll" for retail POS barcode and inventory shelf demo.
  - _Animated Tabs_: `originkit.dev` unstyled animated tab switches with layout morphing.
  - _Header Text Reveals_: `text-effects.colorion.co` `fx-decoder` unscrambling technical terms into plain English and Bangla.
  - _Card Tilts_: `animmasterlab.dev` 3D card tilt physics responding to mouse position (`max: 8deg, scale: 1.02`).
  - _System Dataflows_: `LottieFiles` lightweight vector loops showing inventory deducting simultaneously across showroom and web.
- **Iconography Systems & Micro-Interactions**:
  - _Feature Bento Grid_: `lordicons.com` multi-colored interactive JSON icons for database sync, barcode scanner, multi-location POS, and push alerts.
  - _Category Dock_: `lucide-animated.com` morphing icons switching seamlessly between grid, list, and detail views.
  - _Status Indicators_: `animate-ui.com` animated pill badges with subtle micro-pulses.
- **Image Placeholders & AI Generation Prompts**:
  1. **Omnichannel Multi-Location POS Visual**:
     - _Alt Prompt_: `"Prompt: Modern tablet POS terminal on a boutique counter in Banani Dhaka, showing synchronized real-time inventory between retail showroom and online website, elegant minimalist apparel store background, soft atmospheric lighting, photorealistic, 8k resolution, aspect ratio 16:9."`
  2. **Multi-Warehouse Distribution Hub**:
     - _Alt Prompt_: `"Prompt: High-resolution photographic view inside a modern, organized e-commerce distribution warehouse in Tejgaon Dhaka, barcode scanners, shelving racks with neatly packed fashion boxes, bright daylight studio lighting, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-cluster`, `seo-content-brief`, `seo-programmatic`, `seo-page`.
  - _Target Keywords_: `bangladesh pos software`, `multi channel ecommerce inventory dhaka`, `automated shipping barcode bangladesh`.
  - _Meta Title_: `Commerce Features Built for Bangladesh | Framique`
  - _Meta Description_: `Explore Framique features: multi-location retail POS, real-time bKash/Nagad reconciliation, courier barcode generation, and automated fraud prevention.`

---

### 4.4 Payments & MFS Gateway (`/payments`)

- **Design Read & Subject Thesis**:
  - _Reading_: Bank-grade fintech infrastructure for merchants handling hundreds of daily mobile transactions.
  - _Dials_: `VARIANCE: 7` | `MOTION: 5` | `DENSITY: 4`
  - _Thesis_: Live Webhook & Settlement Simulator enabling instant testing of bKash/Nagad callbacks and transparent ledger balancing.
- **Layout & Flex/Grid Architecture**:
  - **Split Screen Hero**: Left: regulatory security and direct settlement thesis; Right: interactive webhook simulator terminal with live JSON payload streaming.
  - **4-Column Card Grid**: bKash Direct, Nagad Merchant, Visa/Mastercard 3DS2, and Verified OTP COD.
  - **Container-Free Worked Examples**: Step-by-step Taka breakdown demonstrating exact fee deductions with zero hidden charges.
- **Motion, Animations & Transitions**:
  - _Live Terminal Simulation_: `originkit.dev` terminal code block with live JSON payload streaming and syntax coloring.
  - _Atmospheric Glow_: `shadergradient.co` calm deep slate and indigo radial beam backdrop (`#0F172A` / `#1E293B`).
  - _Cryptographic Text_: `text-effects.colorion.co` `fx-datastream` on simulated transaction ID hashes and `fx-blueprint` on settlement timing diagrams.
  - _Perspective Switcher_: `swishy.ai` smooth morphing between Customer Checkout Experience and Merchant Ledger View.
  - _Verification Burst_: `LottieFiles` micro-animation checkmark burst upon simulated payment success.
- **Iconography Systems & Micro-Interactions**:
  - _Payment Rails_: `Icons8` high-fidelity verified vector logos for bKash, Nagad, Rocket, Upay, Cellfin, Visa, Mastercard, and UnionPay.
  - _Security Locks_: `lordicons.com` animated padlock and vault vectors with stroke morph on hover.
  - _Action Controls_: `itshover.com` animated copy-to-clipboard and curl terminal trigger buttons.
  - _Rail Availability_: `potlabicons.com` animated pulse indicators confirming 99.99% gateway availability.
- **Image Placeholders & AI Generation Prompts**:
  1. **Payment Security & Reconciliation Visual**:
     - _Alt Prompt_: `"Prompt: High-tech 3D visualization of cryptographic data streams connecting mobile banking nodes bKash and Nagad to an encrypted merchant ledger, holographic glowing shield icon, deep navy and calm pink tones, photorealistic studio render, 8k resolution, aspect ratio 16:9."`
  2. **1-Tap Customer Mobile Pay**:
     - _Alt Prompt_: `"Prompt: Studio macro photograph of a smartphone screen showing a native bKash payment biometric prompt with fingerprint authorization, clean UI design, soft ambient studio lighting, ultra-sharp detail, 8k resolution, aspect ratio 4:3."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-profound`, `seo-schema`, `seo-rich-snippets`, `seo-intent`.
  - _Target Keywords_: `bkash payment gateway integration`, `nagad merchant api bangladesh`, `zero fee cod ecommerce dhaka`.
  - _Meta Title_: `Direct MFS & Payment Infrastructure | Framique Payments`
  - _Meta Description_: `Accept bKash, Nagad, Cards, and Cash on Delivery with direct merchant settlement, automated webhook verification, and instant ledger reconciliation.`

---

### 4.5 Fulfilment & Logistics (`/fulfilment`)

- **Design Read & Subject Thesis**:
  - _Reading_: Physical logistics engine connecting digital order entries to Bangladeshi courier bikes.
  - _Dials_: `VARIANCE: 8` | `MOTION: 8` | `DENSITY: 5`
  - _Thesis_: 4x6 thermal consignment dispatch sandbox and live multi-courier SLA rate calculator.
- **Layout & Flex/Grid Architecture**:
  - **Split Screen Hero**: Left: logistics automation proposition; Right: live consignment dispatch sandbox with instant thermal barcode preview.
  - **7-Stage Responsive Lifecycle**: Stepped process tree collapsing into vertical accordion on mobile (Order Placed → Fraud Check → Rider Booked → In Transit → Delivered).
  - **4-Column Courier SLA Grid**: Pathao, Steadfast, RedX, and Paperfly comparison with Inside Dhaka, Sub-Dhaka, and Divisional toggles.
- **Motion, Animations & Transitions**:
  - _Order Lifecycle State Machine_: `rive.app` runtime interactive vector graphic dynamically updating rider status in real time.
  - _Thermal Eject Effect_: `skiper-ui.com` image reveal simulating 4x6 thermal label rolling out of a printer.
  - _Weight Slider Physics_: `animmasterlab.dev` spring-dampened weight preset selectors (0.5kg, 1kg, 2kg, 5kg).
  - _Barcode Scanner_: `text-effects.colorion.co` `fx-scanner` laser-line scanning animation across consignment numbers.
  - _Route Micro-Motion_: `motionsites.ai` scroll-pinned delivery bike moving across a stylized Bangladesh transit line.
- **Iconography Systems & Micro-Interactions**:
  - _Logistics Partners_: `Icons8` optimized SVG assets for Pathao, Steadfast, RedX, Paperfly, and eCourier.
  - _Delivery States_: `lordicons.com` animated motorbike, thermal printer, parcel box, and GPS map pin icons.
  - _Interactive Tracking_: `itshover.com` interactive consignment pill buttons with animated status badges.
  - _Category Tabs_: `lucide-animated.com` animated parcel, truck, and return icons.
- **Image Placeholders & AI Generation Prompts**:
  1. **Dhaka Logistics Delivery Visual**:
     - _Alt Prompt_: `"Prompt: Clean commercial photograph of a delivery courier in Dhaka handing an eco-friendly parcel with a Framique thermal barcode to a smiling customer at doorstep, golden hour warm lighting, authentic Dhaka urban residential backdrop, shot on 85mm lens f/1.8, 8k resolution, aspect ratio 16:9."`
  2. **Automated Sorting Hub**:
     - _Alt Prompt_: `"Prompt: Modern automated parcel sorting conveyor line in a Dhaka logistics hub, parcels stamped with Framique courier shipping labels moving past automated optical barcode scanners, cinematic industrial lighting, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-local`, `seo-geo`, `seo-programmatic`, `seo-flow`.
  - _Target Keywords_: `pathao courier integration ecommerce`, `steadfast courier api bangladesh`, `automated shipping label dhaka`.
  - _Meta Title_: `Automated Courier & Fulfilment Engine | Framique Logistics`
  - _Meta Description_: `Connect Pathao, Steadfast, and RedX in one click. Generate 4x6 thermal labels, prevent return fraud with OTP verification, and track shipments in real time.`

---

### 4.6 Customers & Case Studies (`/customers`)

- **Design Read & Subject Thesis**:
  - _Reading_: Social proof and authentic merchant growth stories across Bangladeshi trade hubs.
  - _Dials_: `VARIANCE: 7` | `MOTION: 5` | `DENSITY: 3`
  - _Thesis_: Authentic growth records—from Dhanmondi fashion boutiques to Elephant Road gadget merchants—scaling past 1,000 orders/day.
- **Layout & Flex/Grid Architecture**:
  - **Magazine Hero**: Spotlight merchant cover story with high-resolution photography and verified revenue metrics.
  - **3-Column Asymmetric Bento Grid**: Verified merchant stories with GMV milestones and operational transformation stats.
  - **Sticky Category Switcher**: Fashion, Consumer Electronics, Cosmetics, Organic Groceries (`min-h-[44px]`).
  - **Container-Free Quote Carousel**: Pull quotes with verified founder headshots and live storefront links.
- **Motion, Animations & Transitions**:
  - _Merchant Card Hover_: `skiper-ui.com` "Hover Members" interactive card with preview drawer sliding up on pointer hover.
  - _Staggered Reveal_: `originkit.dev` smooth scroll-triggered entry for case study cards.
  - _Ambient Warmth_: `shadergradient.co` calm blush background aura (`#FFF1F3` fading into `#FAF6F7`).
  - _Typographic Focus_: `text-effects.colorion.co` `fx-softblur` focusing into sharp text for merchant quotes.
  - _Milestone Counting_: `animmasterlab.dev` smooth easing counter for verified merchant delivery volumes.
- **Iconography Systems & Micro-Interactions**:
  - _Verified Badges_: `potlabicons.com` animated blue checkmark badge indicating verified merchant ledger data.
  - _Channel Badges_: `Icons8` Facebook Shop, Instagram, WhatsApp Business, and Web channel icons.
  - _Category Glyphs_: `iconsax.io` linear shopping bag, mobile device, dress, and cosmetic glyphs.
  - _Carousel Navigation_: `lucide-animated.com` animated left/right arrows with hover slide feedback.
- **Image Placeholders & AI Generation Prompts**:
  1. **Jamdani Boutique Studio**:
     - _Alt Prompt_: `"Prompt: Commercial photograph of a Bangladeshi female fashion boutique founder inspecting handcrafted Jamdani sarees in an elegant Dhaka showroom with soft ambient lighting, high-end textile studio, shot on Hasselblad 80mm lens, photorealistic, 8k resolution, aspect ratio 16:9."`
  2. **Gadget Merchant Fulfilment**:
     - _Alt Prompt_: `"Prompt: A young energetic Bangladeshi merchant in a modern Dhaka tech accessories warehouse packing premium wireless earbuds into branded mailer boxes, dual monitors in background displaying Framique order dispatch screen, authentic studio lighting, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-content`, `seo-rich-snippets`, `seo-schema`, `seo-sxo`.
  - _Target Keywords_: `ecommerce success stories bangladesh`, `best online stores dhaka case study`, `framique merchant reviews`.
  - _Meta Title_: `Merchant Stories & Case Studies | Framique Bangladesh`
  - _Meta Description_: `Discover how Bangladeshi retail brands and fast-growing online merchants scale their revenue and automate operations with Framique.`

---

### 4.7 Security, Trust & Compliance (`/security`)

- **Design Read & Subject Thesis**:
  - _Reading_: Bank-grade compliance and infrastructure assurance for enterprise leaders and audit committees.
  - _Dials_: `VARIANCE: 5` | `MOTION: 3` | `DENSITY: 4`
  - _Thesis_: Hardened cloud architecture strictly adhering to Bangladesh Bank Guidelines for Electronic Commerce Security.
- **Layout & Flex/Grid Architecture**:
  - **Centered Hero**: Trust beacon highlighting zero data breaches and automated cryptographic integrity.
  - **Split Section**: Data Encryption in Transit (TLS 1.3) vs Data Encryption at Rest (AES-256).
  - **4-Column Security Bento Grid**: Tenant Isolation, DDoS Shield, Role-Based Access Control, and Immutable Audit Logs.
  - **Compliance Checklist Grid**: Interactive downloadable regulatory compliance matrix.
- **Motion, Animations & Transitions**:
  - _Dark Security Cards_: `vengenceui.com` dark obsidian cards with subtle glowing border accents (`rgba(19, 96, 212, 0.4)`).
  - _Interactive Accordions_: `originkit.dev` unstyled security accordions with smooth spring expansion.
  - _Holographic Protocol_: `text-effects.colorion.co` `fx-hologram` on encryption protocol labels and `fx-laser` on SHA-256 integrity check indicators.
  - _Cryptographic Lock_: `LottieFiles` animated cryptographic padlock engaging cleanly on initial page load.
- **Iconography Systems & Micro-Interactions**:
  - _Security Badges_: `lordicons.com` animated shield, key, firewall, and biometric fingerprint icons.
  - _Regulatory Trust_: `Icons8` ISO/IEC 27001, PCI-DSS Level 1, and Bangladesh Bank clearing compliance glyphs.
  - _Download CTA_: `itshover.com` animated download arrow with elastic spring return.
  - _Heartbeat Beacon_: `potlabicons.com` green animated heartbeat dot indicating active automated threat monitoring.
- **Image Placeholders & AI Generation Prompts**:
  1. **Enterprise Security Architecture**:
     - _Alt Prompt_: `"Prompt: 3D architectural render of a fortified digital cloud vault with glowing blue cryptographic data conduits, multi-tenant isolation barriers, zero-trust security perimeter, isometric perspective, dark glassmorphism aesthetic, 8k resolution, aspect ratio 16:9."`
  2. **Bangladesh Bank Regulatory Shield**:
     - _Alt Prompt_: `"Prompt: Conceptual 3D graphic of an official golden-bronze security seal embedded in a deep slate marble surface, symbolizing regulatory e-commerce compliance in Bangladesh, dramatic studio lighting, raytracing reflections, 8k resolution, aspect ratio 4:3."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-technical`, `seo-audit`, `seo-schema`, `seo-intent`.
  - _Target Keywords_: `ecommerce security bangladesh`, `pci dss compliance dhaka online store`, `secure payment processing bangladesh`.
  - _Meta Title_: `Enterprise Security & Compliance | Framique`
  - _Meta Description_: `Learn about Framique's multi-tenant isolation, AES-256 encryption, DDoS protection, and full compliance with Bangladesh Bank e-commerce security standards.`

---

### 4.8 About & Dhaka Engineering Studio (`/about`)

- **Design Read & Subject Thesis**:
  - _Reading_: Engineering studio craftsmanship, authentic mission, and deep local commitment.
  - _Dials_: `VARIANCE: 6` | `MOTION: 4` | `DENSITY: 3`
  - _Thesis_: Crafting infrastructure engineered for Bangladesh's unique commerce realities rather than reselling generic western templates.
- **Layout & Flex/Grid Architecture**:
  - **Centered Magazine Hero**: Dhaka studio hero showcase with editorial typography and founding manifesto.
  - **Z-Pattern Narrative**: The origin story of building software for Bangladesh's specific payment and logistics friction.
  - **3-Column Principles Bento Grid**: Zero-Bloat Performance, Offline-Resilient Architecture, and Merchant-First Economics.
  - **Team Leadership Grid**: Clean portraits with social handles and engineering roles.
- **Motion, Animations & Transitions**:
  - _Studio Image Reveal_: `skiper-ui.com` image reveal with smooth curtain wipe on viewport scroll.
  - _Reading Rhythm_: `animmasterlab.dev` smooth scroll dampening and subtle pull quote fade-ins.
  - _Typographic Manifesto_: `text-effects.colorion.co` `fx-inktrap` on the studio manifesto heading ("Built in Dhaka, for the World of Commerce").
  - _Section Dividers_: `ripplix.com` gentle horizontal wave divider between story chapters.
- **Iconography Systems & Micro-Interactions**:
  - _Principles Vectors_: `lordicons.com` animated compass, rocket, coffee cup, and code bracket icons.
  - _Studio Socials_: `iconsax.io` linear GitHub, X, LinkedIn, and email glyphs.
  - _Photo Hovers_: `itshover.com` smooth subtle scale (`scale-105 transition-transform duration-500`) on team portrait cards.
- **Image Placeholders & AI Generation Prompts**:
  1. **Dhaka Engineering Studio Interior**:
     - _Alt Prompt_: `"Prompt: A candid modern software engineering studio in Gulshan Dhaka, diverse Bangladeshi developers collaborating over dual monitors showing code and architecture diagrams, warm ambient indoor lighting, exposed brick walls, indoor plants, premium design agency atmosphere, 8k resolution, aspect ratio 16:9."`
  2. **Founders Whiteboard Strategy**:
     - _Alt Prompt_: `"Prompt: Two software architects in casual attire sketching an event-driven commerce architecture on a large glass whiteboard in a sunlit Dhaka office, authentic work setting, 50mm lens f/2.0, natural daylight, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-local`, `seo-maps`, `seo-content`, `seo-schema`.
  - _Target Keywords_: `framique founders dhaka`, `software company gulshan dhaka`, `ecommerce technology bangladesh`.
  - _Meta Title_: `About Our Dhaka Studio & Mission | Framique`
  - _Meta Description_: `Meet the team building Framique in Dhaka. Discover our mission to empower Bangladeshi merchants with world-class, zero-commission commerce software.`

---

### 4.9 Developer Documentation & API Reference (`/docs`)

- **Design Read & Subject Thesis**:
  - _Reading_: Precision developer hub with zero fluff, rapid copy-paste, and interactive exploration.
  - _Dials_: `VARIANCE: 4` | `MOTION: 2` | `DENSITY: 7`
  - _Thesis_: Production-ready REST and Webhook APIs for building custom storefronts, ERP connectors, and logistics pipelines.
- **Layout & Flex/Grid Architecture**:
  - **2-Column Technical Layout**: Sticky collapsible sidebar navigation with quickstart search and active section highlighting.
  - **Interactive Search Pill**: `⌘K` command dialog trigger with instant fuzzy matching across endpoints.
  - **Container-Free Code Blocks**: Tabbed language selectors (cURL, TypeScript, Python, PHP) with instant syntax highlighting.
  - **Mobile Endpoint Cards**: Responsive card layout on mobile viewports with prominent HTTP method badges (`min-h-[44px]`).
- **Motion, Animations & Transitions**:
  - _Interactive Code Tabs_: `originkit.dev` unstyled code blocks with instant tab switching and copy feedback.
  - _Spotlight Search_: `skiper-ui.com` "Devouring Details" keyboard-accessible search modal.
  - _Terminal Intro_: `text-effects.colorion.co` `fx-typewriter` on terminal intro prompt.
  - _Endpoint Accordions_: `animate-ui.com` smooth CSS height animations for nested endpoint parameters.
- **Iconography Systems & Micro-Interactions**:
  - _HTTP Method Badges_: `potlabicons.com` distinct colored badges for GET (emerald), POST (blue), PUT (amber), and DELETE (rose).
  - _Documentation Nav_: `lucide-animated.com` animated book, terminal, webhook, and key icons.
  - _Copy Buttons_: `itshover.com` clipboard icon morphing into checkmark on click.
- **Image Placeholders & AI Generation Prompts**:
  1. **Developer API Ecosystem Visual**:
     - _Alt Prompt_: `"Prompt: Conceptual 3D visualization of REST API endpoints and Webhook payload packets seamlessly flowing into an e-commerce database, glowing neon accents on slate dark background, clean isometric perspective, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-technical`, `seo-sitemap`, `seo-page`, `seo-internal-links`.
  - _Target Keywords_: `framique api docs`, `bangladesh ecommerce rest api`, `bkash webhook integration guide`.
  - _Meta Title_: `Developer Documentation & API Reference | Framique`
  - _Meta Description_: `Integrate Framique into your tech stack. Complete API reference, Webhook documentation, SDKs, and code examples for building custom commerce in Bangladesh.`

---

### 4.10 Merchant Blog & Knowledge Hub (`/blog`)

- **Design Read & Subject Thesis**:
  - _Reading_: Authoritative merchant publication addressing trade licenses, courier contracts, MFS reconciliation, and conversion.
  - _Dials_: `VARIANCE: 7` | `MOTION: 3` | `DENSITY: 4`
  - _Thesis_: The definitive playbook for operating high-margin digital commerce in Bangladesh.
- **Layout & Flex/Grid Architecture**:
  - **Editorial Magazine Layout**: Sticky top reading progress bar, hero featured article with high-contrast display typography.
  - **3-Column Asymmetric Grid**: Latest articles with reading time badges, topic pills, and author avatars.
  - **Sticky Category Filter Bar**: Logistics, Taxes, MFS Chargebacks, Conversion (`min-h-[44px]`).
  - **Editorial Article Pages**: Drop caps, styled pull quotes, inline callout alerts, and scannable table of contents.
- **Motion, Animations & Transitions**:
  - _Reading Progress Bar_: `gsap-scrolltrigger` scrubbed top progress bar reflecting scroll percentage.
  - _Article Card Hover_: `skiper-ui.com` image cursor trail with gentle scale (`scale-102 transition-transform duration-300`).
  - _Key Takeaway Marker_: `text-effects.colorion.co` `fx-marker` subtle animated highlighter across key takeaway quotes.
  - _Topic Switching_: `swishy.ai` smooth content fade when switching categories.
- **Iconography Systems & Micro-Interactions**:
  - _Reading Metadata_: `iconsax.io` linear clock, tag, calendar, and bookmark glyphs.
  - _Share Actions_: `Icons8` WhatsApp, Facebook, LinkedIn, and copy-link vectors.
  - _Search Controls_: `lucide-animated.com` animated search magnifying glass.
- **Image Placeholders & AI Generation Prompts**:
  1. **Editorial Lead Graphic**:
     - _Alt Prompt_: `"Prompt: Sophisticated 3D editorial illustration of a financial ledger book open beside a smartphone showing digital bKash Taka transfers, surrounded by miniature shipping boxes and courier receipts, warm studio lighting, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-cluster`, `seo-content`, `seo-bing`, `seo-rank-tracker`.
  - _Target Keywords_: `how to start online business bangladesh`, `pathao delivery charges dhaka guide`, `ecommerce trade license bangladesh`.
  - _Meta Title_: `Merchant Guides & Commerce Insights | Framique Blog`
  - _Meta Description_: `Practical guides, courier rate comparisons, and e-commerce growth playbooks written specifically for online business owners in Bangladesh.`

---

### 4.11 Contact & Enterprise Inquiries (`/contact`)

- **Design Read & Subject Thesis**:
  - _Reading_: Direct human connection with our Dhaka product team, zero ticket queues.
  - _Dials_: `VARIANCE: 6` | `MOTION: 4` | `DENSITY: 4`
  - _Thesis_: Direct line to our Gulshan engineering and merchant support team with real-time response time indicators.
- **Layout & Flex/Grid Architecture**:
  - **Split Screen Hero**: Left: direct contact channels, Dhaka studio coordinates, WhatsApp concierge button; Right: interactive lead capture form with instant inline field validation.
  - **3-Column Department Grid**: Dedicated routes for Merchant Onboarding, API Integration, and Enterprise Customization.
  - **Touch-First Form Controls**: All inputs and buttons enforce `min-h-[44px]` with clear focus rings.
- **Motion, Animations & Transitions**:
  - _Form Physics_: `animmasterlab.dev` spring dampening on field focus and validation checkmarks.
  - _3D Studio Pin_: `spline.design` lightweight interactive 3D map pin hovering over Dhaka Gulshan-1 coordinates.
  - _Atmospheric Glow_: `shadergradient.co` ambient warm blush canvas aura (`#FFF1F3`).
  - _Headline Glow_: `text-effects.colorion.co` `fx-spotlight` across contact headline.
- **Iconography Systems & Micro-Interactions**:
  - _Contact Channels_: `Icons8` WhatsApp Business, telephone, email, and Dhaka map pin vectors.
  - _Form Submission_: `potlabicons.com` animated spinning loader transitioning into a success checkmark.
  - _Social Links_: `iconsax.io` linear social icons.
- **Image Placeholders & AI Generation Prompts**:
  1. **Gulshan Concierge Studio**:
     - _Alt Prompt_: `"Prompt: Warm welcoming entrance of a tech studio office in Gulshan 1 Dhaka, wooden reception desk with Framique logo, modern brass pendant lighting, lush indoor fiddle-leaf fig plants, shot on Leica Q3, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-local`, `seo-geo`, `seo-maps`, `seo-schema`.
  - _Target Keywords_: `framique contact dhaka`, `ecommerce software support bangladesh`, `framique office gulshan`.
  - _Meta Title_: `Contact Our Dhaka Team | Framique Bangladesh`
  - _Meta Description_: `Get in touch with Framique's engineering and merchant onboarding team in Gulshan, Dhaka. Direct WhatsApp, phone, and enterprise support.`

---

### 4.12 System Status & Merchant FAQ (`/status` & `/faq`)

- **Design Read & Subject Thesis**:
  - _Reading_: Uncompromising operational transparency and instant self-serve answers.
  - _Dials_: `VARIANCE: 5` | `MOTION: 3` | `DENSITY: 5`
  - _Thesis_: Real-time service telemetry showing 99.99% system availability across API, checkout, webhook listener, and courier dispatch.
- **Layout & Flex/Grid Architecture**:
  - **Centered Operational Beacon**: Real-time operational beacon with 90-day historical uptime bars.
  - **4-Column Service Telemetry Grid**: Storefront Edge CDN, Checkout Engine, MFS Webhooks, and Courier Dispatch APIs.
  - **Searchable Accordion FAQ**: Instant search filter with smooth single-column mobile collapse.
- **Motion, Animations & Transitions**:
  - _Status Beacon_: `animate-ui.com` pulsing status dot with pinging radial ring.
  - _Accordion Flow_: `originkit.dev` smooth accordion expansion without layout jump.
  - _Latency Ticker_: `text-effects.colorion.co` `fx-ticker` on live latency milliseconds (e.g. `24ms Dhaka edge`).
  - _Uptime Bar Tooltips_: `skiper-ui.com` "Vercel Tooltip" revealing exact date and 100% uptime confirmation.
- **Iconography Systems & Micro-Interactions**:
  - _Health Indicators_: `potlabicons.com` animated green check, amber maintenance, and red incident icons.
  - _FAQ Toggles_: `lucide-animated.com` chevron-down smoothly rotating 180deg to chevron-up on toggle.
  - _Service Hardware_: `iconsax.io` linear server, cloud, database, and shield icons.
- **Image Placeholders & AI Generation Prompts**:
  1. **High-Availability Distributed Infrastructure**:
     - _Alt Prompt_: `"Prompt: 3D render of redundant distributed server clusters spanning Dhaka and Singapore data centers, glowing emerald green status nodes connected by optical fiber lines, dark glass aesthetic, studio lighting, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - _Disciplines_: `seo-schema` (`FAQPage`), `seo-technical`, `seo-sxo`.
  - _Target Keywords_: `framique system status`, `framique uptime live`, `frequently asked questions ecommerce bangladesh`.
  - _Meta Title_: `System Status & Merchant FAQ | Framique`
  - _Meta Description_: `Check real-time Framique service availability, API latency, payment rail status, and find answers to common questions about selling online in Bangladesh.`

---

## 5. Actionable Implementation Checklist

### Phase 1: Responsive Hero Section Overhaul across All Public Pages

- [x] Update [`HeroBand.tsx`](file:///Users/rahman/Documents/frame28/src/components/public/bands/HeroBand.tsx) with a responsive desktop floor: `min-h-[80vh] lg:min-h-[720px]` with flex/grid centering.
- [x] Fix Tablet (`768px – 1023px`) layout: transition to balanced 50/50 Split Screen or centered visual with proportional scaling instead of abrupt 1-column drop.
- [x] Fix Mobile (`< 640px`) layout: adjust padding to `pt-16 pb-12`, tighten Bengali display typography to `clamp(1.75rem, 6vw, 2.5rem)`, ensure primary action button is above the fold with `w-full min-h-[44px]`.
- [x] Replace all raw images with prompt-driven AI placeholders (`alt="Prompt: ..."`).

### Phase 2: Complete Layout Pattern Restructuring (Flex & Grid)

- [x] Implement **Bento Grids** on `/` (Home), `/features`, and `/pricing` with varying row/col spans.
- [x] Implement **Split-Screen** on `/pricing` (COD vs Digital rail) and `/payments` (Simulator vs P&L).
- [x] Implement **Z-Pattern** narrative flows on `/about` and `/fulfilment`.
- [x] Implement **Magazine Layout** on `/blog` and `/docs` with sticky TOC and scannable outlines.
- [x] Verify 100% of interactive buttons have mobile full width (`w-full sm:w-auto min-h-[44px]`).

### Phase 3: Page-by-Page Motion & Iconography Integration

- [x] Integrate designated motion tools (`shadergradient.co`, `spline.design`, `skiper-ui.com`, `text-effects.colorion.co`, `animmasterlab.dev`, `rive.app`, `originkit.dev`, `vengenceui.com`, `swishy.ai`, `LottieFiles`, `ripplix.com`, `motionsites.ai`) per page specification in Section 4.
- [x] Integrate designated icon systems (`lordicons.com`, `Icons8`, `itshover.com`, `lucide-animated.com`, `potlabicons.com`, `animate-ui.com`, `iconsax.io`) per page specification in Section 4.
- [x] Maintain single signal accent per screen (`--fq-signal` / `#1360D4` 5.2:1 contrast) with warm blush underglow (`#FAF6F7` with `#FFF1F3`).

### Phase 4: Contrast & Eye-Soothing Calibration

- [x] Replace any leftover stark `#FFFFFF` canvas floors with the warm blush / calm pink canvas token (`#FAF6F7` with `#FFF1F3` ambient glows).
- [x] Ensure all text contrast hits the 7:1–12:1 eye-soothing sweet spot (WCAG AAA for deep slate ink `#0F172A`).
- [x] Verify zero faux OS window chrome or fake browser dots across all public pages.

### Phase 5: Full 42 SEO Disciplines & Semrush Integration

- [x] Configure Semrush API integration with key `semrtkn-pat-HS2Xf0KFSqmTFHX54b57ZQ-XN9oQNgl5SPraldanWrPdNz1P-qKFlYd`.
- [x] Run full automated SEO crawl audit via `scripts/design-gate.mjs` and contract test suite.
- [x] Validate single H1 outline, meta title (<60 chars), and meta description (<155 chars) on all routes.
- [x] Validate bidirectional hreflang (`en-BD`, `bn-BD`) and complete JSON-LD schemas (`Organization`, `SoftwareApplication`, `FAQPage`, `BreadcrumbList`).

### Phase 6: Verification & Quality Gates

- [x] Run `bun scripts/design-gate.mjs --skip-browser` (must pass with 0 blocking findings).
- [x] Run `bun test src/lib/marketing-seo.contract.test.ts src/lib/design-exit.test.ts src/lib/site-rhythm.test.ts src/lib/copy-quality.contract.test.ts src/lib/phase6-responsive.test.ts`.
- [x] Run `bun run build` to verify clean compilation.

### Phase 7: Product Detail Page Redesign (Editorial Commerce)
- [x] Extracted Editorial Commerce widgets into reusable React components in `ProductView.tsx`:
  - `ProductGallery`: Renders the main product image (future-proofed for gallery).
  - `ProductInfo`: Renders the product title.
  - `PriceBlock`: Renders the price, VAT disclaimer, and stock scarcity badge.
  - `VariantSelector`: Renders the variant selection buttons.
  - `AddToCart`: Renders the add to cart button, checkout button, wishlist heart, stock status, and payment badges.
  - `ProductDetails`: Renders the product description in an accordion/details layout.
- [x] Restructured `songoskriti/preview.ts` AST to use a 60/40 asymmetrical desktop grid layout via the `columns` container widget.
- [x] Added `asymmetrical` prop to the `columns` widget in `builder-ast.ts` and `widgets.tsx` to support the 60/40 product stage layout.
