# Theme Registry — E2E spec (install, publish, snapshot, purge, fallback)

Status: Planning (depth spec for `docs/15-e2e` §Suites) · Slices S1/S7 theme surface (P4) · feeds `.e2e/store_loop.spec.ts` (theme scenarios) + `.e2e/builder_loop.spec.ts`
Owners: Builder + Storefront Runtime
References: `docs/04-builder/theme-registry.md` §1–§8 (Tenant006 schema) · `docs/04-builder/theme-runtime.md` (TR-1/TR-2, fallback) · `docs/02-merchant/staff-rbac.md` (Tenant004 `staff_has`, roles grants) · `AGENTS.md` §4 (E2E) · `docs/15-e2e/README.md`
Implementation note: Playwright files are **deferred until the S1 app scaffold + storefront renderer exist** (no `package.json`, no dev server, no Supabase local stack, no edge layer, no renderer yet). This document is the canonical acceptance contract those files must implement; no `.e2e/` artifact may claim green against it before the harness exists.

---

## 1. Purpose

Prove end-to-end that the theme registry serves exactly one correct, sanitized storefront per merchant: install → switch → build pages → publish → snapshot (package defaults + merchant token overrides) → rendered HTML with CDN purge → rollback; invalid widgets and tokens never break a page; unpublished pages never serve; the builtin `$fallback` absorbs runtime crashes. This suite is the acceptance contract for `Tenant006`.

## 2. Scope

**In scope** — the ten golden scenarios of `theme-registry.md` §5 mapped to the error literals of `Tenant006` (`theme_not_found`, `theme_not_published`, `theme_render_failed`, `widget_invalid`, `widget_unknown`, `token_override_invalid`, `ast_invalid`, `revision_required`, `preview_only`, `page_missing`), each with concrete RPC calls, expected error codes, expected `theme_audit` rows, and expected served HTML. Plus RLS/grants guards: non-staff or missing `themes` grant → `no_permission`; direct DML on theme tables → denied; writes RPC-only.

**Naming disambiguation**: the `docs/15-e2e/README.md` "Builder loop" line covers the editor surface (drag-drop AST editing, undo/redo, device preview). This spec covers only the **theme registry + storefront contract arm** (install/version/publish/snapshot/token/purge/fallback) and reuses the same `.e2e/builder_loop.spec.ts` file for its builder-side scenarios. `.e2e/store_loop.spec.ts` hosts the storefront-side scenarios here.

**Out of scope**

- Editor canvas mechanics (widget palette, drag/undo), marketplace publish/install (`docs/12-marketplace`), CDN/cache implementation details (timing asserted via events), per-widget renderer correctness (covered by `theme-runtime.md`).

## 3. Harness contract

- Playwright at repo root in `.e2e/`; `retries = 2`; `@flaky` quarantine after 3 flakes; trace on fail (screenshot + video) to `docs/15-e2e/artifacts`.
- Supabase local stack (`supabase start`) with per-env `test-*` datastore; **temp org per test** (`merchant_id` generated per test); `theme_audit` truncated between tests.
- Mock CDN in-process; purge asserted via the `page.published`/`theme.updated` event stream, not wall-clock TTL.
- **The suite calls PostgREST as the user — `service_role` is never used**, matching the Tenant006 grants convention (`theme_snapshot` is the only anon-executable RPC). A dedicated failure test asserts `service_role`-keyed calls are denied.
- Fixtures: two built-in themes (`$fallback` + one sample package), a `version_id` per theme, 10 seed pages (`home`,`collection`,`product`,`cart`,`checkout`,`account`,`order`,`tracking`,`search`,`not_sale` — the publish gate slug set), a staff account with the `themes` grant (seeded via Tenant004 + Tenant006 backfill).
- Tests drive the public RPC surface only (`app.theme_*`); no direct DML from tests.
- CI: migration forward on every run; migration rollback in a separate check; never auto-rollback (human).

## 4. Golden scenarios (map `theme-registry.md` §5)

Error codes below are the literal exceptions from Tenant006; P = publish-gate assertions, R = render/snapshot assertions.

### 4.1 Install → switch → serve (store_loop)

