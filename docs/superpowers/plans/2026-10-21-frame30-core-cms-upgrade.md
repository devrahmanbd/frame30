# Frame30 — Core CMS upgrade: seven first-class theme-editable templates (search, cart, account, blog, checkout, archive, page)

**Goal:** Make **seven** storefront templates — search, cart, account, blog, checkout, archive and page — real, first-class, merchant-editable templates in Frame30's actual CMS: a merchant selects the template in the real editor, arranges its sections, previews realistic data, saves, publishes, and sees that exact composition rendered around the **route-owned** data on the live storefront — with the platform keeping every data, authorisation and payment authority it has today. Two prior rulings are **superseded** by this brief: `archive` becomes a genuine first-class template key (D1 said "no new key"), and the authored checkout composition becomes the **production** shell around platform-owned primitives (D2 said "production stays platform-owned"). The Account page is the highest-priority visual repair and gets a real designed dashboard.

**Architecture:** The platform already has the whole spine this work needs — one canonical AST (`src/lib/builder-ast.ts`), one template-key union (`TEMPLATE_KEYS`, `src/lib/builder-ast.ts:46-59`), one persisted template map per theme (a `jsonb` map keyed by template key inside `theme_drafts.templates` / `theme_versions.templates`), one editor (`/dashboard/builder`, template switcher at `src/components/builder/BuilderTopBar.tsx:413`), one publish/rollback lifecycle (`src/lib/themes.server.ts:829` / `:956`), one route-owned context-slot contract (`ContextSlot`, `src/components/builder/SectionRenderer.tsx:825-833`), one per-widget context allowlist (41 catalogue `templates:` rows in `src/lib/builder-ast.ts`), one theme presentation registry, and one distinctness gate (`src/lib/themes/songoskriti/template-distinctness.ts`). What is missing is (a) the `archive` key itself, (b) the account dashboard, (c) the production checkout shell, (d) a way to author and resolve **variants** of a template (the machinery exists and persists variant keys; the editor and the routes do not use it), (e) a per-template persistence isolation proof, and (f) the integration/E2E/visual-regression coverage that proves all of it. The work therefore **extends the existing model**, never replaces it: the archive key rides the same `TEMPLATE_KEYS` union, the same zone allowlist, the same `jsonb` template map (so **no database migration is required**), the same editor and the same publish path. The checkout change is a *composition* change only: the route keeps its server-quoted totals, its validated form and its payment rails, and the theme's AST becomes the shell those primitives render inside.

**Tech Stack:** TypeScript 5.8 / React 19 (TanStack Start + Router), Vitest 4.1.11, Playwright 1.x (Chromium), `tsgo --noEmit` typecheck, ESLint 9 + Prettier 3, Node 24, PostgREST/Supabase (`publicClient` + `requireSupabaseAuth`). **No new npm dependency is added** and no lockfile changes.

**Spec:** `docs/superpowers/plans/2026-10-20-theme-editable-templates-brief.md` (the brief, as received) · `docs/superpowers/songoskriti-evidence/port/phase0-implementation-map.md` (the prior Phase-0 audit — §4 the archive blast radius, §8 the phase order) · `docs/superpowers/plans/2026-10-20-theme-editable-templates.md` (the master plan) · `docs/superpowers/plans/2026-10-20-songoskriti-template-completeness.md` (the prior phase plan) · `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-evidence.md` (the evidence record) · `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md` (the escalation record — the list of every §7 relaxation granted so far) · `report.md` (the consolidated report and the seven rulings) · `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md` §7 (Boundary) and §9 (Testing & evidence).

---

# Part I — The audit (the brief's Phase 0 / 0.2, re-derived from the code at `182c37b5`)

Every claim below was measured in this working tree, not taken from the brief or from `report.md`. Where the prior report and the tree disagree, **the tree wins** and the disagreement is stated.

## A1. `main` vs `frame30` — they are not the same, and the local `main` is the odd one out

```
cd /opt/frame28
git rev-parse main origin/main origin/frame30 HEAD
git rev-list --count main..origin/main
git rev-list --count origin/main..frame30
git rev-list --count frame30..main
git log --oneline frame30..main
git diff --shortstat main..frame30
```

Measured:

| fact | value |
| --- | --- |
| `HEAD` | `182c37b5` (`docs(report): list the exact §7 relaxations the owner granted`) |
| `origin/frame30` | `182c37b5` — identical to `HEAD`; the branch is pushed |
| `origin/main` | `182c37b5` — **identical to `origin/frame30`**; the remote `main` was fast-forwarded to this programme's tip |
| local `main` | `59240258` — *`docs: backup location, retention, and expiry policy`* — a **local-only** branch |
| merge base | `56d2a2a0` (`Merge remote-tracking branch 'origin/main'`) |
| `git rev-list --count main..origin/main` | **409** — local `main` is 409 commits **behind** `origin/main` |
| `git rev-list --count origin/main..frame30` | **0** — the remote `main` and `frame30` are the same commit |
| `git rev-list --count frame30..main` | **1** — local `main` carries exactly one commit not in `frame30` |
| `git diff --shortstat main..frame30` | `1203 files changed, 209752 insertions(+), 7723 deletions(-)` (691 files / +150 941 / −5 747 under `src/`; 202 files / +22 282 / −965 under `docs/`) |

**The lineage.** `frame30` branched from `56d2a2a0`; the local `main` is the *same* `56d2a2a0` plus one commit, `59240258`, which adds ten lines to `AGENTS.md` (the dev-server backup/retention policy). That exact text **is already present in `origin/main`** (`git show origin/main:AGENTS.md | grep -n "Backups"` → line 134) — it was carried forward through the merge, so the local `main` commit is a **duplicate** of content the programme already has, not new work.

**What a PR against `main` would contain.** Two different answers, and the difference matters:

- **Against the remote `main` (`origin/main`): nothing at all.** They are the same commit, so there is no diff to review. The programme was merged into the remote `main` by fast-forward.
- **Against the local `main` branch as it stands on this box:** the **entire programme** — 1 203 files, +209 752 / −7 723, including 691 files under `src/`. That is not a reviewable PR; it is the whole nine-phase port.

**The actionable consequence.** The brief's instruction *"check both `main` and `frame30` before modifying anything. Do not assume they are identical"* is satisfied by measurement: they **are** identical at the remote, and the local `main` is a stale, diverged pointer that must **not** be used as a diff base. The CI's SAST job resolves its base as `origin/main` (`.circleci/config.yml`, the `scan` job: `CANDIDATE="main"`, then `git fetch origin "$CANDIDATE:refs/remotes/origin/$CANDIDATE" --depth 50`) — which is correct, because `origin/main` is the programme's tip. **Work continues on `frame30`; the local `main` branch is left exactly as it is.**

## A2. The editor — what exists, and what the brief's Phase 2 items really are

**The route.** `/dashboard/builder` → `src/routes/_authenticated/dashboard/builder.tsx` (2 595 lines). This is the **theme** editor (storefront templates). It is a *different* surface from `/dashboard/content/editor` → `src/routes/_authenticated/dashboard/content/editor.tsx` (168 lines), which edits **CMS page/post records** (`?kind=page|post&id=<uuid>`, `searchSchema` at `:23-27`) and has **no template selector at all** — it is the content-record editor, not the template editor. The brief's "the CMS editor must expose all seven templates" therefore means the **theme editor at `/dashboard/builder`**, and any plan that wires the seven templates into `/dashboard/content/editor` would be wiring the wrong surface.

**The selector.** `src/components/builder/BuilderTopBar.tsx:413` — `{TEMPLATE_KEYS.map((key) => …)}` inside a `role="listbox"` popover (`#template-switcher-button`). The per-template metadata is `TEMPLATE_META` (`:6-76`), a `Record<TemplateKey, {en, bn, desc:{en,bn}, icon}>` — a **compile-time-total** map, so adding a key is a compile error until the map grows. A second, parallel label map exists at `src/routes/_authenticated/dashboard/builder.tsx:205-214` (`TEMPLATE_LABEL`, also `Record<TemplateKey, …>`) and a third in `src/lib/theme-preview-nav.ts:413-423` (`GENERIC_TITLES`, also `Record<TemplateKey, …>`). **Three exhaustive label maps, all of which must grow for a new key.**

**The state / persistence model.** `EditorDoc` = `{ templates: ThemeTemplates; tokens: ThemeTokens }` (`src/hooks/use-builder-editor.ts:39`), where `ThemeTemplates = Partial<Record<TemplateKey, ThemeAst>>` (`src/lib/builder-ast.ts:517`). Edits are per-template and per-slot (`editSlot(template, slot, …)`), so **per-template persistence isolation is structurally already true** — there is no shared slot map; each template has its own AST keyed by the template key. The editor hook holds undo/redo (`HISTORY_LIMIT = 50`, `:197`), autosave (`flush`), and a per-key lint map (`:632-641`).

**The save / publish path.** `src/lib/themes.server.ts`: `autosave` (`:409`, RPC `theme_autosave`, last-writer-wins on a monotonic `revision`), `commitVersion` (`:436`, RPC `theme_commit`, immutable snapshot), `publishVersion` (`:829`, gate → `theme_commit` → `snapshotCustomCode` → RPC `theme_publish` → `purgeStorefront`), `rollbackVersion` (`:956`, RPC `theme_rollback`), `scheduleTheme` / `cancelSchedule` (`:1004` / `:1055`). The editor calls them through `builderWorkspaceFn` / `builderAutosaveFn` / `builderCommitFn` / `builderPublishFn` / `builderRollbackFn` (`src/routes/_authenticated/dashboard/builder.tsx:289-296`).

**Version / rollback behaviour.** `theme_versions` rows are immutable snapshots (`templates`, `tokens`, `ast`, `checksum`, `status`, `rollback_of`); `store_themes.published_version_id` is the live pointer; `rollbackVersion` re-publishes a prior row as a **new** version (`:979`, `theme_rollback`) and restores the custom code that shipped with it (`:983-994`). The workspace loader prefers the newest **draft** over the newest committed version (`loadWorkspace`, `:219-269`), so a merchant's unpublished work is never lost by a publish or a rollback.

**The widget tray / inspector / canvas.** One registry, built once per route render: `buildEditorExtensionRegistry` (`src/lib/editor/editor-registry.ts:62-88`) → `buildTrayRegistry(installedPlugins)` + the approved dev-theme widget defs; the same instance feeds tray, inspector, canvas, preview, save and publish. The content editor mounts `PluginProvider` so the canvas resolves installed plugins (`src/routes/_authenticated/dashboard/content/editor.tsx:140`). The inspector is **schema-generated** (`validateProps` / `errorsForField` / `fieldsOf`, `src/lib/widget-props.ts`), and the client and the server call the **same** validator (`src/hooks/use-builder-editor.ts:141-195` vs `src/lib/themes.server.ts:453`).

**So, against the brief's Phase 2 list (§3 "Make every template editable in the actual CMS"):**

| brief item | status | evidence |
| --- | --- | --- |
| template manager inside the existing CMS/theme editor | **ALREADY SATISFIED** | `/dashboard/builder` + `BuilderTopBar.tsx:413` + `use-builder-editor.ts` |
| select any supported template | **ALREADY SATISFIED** (9 keys) | `TEMPLATE_KEYS` = index, product, collection, account, page, blog, cart, checkout, search |
| edit composition / insert widgets / reorder | **ALREADY SATISFIED** | `use-builder-editor.ts` `editSlot` / `insertNodes` / `moveRelative` |
| change schema-generated properties | **ALREADY SATISFIED** | `src/components/builder/SchemaControls.tsx` + `widget-props.ts` |
| preview desktop / tablet / mobile | **ALREADY SATISFIED** | `BREAKPOINTS` (`src/lib/builder-ast.ts:203`), the studio's device frames, `compileResponsiveCss` |
| save | **ALREADY SATISFIED** | `autosave` / `commitVersion` |
| publish | **ALREADY SATISFIED** | `publishVersion` |
| **the selected template is explicit in the editor UI** | **ALREADY SATISFIED** | the switcher names the active template and every template is a separate AST |
| **saving Search must not overwrite Cart** | **ALREADY SATISFIED** (structurally) | one AST per template key; proved by Task 6's isolation test |
| **editing Account must not change Page** | **ALREADY SATISFIED** (structurally) | same |
| **changing a shared widget presentation must not unexpectedly alter another theme** | **ALREADY SATISFIED** (registry keyed by theme) | `resolveThemePresentation(themeKey, type, …)` (`src/components/builder/SectionRenderer.tsx:800-804`) |
| **reset to a safe default** | **MISSING** | no reset affordance is exposed in the studio; `themes.server.ts` has no reset path |
| **recover when a saved template references a missing widget** | **PARTIAL** | `SectionRenderer` renders `null` for an unknown widget outside the editor (`:806-811`) and a labelled placeholder in the editor — a *silent* drop in production, not a recovery |
| **do not silently replace a missing template with the homepage** | **SATISFIED for the preview** (explicit unsupported panel, `src/components/store/ThemePreviewFrame.tsx:129-136`, `:577`, `:935-936`); **NOT SATISFIED for the storefront** — `resolveTemplate` falls back `suffix → slug → base → page → index` (`src/lib/builder-ast.ts:8254-8274`), so a storefront route whose template is absent renders the **homepage** | |
| **variants of a template are authorable** | **MISSING** | `parseTemplates` **persists** variant keys (`src/lib/builder-ast.ts:8129-8133`) and `resolveTemplate` **resolves** them, but the editor's switcher lists only `TEMPLATE_KEYS` and `EditorDoc.templates` is typed `Partial<Record<TemplateKey, …>>` — a variant is **unauthorable** |
| the same template is used by storefront route, editor preview and publish validation | **PARTIAL** | the same AST + the same `lintTemplate` are shared; the **contexts** are not (the preview grants its own slots) |

## A3. The persistence identity — how a template layout is keyed, and what a new key costs

**The chain.** `store_themes` (one row per merchant × theme, `is_active`, `published_version_id`) → `theme_versions` (immutable snapshot: `templates` **jsonb**, `tokens` jsonb, `ast` jsonb, `checksum`, `status`, `rollback_of`) → `theme_drafts` (autosave: `templates` **jsonb**, `tokens` jsonb, `revision`).

**The key.** The `templates` jsonb is a **map keyed by template key**: `{"index": {header:[…],main:[…],footer:[…]}, "product": {…}, …}`. `parseTemplates` (`src/lib/builder-ast.ts:8117-8136`) reads **only** the keys in `TEMPLATE_KEYS` and **silently drops everything else** — except keys that pass `isVariantTemplateKey` (`:8170-8182`, `<base>_<suffix>` with a known base and a `^[a-z0-9_]+$` suffix), which ride the same record so suffixed templates survive the round-trip. The template key is therefore the **only** identity: there is no per-template table, no per-template row, no per-template foreign key.

**What a new `archive` key requires in the database: nothing.** `templates` is `jsonb`; a new key is a new object in an existing map. **No migration, no schema change, no backfill, no DDL.** The consequences are all *code*:

- **Backward compatibility for persisted layouts.** Every merchant's existing `theme_versions.templates` map has no `archive` key. `templateOf(templates, "archive")` returns `EMPTY_AST` (`src/lib/builder-ast.ts:8138-8143`) — the empty AST, not a crash. `loadPublished` then borrows the **home template's** chrome for a missing secondary template (`src/lib/storefront.server.ts:138-144`), so an archive page on an old theme still shows the store's header/footer and an empty body rather than a broken page. The archive route must therefore **fall back explicitly** (the platform's grid, or an explicit "this theme does not design the archive" state) — never silently render the homepage.
- **Migration.** The two real migration surfaces are (a) **seed the default**: `installRegistryTheme` / `registryPackage` (`src/lib/themes.server.ts:1158-1193`, `:1242`) must seed the `archive` default for a theme that ships one, **without overwriting a merchant-edited template** (the seed is "fill only the keys the merchant's map does not have"), and (b) **theme updates**: `previewThemeUpdate` (`:1431`) / `applyThemeUpdate` (`:1476`) use `diffTemplates` (`:1353`) and `mergeTemplates` (`:1378`), which key off `TEMPLATE_KEYS` (`:1358`, `:1384`) and `isVariantTemplateKey` (`:618-619`) — both must learn the new key and the new variant shape, or a theme update silently drops the merchant's archive layout.
- **The `THEME_API_RANGE` contract — measured, not assumed.** `THEME_API_RANGE = "^3.0.0"` (`src/lib/theme-package.ts:52`) is **documentation only**: no code reads it. The **live** gate is `satisfiesApiRange(api)` (`src/lib/plugin-manifest.ts:463-484`) evaluated against `BUILDER_API_VERSION = "3.1.0"` (`src/lib/plugin-manifest.ts:32`), called at `src/lib/theme-package.ts:316` (`else if (!satisfiesApiRange(api)) errors.push("api_incompatible")`), plus `checkApiCompatibility` at install time (`src/lib/package-install.server.ts:316-331`). `^4.0.0` is **pinned as failing** by the existing suite — `src/lib/theme-package.test.ts:211-213` asserts `api_incompatible` for `api: "^4.0.0"` — so *"bump the range to `^4.0.0`"* is **not implementable as written**. The rule is therefore **additive**: **`THEME_API_RANGE` stays `^3.0.0`**; a package that declares `archive` in its `templates` must declare an `api` range whose **lower bound is ≥ 3.1.0** (the running API, which is where the archive key lands), and a package that declares `archive` while claiming a lower bound is **rejected with a stable reason code** — `templates.archive_requires_api`. The `templates` subset check (`:352-356`, against `TEMPLATE_SET` at `:172`) grows automatically with the union; the **new** per-template check is the one that has to be written, and it is the one breaking element of the archive key.

## A4. The publishing path — file:line

| step | where | what it does |
| --- | --- | --- |
| load the workspace | `src/lib/themes.server.ts:219-339` (`loadWorkspace`) | newest `theme_drafts` row wins over the newest `theme_versions` row; `parseTemplates` on both; per-key `lintTemplate` for every `TEMPLATE_KEYS` member (`:287-288`); returns `{templates, tokens, revision, versions, schedules, issues}` |
| structural gate | `src/lib/themes.server.ts:370-406` (`parseUntrusted`) | `assertPayloadWithinLimits` (size/nesting), the sanitiser reject counter, `parseTemplates`, `parseTokens`, the variation-key re-attach |
| autosave | `src/lib/themes.server.ts:409-433` | rate-limited, RPC `theme_autosave`, monotonic `revision`, last-writer-wins |
| commit a version | `src/lib/themes.server.ts:436-…` | rate-limited, extension props re-validated server-side (`:453-473`), RPC `theme_commit` → an immutable `theme_versions` row |
| resolve the publish payload | `src/lib/themes.server.ts:678-714` (`resolvePublishPayload`) + `:715-828` (`loadPublishArtifact`) | the **installed artifact is authoritative**: an omitted payload resolves only from the newest version row; a missing/malformed row fails closed with `builder.artifact_missing` |
| **publish** | `src/lib/themes.server.ts:829-954` | lint over **every** `TEMPLATE_KEYS` member (`:853-857`) → translation gate (`translationGate(translationCoverage(templates))`, `:860-862`) → font licence + budget (`:866-875`) → `composePublishGate` (`:881-888`, which also runs the no-plugin-territory trust gate over the templates) → **idempotent replay** (`:903-927`) → `commitVersion` → `snapshotCustomCode` → RPC `theme_publish` → `purgeStorefront("publish", …)` → `auditPublish` |
| rollback | `src/lib/themes.server.ts:956-1002` | merchant predicate **before** the RPC (`:967-978`), RPC `theme_rollback`, `restoreCustomCode`, `purgeStorefront("rollback", …)`, `theme.rolled_back` audit |
| schedule / cancel | `src/lib/themes.server.ts:1004-…` | merchant + theme + version predicates, RPC `theme_schedule_set` / `theme_schedule_clear` |
| the live pointer | `src/lib/themes.server.ts:1753-1866` (`publishedTheme`) | `store_themes.published_version_id` → `theme_versions` row with `status = "published"`; a dangling pointer serves the **last good** published pin (`lastGoodVersion`) and logs `theme.serve_fallback` — never a blank storefront |

**The publish gate is template-key-complete by construction**: it lints over `TEMPLATE_KEYS`, so a new key is linted automatically *once it is in the union*. The gate that must be taught the new key explicitly is the **theme-package** contract (A3).

## A5. The archive blast radius — every site, with the exact edit

Measured on this tree. "Site" = one insertion point in one file.

### A5.1 The exhaustive type surfaces (a new key is a **compile error** until each grows)

