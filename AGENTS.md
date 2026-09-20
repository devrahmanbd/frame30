# Framique Engineering Rules

> Keep the repository in a clean, working state. All tests and type checks must pass before pushing changes.

## 🔴 TOP PRIORITY — WordPress-Parity CMS Program (Sept 2026)

Framique must feel like WordPress to a merchant: same user experience, same user journey, same theme/plugin/page-builder management, same sidebar system. Reference: WP admin (`/wp-admin/`) — Appearance › Themes (grid, Activate, Live Preview, Delete, Add New), Plugins › Installed Plugins (Activate, Deactivate, Delete, Add New), Pages/Posts lists, Settings, collapsible sidebar sections.

**P0 — Marketplace theme lifecycle (the current gap):**

- Marketplace Install MUST create a **new inactive** `store_themes` row — never mutate the active theme's draft. Record the `marketplace_installs` ledger row.
- Every installed theme card needs **Activate** (switch `is_active`, keep published version coherent), **Live Preview**, and **Delete** (blocked while active; cascade versions/drafts; ledger row to terminal status).
- "Installed" badge logic must follow the active/installed state, not just ledger presence.

**P0 — Plugin lifecycle:**

- Installed plugins need **Activate / Deactivate / Delete** (plugin_state.enabled toggle + row removal + ledger status), matching WP's Installed Plugins table. No dead buttons: every action must have a working server path.

**P1 — Sidebar system:**

- Audit `src/lib/console-nav.ts` + `AdminShell` against the WP menu model: top-level sections with icons, collapsible submenus, current-item highlighting, capability-gated entries. One nav source of truth.

**P1 — Page builder management:**

- Builder versions/drafts/publish/rollback/schedules already exist server-side — expose them consistently (no feature reachable only by RPC).

**Rules for this program:** no action button without a working server path; no fabricated counts/ratings; every new server mutation gets deny + replay + audit coverage per the Testing section below.

## What Framique Is

Framique is a **full-stack cloud hosting service provider** — we do everything: CMS, visual storefront builder, zero-fee commerce engine, payments, courier dispatch, themes, analytics, AI support, and infrastructure. Merchants get a complete storefront at `store.framique.com/<slug>` plus optional custom domains. We handle hosting, databases, auth, CDN, observability, backups, and deployments end-to-end. No third-party app bloat, no per-transaction fees, no vendor lock-in.

## WordPress-Grade CMS Architecture & UX (Priority #1)

Framique must deliver the exact user experience, user journey, and management systems of a full-scale CMS (modeled after WordPress):

1. **Appearance › Themes Management**:
   - **Active Theme**: The current storefront theme must be prominently featured with a "Customize" button (opening the page builder/customizer), version, and author details.
   - **Installed Themes Grid**: Every installed theme must have an instant **Activate** action (swapping the live storefront theme), **Live Preview**, and **Delete** (uninstalling inactive themes).
   - **Theme Directory / Marketplace ("Add New Theme")**: Integrated directory where merchants can browse, filter, search, and 1-click install themes, with the install button immediately changing to **Activate**.
2. **Plugins Management**:
   - **Installed Plugins**: Tabular list view showing active and inactive plugins with toggles: **Activate**, **Deactivate**, **Settings**, and **Delete**.
   - **Plugin Catalog / Marketplace ("Add New Plugin")**: Searchable extension store with 1-click install and instant activation.
3. **Visual Page Builder & Templates**:
   - Visual drag-and-drop page builder seamlessly integrated into Appearance › Customize and Pages table ("Edit with Page Builder").
4. **Hierarchical CMS Sidebar Navigation**:
   - CMS-first sidebar hierarchy: Dashboard, Content (Pages, Posts, Media), Appearance (Themes, Customize, Menus), Plugins (Installed Plugins, Add New), Store (Orders, Products, Customers), Settings.
   - Submenus must support expandable accordion toggles and collapsed hover flyouts matching WordPress admin navigation.

## Stack

- **Runtime**: Bun (ESM, `"type": "module"`)
- **Framework**: TanStack Start + TanStack Router + TanStack React Query
- **Styling**: Tailwind CSS v4 + shadcn/ui (New York style)
- **Backend**: Self-hosted Supabase (Postgres, RLS, GoTrue) + Redis
- **Build**: Vite 8 + Nitro
- **Edge**: OpenResty + ACME TLS, Blue/Green canary deploys
- **Observability**: Prometheus + Grafana + Loki + Sentry (all self-hosted)

## Commands

