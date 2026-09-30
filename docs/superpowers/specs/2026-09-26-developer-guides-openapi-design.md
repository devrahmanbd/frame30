# Developer Guides + OpenAPI Design (Approach B, phased)

Date: 2026-09-26. Audience: split — public third-party developers and internal
contributors. Test strategy: scaffold with green tests + submission gates.
OpenAPI: audit → generate from code → hand-maintain as contract with tests.

## 0. Starting evidence (verified 2026-09-26, repo `/tmp/opencode/mainline`)

- No `*openapi*` / `*swagger*` project file exists (only hits are an unrelated
  skill under `.agents/`). API routes live at `src/routes/api/{admin,public}`.
- API prose docs: `docs/13-export-sdk/rest-api.md` (header: `Status: Planning`,
  gate not approved), `api-sdk.md`, `oauth.md`, `README.md` (7 links repaired
  2026-09-26).
- Authoritative post-merge guides: `docs/04-builder/README.md` (runtime),
  `docs/themes/creation.md` (authoring). History: `docs/themes/sdk.md`,
  `packages.md`, `wordpress-handbook-index.md`, 4 `theme-plan-*` files.
- Theme tests exist per theme (`wiring`, `skins`, `preview`, plus `widgets` for
  `songoskriti`) for `songoskriti` + `oceanblue`. Plugin tests exist (`plugin-lifecycle`,
  `plugin-acceptance`, `plugins-consent`, `plugin-bundle-gate`,
  `plugin-emission`, studio `plugin-tray`, `ThemeChrome.plugins`,
  `StudioNodes.plugins`).
- Plugin contract source of truth: `src/lib/plugin-manifest.ts`
  (`BUILDER_API_VERSION`, `PLUGIN_BUDGET`, `SERVER_HOOKS`, `BLOCK_SLOTS`).
- Theme code reality (REPORT-THEMES.md): brands `#1a1a1a` / `#7C2A1A`,
  songoskriti 20-section homepage opening `hero_carousel`, studio twin parity
  (`src/lib/studio/catalog.ts:2418-2429`), persist-shape rule
  (`src/lib/builder-ast.ts`), dashboard-driven songoskriti menus, token-only
  CSS gate.
- Known doc debt (deferred, do NOT silently absorb): `packages.md` phantom
  `src/lib/theme-package.ts`; `creation.md` §1 stale pins; README Phase C
  `theme-presets.ts` phantom.

## 1. Deliverable map

Public (`docs/developers/` — new directory, keeps developer docs separate
from product docs):

- `themes.md` — author → submit → update a theme. Consumes `creation.md` +
  `04-builder/README.md`; adds submission checklist + update/version rules.
- `plugins.md` — manifest, sandbox, hooks, billing/proration reality
  (one-time + trial exists; recurring/proration is a documented gap with the
  `hooksUrl` self-bill workaround — never promise what the engine lacks).
- `api-reference.md` — GENERATED from `openapi/openapi.yaml`, never
  hand-edited (header banner says so).

Internal (`docs/internal/` — new directory):

- `sdk-contracts.md` — builder-ast, studio catalog, preview engine
  invariants with file:line pins; the contract a reviewer checks against.
- `submission-gates.md` — runbook: which suite runs when, who approves,
  kill-switch procedure.

Scaffolds (new): `examples/starter-theme/`, `examples/starter-plugin/`,
each with green vitest suites mirroring the real gates.

Machine-readable (new): `openapi/openapi.yaml` (generated) +
`openapi/overrides/` (hand-written descriptions/examples) + generator script

- CI drift gate + contract tests.

## 2. OpenAPI pipeline

Source of truth is ALWAYS route code (`src/routes/api/*`) plus validation
schemas. The generator emits `openapi/openapi.yaml`; CI compares
regenerated output to the committed file and fails on drift
(regenerate-or-fix, no silent skew). Hand-written content lives ONLY in
`openapi/overrides/` and merges at generation time. Contract tests execute
every documented endpoint against the spec (status codes, envelopes,
auth failures, pagination cursors). Versioning: additive changes only;
breaking changes require a new path version and a migration note in the
public guide. No Swagger UI hosted in-app in Phase 1 (Redoc preview in CI
artifacts only); hosting decision deferred to Phase 3.

## 3. Theme/plugin test design

Scaffold suites mirror — never duplicate — the real gates:

- Starter theme: token-table test (brands match `tokens.ts`), skin-default
  test (rails `editorial`, hero/testimonial overrides), no-hex CSS test,
  twin-parity test (every emitted type resolvable in studio catalog),
  round-trip test (emitted props survive persist).
- Starter plugin: manifest validation test (id regex, budget, slots, hooks
  allow-list), sandbox bridge test (allow-listed messages only),
  lifecycle test (install → consent → enable → kill-switch → uninstall).
- Submission gates = the existing suites plus the scaffold suites, runnable
  via one command (`bun run gates:theme <path>`, `bun run gates:plugin
<path>`). A submission passes when the gate command is green; human
  review covers only what machines cannot (design quality, copy, brand
  safety).

## 4. Guideline style (binding on all new docs)

- Every code claim carries a `file:line` pin verified at HEAD.
- Merchant-facing copy notes bn/en behavior explicitly.
- Examples contain no raw hex (tokens only) and no invented endpoints.
- Descriptive links, never `here`; `**Bold**` for UI, backticks for code;
  American spelling; `bun run prettier --write` on every markdown file.
- Dated audits stay dated (append pointers, never rewrite); living guides
  carry a `Last verified: <date> @ <commit>` header.

## 5. Phase boundaries (each independently shippable)

- Phase 1: API audit report + `openapi/openapi.yaml` generated + CI drift
  gate + Redoc preview + contract-test harness.
- Phase 2: public `themes.md` + `plugins.md` + both scaffolds with green
  tests + `api-reference.md` generation wired.
- Phase 3: internal `sdk-contracts.md` + `submission-gates.md` runbook +
  gate commands + Swagger-hosting decision.

## 6. Non-goals

- No recurring-billing/proration engine (document the gap, do not build it
  here).
- No `validateThemePackage` implementation and no `packages.md` rewrite
  (separate follow-up issues already identified).
- No unrelated refactoring of `src/routes/api` beyond what contract tests
  require (new schemas only where an endpoint is undocumented).
- No in-app Swagger UI in Phase 1.

## 7. Acceptance

- Phase 1: `openapi.yaml` validates with an OpenAPI 3.1 validator; CI
  drift gate green; every `src/routes/api` endpoint appears in the spec or
  in a documented exclusion list with owner + reason.
- Phase 2: a fresh developer clones each scaffold, runs one command, sees
  green; submits it to the gate command, sees green.
- Phase 3: a reviewer can approve or reject a third-party submission using
  ONLY `submission-gates.md` + gate output.