1. Owner installs sample theme via `theme_install(version_id)` → `store_themes` row; audit `theme.installed` with `version_id`/`theme_key`/`version` payload.
2. `theme_switch_default(theme_id)` → default flips (single `is_default`, `store_themes_default_uniq`); audit `theme_switched`.
3. R: storefront request for a published page → 200 HTML rendered from the default theme snapshot.

### 4.2 Snapshot merges defaults + merchant token overrides (store_loop)

1. `theme_save_tokens(...)` with valid `semantic.%`/`component.%`/`dark_semantic.%` overrides → 200; audit `token.saved`.
2. R: snapshot payload = package defaults (from `theme_versions`) overlaid with merchant overrides (from `theme_tokens`); rendered HTML reflects the override; invalid overrides rejected at save (see §4.7).

### 4.3 Unpublished page never serves (store_loop)

3. Page exists with `published_at is null` → `theme_snapshot` returns `theme_not_published`; storefront serves 404/fallback, never the draft AST.

### 4.4 Fallback on crash (store_loop, failure arm)

4. Simulated renderer crash (`theme_render_failed` path) → served HTML is the `$fallback` builtin, never a broken page.

### 4.5 Invalid widget skipped, page still renders (store_loop)

5. Page AST contains unknown widget key → sanitizer emits placeholder (`fq.widget`/`fq.placeholder`), error code `widget_unknown`/`widget_invalid`; storefront renders the rest of the page.

### 4.6 Publish gates (builder_loop)

6. Publish without all 10 slugs present → `page_missing`.
7. Publish using a widget not in `installed` state → `widget_unknown`; publish with any token override rejected → `token_override_invalid`.
8. Valid publish: pages snapshot `ast`+`seo`, revision inserted (max+1), all pages `published_at` set, audit `theme.published`.

### 4.7 Token override rejection (builder_loop)

9. `theme_save_tokens` with a leaf not matching `fq-%` / `semantic.%` / `bd-%` → `token_override_invalid`; no partial write, no audit row.

### 4.8 Rollback restores a revision (builder_loop)

10. Publish v2 → `theme_rollback(revision_id)` → page AST/`published_at` restored from v1; audit `theme.rolled_back`.

## 5. Failure suite (`theme_registry_failure`)

- `service_role` probe: calling any `app.theme_*` write RPC with a `service_role` key → denied (guards the grants convention); only `theme_snapshot` accepts `anon`.
- Non-staff / no-`themes`-grant actor: any theme RPC → `not_staff`/`no_permission`; failed calls write no audit rows.
- `theme_install(unknown_version)` → `theme_not_found`.
- Direct DML on `store_themes`/`pages`/`theme_tokens`/`widgets`/`revisions`/`theme_audit` from the RLS-policy-less user → denied (write-guard revoke from `anon, authenticated`).
- `ast_invalid` on malformed AST at save/publish; `revision_required` where a rollback target is absent.
- `theme_audit` integrity: every mutation above leaves exactly the expected rows; failed calls write none.

## 6. Fixtures & seeds

- Two themes (builtin `$fallback` + one sample package with `theme_versions` row); `store_themes` never seeded directly.
- One staff account with the `themes` grant via Tenant004 seed + Tenant006 backfill; `page_missing` fixture removes one slug.
- Cases applied through Tenant006 RPCs only — no direct DML rejects the walk guard contract.

## 7. Determinism & data reset

- Temp org per test; `theme_audit` truncate per test; mock CDN + event stream reset per test; publish/rollback computation seeded (no real clock waits); snapshot reads pinned to the default theme.

## 8. Gates

- Store-loop theme scenarios critical at the S1 builder/theme merge gate; full suite nightly + per release; Lighthouse a11y ≥ 90 on storefront & builder (theme surfaces); migration forward+rollback in CI.

## 9. Open items

- Implementation blocked on S1 scaffold + storefront renderer (Playwright, Supabase local stack, edge layer) — see header note.
- bind `theme_render_failed` generation point in the renderer once it exists (crash injection seam), and pin how `theme_snapshot` is routed through the edge in `theme_runtime.md`.