| # | file | site | edit |
| --- | --- | --- | --- |
| 1 | `src/lib/builder-ast.ts` | `TEMPLATE_KEYS` (`:46-59`) | add `"archive"` to the tuple |
| 2 | `src/lib/builder-ast.ts` | `TEMPLATE_ZONES: Record<TemplateKey, readonly Zone[]>` (`:156-189`) | add the `archive` row: `["header","main","footer", …OVERLAY_ZONES, "not_found"]` |
| 3 | `src/lib/builder-ast.ts` | `ROUTE_H1_TEMPLATES` (`:68-75`) | add `"archive"` — the archive route owns the `<h1>` (the resolved term's name) |
| 4 | `src/lib/builder-ast.ts` | the 41 catalogue `templates:` allowlists (`:1506` … `:4954`) | add `"archive"` to **exactly seven** rows — the ones an archive page may legitimately carry: `breadcrumb` (`:1506`, today `["product","collection","page","blog","search"]`), `category_header` (`:2696`, today `["collection","page","search"]` — **mandatory**: the archive body carries a `category_header`, and without `"archive"` in its allowlist `isContextMismatch` (`src/lib/builder-ast.ts:7935-7943`) turns it into a **publish-blocking** "needs data this template does not provide" error (`:8554-8560`) and the distinctness gate's `R3` fails), `pagination` (`:2798`, today `["collection","blog","search"]`), `empty_state` (`:2829`, today `["collection","page","search"]`), and the three blog-pack rows `blog_archive` (`:4838`), `blog_terms` (`:4890`), `blog_pager` (`:4913`), today `["blog","page"]`. **Rows that stay closed to `archive`:** `facet_sidebar` (`:2722`), `filter_chips` (`:2762`) and `result_toolbar` (`:2776`) are **product-search** listing rows (today `["collection","search"]`) — a content archive has no product facets, and the blog pack's `blog_terms` is its facet surface. **`product_grid` needs no change and carries no `templates:` row at all** — it is not a context widget (it takes the host's `productSlot`), so it renders on every template; that is also why the archive body must not use it (see Task 1 step 1.8). `free_shipping_bar` (`:2968`) is a cart/checkout row |
| 5 | `src/lib/builder-ast.ts` | the lint `required` table (`:8438-8462`) | add an `archive` rule if the archive must carry a slot (mirrors the `page` rule) |
| 6 | `src/components/builder/BuilderTopBar.tsx` | `TEMPLATE_META: Record<TemplateKey, …>` (`:6-76`) | add the `archive` entry (label, BN label, description, icon) |
| 7 | `src/routes/_authenticated/dashboard/builder.tsx` | `TEMPLATE_LABEL: Record<TemplateKey, …>` (`:205-214`) | add the `archive` entry |
| 8 | `src/lib/widget-weight.ts` | `TEMPLATE_JS_BUDGET: Record<TemplateKey, number>` (`:205-215`) | add the `archive` budget (a listing page — `widgetBudget(0.9)`) |
| 9 | `src/lib/theme-preview-nav.ts` | `GENERIC_TITLES: Record<TemplateKey, [string,string]>` (`:413-423`) | add the `archive` fallback title pair |
| 10 | `src/lib/themes/songoskriti/template-distinctness.ts` | `SONOSKRITI_TEMPLATE_EXPECTATIONS: Record<TemplateKey, TemplateExpectation>` (`:132-201`) | add the `archive` row (required types / required slots / forbidden types) |

**These ten are not optional.** Each is a `Record<TemplateKey, …>`, so `tsgo --noEmit` fails until every one grows — which is exactly the "use the compiler to find exhaustive maps" instruction in the brief's §2, and it is why the blast radius is knowable up front rather than discovered.

### A5.2 The hand-written duplicate the compiler cannot see

| # | file | site | edit |
| --- | --- | --- | --- |
| 11 | `src/lib/storefront.functions.ts` | the `z.enum([...])` in `getStoreChrome` (`:98-108`) — the nine template keys written out by hand | add `"archive"` |

This is the **only** compiler-invisible duplicate of the key union in the tree (measured: `grep -rn 'z.enum(\[' src` returns no other template-key enum — the other `z.enum`s are `kind`, `entityType`, `addressType`, `locale`, `channel`, `purpose`, `engine`, `scopes`). A key added to the editor but not here is **rejected at runtime** by the server-fn validator, so the archive route would 500. It is the single most dangerous site in the whole blast radius.

### A5.3 The contracts and tables

| # | file | site | edit |
| --- | --- | --- | --- |
| 12 | `src/lib/theme-package.ts` | `THEME_API_RANGE = "^3.0.0"` (`:52`) and the `api` range comment (`:142-145`) | **the value does not move** — `^4.0.0` is pinned as failing (`src/lib/theme-package.test.ts:211-213`) and `THEME_API_RANGE` is documentation-only (no code reads it). Update the comment to state the **additive** rule: `^3.0.0` stays, and a package that declares `archive` must declare a range whose lower bound is ≥ `BUILDER_API_VERSION` (`3.1.0`, `src/lib/plugin-manifest.ts:32`) |
| 13 | `src/lib/theme-package.ts` | `TEMPLATE_SET` (`:172`) + the non-empty-subset check (`:352-356`) | automatic once `TEMPLATE_KEYS` grows; the **new** work is a per-template check — a manifest whose `templates` contains `archive` and whose `api` range's lower bound is **< 3.1.0** is rejected with the stable reason code `templates.archive_requires_api`. The `api` field alone cannot carry it: `satisfiesApiRange("^3.0.0")` is `true` against the running `3.1.0`, so `^3.0.0` keeps working for every package that does **not** declare `archive` |
| 14 | `src/lib/builder-seo.ts` | `TEMPLATE_FALLBACK: Partial<Record<TemplateKey, string>>` (`:317-325`) | add `"archive": "Archive"` (the SEO title fallback) |
| 15 | `src/lib/builder-seo.server.ts` | the template-key validation (`:74`) and the query limit (`:124`) | automatic (loop over `TEMPLATE_KEYS`), but the **per-template SEO row** for `archive` must be writable — the row's key is a template key |
| 16 | `src/lib/template-seo.server.ts` | the known-key set (`:78-80`) and the query limit (`:78`) | automatic |
| 17 | `src/lib/translation-coverage.ts` | the per-template coverage loop (`:93`) | automatic; an archive body must reach the 90 % Bangla gate like every other template |

**One checked-and-untouched site.** `src/lib/template-seo.ts:36-45` holds `ROUTE_TEMPLATE: Record<string, TemplateKey>` — a route → template map that is **exported but never used anywhere in `src/`** (measured: the only hit for `ROUTE_TEMPLATE` is its own declaration) and that already lacks `blog` and `search`. It is therefore **dead code**, it is **not** on the archive's path, and **it stays untouched** — adding `archive: "archive"` to a map nobody reads would be a cosmetic edit to a prohibited file. If the owner wants the map completed, that is a separate, named cleanup; this plan does not need it.

### A5.4 The theme and the editor surfaces

| # | file | site | edit |
| --- | --- | --- | --- |
| 18 | `src/lib/themes/songoskriti/preview.ts` | the `main(template, s)` switch (`:90-380`) | add the `case "archive":` composition — Songoskriti's authored archive body |
| 19 | `src/lib/themes.server.ts` | the workspace lint loop (`:287`), the publish lint loop (`:853-857`), the merge/diff key filter (`:618-619`, `:1358`, `:1384`), the variation loop (`:1595`) | **not** automatic — three measured gaps. **(a) The seed:** the RPC `theme_install_preset` (`supabase/migrations/20260917200000_phase2d_theme_install_preset.sql`) **deletes the draft and inserts the preset verbatim** (`delete from public.theme_drafts …; insert … coalesce(_preset->'templates', …)`) — it does **not** merge per key, so the "fill only the keys the merchant's map does not have" rule cannot live in SQL; it must be implemented **in TypeScript inside `installRegistryTheme`** (`:1242-1299`), which merges the package's `archive` default into the merchant's map in memory and hands the merged map to the RPC. **(b) The merge/diff:** `diffTemplates` (`:1353`) and `mergeTemplates` (`:1378`) both loop over `TEMPLATE_KEYS` only (`:1358`, `:1384`), so **variant keys are silently dropped on a theme update** — both must be widened to the whole template map (`TemplateMap`, `src/lib/builder-ast.ts:8167`) and must carry the variants. **(c) The publish lint:** `publishVersion` lints `TEMPLATE_KEYS` only (`:853-857`), so a variant AST would **publish unlinted**; every variant must be linted **with its base key**, and the `applyThemeUpdate` lint (`:1494-1499`), which casts `Object.keys(templates) as TemplateKey[]`, must not treat a variant as a template — otherwise every context widget inside a variant becomes a publish-blocking "needs data this template does not provide" error (`src/lib/builder-ast.ts:8554-8560`) |
| 20 | `src/hooks/use-builder-editor.ts` | the per-key lint loop (`:632-641`) and the `EditorDoc` type (`:39`) | automatic for the lint; the **doc type** must widen to carry variant keys (see A5.7) |
| 21 | `src/components/store/ThemePreviewFrame.tsx` | `templates: Record<TemplateKey, ThemeAst>` (`:172`), `Partial<Record<TemplateKey, ThemeAst>>` (`:575`), the per-template slot map (`:575-…`), the unsupported panel (`:129-136`) | add the archive branch to the slot map and the preview's per-template context grants |
| 22 | `src/routes/theme-preview.$key.tsx` | the deep-link allow-list (driven by `theme-preview-nav.ts:332`) | automatic — `archive` is now a **known** key, so it travels in `template` (not `unsupportedTemplate`) and the preview host renders the theme's archive body; the **unknown-key** path keeps carrying `unsupportedTemplate`, now for a **still-unknown** key (Task 1 step 1.12) |

### A5.5 The `parseTemplates` unknown-key behaviour — the trap

`parseTemplates` (`src/lib/builder-ast.ts:8117-8136`) reads **only** `TEMPLATE_KEYS` and silently drops everything else; variant keys survive only if `isVariantTemplateKey` accepts them. **Consequence:** a key added to the editor but not to `TEMPLATE_KEYS` (or to the variant shape) **appears in the builder and vanishes from every page** — the merchant's work is silently discarded on save. This is why the union is the *first* edit and why Task 1 is a failing test on the union, not on the UI.

### A5.6 The route surfaces (new)

| # | file | site | edit |
| --- | --- | --- | --- |
| 23 | `src/routes/blog.category.$slug.tsx` | the render host (`:127`) | the render host becomes the shared `ArchiveView` (Task 2); the **loader does not resolve a theme** — the route carries **no store slug**, so it cannot (`getStoreChrome` needs one, `src/lib/storefront.functions.ts:94-111`), and the surface keeps the platform's grid |
| 24 | `src/routes/blog.tag.$slug.tsx` | the render host (`:113`) | same, with kind = `tag` |
| 25 | `src/routes/blog.author.$slug.tsx` | the render host (`:80`) | same, with kind = `author` — the author archive is not merchant-scoped at all (`src/lib/blog-reader.server.ts:378-384`) |
| 26 | `src/routes/store.$slug.account.tsx` | the loader (`:48-56`) and the dashboard (`:228-489`) | the account dashboard (Task 3) |
| 27 | `src/routes/store.$slug.checkout.tsx` | `ast={null}` (`:421`) and the render (`:412-433`) | the production checkout shell (Task 4) |
| 28 | `src/routes/store.$slug.blog.index.tsx` / `store.$slug.blog.$slug.tsx` | the loaders | the blog listing / article variant split (Task 5) |
| 29 | `src/lib/storefront-cache.ts` | `PERSONALIZED_SEGMENTS` (`:133-138`) | if the new account/checkout surfaces change the path classification, the cache headers must follow (account/checkout/order/track are `private, no-store`) |

### A5.7 The variant machinery (already present; the missing part is the *authoring* surface)

- `isVariantTemplateKey` (`src/lib/builder-ast.ts:8170-8182`) — a variant key is `<known base>_<suffix>` with a `^[a-z0-9_]+$` suffix. `blog_article`, `blog_listing`, `archive_category` are therefore **already valid persisted keys** the moment `archive` is in `TEMPLATE_KEYS`.
- `parseTemplates` (`:8129-8133`) — variant keys ride the same record. **Already works.**
- `resolveTemplate` (`:8254-8274`) + `resolveTemplateCandidates` (`:8219-8239`) — the fallback chain `suffix → slug → base → page → index`. **Already works.**
- **Missing:** (a) the *editor* cannot author a variant (the switcher lists only `TEMPLATE_KEYS`; `EditorDoc.templates` is `Partial<Record<TemplateKey, …>>`); (b) there is **no closed vocabulary** of legal variants, so `isVariantTemplateKey` accepts `blog_anything`; (c) **no route resolves a variant** — the blog routes render `ast={null}` and the archive routes do not exist. Task 5 closes (a) and (b) with a validated variant table; Tasks 2 and 5 close (c).

### A5.8 The existing test and `.e2e` pins the key also moves

These are **existing** files (prohibited by §7) and are **updated, never weakened**. Each is named in the Task-1 escalation record with its exact diff.

| # | file | site | edit |
| --- | --- | --- | --- |
| 30 | `src/lib/theme-preview-nav.test.ts` | the `FIRST_SECTION: Record<TemplateKey, string>` map (`:120-131`) and the two hard-coded nine-key arrays (`:134-144` Songoskriti, `:375-385` Somvabona) | add the `archive` opener; turn the two literals into `TEMPLATE_KEYS`-driven loops (which cover **more** templates than the old literals did) |
| 31 | `src/components/builder/songoskriti-port-freeze.test.tsx` | `TEMPLATE_MAIN` (the pinned compositions at `:74-131`) and the freeze loop (`:164-175`) | add the `archive` composition's ordered types **and** `"archive"` to the loop — the archive's ORDERED body must be frozen like the other nine |
| 32 | `src/lib/themes/songoskriti/template-distinctness.test.ts` | the "the table is total" assertion (`:541-543`) and the Somvabona un-authored count (`:630`) | the first is automatic (it compares against `TEMPLATE_KEYS`); the second's expected count grows by the new un-authored key |
| 33 | `src/components/store/BlogArchiveTheme.test.tsx` | the "themeless by design" pin (`:82-101`) | the blog host is no longer themeless-by-design — the pin becomes the **opposite** assertion; re-pinned in the **same commit** as the component change (Task 2 step 2.5) |
| 34 | `src/components/store/songoskriti-preview-compositions.test.tsx` | the **total** `Record<TemplateKey, ThemeAst>` map (`:102`) | add the `archive` entry — a total map is a compile error until it grows |
| 35 | `src/components/store/songoskriti-preview-page.test.tsx` | the **total** `Record<TemplateKey, ThemeAst>` map (`:85`) | same — a total map is a compile error until it grows |
| 36 | `src/components/store/ThemePreviewFrame.test.tsx` | the two **total** `Record<TemplateKey, ThemeAst>` maps (`:53` and `:347`) | both grow — a compile error until they do |
| 37 | `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` | every `?template=archive` pin (`:193-197`, `:227-231`, `:243-248`, `:268`, `:275`, `:288-289`, `:357-433`) and the known-key loop (`:392-402`) | **re-pointed**: `archive` becomes a *known* key, so the suite's "unknown key" subject must become a **still-unknown** key (e.g. `blog_anything`), `"archive"` is **added to the known-key loop**, and the "the assembled templates carry the nine keys" count (`:266`) becomes ten |
| 38 | `src/lib/themes/songoskriti/archive-contract.test.ts` | the ruling pins (`:111`, `:177-182`) | **re-pinned to the new ruling**: the suite stops pinning `"Archive contract (Decision D1, Option A)"` and `"No \`archive\` template key is added"` and pins the **new** record instead |
| 39 | `.e2e/real-frames.spec.ts` | the template loop (`:13`) | the archive surface joins the frame sweep — **an addition, never a removal** |
| 40 | `.e2e/songoskriti-port-parity.spec.ts` | the `TEMPLATES` list (`:41-51`) and the machine-baseline set | add `"archive"`; the **baselines are not rewritten here** — the re-freeze is the owner's action (Decision Gate G3) |

**Two files that leave this list.** `src/lib/definition-of-done.test.ts` and `src/lib/phase9-guardrails.test.ts` import `TEMPLATE_KEYS` (`:11` and `:18`) and **never use it** — measured: the identifier appears exactly once in each file, in the import. They therefore carry no total map, no key loop and no key literal, so the union change does not touch them, and they are **removed** from the escalation list (and from the count) rather than being escalated for an edit that is not needed.

### A5.9 The count

**36 files · 46 edit sites** for the `archive` key and its variants, enumerated above:

| group | files | sites |
| --- | --- | --- |
| A5.1 the exhaustive type surfaces | 6 | 10 |
| A5.2 the hand-written `z.enum` | 1 | 1 |
| A5.3 the contracts and tables | 5 | 6 |
| A5.4 the theme and the editor surfaces | 5 | 5 |
| A5.6 the route surfaces | 8 | 7 |
| A5.8 the existing test / `.e2e` pins | 11 | 17 |
| **total** | **36** | **46** |

The 41 catalogue allowlist rows count as **one** site in `src/lib/builder-ast.ts` (they are one contiguous table) and are called out separately in A5.1 because they are the most numerous — **seven** of the rows actually grow (A5.1 item 4, Task 1 step 1.7): `breadcrumb` (`:1506`), `category_header` (`:2696`), `pagination` (`:2798`), `empty_state` (`:2829`), `blog_archive` (`:4838`), `blog_terms` (`:4890`), `blog_pager` (`:4913`).

**The §7 status — corrected.** The first draft of this plan claimed *"of the 33 files: 24 are prohibited … 9 are allowed"*. **That was wrong in both directions, and the count is stated here the way it measures.** Only **two** of the blast radius's files are §7-allowed: `src/lib/themes/songoskriti/preview.ts` and `src/lib/themes/songoskriti/template-distinctness.ts` (both under `src/lib/themes/songoskriti/**`). The "9 allowed" figure wrongly counted **seven NEW files** — `src/lib/template-key-contract.test.ts`, `src/lib/archive-context.ts` + its test, `src/components/store/ArchiveView.tsx` + its test, `src/lib/template-variants.ts` + its test — **which are not among the blast radius at all** (a new file is allowed by §7 and needs no relaxation). Measured against the original 33-file list, the split is therefore **31 prohibited / 2 allowed**, not 24 / 9. Two of those 31 (`src/lib/definition-of-done.test.ts`, `src/lib/phase9-guardrails.test.ts`) import `TEMPLATE_KEYS` and never use it, so they need no edit and **leave** the escalation list; five further existing test files (A5.8 rows 34-38) **enter** it. **Of the 36 files, 34 are §7-prohibited and 2 are allowed.** `src/components/store/BlogArchiveTheme.tsx` is not in A5's tables — it is on the programme-wide list because **Task 5** changes it (Task 2 leaves the blog host alone), and it is counted in the Decision Gate G1 list below.

## A6. The account data model and routes — what the route really supplies, and what "supported destinations" really are

**The route.** `src/routes/store.$slug.account.tsx` — one route, `/store/$slug/account`, with `?tab=` (`validateSearch` at `:45-47`, `ACCOUNT_TABS` at `src/lib/account-tab.ts:8-14`).

**The tabs (the "supported destinations") — they are TABS on one route, not separate routes.** `orders`, `addresses`, `wishlist`, `profile`, `privacy` (`src/lib/account-tab.ts:8-14`). There is **no** `/account/orders`, `/account/profile`, `/account/addresses` or `/account/wishlist` route anywhere in the tree (`find src/routes -name '*account*'` returns only `src/routes/account.tsx` (the custom-host twin) and `src/routes/store.$slug.account.tsx`). A design that links to `/account/orders` would 404. The **only** real account-adjacent route that exists is `/store/$slug/order/$orderId` (the order detail, linked from the orders list at `:300-302`).

**The data the route owns.**

| thing | where | shape |
| --- | --- | --- |
| session | `src/routes/store.$slug.account.tsx:108-113` | `supabase.auth.getSession()` — the client session; `signedIn` gates everything |
| the overview | `accountOverviewFn` (`src/lib/accounts.functions.ts:34-42`) → `accountOverview` (`src/lib/accounts.server.ts:95-105`) → RPC `customer_overview` (a security-definer routine scoped to `auth.uid()`) | `AccountOverview` (`src/lib/accounts.server.ts:36-67`): `profile {id,name,email,phone}`, `addresses[]`, `wishlist[]`, `consents[]`, `orders[]`, `reviews[]` |
| the order rows | `orders[]`: `{id, order_number, status, total_minor_int, currency_code, created_at}` | mapped to widget rows by `mapOrdersToRows` (`src/components/store/account-slots.tsx:31-40`) |
| the profile row | `profile` → `mapProfileToRow` (`account-slots.tsx:42-52`) | `{id,title,subtitle,body}` |
| the theme context slots | `accountSlots` (`src/routes/store.$slug.account.tsx:185-219`) | `orders_list` and `profile_card` — **the only two account widgets that exist** (`src/lib/builder-ast.ts:4931-4960`; both `templates: ["account"]`, both `heading: false`) |
| the writes | `accountUpsertSelfFn`, `accountSaveAddressFn`, `accountDeleteAddressFn`, `accountToggleWishlistFn`, `accountSetConsentFn` (`src/lib/accounts.functions.ts:55-149`) | all `requireSupabaseAuth` + rate-limited + `storeBySlug` tenancy |

**What an intentional dashboard can honestly show, from permitted data only:** the shopper's name / email / phone (`profile`), their orders (number, date, status, total, currency), their saved addresses, their wishlist, and their consent switches. It **cannot** show: a spent-total, a loyalty tier, a recommendation, a "you might like" rail, an avatar upload, a live session list, or anything derived from another customer. The `reviews` array exists in the overview payload but has **no widget and no tab** — it is available, unused.

**The states the route already distinguishes** (and that the brief demands the theme must also distinguish): **unauthenticated** (`:221-223` → `<ShopperOrderLookup/>`, `:716-773` — an order-id lookup form, *not* a themed sign-in page), **loading** (`account.isPending`, `:272-275`), **failure** (`account.isError`, `:278-285`), **with orders** (`:289-325`), **no orders** (`:290-295` → `<Empty/>`). The **route's default body** is the `dashboard` fragment (`:228-489`) — a hand-written tab strip + panels — and it is passed to `ThemeChrome` as `fallback` (`:511`), so it renders **only when the theme publishes no `account` body**. The theme's authored body today is `heading` + `profile_card` + `orders_list` (`src/lib/themes/songoskriti/preview.ts:374-379`) — a heading and two widgets, with **no navigation at all**. That is the defect the brief calls the highest-priority visual repair.

**One stale comment, worth recording.** The route's loader comment says the published `account` template is *"Rejected by the storefront validator until the template-key track extends it — caught to null so the page renders the built-in dashboard regardless"* (`:49-52`). **That is false in the current tree**: `account` has been in `TEMPLATE_KEYS` since Phase 6 (`:50`) and `getStoreChrome`'s `z.enum` already lists it (`src/lib/storefront.functions.ts:107`). The `.catch(() => null)` is real, but it now only swallows a *genuine* loader failure. The comment must be corrected as part of Task 3, because it tells a reader the theme's account body is never used — the opposite of the truth.

## A7. The checkout production path — where the theme's AST is discarded, and what the route already owns

**The discard.** `src/routes/store.$slug.checkout.tsx:412-433`:

```
412  return (
413    <PluginLayer plugins={installedPlugins}>
414      <ThemeChrome
415        template="checkout"
...
419        // The checkout form is hand-built (server-quoted totals, live rails), so
420        // the theme contributes the tokens only. We drop the normal header and footer.
421        ast={null}
422        tokens={tokens}
```

The custom-host twin does the same at `src/routes/checkout.tsx:276` — but it keeps the header/footer: `ast={ast ? { header: ast.header, main: [], footer: ast.footer } : null}`.

**What the route already owns (and must keep owning):**

| concern | where | authority |
| --- | --- | --- |
| the cart lines and quantities | `useCart` (`src/lib/cart.tsx`) | the client cart, re-validated server-side by `quoteCart` |
| the totals | `quoteCart` (`src/lib/storefront.functions.ts:140-160`) → `priceCart` (`src/lib/pricing.server.ts`) | **server**; the route renders `quote.totals` (`:397`) |
| the offered rails | `quote.settings.methods` (`:401-404`) → `groupMethods` (`src/lib/payment-rails.ts:358-363`) | **server**; the route renders only what the server offered |
| the stock hold | `reserveCheckout` / `releaseCheckout` (`src/lib/storefront.functions.ts:203-260`) | **server**; `releaseCheckout` fails closed on an unknown store slug (`:246-255`) |
| the order write | `placeOrder` (`:162-201`) → `createOrder` (`src/lib/orders.server.ts`) with an idempotency key, a honeypot and a behaviour beacon | **server** |
| the customer fields | the validated `customer` schema in `placeOrder` (`:184-192`) | **server**; `name ≥ 2`, `phone ≥ 6`, `addressLine ≥ 4`, `city ≥ 2`, `email` optional |
| the charge hop | `startCharge` (`src/lib/payments.functions.ts`) | **server**; only the signed return marks the order paid |
| the order rescue | `savePendingOrder` / `loadPendingOrder` (`src/routes/store.$slug.checkout.tsx:92-150`) | the client only holds a token |

**Therefore the composition change is exactly this:** the route keeps the **form** and every value it binds to; the theme's `checkout` AST becomes the **shell** — the progress trail, the section order, the order-summary placement, the payment block's *presentation* — and it renders the **same platform-owned primitives** the route already owns, through the **same** `contextSlots` mechanism the cart route uses (`src/routes/store.$slug.cart.tsx:102-108`: `cart_lines`, `cart_summary`, `cart_drawer`, `checkout_steps`, `payment_methods`). `cart_lines`, `cart_summary`, `checkout_steps` and `payment_methods` all read the live cart through `CartContext`, which `ThemeChrome` opens for every storefront render — so **the theme's authored checkout body can already render real, live, server-quoted data**; what is missing is that the route throws the AST away and hand-builds the form. The brief's §9 constraints (no custom JS, no price setting, no bypassing validation, no popups over a payment step) are met by construction if the theme contributes **layout only** and the route's own form and totals stay where they are. `TEMPLATE_ZONES.checkout` already forbids `popup` (`:187` — only `header`, `main`, `footer`, `thank_you`), so the overlay rule is already enforced by the zone allowlist.

**The one thing the theme must never get:** the `<form>` that posts the customer fields and the "place order" action. The theme's authored `checkout` body has **no** such section today (`src/lib/themes/songoskriti/preview.ts:343-373` — `heading`, `checkout_steps`, `columns` → `payment_methods`, `payment_icons`, `cart_summary`), which is the right shape; the plan keeps it that way.

## A8. The blog routes, and whether the `blog` key can carry validated variants

**The routes.**

| route | file | template today | notes |
| --- | --- | --- | --- |
| `/blog` (platform index) | `src/routes/blog.index.tsx` | none | — |
| `/blog/$slug` (platform article) | `src/routes/blog.$slug.tsx` | none | — |
| `/blog/category/$slug` | `src/routes/blog.category.$slug.tsx` | none | `blogArchiveFn` → `loadTermArchive` (`src/lib/blog-index.server.ts:345-…`), kind `category` |
| `/blog/tag/$slug` | `src/routes/blog.tag.$slug.tsx` | none | `blogArchiveFn`, kind `tag` |
| `/blog/author/$slug` | `src/routes/blog.author.$slug.tsx` | none | `authorArchiveFn` → `loadAuthorArchive` (`src/lib/blog-reader.server.ts`) |
| `/store/$slug/blog` | `src/routes/store.$slug.blog.index.tsx` | none | `storeBlogIndexFn` → `loadStoreBlogIndex` (`src/lib/store-blog.server.ts:156`) |
| `/store/$slug/blog/$slug` | `src/routes/store.$slug.blog.$slug.tsx` | none | `storeBlogArticleFn` → `loadStoreArticle` (`:267`) |

**Every one of them renders `ast={null}`.** `BlogArchiveTheme` (`src/components/store/BlogArchiveTheme.tsx:29-33`) passes `template="blog" ast={null} tokens={null}` with the comment *"the render stays generic for every key by design — pinned in `BlogArchiveTheme.test.tsx`"*. **That is D5's "themeless by design" — and the corrected basis is not "themeless", it is "store-less".** These surfaces carry **no store slug**, so they cannot resolve a theme at all (A8's measured table below); that is a different fact from "the theme declines to design the blog", and it changes what the gate should require. The brief supersedes D5's *conclusion* — the blog listing and the article detail must be *distinguishable without ambiguity* — and Task 5 gives them the theme's `blog_listing` / `blog_article` compositions on the **merchant-scoped** routes. The `blog` approved exception's reason and basis are rewritten accordingly in Task 1 (step 1.13), and the `BlogArchiveTheme.test.tsx:82-101` pin is re-pinned in Task 5 (step 5.5), the task that changes that component.

**Can the `blog` key carry validated variants? Yes — and the machinery is already built and already persists them.**

- `isVariantTemplateKey` (`src/lib/builder-ast.ts:8170-8182`) accepts `blog_listing` / `blog_article` the moment `blog` is a known base.
- `parseTemplates` (`:8129-8133`) **persists** them in the same `templates` map — no schema change, no migration.
- `resolveTemplate(templates, "blog", { suffix: "article" })` (`:8254-8274`) resolves `blog_article` first, then `blog`, then `page`, then `index`.
- `templateSuffixFromOverride` (`:8203-8213`) already derives a suffix from a row's `template` override column (`"default"` / blank → no override).

**What is missing is (i) a closed, validated vocabulary of legal variants** — today `isVariantTemplateKey` accepts `blog_<anything-matching-the-regex>` — **(ii) an authoring surface** — the editor's switcher lists only `TEMPLATE_KEYS`, and `EditorDoc.templates` cannot hold a variant key — **and (iii) route resolution** — no route calls `resolveTemplate` for the blog. The **smallest compatible extension** is therefore: a `TEMPLATE_VARIANTS` table (`{ blog: ["listing", "article"], archive: ["category", "tag", "author"] }`) that (a) closes the vocabulary, (b) is what the editor's switcher renders as second-level entries, and (c) is what the routes resolve through. It reuses `parseTemplates` and `resolveTemplate` unchanged; it adds no table, no column and no new widget type.

**The archive's kinds are now precise.** The three content-archive routes that **exist** are `/blog/category/$slug`, `/blog/tag/$slug` and `/blog/author/$slug` — category, tag and author. The product collection (`/store/$slug/c/$collectionSlug`) already owns the `collection` template and must **not** be duplicated (the brief's §10). A product category is a **search facet**, not a route (`src/lib/storefront-search.ts` puts `category` in the search query); a brand resolves to a search query. So the `archive` key's **supported kinds are exactly `category`, `tag`, `author`** — the content archives — and anything else is an explicit not-found, never a "valid archive".

**And the three of them have no store subject — this decides how the archive is wired.** The theme's chrome is resolved per **store**: `getStoreChrome` takes a `slug` and a `template` (`src/lib/storefront.functions.ts:94-111`) and resolves it through `loadStoreChrome` → `loadPublished` on a merchant looked up **by slug** (`src/lib/storefront.server.ts:216-224`). The three platform archive routes carry **no slug**:

| route | what it knows | why it cannot name a theme |
| --- | --- | --- |
| `/blog/category/$slug`, `/blog/tag/$slug` | a **term** — `merchant_id`, `slug`, `name`, … (`src/lib/blog-index.server.ts:300-303`) | the term carries a `merchant_id`, **not** a slug, and term slugs are unique **per merchant, not globally** — `resolveTerm` (`src/lib/blog-index.server.ts:304-328`) deliberately picks the most-populated claimant across merchants, so the URL does not identify the store |
| `/blog/author/$slug` | an **author** — `blog_authors` rows carry `merchant_id` (`src/lib/blog-reader.server.ts:44-45`) but the lookup is by slug + `is_public` alone (`:378-384`), so it is **not merchant-scoped at all** | same: no store, no slug |

**Consequence, and it is a design constraint rather than an inconvenience:** a route that cannot name a store must not guess one. The platform taxonomy routes therefore **keep the platform grid** (`BlogArchiveTheme` with `ast={null}`), and the `archive` key's render path in this programme is the **editor** and the **theme preview host** — both of which are merchant-scoped by construction — until the platform grows a **merchant-scoped** taxonomy route (`/store/<slug>/blog/category/<slug>`) that carries a slug. Task 2 is written against exactly that rule; see Task 2 steps 2.4 and 2.6.

## A9. The custom-widget extension path, and the asset inventory

**Extension path (Level B / plugin widgets → the editor tray).**

1. **Server authorisation.** `pluginListFn` (`src/lib/plugins.functions.ts`) returns the **server-authorized installed plugins for this tenant**; the editor route queries it (`src/routes/_authenticated/dashboard/builder.tsx:295-303`) and the content editor does the same (`src/routes/_authenticated/dashboard/content/editor.tsx:75-81`).
2. **One registry.** `buildEditorExtensionRegistry({installedPlugins, themeKey, approvedDevManifest, isActive})` (`src/lib/editor/editor-registry.ts:62-88`) → `buildTrayRegistry(installed)` + `activeDevThemeWidgetDefs(...)` for the approved ACTIVE dev-theme release. **One instance per route render** feeds tray, inspector, canvas, preview, save and publish — the route never builds a second.
3. **Fail-closed.** A missing or malformed input yields `buildTrayRegistry([])` — *fewer* widgets, never foreign ones. A bad theme def is swallowed individually (`:80-82`) so one defect cannot break the tray.
4. **The canvas seam.** `PluginProvider` (`src/components/admin/editor/…`, mounted at `src/routes/_authenticated/dashboard/content/editor.tsx:140`) is what makes the canvas resolve installed plugins; without it the canvas degrades to *"This app is not installed"* while the inspector still shows full controls — a bug found live and closed.
5. **Theme-owned widgets** are registered through the same registry: Songoskriti's own `ornament-def.ts` (`theme:songoskriti/ornament`) is proven end-to-end by `.e2e/songoskriti-editor-journey.spec.ts` (tray → schema → save → reload → theme switch).
6. **Level B execution** is sandboxed behind an **authorizer with `granted: []`** and a **deny-all bridge host** (`denyAllDevThemeCalls`, `src/routes/_authenticated/dashboard/builder.tsx:283-286`; `denyEditorDevThemeCalls`, `src/lib/editor/editor-registry.ts:97-100`). A theme's JavaScript never runs on the host.

**Asset inventory for any new art.** `public/ph/songoskriti/` — **21 files** (15 `.jpg`, 5 `.png`, 1 `.svg`), governed by **one** manifest (`scripts/songoskriti-assets-manifest.mjs`, 21 entries) + **one** frozen expectation (`scripts/songoskriti-assets-expected.json`, 21 sha256 digests) + the tree, with the gate `scripts/songoskriti-assets-check.mjs` (wired as `bun run assets:songoskriti`, and a head of `gates:release`) and the generator `scripts/gen-songoskriti-assets.mjs --check`. The gate's rules include missing / orphan / byte-vs-name / name-vs-manifest format mismatch / size / density / total size / duplicate / unreferenced / invalid SVG / expectation drift / dangling reference / wrong URL form / cross-theme reference / retired-path-in-migration. **Consequence for this plan: adding any new art means adding it to the manifest AND the expectation AND the tree, or the gate goes red.** The plan therefore adds **no new art** — the account dashboard, the archive body and the checkout shell are composed from existing widgets, existing theme art and the theme's existing token set. (Should a future task need new art, the order is fixed: generator → manifest → expectation → tree, and the gate must be green before the commit.)

## A10. Somvabona — the fact, and what its removal would touch

**It is still an official theme.** `OFFICIAL_THEME_KEYS = ["songoskriti", "somvabona"]` in **two** files:
- `src/lib/themes/appearance.ts:71` — *"Framique-built themes. Exactly these two — no OceanBlue source exists."*
- `src/lib/themes/builtin-themes.ts:17` — *"this map is the ONLY place that names official themes for identity."*

Both are asserted by existing tests: `src/lib/themes/appearance.test.ts:308` and `src/lib/themes/builtin-themes.test.ts:10` both pin `["songoskriti", "somvabona"]`. `src/lib/widget-presentation.test.ts:960-965` pins `OFFICIAL_THEME_KEYS_DEFAULT` against `OFFICIAL_THEME_KEYS`.

**Is its removal part of the agreed branch scope? No.** The brief says *"Do not resurrect Somvabona-specific dependencies as part of this work"* — that is a prohibition on **re-adding** Somvabona, not a mandate to **remove** it. The prior ruling **D3** scoped the *programme* to Songoskriti ("Songoskriti only") — a scope of **work**, not a **removal**. `report.md` §5.1 records D3 as *"RULED 2026-10-21 — Songoskriti only"*, and the phase-2 plan's Decision Gate carries the same. Nothing in the branch's agreed scope removes the theme.

**What its removal *would* touch** (recorded so the plan invents no decision): `src/lib/themes/appearance.ts` + `src/lib/themes/builtin-themes.ts` (the two key lists) and their two pinning tests; `src/lib/themes/somvabona/**` (the theme's source module, its preview source, its widget renderers in `src/components/builder/somvabona.tsx`); the `somvabona` entry in `src/lib/themes/builtin-themes.ts`'s `ENTRIES` and `META`; the catalogue's Official section (`sectionCatalogue`, `src/lib/themes/appearance.ts:118-137`); the registry seed rows (`supabase/migrations/20260922025442_theme_registry_seed.sql` and `…/20260922090000_theme_registry_seed.sql`); the `theme_registry` / `store_themes` rows for Somvabona in every merchant; the distinctness gate's Somvabona fixture (`src/lib/themes/songoskriti/template-distinctness.test.ts:580-640`, which asserts the **machinery** rejects the generic body for a template Somvabona does not author — that test stays valid under either ruling); and the migration to retire the theme's rows. **This plan does none of that.** It records the fact, keeps Somvabona as an official theme, and — importantly — keeps the plan from creating a **new** Somvabona dependency: the archive and blog-variant work is authored for Songoskriti only, and Somvabona's surfaces continue to fall through to the engine's generic body (which the distinctness gate already handles).

## A11. The authenticated E2E — what exists, and whether it is runnable here

**The pieces.**

| piece | where | state on this box |
| --- | --- | --- |
| Playwright + browsers | `.e2e/playwright.config.ts`; `node_modules/.bin/playwright` | **installed** — `~/.cache/ms-playwright` holds `chromium-1194/1234/1243`, `chromium_headless_shell-*`, `firefox-1495`, `webkit-2215`, `ffmpeg-1011` |
| the harness | `.e2e/playwright.config.ts` — `testDir: "./"`, `testMatch: "*.spec.ts"`, chromium only, `globalSetup: "./global-setup.ts"`, a `webServer` that spawns `npx vite --port <port> --strictPort --host localhost` from the **repo root** | present; `E2E_NO_WEBSERVER=1` lets the caller own the server |
| the loopback backend | `docker-compose.e2e.yml` (project `e2e-supabase`, own network/volume) + `docs/15-e2e/loopback-auth-setup.md` §§1-3 | **the env file exists** (`/tmp/opencode/e2e-auth/.e2e.env`, 600, with `ANON_KEY`, `SERVICE_ROLE_KEY`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `KONG_*`) but **the stack is DOWN** — `docker ps` shows no `e2e-supabase` container, and the `socat` relay on `127.0.0.1:58000` is not answering (`curl` → `000`) |
| the credentials | `E2E_MERCHANT_EMAIL` / `E2E_MERCHANT_PASSWORD` (`merchantCreds()`, `.e2e/helpers-songoskriti.ts:31-36`) | **not set** in this shell, and **not present** in `/tmp/opencode/e2e-auth/.e2e.env` (that file carries the *backend* keys, not a merchant account) |
| the real-login helper | `loginThroughRealForm` (`.e2e/helpers-songoskriti.ts:52-…`) — drives the **real** `/auth` form, waits for a real GoTrue session in `localStorage`, and throws if the backend refuses | present, **no auth stubbing anywhere** |
| the theme activation helper | `ensureSongoskritiActive` / `setActiveTheme` / `activeThemeKey` (same file) — call the **real** themes server functions and verify `store_themes.isActive` | present, idempotent |
| the existing authenticated journey | `.e2e/songoskriti-editor-journey.spec.ts` — 13 steps: login → theme active → open the editor → tray row → insert → schema inspector → edit → save → reload → preview → theme switch → owner dress returns | present; it **skips** when the creds are absent (`:101`, `test.skip(…)` with the reason) — never fakes a session |
| the parity harness | `.e2e/songoskriti-port-parity.spec.ts` — 9 templates × 3 widths × 2 locales = 54 stills + 6 chrome stills, plus a **helper smoke** test that needs creds | present; **the capture path needs no auth** (it drives the public `/theme-preview/<key>` route); only the idempotency smoke test is cred-gated |

**So: is an authenticated editor flow runnable here? Yes — but it needs two things this box does not currently have.**

1. **The loopback stack must be brought up** — `docker compose -f docker-compose.e2e.yml --env-file /tmp/opencode/e2e-auth/.e2e.env up -d`, the migrations applied per `docs/15-e2e/loopback-auth-setup.md` §2, the `socat` relay started, the app booted with the `VITE_SUPABASE_URL=http://127.0.0.1:58000` override, and **a merchant user created through the real GoTrue admin API** with `email_confirm:true` (the file's `seed.sh` / `apply-all.sh` in that directory did exactly this on 2026-10-21 — the logs are there).
2. **The creds must be exported** — `E2E_MERCHANT_EMAIL` / `E2E_MERCHANT_PASSWORD` from the unsaved env, never committed.

**The honest answer to the brief's demand for "real authenticated editor flows": the flows are runnable *here*, and the plan must (a) bring the stack up as an explicit step, (b) export the creds from the unsaved env file, and (c) **never** treat a skipped authenticated test as a pass.** The prior record is explicit about this discipline: *"Absent creds ⇒ skip, never fake a session."* The plan keeps it: the authenticated suite is **run and reported**; if the stack cannot be brought up, the suite's skip is reported as a **skip with a stated reason**, never as a pass, and the task that depends on it is not marked done.

**One more, sharper limitation:** the parity harness's **mutating** path (the `ensureSongoskritiActive` helper, which installs and activates a theme) touches a real database. `report.md` §5.1 (D6) records the measurement that settled this: `.env.local` holds a **placeholder** (`https://dummy.supabase.co`) that resolves nowhere, while `.env`'s `SUPABASE_URL=https://framebase.qubickle.com` resolves to this host's own IP and routes to the **`framique-supabase-db` container — production**. **So the parity harness must never be run against the configured database.** It runs against the repo's own throwaway stack only. The plan states this as a hard constraint and never runs the harness without the loopback stack.

## A12. The remote CI — what is verifiable from this environment

**The pipeline** (`.circleci/config.yml`, `workflows.gates` at `:354-384`): `lint-typecheck` → `unit-contract` → `scan` → `build` → (`e2e-critical`, `e2e-security`, `e2e-levelb-production`, all `requires: build`) + `plugin-storefront-gate`; plus a nightly whole-tree SAST sweep on `main` and `frame30` (`:387-397`). CircleCI is the only CI system (the file's own header says so, and `AGENTS.md`'s CI section agrees).

**What is verifiable from this environment: nothing remote.**

- **No CircleCI credentials.** No `CIRCLECI_TOKEN`, no `CIRCLECI_CLI_TOKEN`, no `~/.circleci/cli-config.yml` (the directory does not exist). The CircleCI **API and CLI are therefore unusable** — a workflow cannot be triggered, and a run's status cannot be queried.
- **Network reaches circleci.com** (`curl -s -o /dev/null -w '%{http_code}' https://circleci.com/` → `200`), so the limitation is **authentication**, not connectivity.
- **Git push works** — the remote is `https://devrahmanbd:<token>@github.com/devrahmanbd/frame30.git`, and `origin/frame30` is already at `182c37b5`. A push **will** trigger the CircleCI pipeline (the repo is connected), but the **result is unobservable from this box**: without an API token there is no way to read the run's status, its job logs or its conclusion.

**Therefore the brief's DoD item 10 ("CI passes on the actual target branch commit") is, from this environment, a statement the plan must make as a *limitation with an exact wording*, not as a success claim.** The plan's last task states it verbatim, runs every gate **locally** that CI runs (and can: `bun run lint`, `bun run typecheck`, `bun run test`, `bun run test:contracts`, `bun run doc:gate`, `bun run build`, the asset gate, and the Playwright suites), records the local results with their exact commands, and states that the remote run is **unverifiable here** for the reason above. A CI-verification step is therefore written as "push and hand the run URL to the owner", not as "CI is green".

---

# Part II — The executable plan

## Global Constraints

*(The binding ones, copied from the port spec, the escalation record and the owner's standing instructions. Where a constraint is quoted, the quote is verbatim.)*

- **Port spec §7 boundary.** *"Editable: `src/lib/themes/songoskriti/**`; `src/components/builder/songoskriti.tsx` + `songoskriti-motion.ts` (theme-owned renderers — editable only if the port requires it, including as an activation carrier for (b)/(c) registrations); NEW test/fixture files; NEW `.e2e/` spec/helper files; `docs/**`; `scripts/**` (including the Songoskriti asset gate scripts `scripts/songoskriti-assets-{manifest,image,check}.mjs`, `scripts/songoskriti-assets-expected.json` and `scripts/gen-songoskriti-assets.mjs`); `examples/starter-plugin/**` + `examples/starter-theme/**` (guide-alignment only — explicitly exempt from the test freeze; never `examples/demo-theme/**`); and minimal wiring-only edits to `package.json` (`doc:gate` script + gate-chain entry) and `.circleci/config.yml` (the CI step for `doc:gate`). … Prohibited: engine/plumbing — `src/lib/unified-widget-registry.ts`, `src/lib/editor/**`, `src/lib/theme-presentations.ts`, `src/lib/builder-ast.ts`, `src/components/builder/widgets.tsx`, `heritage.tsx`, `theme-widgets.ts`, all `src/routes/**`, `EditorShell`/`StudioBuilder`, existing test files and their snapshots (`.snap`) under `src/`, existing `.e2e/**` files (specs and `playwright.config.ts`; new `.e2e` specs/helpers are additive-only, config edits escalate), and everything else under `src/`. **Escalation:** any required capability missing in core → stop, report, wait for a decision. Never edit silently."* — `docs/superpowers/specs/2026-10-18-songoskriti-unified-port-design.md:150-156`.
- **The owner's standing instruction on §7 relaxations.** The prior D4 ruling relaxed §7 *"for a narrow, owner-ruled list"* — the preview host, the two composition pins, the theme-owned `skins.test.ts` pin, the Phase-1 preview-page pin, the search route, `src/lib/theme-preview-nav.ts`, `src/routes/theme-preview.$key.tsx` and the platform's payment widget — and the escalation record states the rule that produced it: *"**Escalation:** any required capability missing in core → stop, report, wait for a decision. Never edit silently."* **This plan changes the size of that list, not the rule.** Every prohibited file it touches is enumerated by name in the Decision Gate below, with its exact edit, and nothing is edited before the owner rules. *A relaxation granted for one file is never a precedent for the next.*
- **No new npm dependency.** No package is added to `package.json`; no lockfile changes.
- **No test is weakened, deleted or skipped.** Existing suites and their `.snap` files are updated only to a **stronger** expectation, each update named in the Task-1 escalation record with its exact diff. No `it.skip`, no `test.skip`, no loosened `expect`, no deleted assertion. Where a new suite would need to skip for want of credentials, the skip is **reported as a skip**, never as a pass.
- **Explicit-path staging only.** Every commit uses `git add <exact paths>`; never `git add -A`, `git add .`, `git commit -a`.
- **Never commit the churn files.** `.artifacts/e2e/playwright-report/index.html`, `ops/routing/canary-weights.conf`, `ops/routing/upstream.conf` — leave them dirty, untouched, unstaged. **Never commit `.output-snapshots/`** (untracked; it is what makes a repo-wide `eslint .` stall).
- **`bun` is NOT on PATH in this environment.** Use `node_modules/.bin/<tool>` — `node_modules/.bin/vitest` (4.1.11), `node_modules/.bin/tsgo`, `node_modules/.bin/eslint`, `node_modules/.bin/prettier`, `node_modules/.bin/playwright` — and plain `node` for the `scripts/*.mjs` gates. CI uses `bun`; local verification does not. `scripts/contract-gate.mjs` hardcodes `spawnSync("bunx", …)` (`:302`) and therefore cannot be made to work locally — it is an **expected red with a stated reason**, not a regression.
- **The archive key's backward-compatibility requirement.** A persisted layout written before the `archive` key existed must keep working: the `templates` map is `jsonb` and keyed by template key, so **no migration and no DDL is required**; `templateOf(templates, "archive")` returns `EMPTY_AST` for an old map, `parseTemplates` drops nothing it did not already drop, and the archive route must fall back **explicitly** (the platform's grid or a named "this theme does not design the archive" state) — **never silently to the homepage** (`resolveTemplate`'s `→ index` tail, `src/lib/builder-ast.ts:8254-8274`, is the exact behaviour to avoid on this route; every resolution inspects the returned `match` and accepts **only** `"suffix"` / `"base"`). Theme installation and theme updates must **seed the missing default without overwriting a merchant-edited template** (`installRegistryTheme` `:1242`, `mergeTemplates` `:1378`) — and because the RPC `theme_install_preset` **replaces** the draft's map verbatim rather than merging per key, **that per-key merge is implemented in TypeScript inside `installRegistryTheme`**, not in SQL (no migration is edited). A theme update must also **carry the variants** (the merge and the diff loop over `TEMPLATE_KEYS` only, `src/lib/themes.server.ts:1358`, `:1384`), and the publish gate must **lint every variant with its base key** (`publishVersion` lints `TEMPLATE_KEYS` only, `:853-857`), so no variant AST ever reaches a merchant's storefront unlinted.
- **The platform keeps data, authorisation and payment authority.** The theme controls presentation, not access. Search execution, tenant scoping, result limits and authorisation stay in the platform; cart and checkout keep server-authoritative prices, discounts, stock, totals and state transitions; account data belongs to the currently authenticated customer and is read through the `auth.uid()`-scoped RPCs; archive, collection, blog and page queries respect publication status and permissions; preview data is synthetic and labelled; **no theme may access raw database connections, secrets, payment credentials or unrestricted authenticated APIs**. In particular the checkout change is a **composition** change: the route's form, its server quote, its validation and its payment rails stay exactly where they are.
- **Never edit an applied migration.** No file under `supabase/migrations/` is edited and no migration is created — **this plan needs no schema change** (the `templates` column is `jsonb`).
- **No deploy inside the plan.** The deploy is a separate, explicit step after the branch merges.
- **The parity harness never runs against the configured database.** `.env`'s `SUPABASE_URL` resolves to this host's own IP and routes to the **production** database container (`report.md` §5.1 D6). The harness runs only against the repo's own throwaway stack (`docker-compose.e2e.yml` + `docs/15-e2e/loopback-auth-setup.md`), and only on a disposable merchant.
- **The three churn files and `.output-snapshots/` must still be unstaged at every commit.** `git status --short` is checked before each commit.

## Review Focus

*The five failure modes most likely to bite, most likely first. Each names the test that pins it and the task that owns the code it protects.*

1. **The archive key is added to the editor but not to the parser, and every merchant's archive layout silently vanishes on save.** `parseTemplates` (`src/lib/builder-ast.ts:8117-8136`) reads **only** `TEMPLATE_KEYS`; a key the union does not know is dropped on the way to storage, with no error anywhere. The ten exhaustive `Record<TemplateKey, …>` maps make most of the blast radius a **compile error**, but the one place that matters most — the union itself — is a runtime behaviour, not a type. → **Pinned by Task 1**: a new contract suite asserts `parseTemplates({archive: ast}).archive` survives a parse→serialise→parse round trip **and** that `TEMPLATE_KEYS` contains `"archive"`, and the suite is written **before** the union changes so it fails first. The hand-written `z.enum` in `src/lib/storefront.functions.ts:98-108` is the second half of this failure — it rejects an unknown key at **runtime**, so the archive route would 500 while every type check passed; → **also pinned by Task 1**, by a suite that reads the enum's key list out of the source and compares it with `TEMPLATE_KEYS` (the same "read it as text" pattern `src/routes/store.$slug.search-composition.test.tsx` already uses).

2. **The production checkout loses its server authority.** The temptation is to let the theme's AST own the form, the totals or the place-order action, because the theme's `checkout` body already contains `payment_methods` and `cart_summary` and *looks* like a checkout. If the theme's body renders the customer fields, the form, or a total, the platform's authority is gone. → **Pinned by Task 4**: a contract suite asserts the checkout route still calls `quoteCart` / `reserveCheckout` / `placeOrder` (the server functions), that the customer fields are read from the route's **own** form and not from the theme AST, that the theme's AST contributes **no** input element and **no** form, and that `TEMPLATE_ZONES.checkout` still contains the archive zone is the overlay zone (which includes `popup`); `thank_you`/`password`/`coming_soon` stay excluded. The browser E2E in Task 7 then completes a real test-provider checkout with a tampered total **rejected**.

3. **The account dashboard shows data it is not allowed to show, or a link that 404s.** The temptation is to build a nav that links to `/account/orders`, `/account/profile`, `/account/addresses`, `/account/wishlist` — **none of which exist**; the real destinations are the `?tab=` values of the *same* route (`src/lib/account-tab.ts:8-14`). A second temptation is to render an overview figure (a spent total, a "3 unread" count) that the `customer_overview` RPC does not return. → **Pinned by Task 3**: a contract suite asserts (a) every account nav destination is a member of `ACCOUNT_TABS` and is rendered as `?tab=<value>` on `/store/$slug/account`, and (b) the dashboard's data comes **only** from the `AccountOverview` fields the route already supplies — asserted by reading the route's source as text and pinning the set of properties it reads from `overview`. The browser E2E in Task 7 then exercises the authenticated, unauthenticated, with-orders and no-orders states.

4. **The blog listing and the article detail become ambiguous again.** The `blog` key has one AST; the listing and the detail need different compositions. The risk is that a "variant" is introduced as an unvalidated string, so `blog_anything` becomes a legal key and a merchant's typo silently persists a template nothing routes to. → **Pinned by Task 5**: a contract suite asserts the variant vocabulary is **closed** (a variant key outside the table is rejected by the validator), that `blog` resolves to `blog_listing` on the listing route and to `blog_article` on the detail route, and that both fall back to the base `blog` template when the variant is absent — the `resolveTemplate` order, unchanged.

5. **The distinctness gate stops guarding, because a new key was added to the union but not to the gate's table.** `SONOSKRITI_TEMPLATE_EXPECTATIONS` is a `Record<TemplateKey, TemplateExpectation>` — the table is compile-total, so a new key is a compile error, and the gate's own suite pins the table against `TEMPLATE_KEYS` (`:541-543`). But a theme that authors an archive body which is really the engine's generic demo body would pass an **empty** expectation row, and the gate would go quiet on exactly the surface it was built for. → **Pinned by Task 1 and Task 7**: the archive row in the expectations table is non-empty (required types **and** required slots), and the gate's "the table is total" assertion is re-run against the grown `TEMPLATE_KEYS`. The gate's own "every template a theme does not author is rejected as generic" loop is re-run for the new key.

## Superseding decisions — **RULED**

*These two prior rulings are **superseded by the brief** and are recorded here as decided, not as open. The prior record is `report.md` §5.1 and the phase-2 plan's Decision Gate; the prior evidence is `docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md` §(l) (D1) and the phase-2 plan's D2.*

- **D1′ — the archive key is REAL. (Supersedes D1 "Option A — no new key".)** `archive` becomes a first-class template key in `TEMPLATE_KEYS`, with its own zone allowlist row, its own route-owned render context, its own editor entry, its own default composition and its own distinctness row. Its **supported kinds are the content archives that exist as routes today** — `category` (`/blog/category/$slug`), `tag` (`/blog/tag/$slug`) and `author` (`/blog/author/$slug`) — carried as **validated variants** of the key (`archive_category`, `archive_tag`, `archive_author`) through the platform's existing, already-persisting variant machinery. It is **not** a hardcoded alias for another template, it does **not** duplicate the `collection` template (the product collection keeps it), and an unsupported archive path stays an explicit not-found. **Why this supersedes D1:** D1 chose "no new key" to avoid the blast radius; the brief accepts that blast radius and asks for the real key. **What carries over from D1:** the *semantics* — the archive surface is the **content** archive (category/tag/author), never a product listing, and the product collection keeps the `collection` template. **Cost, stated plainly:** the blast radius in A5 (**36 files, 46 edit sites**) and the **theme-package** contract change (the additive rule of G2 — `THEME_API_RANGE` keeps its value; the per-template `templates.archive_requires_api` check is new); **31** of the original 33 are §7-prohibited — **not 24**, which is the number the first draft of this plan gave and got wrong (A5.9) — and need the owner's ruling (Decision Gate G1). The G1 list the owner is asked to rule on names **40 files** in total.

- **D2′ — the authored checkout composition becomes the PRODUCTION shell. (Supersedes D2 "production checkout stays platform-owned".)** The production checkout route stops discarding the theme's AST (`ast={null}`, `src/routes/store.$slug.checkout.tsx:421`) and instead renders the theme's `checkout` composition **around** the platform's own form, totals, validation and payment rails. The theme contributes **layout, order, labels and the presentation of the platform-owned primitives**; the route keeps the `<form>`, the customer fields, the server quote, the rails, the stock hold and the order write. **Why this supersedes D2:** the brief's §9 asks for exactly this, and the platform-owned primitives already exist as context widgets that read the live cart. **What carries over from D2:** *every* platform authority — no custom JavaScript on the privileged page, no price-setting, no payment-credential access, no bypassing validation, no overlay that could obstruct a payment step (already enforced by `TEMPLATE_ZONES.checkout`, which has the archive zone is the overlay zone (which includes `popup`); `thank_you`/`password`/`coming_soon` stay excluded), and the theme may not inject a form. **The residual risk is payment integrity**, which is why the checkout task is placed after the account task and before the blog task, and why it carries its own contract suite *and* its own browser E2E.

## Decision Gate

*Three decisions are still the owner's. **None of them blocks Task 1** (the archive key) or Task 3 (the account dashboard), both of which are executable under the readings below. Each names the evidence that settles it.*

**G1 — The §7 relaxation list for this programme.**
*Question:* the archive key, the production checkout shell, the blog variants and the editor's variant surface all require files that port spec §7 prohibits — **31** of the original 33 in the archive blast radius alone (not 24; A5.9 states the corrected count and why). Is §7 relaxed for this programme, and for exactly which files?
*Evidence that settles it:* §7's own escalation rule (*"any required capability missing in core → stop, report, wait for a decision. Never edit silently."*); the prior D4 ruling, which relaxed §7 for a named list and explicitly did **not** set a precedent (*"the Phase-1 exception was a one-off, not a precedent"*, master plan's Decision Gate); the measured blast radius (A5.9).
*What the plan proposes:* a **named list**, exactly as D4 was, and nothing outside it. The list is enumerated in A5 and repeated per task in each task's **Files:** block, each marked `escalation-required`. **The list names 40 files.** It is the plan's previous 35, **minus** `src/lib/definition-of-done.test.ts` and `src/lib/phase9-guardrails.test.ts` (both import `TEMPLATE_KEYS` and never use it, so the union change does not touch them — measured, A5.8), **plus** the seven existing test files the reviews surfaced: `src/components/store/songoskriti-preview-compositions.test.tsx` · `src/components/store/songoskriti-preview-page.test.tsx` · `src/components/store/ThemePreviewFrame.test.tsx` · `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` · `src/lib/themes/songoskriti/archive-contract.test.ts` · `src/lib/builder-phase2a.test.ts` · `src/lib/phase5-seo.test.ts`. **The last two were added on 2026-10-21, after the first implementation measured them:** neither names the key — one pins a COUNT (`expect(Object.keys(TEMPLATE_ZONES)).toHaveLength(9)`) and the other a LIST (`ROUTE_H1_TEMPLATES`) — so the union's growth broke both, and the batch had to escalate them beyond the list this table names. **The table now names every §7-prohibited file the batch touches**; the escalation record's §(f) rows 20 and 21 are the history of that correction.

| group | count | files |
| --- | --- | --- |
| engine / platform libs | 11 | `src/lib/builder-ast.ts` · `src/lib/storefront.functions.ts` · `src/lib/themes.server.ts` · `src/lib/theme-package.ts` · `src/lib/widget-weight.ts` · `src/lib/builder-seo.ts` · `src/lib/builder-seo.server.ts` · `src/lib/template-seo.server.ts` · `src/lib/translation-coverage.ts` · `src/lib/theme-preview-nav.ts` · `src/lib/storefront-cache.ts` |
| hooks / components | 4 | `src/hooks/use-builder-editor.ts` · `src/components/builder/BuilderTopBar.tsx` · `src/components/store/ThemePreviewFrame.tsx` · `src/components/store/BlogArchiveTheme.tsx` |
| routes | 12 | `src/routes/_authenticated/dashboard/builder.tsx` · `src/routes/store.$slug.account.tsx` · `src/routes/store.$slug.checkout.tsx` · `src/routes/store.$slug.blog.index.tsx` · `src/routes/store.$slug.blog.$slug.tsx` · `src/routes/blog.category.$slug.tsx` · `src/routes/blog.tag.$slug.tsx` · `src/routes/blog.author.$slug.tsx` · `src/routes/blog.index.tsx` · `src/routes/blog.$slug.tsx` · `src/routes/checkout.tsx` · `src/routes/theme-preview.$key.tsx` |
| existing test files | 11 | `src/lib/theme-preview-nav.test.ts` · `src/components/builder/songoskriti-port-freeze.test.tsx` · `src/lib/themes/songoskriti/template-distinctness.test.ts` · `src/components/store/BlogArchiveTheme.test.tsx` · `src/components/store/songoskriti-preview-compositions.test.tsx` · `src/components/store/songoskriti-preview-page.test.tsx` · `src/components/store/ThemePreviewFrame.test.tsx` · `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` · `src/lib/themes/songoskriti/archive-contract.test.ts` · `src/lib/builder-phase2a.test.ts` · `src/lib/phase5-seo.test.ts` |
| existing `.e2e` files | 2 | `.e2e/real-frames.spec.ts` · `.e2e/songoskriti-port-parity.spec.ts` |
| **total** | **40** | — |

*Four of the eleven libs are named **conditionally**:* `src/lib/builder-seo.server.ts`, `src/lib/template-seo.server.ts` and `src/lib/translation-coverage.ts` derive their behaviour from `TEMPLATE_KEYS` (A5.3 items 15-17), and `src/lib/storefront-cache.ts` needs a change only if a new personalised path appears (A5.6 item 29) — the archive surface is public and cacheable, so it does **not** (Task 2). Each of the four is on the list so that if it does change, the change is escalated and not silent. *One more file is named for the same reason under G2:* if the owner prefers a **version bump** instead of the additive rule, `src/lib/plugin-manifest.ts` and `src/lib/frame30-security-matrix.test.ts:531` **join** this list — the running API pin (`BUILDER_API_VERSION = "3.1.0"`, `src/lib/plugin-manifest.ts:32`) is asserted by that suite.
*Unlocks:* every task after Task 1.

**G2 — The `THEME_API_RANGE` contract and what it breaks for third-party theme authors.**
*Question, restated against the measured code:* `THEME_API_RANGE` is `^3.0.0` (`src/lib/theme-package.ts:52`), but it is **documentation only — no code reads it**. The **live** gate is `satisfiesApiRange(api)` (`src/lib/plugin-manifest.ts:463-484`) against `BUILDER_API_VERSION = "3.1.0"` (`src/lib/plugin-manifest.ts:32`), called at `src/lib/theme-package.ts:316`, plus `checkApiCompatibility` at install (`src/lib/package-install.server.ts:316-331`). **The plan's first draft asked the wrong question** — it asked whether to bump the *documentation constant* to `^4.0.0`, and `^4.0.0` is **pinned as failing** by the existing suite (`src/lib/theme-package.test.ts:211-213` expects `api_incompatible` for `api: "^4.0.0"`), so that option is **not implementable as written**. The real question is: **does the running API version move** (a builder-version bump that every plugin and theme is re-reviewed against), or does the archive key stay **additive** inside the existing `3.1.0` line?
*Evidence that settles it:* the manifest validation (`src/lib/theme-package.ts:352-356`) checks the declared `templates` against `TEMPLATE_SET`; `satisfiesApiRange` is the shared range semantics and is what both the manifest gate and the install gate use; the review pipeline is `src/lib/package-review.ts`; the pinned failure of `^4.0.0` is `src/lib/theme-package.test.ts:211-213`.
*What the plan assumes if the owner does not rule — the **additive** rule, stated precisely:* **`THEME_API_RANGE` stays `^3.0.0`**; the running API stays `3.1.0`; **a package that declares `archive` in its `templates` must declare an `api` range whose lower bound is ≥ 3.1.0**, and a package that declares `archive` while claiming a lower bound is **rejected with the stable reason code `templates.archive_requires_api`**. Every package that does **not** declare `archive` keeps working exactly as it does today — `satisfiesApiRange("^3.0.0")` is `true` against the running `3.1.0` (`src/lib/plugin-manifest.ts:463-484`: same major, `3.1.0 ≥ 3.0.0`), so no existing third-party package is invalidated by this plan.
*If the owner prefers a **version bump** instead:* then `src/lib/plugin-manifest.ts` (the `BUILDER_API_VERSION` pin) and `src/lib/frame30-security-matrix.test.ts:531` (which asserts `BUILDER_API_VERSION === "3.1.0"`) **join the G1 escalation list**, the pin moves to a new line, and every plugin and theme manifest is re-reviewed — a strictly larger change than the additive rule.
*The plan will not change the value of `THEME_API_RANGE` or of `BUILDER_API_VERSION` without the owner's ruling.*
*Unlocks:* Task 1 step 1.6.

**G3 — The parity re-freeze.**
*Question:* the archive key, the account dashboard, the production checkout shell and the blog variants all change the rendered output of surfaces that the frozen parity captures pin. The 60 frozen captures (`docs/superpowers/songoskriti-evidence/port/reference/` + `reference-manifest.json`) and their 60 machine baselines (`.e2e/songoskriti-port-parity.spec.ts-snapshots/`) become stale. Re-freezing rewrites all 60 manifest entries and needs the **throwaway stack** (never the configured database).
*Evidence that settles it:* the prior D6 measurement (`report.md` §5.1) — 60 passed / 1 skipped in freeze mode against the throwaway stack, 8.7 min, 66 of 118 baseline files materially changed; the rule from the prior record: *"a disposable store on a development database, never a production merchant."*
*What the plan assumes if the owner does not rule:* the re-freeze is an **owner action**, executed on the throwaway stack, recorded in the evidence file — **not** a task commit. The plan's own commits never write to `reference/` or to the snapshot directory; the plan only *reports* which captures are stale and by how much.
*Unlocks:* Task 7 (the visual-regression lane) and Task 8 (the self-critique re-capture).

---

## Tasks

*Ordered as the brief requires: the archive key first (it touches the model every later task depends on), then the account dashboard, then the production checkout shell, then the blog variants, then the editor / persistence / publishing integration, then the E2E + visual regression + distinctness extension, then the self-critique pass, then the docs, then the remote-CI statement.*

### Task 1 — The `archive` template key: the union, the exhaustive maps, the contract and the migration

**Files:**
- **Create (allowed):** `src/lib/template-key-contract.test.ts` — the new contract suite (union ↔ hand-written enum ↔ package contract ↔ editor labels ↔ SEO/weight tables ↔ the exact set of catalogue rows that carry `"archive"`).
- **Create (allowed):** `docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md` — the escalation record (Task 1 step 1.2 writes it, before any pinned output moves).
- **Modify (escalation-required):** `src/lib/builder-ast.ts` (the union, the zone table, the route-h1 list, the seven catalogue allowlist rows, the lint `required` table).
- **Modify (escalation-required):** `src/lib/storefront.functions.ts` (the hand-written `z.enum`).
- **Modify (escalation-required):** `src/lib/theme-package.ts` (the API range comment / the per-key `templates.archive_requires_api` check).
- **Modify (escalation-required):** `src/lib/widget-weight.ts` (`TEMPLATE_JS_BUDGET`).
- **Modify (escalation-required):** `src/lib/builder-seo.ts` (`TEMPLATE_FALLBACK`).
- **Modify (escalation-required):** `src/lib/theme-preview-nav.ts` (`GENERIC_TITLES`, **and** the D1 prose the archive key supersedes).
- **Modify (escalation-required):** `src/components/builder/BuilderTopBar.tsx` (`TEMPLATE_META`).
- **Modify (escalation-required):** `src/routes/_authenticated/dashboard/builder.tsx` (`TEMPLATE_LABEL`).
- **Modify (escalation-required):** `src/lib/themes.server.ts` (the **seed merge** in `installRegistryTheme`, the **widened** `mergeTemplates`/`diffTemplates`, and the **variant linting** in `publishVersion`/`applyThemeUpdate`).
- **Modify (escalation-required):** `src/components/store/ThemePreviewFrame.tsx` (the **false D1 copy** the archive key makes false, and the archive branch of the preview's per-template context grants).
- **Modify (escalation-required):** `src/components/store/songoskriti-preview-compositions.test.tsx` (the total `Record<TemplateKey, ThemeAst>` map gains its `archive` entry).
- **Modify (escalation-required):** `src/components/store/songoskriti-preview-page.test.tsx` (the total `Record<TemplateKey, ThemeAst>` map gains its `archive` entry).
- **Modify (escalation-required):** `src/components/store/ThemePreviewFrame.test.tsx` (its two total `Record<TemplateKey, ThemeAst>` maps gain their `archive` entries).
- **Modify (escalation-required):** `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` (re-pointed at a still-unknown key; `"archive"` joins its known-key loop).
- **Modify (escalation-required):** `src/lib/themes/songoskriti/archive-contract.test.ts` (re-pinned from the superseded D1 ruling to the new one).
- **Modify (allowed):** `src/lib/themes/songoskriti/template-distinctness.ts` (the expectations row, and the `blog` approved exception's new basis).
- **Modify (allowed):** `src/lib/themes/songoskriti/preview.ts` (the `case "archive":` composition).

**Interfaces:**
- Consumes: `TEMPLATE_KEYS` / `TemplateKey` (`src/lib/builder-ast.ts:46-60`) · `TEMPLATE_ZONES` (`:156-189`) · `ROUTE_H1_TEMPLATES` (`:68-75`) · `parseTemplates` (`:8117-8136`) · `templateOf` (`:8138-8143`) · `isVariantTemplateKey` (`:8170-8182`) · `isContextMismatch` (`:7935-7943`) · `lintTemplate` (`:8380-…`, its `required` table at `:8438-8462`) · `catalogEntry` / the 41 `templates:` rows · `TEMPLATE_META` (`src/components/builder/BuilderTopBar.tsx:6-76`) · `TEMPLATE_LABEL` (`src/routes/_authenticated/dashboard/builder.tsx:205-214`) · `TEMPLATE_JS_BUDGET` (`src/lib/widget-weight.ts:205-215`) · `TEMPLATE_FALLBACK` (`src/lib/builder-seo.ts:317-325`) · `GENERIC_TITLES` (`src/lib/theme-preview-nav.ts:413-423`) · `THEME_API_RANGE` / `TEMPLATE_SET` (`src/lib/theme-package.ts:52`, `:172`) · `BUILDER_API_VERSION` / `satisfiesApiRange` (`src/lib/plugin-manifest.ts:32`, `:463-484`) · `getStoreChrome`'s validator (`src/lib/storefront.functions.ts:98-108`) · `installRegistryTheme` / `mergeTemplates` / `diffTemplates` / `publishVersion` / `applyThemeUpdate` (`src/lib/themes.server.ts:1242-1299`, `:1353`, `:1378`, `:829-954`, `:1476-…`).
- Produces: `TEMPLATE_KEYS` gains `"archive"` · `TEMPLATE_ZONES.archive` · `ROUTE_H1_TEMPLATES` gains `"archive"` · `SONGOSKRITI_TEMPLATE_EXPECTATIONS.archive` (non-empty) · a theme-package rule that **admits** an `archive`-declaring package whose `api` range's lower bound is ≥ 3.1.0 and **rejects** one that does not, with the reason code `templates.archive_requires_api` · a seed that fills only the keys the merchant's map lacks · a merge that carries the archive **and** its variants · a publish gate that lints every variant with its base key.

- [ ] **1.1** Confirm the measured blast radius before touching anything, and that nothing in the tree already carries an `archive` key:
  ```
  cd /opt/frame28
  grep -n "export const TEMPLATE_KEYS" -A 14 src/lib/builder-ast.ts
  grep -c "templates: \[" src/lib/builder-ast.ts
  grep -n "z.enum(\[" -A 12 src/lib/storefront.functions.ts | sed -n '1,20p'
  grep -rn '"archive"' --include=*.ts --include=*.tsx src | grep -v "\.test\." | head -20
  grep -n "THEME_API_RANGE" src/lib/theme-package.ts
  ```
  Expected output: the nine-key tuple `index, product, collection, account, page, blog, cart, checkout, search`; the count `41`; the hand-written nine-key `z.enum` at `src/lib/storefront.functions.ts:98-108`; and `THEME_API_RANGE = "^3.0.0"` at `src/lib/theme-package.ts:52`. **The `"archive"` grep returns exactly two hits, and neither is a template key:** `src/lib/blog-taxonomy.ts:77` — the **reserved taxonomy slug** `"archive"` in the reader's reserved-word list — and `src/lib/studio/catalog.ts:1281` — the **keyword** `"archive"` in the `blog_archive` widget's search keywords. It does **not** return the preview's D1 copy, because that copy is **backticked** (`` `archive` ``) and not double-quoted, so the pattern misses it; the D1 prose is found by reading `src/components/store/ThemePreviewFrame.tsx:125-126` and `src/lib/theme-preview-nav.ts:282-300` directly, and it is corrected in step 1.13. **No `archive` template key exists anywhere.**

- [ ] **1.2** Write the escalation record **before** any pinned output moves (port spec §9). It must contain, in this order: (a) the finding — *"the brief supersedes D1: `archive` becomes a first-class template key; the measured blast radius is **36 files / 46 edit sites**, and **31** of the original 33 are §7-prohibited (**not 24** — the first draft of the plan counted seven NEW files as if they were among the 33; A5.9)*"; (b) the exact old → new diff for each prohibited file, quoted as unified-diff hunks; (c) the **backward-compatibility** statement — *"the `templates` column is `jsonb`; no migration and no DDL; a map written before the key existed resolves to `EMPTY_AST` for `archive`; the archive route therefore falls back **explicitly** and never to the homepage"*; (d) the **package-contract** statement — *"the live gate is `satisfiesApiRange` against `BUILDER_API_VERSION = 3.1.0`; `THEME_API_RANGE` stays `^3.0.0`; a package that declares `archive` must declare an `api` range whose lower bound is ≥ 3.1.0, and a package that declares `archive` while claiming a lower bound is rejected with the stable reason code `templates.archive_requires_api`; every package that does not declare `archive` keeps working unchanged"* (subject to G2); (e) the **parity impact** — *"the archive template is a new surface: it has no frozen capture today, so the parity impact of this task is zero; the captures that go stale are the account, checkout and blog ones, listed in Task 7"*; (f) the **boundary statement** — *"this record escalates exactly the files enumerated in the plan's Decision Gate G1, each with its exact diff; no file outside that list is edited"*.
  ```
  mkdir -p docs/superpowers/songoskriti-evidence/port
  git status --short
  ```
  Expected output: the three churn files (` M .artifacts/e2e/playwright-report/index.html`, ` M ops/routing/canary-weights.conf`, ` M ops/routing/upstream.conf`) and `?? .output-snapshots/` — and nothing else touched.

- [ ] **1.3** Write the **failing** contract suite first. It must assert: (a) `TEMPLATE_KEYS` contains `"archive"`; (b) `parseTemplates` **keeps** an `archive` entry through a parse→JSON→parse round trip; (c) the hand-written `z.enum` key list in `src/lib/storefront.functions.ts` equals `TEMPLATE_KEYS` (read as **text**, the pattern `src/routes/store.$slug.search-composition.test.tsx` already uses); (d) `TEMPLATE_ZONES` has an `archive` row that permits `header`/`main`/`footer` and **no** `popup`; (e) the editor's three label maps (`TEMPLATE_META`, `TEMPLATE_LABEL`, `GENERIC_TITLES`) each carry an `archive` entry; (f) `TEMPLATE_JS_BUDGET` and `TEMPLATE_FALLBACK` carry an `archive` entry; (g) `SONGOSKRITI_TEMPLATE_EXPECTATIONS` carries a **non-empty** `archive` row; (h) `isVariantTemplateKey("archive_category")` is true and `isVariantTemplateKey("archive_bogus!")` is false; **(i) the exact set of catalogue rows that carry `"archive"`** — the suite reads `src/lib/builder-ast.ts` **as text**, finds every catalogue entry whose `templates:` allowlist contains `"archive"`, and asserts that set is exactly `{breadcrumb, category_header, pagination, empty_state, blog_archive, blog_terms, blog_pager}` — so a **missing allowlist row fails the suite, not a merchant's publish** (the reason: `isContextMismatch`, `src/lib/builder-ast.ts:7935-7943`, turns an un-allowlisted widget into a **publish-blocking** error at `:8554-8560`, and the distinctness gate's `R3` fails on the same gap); **(j) the package contract** — a manifest that declares `templates: ["archive"]` while its `api` range's lower bound is **< 3.1.0** is rejected with the reason code `templates.archive_requires_api`, and the same manifest with a lower bound of **≥ 3.1.0** is accepted, while a manifest that declares no `archive` is unaffected.
  ```
  node_modules/.bin/vitest run src/lib/template-key-contract.test.ts
  ```
  Expected output: **FAIL** — e.g. `AssertionError: expected 'index,product,collection,account,page,blog,cart,checkout,search' to contain 'archive'` (Vitest 4.1.11 prints `expected '#{received}' to contain '#{expected}'` for a `toContain` on a string).

- [ ] **1.4** Add `"archive"` to the union and to the three structural tables:
  ```
  # src/lib/builder-ast.ts
  #   TEMPLATE_KEYS        — add "archive" after "search"
  #   ROUTE_H1_TEMPLATES   — add "archive"
  #   TEMPLATE_ZONES       — add: archive: ["header","main","footer", ...OVERLAY_ZONES, "not_found"]
  ```
  Expected outcome: `node_modules/.bin/vitest run src/lib/template-key-contract.test.ts` still fails on (c)–(g) and now **compiles** — the ten `Record<TemplateKey, …>` maps are what make the rest of the task mechanical.

- [ ] **1.5** Grow the ten exhaustive maps, one by one, and watch the compiler point at each:
  ```
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: a list of errors, each of the shape — *`Type 'Record<TemplateKey, { en: string; bn: string; desc: { en: string; bn: string; }; icon: string; }>' is missing the following properties from type 'Record<TemplateKey, …>': archive`* — naming `src/components/builder/BuilderTopBar.tsx`, `src/routes/_authenticated/dashboard/builder.tsx`, `src/lib/widget-weight.ts`, `src/lib/theme-preview-nav.ts` and `src/lib/themes/songoskriti/template-distinctness.ts`. **This is the compiler doing the blast-radius work the brief asks for.** Add each row, re-run, and the list shrinks to zero. Do **not** add `archive` to a `templates:` allowlist that has no business carrying it — the 41 rows are per-widget permissions, not a blanket.

  **Two more error shapes the compiler raises, which the plan must not miss.** (i) `src/lib/themes/songoskriti/preview.ts` — the `main(template, s)` switch (`:91-380`) has **no `default:`**, so once `archive` is a `TemplateKey` the switch no longer covers it, the arrow function's inferred return type becomes `Section[] | undefined`, and the assignment to `PreviewThemeSource["main"]` (`src/lib/theme-preview-nav.ts:398`, typed `Section[] | null`) fails with **`TS2322`**: *"'Section[] | undefined' is not assignable to type 'Section[] | null'"* — the error the theme's `case "archive":` composition (step 1.8) resolves. (ii) The **four total `Record<TemplateKey, ThemeAst>` maps** in the existing test files — `src/components/store/songoskriti-preview-compositions.test.tsx:102`, `src/components/store/songoskriti-preview-page.test.tsx:85`, `src/components/store/ThemePreviewFrame.test.tsx:53` and `:347` — each fails with the same "missing the following properties … archive" shape. **All five of these files are in Task 1's Files and in Task 1's commit** (the four test files are existing test files, so they are escalation-required; `preview.ts` is theme-owned and allowed).

- [ ] **1.6** Add the `archive` key to the hand-written `z.enum` **and** implement the package contract:
  ```
  # src/lib/storefront.functions.ts:98-108 — add "archive" to the z.enum key list
  # src/lib/theme-package.ts — keep THEME_API_RANGE at "^3.0.0"; add the per-template check:
  #   a manifest whose `templates` contains "archive" is rejected with the reason code
  #   `templates.archive_requires_api` unless its `api` range's lower bound is >= 3.1.0
  ```
  Expected outcome: `node_modules/.bin/vitest run src/lib/template-key-contract.test.ts` passes on (a), (c), (d), (e), (f), (h), (i) and (j). **The package-contract case (j) is decided by G2** — and the plan's first draft got G2 wrong, so the assumption is restated here against the measured code: `THEME_API_RANGE` is **documentation only** (no code reads it); the live gate is `satisfiesApiRange(api)` against `BUILDER_API_VERSION = "3.1.0"` (`src/lib/plugin-manifest.ts:32`, `:463-484`) at `src/lib/theme-package.ts:316`, plus `checkApiCompatibility` at install (`src/lib/package-install.server.ts:316-331`); and **`^4.0.0` is pinned as failing** by `src/lib/theme-package.test.ts:211-213`, so **no version bump is made**. **If the owner has not ruled, implement the additive rule**: `THEME_API_RANGE` stays `^3.0.0`, the running API stays `3.1.0`, and only a package that **declares `archive`** is held to the ≥ 3.1.0 lower bound (rejected with `templates.archive_requires_api`); every other package is unaffected — `satisfiesApiRange("^3.0.0")` is `true` against the running `3.1.0`. Record the assumption in the escalation record. **If the owner prefers a version bump instead**, `src/lib/plugin-manifest.ts` and `src/lib/frame30-security-matrix.test.ts:531` **join the G1 escalation list** (that suite pins `BUILDER_API_VERSION === "3.1.0"`).

- [ ] **1.7** **Risk 2 — the per-widget allowlist rows, grown in the SAME commit as the union.** A missing allowlist row is not a cosmetic gap: it is a **publish-blocking** error in a merchant's storefront the first time they place that widget on the archive (`isContextMismatch` → `src/lib/builder-ast.ts:8554-8560`) and a failure of the distinctness gate's `R3` — both **after** the union has already shipped. So the rows are grown **in this commit**, and the new `src/lib/template-key-contract.test.ts` asserts the **exact set** of catalogue rows that carry `"archive"` by reading `src/lib/builder-ast.ts` **as text** (case (i) of step 1.3) — so a missing row **fails the suite**, not a merchant's publish. Add the per-widget allowlist rows that an archive listing may legitimately carry, and **no others**. **The exact seven rows are:** `breadcrumb` (`:1506`), `category_header` (`:2696`), `pagination` (`:2798`), `empty_state` (`:2829`), `blog_archive` (`:4838`), `blog_terms` (`:4890`), `blog_pager` (`:4913`). Each addition is `templates: […, "archive"]` — the row's existing members are **not** removed, and **no** row that has no business on an archive page is touched. **`category_header` (`:2696`) is mandatory, not optional**: the archive body carries one (step 1.8), and without `"archive"` in its allowlist `isContextMismatch` (`src/lib/builder-ast.ts:7935-7943`) makes it a **publish-blocking** "needs data this template does not provide" error (`:8554-8560`) and the distinctness gate's `R3` fails. **Rows that stay closed to `archive`:** `facet_sidebar` (`:2722`), `filter_chips` (`:2762`) and `result_toolbar` (`:2776`) are **product-search** listing rows (today `["collection","search"]`) and a content archive has no product facets — the blog pack's `blog_terms` is its facet surface. **`product_grid` is not a context widget and carries no `templates:` row at all** (it takes the host's `productSlot`), and `free_shipping_bar` (`:2968`) is a cart/checkout row.
  ```
  grep -n 'templates: \["product", "collection", "page", "blog", "search"\]' src/lib/builder-ast.ts
  grep -n 'templates: \["collection", "page", "search"\]' src/lib/builder-ast.ts
  grep -n 'templates: \["collection", "blog", "search"\]' src/lib/builder-ast.ts
  grep -n 'templates: \["blog", "page"\]' src/lib/builder-ast.ts
  ```
  Expected output: `:1506` (`breadcrumb`); `:2696` (`category_header`) and `:2829` (`empty_state`); `:2798` (`pagination`); and `:4838`, `:4890`, `:4913` (the three blog-pack rows) — **seven** rows to grow, each by one element. **The greps above are the corrected ones:** the plan's first draft used `templates: ["collection", "search"]`, `templates: ["collection", "blog", "search"]` and `templates: ["blog", "page"]` and then claimed their output included `:1506` and `:2829` — it did **not**: the first pattern matches only the three product-search rows at `:2722`, `:2762`, `:2776`, and it matches neither `:1506` nor `:2829` nor `:2696`, because those rows carry `["product","collection","page","blog","search"]` and `["collection","page","search"]`. The expected output above is what the four greps actually print.
  ```
  grep -n 'templates: \["collection", "search"\]' src/lib/builder-ast.ts
  ```
  Expected output: `:2722`, `:2762`, `:2776` — **these three rows are deliberately left untouched**, and the grep is kept in the step so that a later edit which adds `archive` to them is caught.

- [ ] **1.8** Author Songoskriti's **archive composition** — a real, designed body, not a generic one:
  ```
  # src/lib/themes/songoskriti/preview.ts — add `case "archive":` to the main() switch
  ```
  **The body is exactly: `category_header` + the blog pack (`blog_terms` + `blog_archive` + `blog_pager`) + `pagination` + `empty_state`.** The `category_header` carries a **merchant-safe label** (the resolved term's name and description are **route context**, never the widget's own copy); the three blog-pack sections are the archive's own listing surface; `pagination` and `empty_state` are its paging and its empty state. It must carry **no** demo copy of a merchant's content, and it must **not** claim the `<h1>` — `archive` joins `ROUTE_H1_TEMPLATES` (`src/lib/builder-ast.ts:68-75`), so the route owns the heading, exactly as `page` does.
  **The body must NOT use `product_grid`.** `SongoskritiProductGrid` reads the host's `productSlot` **only on the search template** (`src/components/builder/songoskriti.tsx:914`: `const host = template === "search" ? productSlot : undefined;`) and on every other template falls through to the skeleton branch (`:945-953`) — eight `ProductCardSkeleton`s where `data.rows` is undefined. An archive has no product slot, so a `product_grid` there would render eight skeletons. This is also why `product_grid` is on the archive row's `forbiddenTypes`.
  **The distinctness row, which must agree with the allowlist growth of step 1.7** (`src/lib/themes/songoskriti/template-distinctness.ts`):
  ```
  archive: {
    requiredTypes: ["category_header", "blog_terms", "blog_archive", "blog_pager", "pagination", "empty_state"],
    requiredSlots: ["category_header", "blog_terms", "blog_archive", "blog_pager", "pagination", "empty_state"],
    forbiddenTypes: ["product_grid", "heading", "rich_text"],
  },
  ```
  Every `requiredSlots` entry is one of the **seven rows** that grow in step 1.7 (`category_header` `:2696`, `pagination` `:2798`, `empty_state` `:2829`, `blog_archive` `:4838`, `blog_terms` `:4890`, `blog_pager` `:4913`), which is exactly what `R3` requires — a required slot must be present, must be a context widget, and must have `"archive"` in its catalogue allowlist (`src/lib/themes/songoskriti/template-distinctness.ts:529-551`). **`heading` is forbidden** because `archive` is a route-h1 template (a second `<h1>` is a lint error) and **`rich_text` is forbidden** for the same reason the `search` row forbids it (`R4`, no demo copy that could impersonate the merchant's content).
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/template-distinctness.test.ts src/lib/themes/songoskriti/preview.test.ts
  ```
  Expected output: the distinctness suite's "the table is total" assertion (`:541-543`) now compares against the grown `TEMPLATE_KEYS` and **passes**; the archive row's `requiredTypes` are satisfied by the new body, and its `requiredSlots` are granted because step 1.7 grew their allowlists.

- [ ] **1.9** Teach the theme lifecycle the new key — the seed and the update paths must not drop a merchant's archive layout:
  ```
  grep -n "export async function installRegistryTheme" -A 60 src/lib/themes.server.ts
  grep -n "export function mergeTemplates" -A 30 src/lib/themes.server.ts
  grep -n "export function diffTemplates" -A 30 src/lib/themes.server.ts
  grep -n "TEMPLATE_KEYS.flatMap" -B 4 -A 8 src/lib/themes.server.ts
  grep -n "Object.keys(templates) as TemplateKey" -B 4 -A 8 src/lib/themes.server.ts
  ```
  Expected output: `installRegistryTheme` at `:1242`, `mergeTemplates` at `:1378`, `diffTemplates` at `:1353`, the publish lint loop at `:853-857` and the update lint at `:1494-1499`. **Three measured gaps to close, not one:**

  **(a) The seed is a whole-map replace, so the per-key merge must live in TypeScript.** The RPC `theme_install_preset` (`supabase/migrations/20260917200000_phase2d_theme_install_preset.sql`) does `delete from public.theme_drafts where theme_id = v_theme;` and then inserts `_preset->'templates'` **verbatim** — it does **not** merge per key, and no SQL change is permitted ("never edit an applied migration"). So `installRegistryTheme` (`:1242-1299`) must do the merge itself: read the merchant's current map, add the package's `archive` default **only for the keys the merchant's map does not have**, and hand the merged map to the RPC. The merge is therefore **implemented in TypeScript inside `installRegistryTheme`**, and the RPC's verbatim insert is what receives the merged result.

  **(b) Variants are dropped on a theme update.** `diffTemplates` (`:1353`) and `mergeTemplates` (`:1378`) both loop over `TEMPLATE_KEYS` **only** (`:1358`, `:1384`), so every variant key — `blog_listing`, `blog_article`, `archive_category` — is silently lost across an update. Both must be widened to the **whole template map** (`TemplateMap`, `src/lib/builder-ast.ts:8167`), which already carries variant keys, and must carry the variants through.

  **(c) The publish gate does not lint variants.** `publishVersion` lints `TEMPLATE_KEYS` only (`:853-857`), so a variant AST would reach a merchant's live storefront **unlinted**. Every variant must be linted **with its base key** — `archive_category` is linted as `archive`, `blog_article` as `blog` — so a context widget inside a variant is checked against the right template. The `applyThemeUpdate` lint (`:1494-1499`) casts `Object.keys(templates) as TemplateKey[]`, which would treat a variant as a template and make every context widget in it a publish-blocking "needs data this template does not provide" error (`src/lib/builder-ast.ts:8554-8560`); it must be changed to lint each variant **with its base key** too.

- [ ] **1.10** Prove the **backward compatibility** with a test, not with a claim: a `templates` map written **before** the key existed (nine keys, no `archive`) must round-trip through `parseTemplates` **unchanged** — i.e. the nine existing keys survive and nothing is added, removed or mutated; and `templateOf(map, "archive")` must be the `EMPTY_AST`.
  ```
  node_modules/.bin/vitest run src/lib/template-key-contract.test.ts
  ```
  Expected output: `Test Files  1 passed (1)` and `Tests  12 passed (12)` (the count is the suite's own; read it from the run, do not assume).

- [ ] **1.11** Run the neighbouring suites, then the type check and the linter:
  ```
  node_modules/.bin/vitest run src/lib/builder-phase2a.test.ts src/lib/builder-phase6.test.ts src/lib/definition-of-done.test.ts src/lib/phase9-guardrails.test.ts src/lib/account-template.test.ts src/lib/theme-package.test.ts src/lib/theme-preview-nav.test.ts src/lib/phase3-content.test.ts src/lib/themes/songoskriti/preview.test.ts src/lib/themes/songoskriti/blog-page-composition.test.ts src/lib/themes/songoskriti/template-distinctness.test.ts
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src/lib/builder-ast.ts src/lib/storefront.functions.ts src/lib/theme-package.ts src/lib/widget-weight.ts src/lib/builder-seo.ts src/lib/theme-preview-nav.ts src/lib/themes.server.ts src/components/builder/BuilderTopBar.tsx src/components/store/ThemePreviewFrame.tsx src/routes/_authenticated/dashboard/builder.tsx src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/template-distinctness.ts
  ```
  **The vitest filter is corrected.** The plan's first draft ended the filter with `src/lib/translation-coverage.ts` — that is a **source** file, not a suite: there is **no** `src/lib/translation-coverage.test.ts`, so the filter matched nothing and the run's `passWithNoTests: true` (`vitest.config.ts:14`) reported *"No test files found"* as a **pass** — a green that proved nothing. The replacement is `src/lib/phase3-content.test.ts`, which is the suite that actually exercises `translationCoverage` (it imports it). The theme's own suites — `src/lib/themes/songoskriti/preview.test.ts` and `src/lib/themes/songoskriti/blog-page-composition.test.ts` — **and** the distinctness suite are added to the same neighbourhood run, because step 1.8 changes the theme's bodies.
  Expected output: the vitest run ends with `Test Files  N passed (N)` and `Tests  M passed (M)` — **N ≥ 11**, not zero; `tsgo --noEmit` prints **nothing**; eslint prints **nothing** and exits 0. (The `theme-preview-nav.test.ts` run may show the `FIRST_SECTION` map failing — that is the **expected** consequence of a new key and is fixed in Task 5 step 5.2, which owns the variant surface; it is **not** skipped or weakened here, and Task 1's commit note says so.)

- [ ] **1.12** **Risk 1 — the unsupported-state suite must not collapse mid-Task 1.** `src/lib/themes/songoskriti/unsupported-template-state.test.tsx` pins `?template=archive` as **the unsupported key** in every one of its cases (`:193-197`, `:227-231`, `:243-248`, `:268`, `:275`, `:288-289`, `:357-433`) and counts the assembled templates (`:266`, `toHaveLength(9)`) — the literal key this work adds. The moment the union grows, that suite's premise is false, and if it is left alone it fails in a way that looks like a regression in the preview rather than a stale pin. **Three edits, one commit, with the union — never as a follow-up:**
  1. **Re-point the suite at a still-unknown key.** `blog_anything` is the right subject: it is key-shaped for the preview's own guard (`PREVIEW_TEMPLATE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/`, `src/lib/theme-preview-nav.ts:272`) and it is **not** one of the `TEMPLATE_KEYS`, so the preview's known-key test (`(TEMPLATE_KEYS as readonly string[]).includes(rawTemplate)`, `src/lib/theme-preview-nav.ts:332-334`) leaves it as an **unsupported request** and the panel renders for it — exactly the state the suite is about. (Note for the reader: `isVariantTemplateKey("blog_anything")` is in fact **true** — the helper is open-ended, which is precisely why Task 5 closes the vocabulary — but the preview's known-key test is `TEMPLATE_KEYS`, not `isVariantTemplateKey`, so the panel still renders.) Every `?template=archive` in the suite becomes `?template=blog_anything`, and the panel assertions now expect the panel to name `blog_anything`.
  2. **Add `"archive"` to the known-key loop** (`:392-402`) — the loop that asserts *"a template the theme authors is not canonicalised at all"* — so `archive` is now proven to keep its URL exactly, with no redirect; and the assembled-template count at `:266` becomes **ten**.
  3. **Re-pin `src/lib/themes/songoskriti/archive-contract.test.ts` to the new ruling** (`:111`, `:177-182`). The suite today reads the **Phase-2** record (`docs/superpowers/songoskriti-evidence/port/phase2-template-completeness-escalation.md`) and pins `"Archive contract (Decision D1, Option A)"` and `"No \`archive\` template key is added"`. Both are **superseded**. The suite must read the **new** record — `docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md`, written in step 1.2 — and pin the **new** ruling's phrases instead: that `archive` **is** a first-class key, that the three content-archive routes are its kinds, and that the platform reader surfaces keep the platform grid because they carry no store slug. The Phase-2 record is a **historical** document and is **not** rewritten.
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/unsupported-template-state.test.tsx src/lib/themes/songoskriti/archive-contract.test.ts
  ```
  Expected output: both suites pass, and the archive-contract suite's record assertions now point at the **new** record.

- [ ] **1.13** **The false user-facing D1 copy is fixed here, in Task 1 — not in Task 6.** From the moment the union gains `"archive"`, three pieces of merchant-facing prose are **false**, and a merchant reading them would be told the opposite of the truth:
  1. `src/components/store/ThemePreviewFrame.tsx:125-126` — `UNSUPPORTED_TEMPLATE_BODY` tells the merchant *"The archive surfaces are the blog listing and its category, tag and author archives, and they wear the blog template."* That was D1's world. The new copy states that `archive` **is** a template the theme may author, and that the platform reader surfaces keep the platform grid because they carry no store slug. (The `archive-contract.test.ts` suite reads this constant **straight out of the file**, so the copy cannot drift back without failing a test — which is why the copy and its test move in the same commit.)
  2. `src/lib/theme-preview-nav.ts:282-300` (the `unsupportedTemplate` doc comment — *"not one of the nine template keys"* and *"D1 (Option A)"*) and the `rawTemplate` binding comment at `:320` (which uses `?template=archive` as its worked example of a **dropped** key). Both are rewritten to describe the **current** ruling: the requested key is carried when the platform does not know it, `archive` is now known, and the example becomes a still-unknown key.
  3. `src/lib/themes/songoskriti/template-distinctness.ts:225-230` — the **`blog`** approved exception, whose reason and basis still say *"the storefront blog is themeless by design"* and cite *"Decision **D5**"*. **That basis is now wrong, and it is stated precisely:** the platform reader surfaces (`/blog`, `/blog/category/$slug`, `/blog/tag/$slug`, `/blog/author/$slug`) are **not** themeless by design — they are **store-less**: none of them carries a store slug, so none of them can resolve a theme (`getStoreChrome` needs a slug, `src/lib/storefront.functions.ts:94-111`; a term carries `merchant_id`, not a slug, and its slug is unique per merchant, not globally — `src/lib/blog-index.server.ts:304-328`; the author archive is not merchant-scoped at all — `src/lib/blog-reader.server.ts:378-384`). They therefore keep the platform grid, while the **content-archive** routes may be served by the **`archive`** template (Decision **D1′**). The exception's new `basis` cites **D1′** and the measured `file:line`s. **The distinctness gate's `blog` row changes with it** — the `blog` expectations row (`src/lib/themes/songoskriti/template-distinctness.ts:166-170`) keeps its required types and slots, which are already correct and already granted on `blog` (the three blog-pack rows keep `["blog","page","archive"]` after step 1.7), and the gate must still pass the `blog` body.
  ```
  grep -n "UNSUPPORTED_TEMPLATE_BODY" -A 2 src/components/store/ThemePreviewFrame.tsx
  grep -n "D1 (Option A)" src/lib/theme-preview-nav.ts src/components/store/ThemePreviewFrame.tsx
  grep -n "themeless by design" src/lib/themes/songoskriti/template-distinctness.ts
  ```
  Expected output: the three sites the step replaces; after the step, the first grep returns a copy that no longer says the archive surfaces wear the blog template, the second returns **nothing**, and the third returns **nothing** (the phrase is re-pointed at the *store-less* basis).

- [ ] **1.14** Commit with explicit paths:
  ```
  git add src/lib/builder-ast.ts src/lib/storefront.functions.ts src/lib/theme-package.ts src/lib/widget-weight.ts src/lib/builder-seo.ts src/lib/theme-preview-nav.ts src/lib/themes.server.ts src/components/builder/BuilderTopBar.tsx src/components/store/ThemePreviewFrame.tsx src/routes/_authenticated/dashboard/builder.tsx src/lib/themes/songoskriti/preview.ts src/lib/themes/songoskriti/template-distinctness.ts src/lib/template-key-contract.test.ts src/components/store/songoskriti-preview-compositions.test.tsx src/components/store/songoskriti-preview-page.test.tsx src/components/store/ThemePreviewFrame.test.tsx src/lib/themes/songoskriti/unsupported-template-state.test.tsx src/lib/themes/songoskriti/archive-contract.test.ts docs/superpowers/songoskriti-evidence/port/phase3-archive-key-escalation.md
  git commit -m "feat(templates): add the archive template key to the union, the contract and the editor"
  git status --short
  ```
  Expected output: a commit touching **19** files; `git status --short` still shows the three churn files and `?? .output-snapshots/`, all unstaged. **Every existing test file in that list changes in the same commit as the union** — the union, the allowlist rows, the re-pointed unsupported-state suite, the re-pinned archive contract and the corrected D1 copy are one atomic change, never a follow-up.

### Task 2 — The archive's route-owned context and the archive host

**Files:**
- **Create (allowed):** `src/lib/archive-context.ts` — the typed, validated archive render context (kind, term, title, description, breadcrumb, records, facets, sorting, pagination, state).
- **Create (allowed):** `src/lib/archive-context.test.ts` — its contract suite.
- **Create (allowed):** `src/components/store/ArchiveView.tsx` — the shared **archive** host: it renders the theme's `archive` composition when a theme has one, and the platform's grid when it does not.
- **Create (allowed):** `src/components/store/ArchiveView.test.tsx` — its suite.
- **Modify (escalation-required):** `src/routes/blog.category.$slug.tsx`, `src/routes/blog.tag.$slug.tsx`, `src/routes/blog.author.$slug.tsx` — the **render host** becomes `ArchiveView`; the loaders keep the platform's grid (see step 2.4 — these routes have **no store subject**, so they cannot resolve a theme).

**Two files that are deliberately NOT in this task.** `src/components/store/BlogArchiveTheme.tsx` stays the **blog** host — the archive host is the new `ArchiveView` — so it leaves Task 2's Files and commit, and the "themeless by design" pin it carries (`src/components/store/BlogArchiveTheme.test.tsx:82-101`) is **owned by Task 5**, the task that changes that component. `src/lib/storefront-cache.ts` also leaves: the archive surface is a platform path, and neither `PERSONALIZED_SEGMENTS` (`src/lib/storefront-cache.ts:133-138`) nor `isStorefrontPath` (`:99-119`) needs to change for it — an archive is public, cacheable content, exactly like the blog listing it already serves.

**Interfaces:**
- Consumes: `resolveTemplate` / `resolveTemplateCandidates` / `TemplateMatch` (`src/lib/builder-ast.ts:8254-8274`, `:8219-8239`) · `blogArchiveFn` / `authorArchiveFn` (`src/lib/blog-taxonomy.functions.ts:51-66`, `src/lib/blog-reader.functions.ts:51-67`) · `loadTermArchive` / `TermArchive` (`src/lib/blog-index.server.ts:345-…`, `:61-66`) · `BlogFeedProvider` / `BlogFeed` (`src/components/builder/blog.tsx`) · `ContextSlot` (`src/components/builder/SectionRenderer.tsx:78`, `:825-833`) · `ThemeChrome` (`src/components/store/ThemeChrome.tsx:306-…`) · `BlogArchiveTheme` (`src/components/store/BlogArchiveTheme.tsx:15-…`).
- Produces: `ArchiveContext` (a validated, typed object) · `ArchiveView` (the shared archive host, with the theme resolution rule) · the three platform taxonomy routes rendering the platform's grid through `ArchiveView`, byte-identically.

- [ ] **2.1** Write the failing contract suite for the archive context. It must assert: (a) the context's `kind` is one of `category | tag | author` — a **closed** vocabulary, and any other value is rejected; (b) an archive route that resolves **no** term yields an explicit `not-found` state and **never** an empty-but-200 archive (the brief's §10: *"Keep unsupported routes as explicit not-found or unsupported states"*); (c) the context carries only permitted fields (kind, term id/slug/name, description, breadcrumb trail, records, facets, paging, state) and **no** unpublished records, no other merchant's records and no PII; (d) the context is **derived from** the route's existing server function output, not re-queried.
  ```
  node_modules/.bin/vitest run src/lib/archive-context.test.ts
  ```
  Expected output: **FAIL** — `Error: Failed to load url ./archive-context` (the module does not exist yet).

- [ ] **2.2** Implement the context as a pure, typed module: `ARCHIVE_KINDS = ["category", "tag", "author"] as const`, an `ArchiveKind` type, a `parseArchiveKind` that returns `null` for anything else, and an `archiveContextFrom(input)` that maps a `TermArchive` / author archive into the permitted shape.
  ```
  node_modules/.bin/vitest run src/lib/archive-context.test.ts
  ```
  Expected output: `Test Files  1 passed (1)`.

- [ ] **2.3** Build `ArchiveView` — the shared **archive** host. It mounts `BlogFeedProvider` with the route's feed and renders **one** of two things: the theme's `archive` composition (through `ThemeChrome`), or the **platform's grid** — and the grid is **delegated**, not re-implemented: the fallback renders the existing `BlogArchiveTheme` (`src/components/store/BlogArchiveTheme.tsx:15-…`), which is the platform's grid host and stays exactly as it is today.
  **The theme resolution is a rule, not a call.** `resolveTemplate` **must not** be used bare: `resolveTemplateCandidates` falls back `base → page → index` (`src/lib/builder-ast.ts:8219-8239`), so an old theme with no `archive` would resolve to the **`page`** composition or the **homepage** composition — both forbidden. The rule `ArchiveView` implements:
  ```
  const resolved = templates ? resolveTemplate(templates, "archive") : null;   // the BASE key only
  const authored =
    resolved !== null && (resolved.match === "base" || resolved.match === "suffix");
  const ast = authored ? resolved.ast : null;                                 // otherwise: no archive body
  ```
  **The accepted set is exactly `"suffix"` and `"base"`.** `"page"`, `"index"` and `"empty"` — and every other match — mean *no archive body*, and the platform grid renders. **Task 2 passes no suffix, so only `"base"` can occur here**; `"suffix"` is in the accepted set because Task 5's variant-aware call passes `{ suffix: kind }` and must resolve `archive_category` the same way. **Task 2 uses the base `archive` key only** — the closed variant vocabulary does not exist until Task 5, and `isVariantTemplateKey` is open-ended (`archive_bogus` would be accepted, `src/lib/builder-ast.ts:8170-8182`), so a suffix must not be used before the table exists. The **unknown kind** case renders the **explicit unsupported panel** (`src/components/store/ThemePreviewFrame.tsx:129-136` is the pattern), never the homepage.
  ```
  node_modules/.bin/vitest run src/components/store/ArchiveView.test.tsx
  ```
  Expected output: `Test Files  1 passed (1)`, with a case asserting the platform grid renders when no `archive` body is authored, a case asserting the theme's composition renders when one is, and a case asserting that a theme whose only other template is `page` renders the **grid**, not the `page` composition.

- [ ] **2.4** **Risk 3 — the three routes have no store subject, so they keep the platform grid.** The plan's first draft told each of the three loaders to *"resolve the theme's chrome for the `archive` template"* — **that step is unimplementable and is removed**, because the theme is resolved per **store**: `getStoreChrome` needs a `slug` and a `template` (`src/lib/storefront.functions.ts:94-111` → `src/lib/storefront.server.ts:216-224`), and **none of these three routes has a slug**: a taxonomy term carries `merchant_id`, **not** a slug, and term slugs are unique **per merchant, not globally** — `resolveTerm` deliberately picks the most-populated claimant across merchants (`src/lib/blog-index.server.ts:304-328`) — and the author archive is **not merchant-scoped at all** (`src/lib/blog-reader.server.ts:378-384`). **A route that cannot name a store must not guess one.** What this step therefore does:
  1. The three routes' **render host** becomes `ArchiveView` (the archive's own host), and the render is **byte-identical** to today's `BlogArchiveTheme` output — because `ArchiveView`'s fallback **is** the platform grid. The routes' loaders are otherwise untouched.
  2. The routes' `notFound()` behaviour and their canonical / robots / JSON-LD helpers (`archiveHead`, `termArchivePath`, `src/lib/blog-taxonomy.ts:427-435`) are **not** touched.
  3. **The archive key's storefront render path in this programme is the editor and the theme preview host** — `/dashboard/builder` and `/theme-preview/<theme>?template=archive` — both of which are merchant-scoped by construction. The **merchant-scoped** storefront wiring is **deferred** to the route that carries a slug: a merchant-scoped taxonomy route (`/store/<slug>/blog/category/<slug>`), which does not exist today. **That deferral is a stated limitation, not an oversight**, and it is recorded as such in the evidence record (Task 9).
  ```
  grep -n "notFound()" src/routes/blog.category.\$slug.tsx src/routes/blog.tag.\$slug.tsx src/routes/blog.author.\$slug.tsx
  grep -n "archiveHead\|listingJsonLd\|breadcrumbJsonLd" src/routes/blog.category.\$slug.tsx
  grep -n "getStoreChrome" src/routes/blog.category.\$slug.tsx src/routes/blog.tag.\$slug.tsx src/routes/blog.author.\$slug.tsx
  ```
  Expected output: the three `notFound()` calls still present, the three SEO helpers still called, and the third grep returning **nothing** — the archive change must not move a canonical, must not move a robots rule, and must not invent a theme resolution the route cannot make.

- [ ] **2.5** Prove the **fallback** is honest: a merchant who has published no `archive` body gets the platform's grid, and a merchant whose `archive` body is published gets the theme's composition around the **same** records. A component test mounts `ArchiveView` twice — once with an authored `archive` body, once without — and asserts the **same** article slugs in the same order in both; and a third case asserts that the no-theme render is **byte-identical** to today's `BlogArchiveTheme` render (the fallback is delegated, so it is identical by construction — and the test pins that fact).
  ```
  node_modules/.bin/vitest run src/components/store/ArchiveView.test.tsx src/lib/archive-context.test.ts
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: both suites pass; `tsgo --noEmit` prints nothing.

- [ ] **2.6** Commit:
  ```
  git add src/lib/archive-context.ts src/lib/archive-context.test.ts src/components/store/ArchiveView.tsx src/components/store/ArchiveView.test.tsx src/routes/blog.category.\$slug.tsx src/routes/blog.tag.\$slug.tsx src/routes/blog.author.\$slug.tsx
  git commit -m "feat(storefront): the archive's route-owned context and its host; the platform taxonomy surfaces keep the grid"
  git status --short
  ```
  Expected output: a commit touching **7** files; the churn files remain unstaged. **Nothing else is in this commit** — in particular not `src/components/store/BlogArchiveTheme.tsx` (the blog host, unchanged here) and not `src/lib/storefront-cache.ts` (the archive path needs no cache change).

### Task 3 — The Account dashboard (the highest-priority visual repair)

**Files:**
- **Create (allowed):** `src/components/store/AccountDashboard.tsx` — the designed dashboard (header, intentional nav, overview, profile, order rows).
- **Create (allowed):** `src/components/store/AccountDashboard.test.tsx` — its suite.
- **Create (allowed):** `src/components/store/account-dashboard.contract.test.ts` — the contract suite (no invented routes, no invented data).
- **Modify (escalation-required):** `src/routes/store.$slug.account.tsx` (the dashboard becomes the route's body; the theme's account AST is composed around it; the stale loader comment is corrected).
- **Modify (allowed):** `src/lib/themes/songoskriti/preview.ts` (the `account` composition grows the new sections).
- **Modify (escalation-required):** `src/lib/builder-ast.ts` (if new account widgets are needed — the catalogue rows for `orders_list` / `profile_card` at `:4931-4960` and any new rows).

**Interfaces:**
- Consumes: `ACCOUNT_TABS` / `initialAccountTab` / `isAccountTab` (`src/lib/account-tab.ts:8-27`) · `accountOverviewFn` / `accountOrderFn` (`src/lib/accounts.functions.ts:34-53`) · `AccountOverview` (`src/lib/accounts.server.ts:36-67`) · `mapOrdersToRows` / `mapProfileToRow` / `accountSlotCtx` (`src/components/store/account-slots.tsx:31-…`) · `OrdersList` / `ProfileCard` (`src/components/builder/account.tsx`) · `getStoreChrome` · `ContextSlot` · `useLang` (`src/lib/i18n.ts`).
- Produces: `AccountDashboard` (a designed, responsive, six-breakpoint dashboard) · the account route's body · the account context slots (`orders_list`, `profile_card`, and the new overview/nav slots).

- [ ] **3.1** Write the failing contract suite. It must assert: (a) **every** navigation destination the dashboard renders is a member of `ACCOUNT_TABS` and is a `?tab=` value on `/store/$slug/account` — the suite reads the route's source as text and pins the set of tab values it finds against `ACCOUNT_TABS`; (b) the dashboard reads **only** from the `AccountOverview` fields the RPC returns — the suite pins the property names it finds in the dashboard source against `["profile","addresses","wishlist","consents","orders","reviews"]`; (c) the dashboard contains **no** link to a path that does not exist (the suite lists the `to=`/`href=` values it finds and asserts each is one of `/store/$slug/account`, `/store/$slug/order/$orderId`, `/store/$slug/p/$productSlug`, `/store/$slug`); (d) the six states the brief names — authenticated, unauthenticated, loading, failure, with-orders, no-orders — are each reachable and distinct.
  ```
  node_modules/.bin/vitest run src/components/store/account-dashboard.contract.test.ts
  ```
  Expected output: **FAIL** — `Error: Failed to load url ./AccountDashboard`.

- [ ] **3.2** Implement `AccountDashboard` as a **designed** surface, not a stack of the existing panels: a header (the shopper's name and a one-line status), an **intentional** nav (five tabs, each with its own icon, label and selected state — a real tablist with `role="tab"`/`aria-selected`, keyboard-reachable), an **overview** strip built only from permitted data (order count, the most recent order's number and status, the default address's city, the wishlist count — every one of them a count or a fact the RPC returns), the **composed profile** (the `profile_card` slot, plus the profile's contact fields where the merchant's own composition asks for them), and **structured order rows** (order number, date, status badge and total — the four fields `mapOrdersToRows` already produces, laid out as rows rather than a plain list).
  ```
  node_modules/.bin/vitest run src/components/store/AccountDashboard.test.tsx
  ```
  Expected output: **FAIL** until the component exists, then `Test Files  1 passed (1)`.

- [ ] **3.3** Make it **responsive at 1440 / 1280 / 768 / 430 / 390 / 375**. The suite asserts the layout's structure at each width through the container's class contract (the repo's own convention — `src/components/store/StoreHeader.test.tsx` and `src/lib/responsive.ts` / `src/lib/responsive.ts`'s `spanClass` helper) rather than through pixel measurement, and a Playwright assertion in Task 7 measures the real thing.
  ```
  grep -n "export function spanClass" -A 20 src/lib/responsive.ts
  ```
  Expected output: the helper's signature; the dashboard's class contract uses it so the breakpoints are the platform's, not hand-rolled.

- [ ] **3.4** Wire the route: the dashboard becomes the route's **body** (replacing the inline `dashboard` fragment at `src/routes/store.$slug.account.tsx:228-489`), the theme's `account` AST is composed **around** it through `ThemeChrome` (the theme owns the frame; the route owns the data), and the **six states** are wired: unauthenticated (`:221-223` → the order-lookup page, which is *not* a themed sign-in page — the brief asks for a sign-in state, and the lookup page **is** the platform's unauthenticated state, so the dashboard's unauthenticated branch renders the same honest thing), loading, failure, with-orders, no-orders. **Correct the stale loader comment** at `:49-52` — `account` has been in `TEMPLATE_KEYS` since Phase 6 and `getStoreChrome` accepts it.
  ```
  grep -n "Rejected by the storefront validator" src/routes/store.\$slug.account.tsx
  ```
  Expected output: the stale comment, which this step replaces with the measured truth.

- [ ] **3.5** Grow Songoskriti's `account` composition to match the new dashboard (the `case "account":` branch at `src/lib/themes/songoskriti/preview.ts:374-379`): the heading, the profile card, the orders list — and the new overview/nav sections the dashboard's structure needs. The body must carry **no** heading-bearing section on the `account` template (it is a route-h1 template, `ROUTE_H1_TEMPLATES`), so no second `<h1>` appears.
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/template-distinctness.test.ts src/lib/themes/songoskriti/preview.test.ts
  ```
  Expected output: both suites pass; the `account` row's `requiredTypes` / `requiredSlots` are satisfied.

- [ ] **3.6** Run the neighbouring suites and the static gates:
  ```
  node_modules/.bin/vitest run src/components/store/account-slots.test.ts src/components/builder/account-widgets.test.tsx src/lib/account-template.test.ts src/lib/account-tab.test.ts src/components/store/songoskriti-preview-compositions.test.tsx
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src/components/store/AccountDashboard.tsx src/routes/store.\$slug.account.tsx src/lib/themes/songoskriti/preview.ts
  ```
  Expected output: every suite passes; `tsgo` and `eslint` print nothing.

- [ ] **3.7** Commit:
  ```
  git add src/components/store/AccountDashboard.tsx src/components/store/AccountDashboard.test.tsx src/components/store/account-dashboard.contract.test.ts src/routes/store.\$slug.account.tsx src/lib/themes/songoskriti/preview.ts
  git commit -m "feat(storefront): a designed account dashboard — nav, overview, profile, structured order rows"
  git status --short
  ```
  Expected output: a commit touching **5** files; the churn files remain unstaged.

### Task 4 — The production checkout shell (theme-composed, platform-authoritative)

**Files:**
- **Create (allowed):** `src/lib/checkout-shell.contract.test.ts` — the authority contract suite.
- **Modify (escalation-required):** `src/routes/store.$slug.checkout.tsx` (the theme's AST becomes the shell; the route keeps the form and the totals).
- **Modify (escalation-required):** `src/routes/checkout.tsx` (the custom-host twin).
- **Modify (allowed):** `src/lib/themes/songoskriti/preview.ts` (if the checkout body needs the presentation sections the shell uses).

**Interfaces:**
- Consumes: `quoteCart` / `reserveCheckout` / `releaseCheckout` / `placeOrder` (`src/lib/storefront.functions.ts:140-260`) · `getStoreChrome` · `useCart` (`src/lib/cart.tsx`) · `groupMethods` / `methodLabel` (`src/lib/payment-rails.ts`) · `ThemeChrome` + `contextSlots` (`src/components/store/ThemeChrome.tsx:306-…`) · the cart route's slot map (`src/routes/store.$slug.cart.tsx:102-108`) · the four context widgets' catalogue rows — `cart_lines` (`:2853`), `cart_summary` (`:1608`), `checkout_steps` (`:2902`), `payment_methods` (`:2926`).
- Produces: the production checkout rendering the theme's `checkout` composition **around** the platform's form and totals.

- [ ] **4.1** Write the failing authority contract. It must assert: (a) the checkout route still calls `quoteCart`, `reserveCheckout`, `releaseCheckout` and `placeOrder` (the four server functions) and that **no** total, method list or customer field is read from the theme AST; (b) the theme's `checkout` AST contributes **no** `<form>`, **no** `<input>`, **no** `<button type="submit">` and no payment credential field — the suite reads the route's source as text and asserts the theme AST is only ever passed to `ThemeChrome`; (c) `TEMPLATE_ZONES.checkout` still contains the archive zone is the overlay zone (which includes `popup`); `thank_you`/`password`/`coming_soon` stay excluded and no `drawer`; (d) the customer fields still come from the route's own `FormData` (`:332-339`).
  ```
  node_modules/.bin/vitest run src/lib/checkout-shell.contract.test.ts
  ```
  Expected output: **FAIL** — the suite's case (a) fails because the route passes `ast={null}` and therefore never composes the theme's body.

- [ ] **4.2** Compose the shell. The route resolves the theme's `checkout` AST (through `getStoreChrome({template: "checkout"})`) and passes it to `ThemeChrome` **together with the context slots** the cart widgets read (`cart_lines`, `cart_summary`, `checkout_steps`, `payment_methods` — the same keys the cart route grants, `src/routes/store.$slug.cart.tsx:102-108`). The route's own `<form>` stays where it is: it is rendered as the route's **content**, and the theme's body is the **frame** around it.
  ```
  grep -n "contextSlots" -A 10 src/components/store/ThemeChrome.tsx | head -30
  ```
  Expected output: `ThemeChrome`'s `contextSlots` prop and how it is threaded into `SectionRenderer` (`src/components/builder/SectionRenderer.tsx:498`, `:594`, `:728`).

- [ ] **4.3** The **fallback** must be exact: a merchant with no published `checkout` body gets the **current** hand-built checkout, unchanged. The route's `fallback` prop keeps today's markup verbatim, so the blast radius of this task for a theme-less store is **zero pixels**.
  ```
  node_modules/.bin/vitest run src/lib/checkout-shell.contract.test.ts
  node_modules/.bin/tsgo --noEmit
  ```
  Expected output: the contract suite passes; `tsgo` prints nothing.

- [ ] **4.4** Apply the same composition to the custom-host twin (`src/routes/checkout.tsx:276`), which currently keeps the header/footer only. Its `ast` becomes the same shell, with the same fallback.
  ```
  sed -n '270,282p' src/routes/checkout.tsx
  ```
  Expected output: the current `ast={ast ? { header: ast.header, main: [], footer: ast.footer } : null}` — which this step replaces.

- [ ] **4.5** Run the neighbouring commerce suites:
  ```
  node_modules/.bin/vitest run src/components/builder/cart.test.tsx src/components/builder/cart-payment-methods.test.tsx src/routes/store.\$slug.checkout.rescue.test.ts src/lib/payment-rails*.test.ts
  node_modules/.bin/eslint src/routes/store.\$slug.checkout.tsx src/routes/checkout.tsx
  ```
  Expected output: every suite passes; eslint prints nothing.

- [ ] **4.6** Commit:
  ```
  git add src/lib/checkout-shell.contract.test.ts src/routes/store.\$slug.checkout.tsx src/routes/checkout.tsx
  git commit -m "feat(storefront): the theme composes the production checkout shell; the platform keeps the form, the totals and the rails"
  git status --short
  ```
  Expected output: a commit touching **3** files; the churn files remain unstaged.

### Task 5 — The blog variants: listing vs article detail, and the editor's authoring surface

**Files:**
- **Create (allowed):** `src/lib/template-variants.ts` — the **closed** variant vocabulary and its helpers.
- **Create (allowed):** `src/lib/template-variants.test.ts` — its contract suite.
- **Modify (escalation-required):** `src/lib/builder-ast.ts` (the variant helpers, if they must read the new table).
- **Modify (escalation-required):** `src/hooks/use-builder-editor.ts` (the editor doc carries variant keys).
- **Modify (escalation-required):** `src/components/builder/BuilderTopBar.tsx` (the switcher shows the variants).
- **Modify (escalation-required):** `src/lib/theme-preview-nav.ts` (the preview resolves the variants).
- **Modify (escalation-required):** `src/routes/store.$slug.blog.index.tsx`, `src/routes/store.$slug.blog.$slug.tsx`, `src/routes/blog.index.tsx`, `src/routes/blog.$slug.tsx` (the routes resolve the variant).
- **Modify (escalation-required):** `src/components/store/BlogArchiveTheme.tsx` — the **blog** host gains an optional `ast`/`tokens` pair so a **merchant-scoped** caller can wear the theme's `blog` composition; with no AST the render stays byte-identical to today's platform grid. (Task 2 left this file alone — the archive host is the new `ArchiveView`.)
- **Modify (escalation-required):** `src/components/store/BlogArchiveTheme.test.tsx` — the "themeless by design" pin (`:82-101`) is **re-pinned in the same commit** as the component change above.
- **Modify (escalation-required):** `src/lib/theme-preview-nav.test.ts` (the `FIRST_SECTION` map — the existing pin — **and the two hard-coded nine-key arrays** at `:134-144` (Songoskriti) and `:375-385` (Somvabona) behind *"authors demo content for every template"*). **Those two arrays omit `archive`**, so the archive's demo body is not covered by the sweep that says every template has one; the archive is the tenth template and the literals still enumerate nine. This task turns both into `TEMPLATE_KEYS`-driven loops (step 5.4), which cover the archive too. **Assigned to this task on 2026-10-21** — the review found the gap; the file was already this task's, and the arrays are the reason it stays here.
- **Modify (allowed):** `src/lib/themes/songoskriti/preview.ts` (the two blog bodies).

**Interfaces:**
- Consumes: `isVariantTemplateKey` / `normalizeTemplateSuffix` / `templateSuffixFromOverride` / `resolveTemplateCandidates` / `resolveTemplate` (`src/lib/builder-ast.ts:8170-8274`) · `parseTemplates` (`:8117-8136`) · `EditorDoc` (`src/hooks/use-builder-editor.ts:39`) · the `TEMPLATE_META` map · `BlogFeedProvider` / `ArticleView` (`src/components/store/ArticleView.tsx`).
- Produces: `TEMPLATE_VARIANTS` (a closed table) · `variantKeysFor(base)` · `isKnownTemplateKey(key)` (base **or** a validated variant) · the blog listing and article-detail compositions.

- [ ] **5.1** Write the failing variant contract. It must assert: (a) the vocabulary is **closed** — `TEMPLATE_VARIANTS` is exactly `{ blog: ["listing", "article"], archive: ["category", "tag", "author"] }` and a variant outside it is **rejected** by the validator; (b) `blog` resolves to `blog_listing` on the listing route and `blog_article` on the detail route; (c) both fall back to the base `blog` when the variant is absent, and to the platform's grid when neither is present; (d) `parseTemplates` **persists** `blog_article` and `blog_listing` through a round trip; (e) the **listing** and the **article detail** compositions are **distinguishable** — different section-type sets, so a merchant can tell them apart in the editor and the distinctness gate can see them apart.
  ```
  node_modules/.bin/vitest run src/lib/template-variants.test.ts
  ```
  Expected output: **FAIL** — `Error: Failed to load url ./template-variants`.

- [ ] **5.2** Implement `src/lib/template-variants.ts`: the closed table, `variantKeysFor(base)`, `baseTemplateKey(key)` (the inverse of `isVariantTemplateKey`), and `isKnownTemplateKey(key)` (a base **or** a validated variant). The **editor's** identity type becomes `TemplateKey | `${TemplateKey}_${string}``; `EditorDoc.templates` widens to `TemplateMap` (`src/lib/builder-ast.ts:8167`), which already exists and already carries variant keys.
  ```
  grep -n "export type TemplateMap" -A 3 src/lib/builder-ast.ts
  ```
  Expected output: `export type TemplateMap = ThemeTemplates & Partial<Record<string, ThemeAst>>;` — the type the editor must move to.

- [ ] **5.3** Teach the editor's switcher the second level: each base that has variants shows them beneath it (`Blog` → `Blog listing`, `Blog article`; `Archive` → `Archive category`, `Archive tag`, `Archive author`). The switcher must keep the **base** key as the default selection and must never let a merchant save a variant that is not in the table.
  ```
  grep -n "TEMPLATE_KEYS.map" -B 6 -A 6 src/components/builder/BuilderTopBar.tsx
  ```
  Expected output: the `TEMPLATE_KEYS.map` at `:413` — the site this step replaces with a table-driven list.

- [ ] **5.4** Move the existing pins to the **stronger** form. `src/lib/theme-preview-nav.test.ts` carries **three** sites that enumerate the template keys: the `FIRST_SECTION: Record<TemplateKey, string>` map (`:120-131`, now ten entries) and two hard-coded nine-key arrays (`:134-144` for Songoskriti, `:375-385` for Somvabona). All three are **updated, never weakened** — the `FIRST_SECTION` map becomes an explicit per-template opener map that now also names the variants, and the two arrays become `TEMPLATE_KEYS`-driven loops (which cover **more** templates than the old literals did). **The archive is in scope for this step** (assigned here on 2026-10-21): both arrays still enumerate nine keys, so *"authors demo content for every template"* does not yet cover the archive's demo body — the loop must cover the tenth key too. This is an **existing test file** (prohibited by §7); the update is named in the Task-1 escalation record.
  ```
  sed -n '115,150p' src/lib/theme-preview-nav.test.ts
  sed -n '370,390p' src/lib/theme-preview-nav.test.ts
  ```
  Expected output: the `FIRST_SECTION` map with its ten entries, the Songoskriti nine-key array, and the Somvabona nine-key array — the three sites this step replaces.

- [ ] **5.5** Resolve the variants on the four blog routes: the listing routes resolve `blog_listing`, the article routes resolve `blog_article`, each falling back to `blog` and then to the platform's own render. The routes' canonical, robots, JSON-LD and breadcrumb behaviour is **not** touched. **The same store-subject rule as Task 2 step 2.4 applies:** a route resolves a theme only when it carries a **store slug**, because `getStoreChrome` needs one (`src/lib/storefront.functions.ts:94-111`). So the **two merchant-scoped** routes — `src/routes/store.$slug.blog.index.tsx` and `src/routes/store.$slug.blog.$slug.tsx` — resolve the theme's `blog` / `blog_listing` / `blog_article` composition, while the **two platform** routes (`src/routes/blog.index.tsx`, `src/routes/blog.$slug.tsx`) carry **no slug** and therefore **keep the platform's grid**. Every resolution inspects the returned `match` and accepts **only** `"suffix"` and `"base"` — `"page"`, `"index"` and `"empty"` mean *no composition* and fall back to the platform's own render, never to the homepage (`src/lib/builder-ast.ts:8219-8239`). **This step also changes the blog host and re-pins its suite in the same commit:** `src/components/store/BlogArchiveTheme.tsx` gains the optional `ast`/`tokens` pair described in this task's Files, and `src/components/store/BlogArchiveTheme.test.tsx:82-101` — the *"forwards themeKey to ThemeChrome with zero behavioral change (generic by design)"* pin — becomes the **opposite** assertion: with **no** AST the render is byte-identical to the platform grid (the generic-by-default behaviour is still true for a store that authors no `blog` body), and **with** an AST the theme's composition wraps the **same** articles. The "themeless by design" basis is replaced by the measured one: the platform reader surfaces are **store-less**, not themeless (Task 1 step 1.13).
  ```
  grep -n "storeListingHead\|storeArticleHead" src/routes/store.\$slug.blog.index.tsx src/routes/store.\$slug.blog.\$slug.tsx
  grep -n "ast={" src/components/store/BlogArchiveTheme.tsx
  grep -n "generic by design" src/components/store/BlogArchiveTheme.test.tsx
  ```
  Expected output: the two head helpers — untouched by this step; the host's `ast={null}` — the site this step replaces; and the "generic by design" pin — the assertion this step re-pins.

- [ ] **5.6** Author Songoskriti's two blog bodies: the listing keeps the pack (`blog_terms` + `blog_archive` + `blog_pager`, `src/lib/themes/songoskriti/preview.ts:218-241`) and the **article detail** gets its own composition (the article's title/excerpt/cover are route context, so the body is the theme's *frame* around them — a rich-text/hero section plus the pack's related-content and the newsletter). The two must be **distinguishable** (case (e) of 5.1).
  ```
  node_modules/.bin/vitest run src/lib/template-variants.test.ts src/lib/themes/songoskriti/blog-page-composition.test.ts src/lib/themes/songoskriti/template-distinctness.test.ts
  ```
  Expected output: every suite passes.

- [ ] **5.7** Run the neighbouring suites and the static gates:
  ```
  node_modules/.bin/vitest run src/lib/theme-preview-nav.test.ts src/lib/builder-phase2a.test.ts src/components/builder/songoskriti-port-freeze.test.tsx src/components/store/songoskriti-preview-compositions.test.tsx src/components/store/BlogArchiveTheme.test.tsx src/components/store/ArchiveView.test.tsx
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src/lib/template-variants.ts src/hooks/use-builder-editor.ts src/components/builder/BuilderTopBar.tsx src/lib/theme-preview-nav.ts src/components/store/BlogArchiveTheme.tsx
  ```
  Expected output: every suite passes (including the two moved pins); `tsgo` and `eslint` print nothing.

- [ ] **5.8** Commit:
  ```
  git add src/lib/template-variants.ts src/lib/template-variants.test.ts src/lib/builder-ast.ts src/hooks/use-builder-editor.ts src/components/builder/BuilderTopBar.tsx src/lib/theme-preview-nav.ts src/lib/theme-preview-nav.test.ts src/routes/store.\$slug.blog.index.tsx src/routes/store.\$slug.blog.\$slug.tsx src/routes/blog.index.tsx src/routes/blog.\$slug.tsx src/components/store/BlogArchiveTheme.tsx src/components/store/BlogArchiveTheme.test.tsx src/lib/themes/songoskriti/preview.ts
  git commit -m "feat(templates): validated blog and archive variants, authorable in the editor"
  git status --short
  ```
  Expected output: a commit touching **14** files; the churn files remain unstaged. **The blog host and its re-pinned suite are in this commit together** — never one without the other.

### Task 6 — The editor, the persistence isolation, the preview parity and the publishing integration

**Files:**
- **Create (allowed):** `src/lib/template-persistence-isolation.test.ts` — the per-template isolation suite.
- **Create (allowed):** `src/lib/publish-migration.contract.test.ts` — the publish / seed / merge / rollback contract.
- **Modify (escalation-required):** `src/routes/_authenticated/dashboard/builder.tsx` (the template panel, the reset affordance, the variant entries).
- **Modify (escalation-required):** `src/lib/themes.server.ts` (the reset path; the seed path; the publish gate's per-key messages).
- **Modify (escalation-required):** `src/components/store/ThemePreviewFrame.tsx` (the preview's per-template context grants, so the preview and the storefront grant the **same** slots).
- **Modify (allowed):** `src/lib/themes/songoskriti/preview.ts` (the preview's per-template demo bodies).

**Interfaces:**
- Consumes: `loadWorkspace` / `autosave` / `commitVersion` / `publishVersion` / `rollbackVersion` / `installRegistryTheme` / `mergeTemplates` / `diffTemplates` (`src/lib/themes.server.ts`) · `useBuilderEditor` (`src/hooks/use-builder-editor.ts`) · `EditorShell` / `StudioBuilder` / `StudioCanvas` · `ThemePreviewFrame` (`src/components/store/ThemePreviewFrame.tsx`) · `assemblePreviewTemplates` (`src/lib/theme-preview-nav.ts:455-475`).
- Produces: a **reset** affordance, a **preview-parity** proof (the preview and the storefront grant the same slots), and a **publish/migration/rollback** contract.

- [ ] **6.1** Write the failing persistence-isolation suite. It must assert: (a) saving the `search` template leaves the `cart`, `account`, `blog`, `checkout`, `archive` and `page` ASTs **byte-identical**; (b) the same for every pair — the suite round-trips the whole `templates` map through `parseTemplates` after a single-template edit and compares every untouched key with `toEqual`; (c) a **theme switch** (the `templates` map of theme A vs theme B) never leaks a layout between them; (d) a **variant** (`blog_article`) never overwrites its base (`blog`).
  ```
  node_modules/.bin/vitest run src/lib/template-persistence-isolation.test.ts
  ```
  Expected output: **FAIL** until the implementation is confirmed — the suite is written to *prove* the property, and a green run on the first try is itself the evidence.

- [ ] **6.2** Write the failing publish/migration contract. It must assert: (a) `publishVersion` lints **every** `TEMPLATE_KEYS` member (the loop at `src/lib/themes.server.ts:853-857`); (b) the seed fills only the **missing** keys and never overwrites a merchant-edited template; (c) `mergeTemplates` carries the new key and its variants across a theme update; (d) `rollbackVersion` restores the target version's templates exactly, including the archive body; (e) a theme update with an **incompatible** stored template **fails safely** (the published output is not partially corrupted — the brief's §16).
  ```
  node_modules/.bin/vitest run src/lib/publish-migration.contract.test.ts
  ```
  Expected output: **FAIL** on the cases the new key breaks (the seed and the merge).

- [ ] **6.3** Implement the seed and merge behaviour for the new key + variants, and add the **reset** affordance (the brief's §3: *"Provide actions to preview, save, publish, **reset to a safe default**, and recover when a saved template references a missing widget"*). The reset restores **one** template to the theme's default and writes a new version — never a silent overwrite of the whole map.
  ```
  grep -n "export async function applyThemeUpdate" -A 40 src/lib/themes.server.ts
  ```
  Expected output: the update path, which must not drop a merchant's archive body.

- [ ] **6.4** Prove the **preview parity**: for each of the seven templates, the set of context slots the preview grants equals the set the production route grants. The suite reads both hosts' source as text and compares the two slot maps — the same "read it as text" pattern the repo already uses. **The `archive` template is the one case without a live production route** (the three platform taxonomy surfaces are store-less and keep the platform grid — Task 2 step 2.4), so for `archive` the suite asserts the preview's granted slot set is **exactly** the archive body's six functional slots (`category_header`, `blog_terms`, `blog_archive`, `blog_pager`, `pagination`, `empty_state`) — the set the deferred merchant-scoped route must grant when it lands. **The theme preview host (`/theme-preview/<theme>?template=archive`) is the `archive` key's production render path in this programme**, alongside the editor, and the copy it shows a merchant was corrected in Task 1 (step 1.13), not here.
  ```
  grep -n "contextSlots" -A 12 src/components/store/ThemePreviewFrame.tsx | head -40
  grep -rn "contextSlots={{" -A 10 src/routes/store.\$slug.*.tsx
  ```
  Expected output: the two maps, side by side; the differences are exactly the ones the suite names (the preview adds `facet_sidebar` and the demo data, and the task closes the real ones).

- [ ] **6.5** Run the neighbouring suites and the static gates:
  ```
  node_modules/.bin/vitest run src/lib/builder-lifecycle.contract.test.tsx src/lib/builder-chrome.contract.test.tsx src/lib/platform-acceptance.test.tsx src/lib/builder-publish-gate.test.ts src/hooks/use-builder-editor.route-h1.test.tsx src/lib/themes/workspace-route-h1-lint.test.ts
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/eslint src/lib/themes.server.ts src/routes/_authenticated/dashboard/builder.tsx src/components/store/ThemePreviewFrame.tsx
  ```
  Expected output: every suite passes; `tsgo` and `eslint` print nothing.

- [ ] **6.6** Commit:
  ```
  git add src/lib/template-persistence-isolation.test.ts src/lib/publish-migration.contract.test.ts src/lib/themes.server.ts src/routes/_authenticated/dashboard/builder.tsx src/components/store/ThemePreviewFrame.tsx src/lib/themes/songoskriti/preview.ts
  git commit -m "feat(builder): per-template isolation, a reset affordance, and preview-parity with the storefront"
  git status --short
  ```
  Expected output: a commit touching **6** files; the churn files remain unstaged.

### Task 7 — The test lanes: contract, integration, authenticated E2E, visual regression, and the distinctness extension

**Files:**
- **Create (allowed):** `.e2e/songoskriti-seven-templates.spec.ts` — the authenticated editor journey over the seven templates.
- **Create (allowed):** `.e2e/songoskriti-storefront-surfaces.spec.ts` — the production storefront assertions (search, cart, account, blog listing, blog article, checkout, archive, page).
- **Create (allowed):** `src/lib/themes/songoskriti/template-distinctness.archive.test.ts` — the distinctness gate's new-key coverage.
- **Modify (allowed):** `.e2e/songoskriti-port-parity.spec.ts` — the `TEMPLATES` list (`:36-46`) gains `archive` (an **existing** `.e2e/**` file → escalation-required; the change is an **addition**, never a removal, and the machine baselines are **not** rewritten here). **Assigned to this task on 2026-10-21** — the nine-template sweep omits the archive, so the parity harness never looks at the new surface.
- **Modify (escalation-required):** `.e2e/real-frames.spec.ts` — the template loop (`:63-73`) gains `archive`. **Assigned to this task on 2026-10-21** — the same nine-template sweep, and the archive's real frame is never rendered by it.
- **Modify (escalation-required):** `.e2e/theme-preview-security.spec.ts` — the preview template sweep (`:567-575`) gains `archive`. **Assigned to this task on 2026-10-21, and NO task claimed this file before:** the sweep walks seven `?template=` variants for the exfiltration probe, and the archive — the tenth template, and the one whose body a merchant authors — was not among them, so the archive preview was never swept.

**Interfaces:**
- Consumes: `merchantCreds` / `ensureSongoskritiActive` / `setActiveTheme` (`.e2e/helpers-songoskriti.ts`) · `blockExternalRequests` / `hermeticPage` (`.e2e/helpers.ts`) · the Playwright config's `webServer` (`.e2e/playwright.config.ts`) · `checkSongoskritiTemplateDistinctness` (`src/lib/themes/songoskriti/template-distinctness.ts`).
- Produces: the seven-template authenticated journey, the storefront-surface assertions, the extended distinctness gate, and the recorded parity impact.

- [ ] **7.1** Extend the distinctness gate's coverage for the new key and write its suite: the `archive` row must reject a body that is the engine's generic demo body (`["heading", "rich_text"]`), must require its own composition, must require its functional slots, and must be checked against the **other** templates for cross-template distinctness (`R6`).
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/template-distinctness.test.ts src/lib/themes/songoskriti/template-distinctness.archive.test.ts
  ```
  Expected output: every suite passes; the new suite's negative case (a generic body on `archive`) reports `R1-not-generic`.

- [ ] **7.2** Write the **authenticated editor journey** over the seven templates: for each template, open the real editor, select the template, insert/reorder a widget, change a real inspector property, preview desktop / tablet / mobile, save, reload, publish, open the real storefront route, and verify the saved template + route context render — then exercise the documented empty / error / unauthenticated / unavailable cases. **For `archive` the "real storefront route" is the theme preview route** (`/theme-preview/<theme>?template=archive`) and the platform taxonomy surface: the archive key's storefront route is the deferred merchant-scoped one (Task 2 step 2.4), so the journey asserts the theme's archive body renders in the preview and that the platform taxonomy surface keeps the grid. The suite **skips** when the creds are absent (never fakes a session) and **reports the skip** as a skip.
  ```
  E2E_BASE_URL=http://localhost:3020 E2E_NO_WEBSERVER=1 \
  E2E_MERCHANT_EMAIL="$E2E_MERCHANT_EMAIL" E2E_MERCHANT_PASSWORD="$E2E_MERCHANT_PASSWORD" \
  node_modules/.bin/playwright test -c .e2e/playwright.config.ts songoskriti-seven-templates
  ```
  Expected output with creds: the seven journeys pass. Expected output **without** creds: the suite reports `skipped` with the reason *"requires E2E_MERCHANT_EMAIL/E2E_MERCHANT_PASSWORD (loopback auth stack; docs/15-e2e/loopback-auth-setup.md)"* — **never** a pass.

- [ ] **7.3** Bring the loopback stack up so the authenticated lane is **real**, not skipped. This is a **multi-step** operation; each is one checkbox:
  ```
  docker compose -f docker-compose.e2e.yml --env-file /tmp/opencode/e2e-auth/.e2e.env up -d
  docker ps --format '{{.Names}}' | grep e2e-supabase
  ```
  Expected output: the `e2e-supabase` containers (`db`, `kong`, `gotrue`, `rest`, `storage`).
  ```
  # the socat relay, then the migrations, then the seed, then the app
  /tmp/opencode/e2e-auth/apply-all.sh
  /tmp/opencode/e2e-auth/run-app.sh
  ```
  Expected output: the migration logs end `OK`; the app answers `http://localhost:3020/favicon.ico` with `200`.
  **If the stack cannot be brought up, the authenticated lane is reported as SKIPPED with that reason, and the task is not marked done.** The plan never converts a skip into a pass.

- [ ] **7.4** Write the **storefront-surface** assertions (no auth needed): the search route renders the theme's search composition with the **same** result count as the platform's own block; the cart renders the theme's cart body; the account route renders the **unauthenticated** state for an anonymous visitor and the dashboard for a signed-in one; the blog listing and the blog article render **different** compositions; the checkout renders the theme's shell around the platform's form; the archive routes render the **platform's grid** with the resolved term's name as the **one** `<h1>` and **no** theme composition (they carry no store slug — Task 2 step 2.4), while the **preview** route `/theme-preview/<theme>?template=archive` renders the theme's **archive body** with its six functional slots; the page route renders the merchant's **own** record and **no** demo copy.
  ```
  node_modules/.bin/playwright test -c .e2e/playwright.config.ts songoskriti-storefront-surfaces
  ```
  Expected output: every surface passes; the archive case asserts **exactly one** `<h1>` carrying the term's name **and** that the theme's archive body is **not** on the page, and the preview case asserts the archive body **is**.

- [ ] **7.5** Add `archive` to the parity harness's `TEMPLATES` list — an **addition**, never a removal — and run the harness **in compare mode** (never `--update-snapshots`) against the **throwaway stack** only:
  ```
  grep -n "const TEMPLATES" -A 12 .e2e/songoskriti-port-parity.spec.ts
  ```
  Expected output: the nine-entry list, which grows to ten. The **machine baselines** for the new `archive` captures are **not** written here — the re-freeze is the owner's action (Decision Gate G3) and happens on the throwaway stack, never against the configured database.
  **Never run** the harness with the configured `.env` (its `SUPABASE_URL` routes to the production database container — `report.md` §5.1 D6).

  **The other two sweeps gain `archive` in the same step** (assigned here on 2026-10-21, with the reason in this task's Files): `.e2e/real-frames.spec.ts:63-73` (the real-frames template loop) and `.e2e/theme-preview-security.spec.ts:567-575` (the preview's `?template=` sweep). All three are **additions**, never removals.
  ```
  grep -n "const TEMPLATES" -A 12 .e2e/real-frames.spec.ts
  grep -n "template sweep" -B 6 .e2e/theme-preview-security.spec.ts
  ```
  Expected output: the nine-entry `TEMPLATES` list in `real-frames.spec.ts` and the seven-entry `?template=` sweep in `theme-preview-security.spec.ts` — the two sites that grow to cover the archive.

- [ ] **7.6** Run the whole local gate chain that CI runs, and record each result with its exact command:
  ```
  node_modules/.bin/eslint src docs scripts
  node_modules/.bin/tsgo --noEmit
  node_modules/.bin/vitest run
  node scripts/doc-gate.mjs
  node scripts/songoskriti-assets-check.mjs
  node scripts/gen-songoskriti-assets.mjs --check
  ```
  Expected output: eslint and `tsgo` print nothing; vitest ends `Test Files  N passed (N)` / `Tests  M passed (M)`; the doc gate prints `0 findings`; the asset gate prints `0 findings` with its advisory notes; the generator prints its match summary. **`node scripts/contract-gate.mjs` is an EXPECTED RED** (exit 2 — it hardcodes `spawnSync("bunx", …)` and `bun` is not on PATH here); **`node scripts/schema-fingerprint.mjs --check` is an EXPECTED RED** (exit 1 — it needs a live Supabase RPC). Both are pre-existing, both are stated, and neither is "fixed" by this plan.

- [ ] **7.7** Commit:
  ```
  git add .e2e/songoskriti-seven-templates.spec.ts .e2e/songoskriti-storefront-surfaces.spec.ts .e2e/songoskriti-port-parity.spec.ts .e2e/real-frames.spec.ts .e2e/theme-preview-security.spec.ts src/lib/themes/songoskriti/template-distinctness.archive.test.ts
  git commit -m "test(e2e): the seven-template editor journey, the storefront surfaces and the archive distinctness"
  git status --short
  ```
  Expected output: a commit touching **6** files; the churn files remain unstaged (in particular `.artifacts/e2e/playwright-report/index.html`, which the Playwright run rewrites — it is **never** staged).

### Task 8 — The self-critique pass: capture, name the three weakest, fix them, re-capture

**Files:**
- **Create (allowed):** `docs/superpowers/songoskriti-evidence/port/phase3-self-critique.md` — the record: the seven captures, the three weakest failures, the fixes, the re-capture.
- **Create (allowed):** `.e2e/songoskriti-self-critique.spec.ts` — the capture script for the seven surfaces.
- **Modify (allowed):** the theme's compositions and the routes, as the fixes require (each fix is recorded with its file list).

**Interfaces:**
- Consumes: the seven surfaces' URLs (`/store/<slug>/search`, `/cart`, `/account`, `/blog`, `/blog/<slug>`, `/checkout`, `/blog/category/<term>`, `/pages/<slug>`) · the Playwright harness · the theme's tokens (`src/lib/themes/songoskriti/tokens.ts`).
- Produces: the self-critique record and the three fixes.

- [ ] **8.1** Capture the **seven surfaces** at the six widths the brief names (1440 / 1280 / 768 / 430 / 390 / 375) in both locales, into a **scratch** directory (never into `reference/` — that is the owner's re-freeze):
  ```
  mkdir -p /tmp/opencode/frame30-self-critique
  ```
  Expected output: an empty scratch directory; the capture script writes 7 × 6 × 2 = **84** stills plus a manifest naming each surface, width and locale.

- [ ] **8.2** Read the captures and **name the three weakest visual/functional failures** — explicitly, with the surface, the width and the reason. The record must be honest: *"the three weakest failures are (1) … (2) … (3) …"*. If fewer than three real failures are found, the record says so and names the three *weakest remaining* surfaces.
  ```
  ls -1 /tmp/opencode/frame30-self-critique | head -20
  ```
  Expected output: the capture list.

- [ ] **8.3** **Fix** the three failures. Each fix is a real change — a composition, a token, a layout or a context change — never a screenshot tweak, and each is recorded with its file list and its reason. A failure that cannot be fixed inside the boundary is **recorded and escalated**, not papered over.

- [ ] **8.4** **Re-capture** the seven surfaces and **compare** against the first capture, with the comparator the parity spec already uses (`maxDiffPixelRatio: 0.02`, `threshold: 0.2` — `.e2e/songoskriti-port-parity.spec.ts:55`):
  ```
  grep -n "THRESHOLDS" -A 2 .e2e/songoskriti-port-parity.spec.ts
  ```
  Expected output: `const THRESHOLDS = { maxDiffPixelRatio: 0.02, threshold: 0.2 } as const;` at `.e2e/songoskriti-port-parity.spec.ts:52`; the re-capture's diff must be **smaller** on the three fixed surfaces and **unchanged** on the other four.

- [ ] **8.5** Write the record: the seven surfaces, the three weakest failures, the three fixes, the re-capture's measurement, and the residual weaknesses that remain.
  ```
  node_modules/.bin/vitest run src/lib/themes/songoskriti/template-distinctness.test.ts
  ```
  Expected output: the gate still passes after the fixes (a fix that breaks the gate is not a fix).

- [ ] **8.6** Commit:
  ```
  git add docs/superpowers/songoskriti-evidence/port/phase3-self-critique.md .e2e/songoskriti-self-critique.spec.ts
  git add <each file the three fixes touched, by exact path>
  git commit -m "fix(songoskriti): the three weakest surface failures from the self-critique pass"
  git status --short
  ```
  Expected output: a commit touching the record, the capture script and the fix files; the churn files remain unstaged.

### Task 9 — The docs

**Files:**
- **Modify (allowed):** `docs/themes/creation.md` (the template-key list, the route semantics, the variant vocabulary).
- **Modify (allowed):** `docs/themes/packages.md` (the theme-package contract, the API range, the declared templates).
- **Modify (allowed):** `docs/04-builder/theme-runtime.md` (the render-context contract, per template).
- **Modify (allowed):** `docs/developers/themes.md` (which templates can be customised, which widgets can be placed, how to declare presentations, what stays platform-controlled).
- **Modify (allowed):** `docs/packages/contract.md` (the manifest's `templates` subset and the range). **Assigned here on 2026-10-21 — the third-party author cannot yet learn the new rule:** `:154-166` states only the range rule, so a package that declares `archive` has no published way to learn that it must declare an API range whose lower bound is `>= 3.1.0` (the reason code is `templates.archive_requires_api`). This task states that rule — the two admitted range shapes (`^a.b.c` and `>=a.b.c <d.e.f`), the floor each of them implies, and the reason code — next to the range rule it qualifies. The contract file itself is **not** edited by the implementation round; the rule is written here.
- **Create (allowed):** `docs/superpowers/songoskriti-evidence/port/phase3-evidence.md` — the evidence record: files changed, templates completed, routes tested, asset results, test commands and results, limitations, blocked criteria.

**Interfaces:**
- Consumes: the shipped behaviour (Tasks 1-8) · the doc gate's rules (`scripts/doc-gate.mjs`).
- Produces: the documentation that matches the shipped contracts, and the evidence record.

- [ ] **9.1** Update the **template-key list** in every doc that enumerates it. The list is now **ten** keys (nine + `archive`) plus the **variant vocabulary**:
  ```
  grep -rn "index.*product.*collection.*account\|template keys\|template-key" docs --include=*.md | head -20
  ```
  Expected output: every doc that names the old nine-key list, so none is left stale.

- [ ] **9.2** Document the **archive route contract** (the three kinds, the three routes, the explicit not-found, the variant keys, **and the fact that the three platform taxonomy surfaces keep the platform's grid because they carry no store slug — the merchant-scoped archive route is deferred**), the **blog variant contract** (listing vs article detail), the **checkout composition contract** (what the theme may and may not contribute) and the **account context contract** (the tabs, the permitted fields, the states).

- [ ] **9.3** Update the **third-party theme/widget developer docs**: which templates can be customised, which widgets can be placed on each, how to declare presentations and properties, how to preview them, and which actions remain platform-controlled. Remove any contradictory legacy instruction. **State the archive's API-floor rule in `docs/packages/contract.md` next to the range rule it qualifies** (assigned here on 2026-10-21): a package that declares `archive` in its `templates` must declare an `api` range whose **lower bound is `>= 3.1.0`**, because that is the API line the key landed in; the two admitted range shapes are `^a.b.c` (floors at `a.b.c`) and `>=a.b.c <d.e.f` (floors at `a.b.c`), and a package that claims a lower bound is rejected with the stable reason code **`templates.archive_requires_api`**. A package that does **not** declare `archive` is unaffected.

- [ ] **9.4** Run the doc gate and the contradiction lint:
  ```
  node scripts/doc-gate.mjs
  ```
  Expected output: `0 findings` and exit 0. The gate's own self-test runs as preflight; a failure there is a **harness** failure (exit 2), not a findings count.

- [ ] **9.5** Write the **evidence record** — the files changed, the templates completed, the real routes tested, the asset results, the exact test commands and their results, the limitations, and any blocked acceptance criteria. The blocked criteria are stated as blocked, with the reason (the Decision Gate items, the parity re-freeze, and the remote CI limitation).

- [ ] **9.6** Commit:
  ```
  git add docs/themes/creation.md docs/themes/packages.md docs/04-builder/theme-runtime.md docs/developers/themes.md docs/packages/contract.md docs/superpowers/songoskriti-evidence/port/phase3-evidence.md
  git commit -m "docs(theme): the seven templates, the variant vocabulary, the render contexts and the archive contract"
  git status --short
  ```
  Expected output: a commit touching **6** files; the churn files remain unstaged.

### Task 10 — The remote CI: the exact limitation, stated rather than claimed

**Files:**
- **Create (allowed):** `docs/superpowers/songoskriti-evidence/port/phase3-ci.md` — the CI statement: what was run locally, with which commands and results; what the remote pipeline will run; and the exact limitation.

**Interfaces:**
- Consumes: `.circleci/config.yml` (the `gates` workflow at `:354-384`, the `scan` job's base resolution) · the local gate results from Task 7.6 · the remote's existence (a push triggers it).
- Produces: the CI statement.

- [ ] **10.1** Confirm, by measurement, that the remote run is **not** verifiable from this environment:
  ```
  env | grep -i "^CIRCLECI" || echo "no CIRCLECI token in the environment"
  ls -la ~/.circleci 2>/dev/null || echo "no ~/.circleci/cli-config.yml"
  curl -s -o /dev/null -w "circleci.com:%{http_code}\n" https://circleci.com/
  ```
  Expected output: `no CIRCLECI token in the environment` · `no ~/.circleci/cli-config.yml` · `circleci.com:200`. **Network is fine; authentication is missing.** The CircleCI API and CLI are therefore unusable: the workflow cannot be triggered from here, and its status cannot be read.

- [ ] **10.2** Record the **local** equivalents of every CI job, with their exact commands and results — `lint-typecheck` (`bun run lint`, `bun run typecheck`) · `unit-contract` (`bun run test`, `bun run test:contracts`, `bun run doc:gate`) · `scan` (`bun run secrets:scan`, `bun run sast:scan`, `bun run scan:deps`) · `build` (`bun run build`) · `e2e-critical` / `e2e-security` / `e2e-levelb-production` (the Playwright suites) — and state each as **green**, **red with a stated pre-existing reason**, or **not runnable here**.

- [ ] **10.3** State the limitation **verbatim** in the record and in the final report:
  > *"The remote CircleCI run for this branch **cannot be verified from this environment**: there is no CircleCI API token and no `~/.circleci/cli-config.yml`, so the workflow can be neither triggered nor observed here (`env | grep -i '^CIRCLECI'` → empty; `ls ~/.circleci` → no such directory; `curl -s -o /dev/null -w '%{http_code}' https://circleci.com/` → `200`, so the limitation is authentication, not connectivity). The push to `origin/frame30` **does** trigger the pipeline, and every gate CI runs was run locally with the commands and results recorded above — but **no claim of a green remote run is made, and the brief's DoD item 10 is reported as UNVERIFIED-FROM-HERE, not as passed."*

- [ ] **10.4** Push the branch (this is the only push in the plan) and hand the run to the owner:
  ```
  git push origin frame30
  git log --oneline -1
  ```
  Expected output: the push succeeds and `git log --oneline -1` names the plan's last commit. The **run URL** is the owner's to open; the plan does not claim its result.

- [ ] **10.5** Commit the CI statement:
  ```
  git add docs/superpowers/songoskriti-evidence/port/phase3-ci.md
  git commit -m "docs(ci): the remote-run limitation, stated with the measurement that settles it"
  git status --short
  ```
  Expected output: a commit touching **one** file; the churn files remain unstaged; the working tree is otherwise clean.

---

## What this plan deliberately does NOT do

- **No second page builder.** The existing `/dashboard/builder` studio, the canonical AST, the history/state management (`use-builder-editor.ts`), the schema-driven inspector (`widget-props.ts`) and the one-registry extension model (`src/lib/editor/editor-registry.ts`) are the only editor. Nothing here introduces a parallel editor, a parallel AST, a parallel inspector or a template-specific hardcoded inspector.
- **No parallel widget registry.** The catalogue in `src/lib/builder-ast.ts` stays the single widget vocabulary; the extension registry (`buildTrayRegistry` + the approved dev-theme defs) stays the single tray source. The archive and the account dashboard are composed from **existing** widgets; a genuinely new widget type is added only where the brief's surface cannot be expressed without one, and then it goes into the same catalogue with the same `templates:` allowlist contract.
- **No per-theme hardcoded renderer.** No `if (theme === "songoskriti")` branch in a route, and no theme-specific JSX in a shared component. The theme's contribution is an **AST**; the platform's contribution is a **renderer** that reads it. Songoskriti's identity arrives through the presentation registry and the tokens, exactly as it does today.
- **No change to the platform's authority.** Search execution, tenant scoping, result limits, cart and checkout prices, discounts, stock, totals, order state, payment rails, account scoping, publication status and permissions stay where they are. The checkout change is a **composition** change; the theme gets a frame, not a form. The account dashboard gets a presentation of the RPC's own fields, not a new query and not a new authorisation path.
- **No Somvabona dependencies.** Somvabona stays an official theme (A10) and the plan creates **no** new dependency on it: no Somvabona-specific composition, no Somvabona-specific renderer, no Somvabona preview change. It keeps falling through to the engine's generic body for the surfaces it does not author, exactly as today — and the distinctness gate's Somvabona case (which proves the **machinery** rejects a generic body) keeps passing.
- **No new npm dependency**, no lockfile change, no migration, no DDL, no new environment variable.
- **No deployment** inside the plan, and no blind `-u` on any snapshot: the parity re-freeze is the owner's action, on the throwaway stack, never against the configured database.
- **No `ast={null}`-style shortcuts.** Every template that exists in the union must have a production render path, and every route that renders one must grant the same context slots the preview grants. **The one stated exception, and it is a deferral rather than a shortcut:** the `archive` key's production render path in this programme is the **editor** and the **theme preview host** (`/theme-preview/<theme>?template=archive`), because the three platform content-archive surfaces carry **no store slug** and therefore cannot resolve a theme (Task 2 step 2.4) — they keep the platform's grid rather than rendering a wrong theme, and the merchant-scoped archive route is named as the follow-on. No template is ever silently replaced by another template's composition: every resolution inspects `resolveTemplate`'s `match` and accepts **only** `"suffix"` / `"base"`.
- **No weakening of a gate to go green.** The three known reds (`contract-gate` — `bunx` absent; `schema-fingerprint --check` — needs a live RPC; the local `secret-scan` findings inside the untracked `.output-snapshots/`) are reported as reds with their reasons, not fixed and not hidden.