```bash
bun install && bun run dev        # dev server (port 3000)
bun run lint                      # ESLint
bun run format                    # Prettier
bun run typecheck                 # tsgo --noEmit
bun run test                      # Vitest (unit + contract)
bun run test:contracts            # contract gate only
bun run e2e                       # Playwright (all suites)
bun run e2e:critical              # Playwright (critical suites only)
bun run schema:check              # repo migrations vs live schema
bun run secrets:scan              # secret scanning
bun run gates                     # full release gate suite
bun run gates:release             # perf, seo, a11y, vitals, responsive
bun run a11y:gate                 # axe-core, >= 90 score
```

**Verification order**: `typecheck` → `test` → `test:contracts` → `schema:check` → `gates:release`

## File Conventions

| Pattern               | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `*.functions.ts`      | `createServerFn` wrappers — thin typed RPC boundary only |
| `*.server.ts`         | Server-only code: secrets, DB, Redis, external calls     |
| `*.test.ts`           | Unit/integration tests                                   |
| `*.contract.test.ts`  | Contract tests                                           |
| `src/routes/**/*.tsx` | TanStack Router file-based routes                        |

**Path alias**: `@/*` maps to `./src/*`

## Architecture Rules (non-negotiable)

1. **No client-trusted decisions**: price, discount, stock, tax, entitlement, risk, and role resolve server-side only.
2. **Integer minor units for money**: `amount_minor_int` + `currency_code`. No floats stored, transmitted, or computed.
3. **Secrets never leave the server boundary**: never in error bodies, logs, or metric labels.
4. **RLS on every public table** plus explicit `GRANT`s per role.
5. **No `server-only` import** — use `*.server.ts` naming instead (ESLint enforced).
6. **Append-only audit rows** for every `[A]` action (actor, before, after, reason).

## Testing

- `vitest.config.ts` sets `passWithNoTests: false` — tests are required.
- Test files live next to the code they test in `src/lib/`.
- `[A]` (money, security, tenant isolation) features need deny cases + replay cases + audit assertions, not just happy paths.
- E2E suites: `store_loop`, `admin_loop`, `builder_loop`, `market_loop`, `public_loop`, `failure_loop`, `owner_loop`, `currency_gate`, `fraud_loop`, `ai_support_loop`, `tenant_isolation`.

## CI — CircleCI only (no GitHub Actions)

- **CircleCI is the only CI system.** Never create or edit anything under `.github/` — no Actions workflows, period. The old `gates.yml` was deleted in this migration.
- **Single pipeline file:** all CI lives in `.circleci/config.yml`. Jobs mirror the Commands section: `lint-typecheck` (ESLint + `tsgo --noEmit`), `unit-contract` (Vitest + contract gate), `scan` (blocking secret scan; advisory dep audit), `build` (Vite + Nitro production build), `e2e-critical` (Playwright critical suites).
- **Task-finish rule:** when a task finishes, update `.circleci/config.yml` so the pipeline actually exercises the change — extend the relevant job (test, build, lint, e2e) instead of assuming existing coverage. New suites, scripts, or gates must be wired into a job in the same commit.
- **E2E auto-activation:** the `e2e-critical` job passes by design until `.e2e/playwright.config.ts` lands in the repo, then it installs Chromium (`--with-deps`) and runs `bun run e2e:critical`. Do not "fix" the skip — build the harness instead.
- **Tooling (verified via Context7 against current CircleCI docs):** `circleci/node` orb for Bun (`install-bun: true`, `bun-version: "1.3.14"` pinned like local dev; `install-packages` with `pkg-manager: bun` runs frozen-lockfile installs that honour the `bunfig.toml` 24h supply-chain guard). Executors are `cimg/node:24.21` (there is no `cimg/bun` image) and `cimg/node:24.21-browsers` for E2E.
- Validate config edits with `circleci config validate` (CLI) when available; at minimum keep the YAML parseable and the job list in sync with this section.

## Bun Supply-Chain Guard

`bunfig.toml` enforces a **24h minimum release age** for all npm packages. No bypasses in `minimumReleaseAgeExcludes` without explicit approval. This prevents supply-chain attacks from freshly published malicious packages.

## SEO & Marketing

`SEO/` contains the full semantic SEO vault: keyword research, topical authority maps, content briefs, schema specs, comparison routes, and editorial playbooks. See `SEO/README.md` for the master index.

## Related Docs

- `SYSTEM.md` — architecture, stack decisions, deployment topology
- `BUILD.md` — feature ledger with `[A]` risk markers and testing gates
- `DESIGN.md` — design system tokens and component specs
- `TODO.md` — active execution plan
- `docs/` — per-area planning specs (18 directories)
