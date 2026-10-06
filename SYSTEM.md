# Framique — System

> Single source of record for system architecture, the design system, and the
> decisions behind both. Companion to `AGENTS.md` (how to work here), `BUILD.md`
> (what is built), `ops/README.md` (how it runs), and `docs/` (per-area plans).

---

## 1. What we build

Framique is a **Bangladesh-first ecommerce CMS in the vein of Shopify** —
merchants launch a storefront, manage orders/products/inventory/POS, take
payment (COD / MFS bKash–Nagad–Rocket / bank / BNPL), ship via local couriers,
run promotions and marketing, and extend via themes/widgets. Built docs-first:
every module ships planning → design guidelines → implementation → E2E.

Pillars:

- **Bangla-first** UI and commerce copy; English-safe.
- **BDT (৳)** as the default working currency (optional USD pilot per
  `docs/06-payments/currency.md`); tabular numerals; VAT per legal year.
- **Mobile-first** for BD (Android / 3G); storefront LCP < 2.5s.
- **Self-hosted, zero vendor lock-in.** Every runtime dependency — database,
  auth, cache, queue, metrics, logs, errors — runs on infrastructure we
  control. See §4.
- Trust/safety: WCAG 2.2 AA (AAA on checkout/refund/auth), GDPR-grade consent,
  fraud + ad-integrity as product differentiators.

---

## 2. Repository layout

```
SYSTEM.md               # this file — architecture + design system + decisions
BUILD.md                # flat feature ledger, tiered, with [A] risk markers
TODO.md                 # active phase breakdown
AGENTS.md               # agent operating rules
docs/
  00-meta/              # design-system.md, PLAN.md, README (tree)
  01-architecture … 17-owner-console/
src/
  routes/               # TanStack Start file routes (public, _authenticated, api)
  routes/api/public/*   # unauthenticated HTTP surface (webhooks, cron, metrics)
  lib/*.ts              # pure, isomorphic logic (unit-tested, no I/O)
  lib/*.server.ts       # server-only: DB, Redis, secrets, external calls
  lib/*.functions.ts    # createServerFn wrappers — thin, typed RPC boundary
  components/           # UI kit + per-domain components
supabase/
  migrations/           # 00000000000000_baseline_schema.sql + additive files
  docker/               # pinned upstream self-hosted Supabase distribution
ops/                    # self-hosted platform + observability (see ops/README.md)
.e2e/                   # Playwright suites incl. failure + tenant-isolation
scripts/                # schema drift check, seeders, release gates
```

---

## 3. Technology stack

> Zero vendor lock-in first; raw performance second. Every choice is the
> **current, swappable** implementation of a requirement, replaceable without
> changing contracts, interfaces, or docs.

| Area                                     | Choice                                                                         | Why / swap path                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Frontend                                 | TanStack Start / Query / Router / Table / Form / Virtual                       | SSR + typed file routes; server functions remove a whole API tier           |
| Styling                                  | Tailwind v4 tokens in `src/styles.css` + shadcn variants                       | Tokens only; see §7                                                         |
| Backend data                             | **Self-hosted Supabase** (Postgres, RLS, PostgREST, GoTrue, Realtime, Storage) | Plain Postgres underneath — portable to bare Postgres + our own auth        |
| Server logic                             | `createServerFn` + `src/routes/api/public/*` route handlers                    | No edge-function vendor coupling                                            |
| Cache / idempotency / rate limit / queue | **Self-hosted Redis** (AOF, `noeviction`) + DB-backed fallbacks                | Valkey/KeyDB drop-in; DB fallback keeps correctness if Redis is down        |
| Payments                                 | In-house Go aggregator (MFS sandbox first)                                     | Provider adapters behind one idempotent `charge`/`refund`/`payout` contract |
| Search                                   | Meilisearch (Bangla-normalized)                                                | Postgres FTS fallback path retained                                         |
| Edge                                     | OpenResty + lua-resty-acme (mTLS/ACME), CDN                                    |                                                                             |
| Metrics                                  | **Prometheus** + exporters (node, cAdvisor, redis, postgres, blackbox)         |                                                                             |
| Dashboards                               | **Grafana**, provisioned from git                                              |                                                                             |
| Logs                                     | **Promtail → Loki**                                                            |                                                                             |
| Errors / traces                          | **Self-hosted Sentry** (getsentry/self-hosted)                                 | Envelope transport is ours (`src/lib/telemetry.ts`) — swappable             |
| Alerting                                 | **Alertmanager** → PagerDuty / Slack                                           |                                                                             |
| Perf gate                                | Lighthouse a11y ≥ 90 on release; perf bots                                     |                                                                             |

The platform runs against our self-hosted Supabase and Redis infrastructure
in all environments (development, staging, and production). The application
only reads standard configuration variables: `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `REDIS_URL`.
Nothing in `src/` names or depends on any external managed cloud provider.

---

## 4. Architecture

### 4.1 Runtime topology

```text
                      ┌───────────────────────────────┐
   shopper / merchant │  OpenResty edge (TLS, ACME,    │
        ──────────────▶  CDN, WAF, rate-limit shed)   │
                      └───────────────┬───────────────┘
                                      │
                        ┌─────────────▼─────────────┐
                        │  Framique app (TanStack)  │
                        │  SSR routes + serverFns   │
                        └───┬─────────┬─────────┬───┘
                            │         │         │
              ┌─────────────▼──┐  ┌───▼────┐  ┌─▼───────────────┐
              │ Supabase (self)│  │ Redis  │  │ Go services     │
              │ PG + RLS +     │  │ cache, │  │ payments agg.,  │
              │ Auth + Storage │  │ idem., │  │ rate limiter    │
              └─────────┬──────┘  │ queues │  └─────────────────┘
                        │         └────────┘
                        │
        ┌───────────────▼────────────────────────────────────────┐
        │ Observability: Prometheus • Loki/Promtail • Sentry •    │
        │ Grafana • Alertmanager   (ops/docker-compose.*.yml)     │
        └─────────────────────────────────────────────────────────┘
```

### 4.2 Tenancy

`merchant_id` on every tenant table; RLS enforces isolation with
security-definer helpers (`is_merchant_member`, `has_merchant_role`,
`staff_has`, `is_platform_admin`). Roles live in dedicated tables, never as a
column on a profile. Each merchant gets `store.framique.com/<slug>` plus
optional custom domain. Negative RLS assertions are a test suite, not a hope:
`.e2e/specs/tenant_isolation.spec.ts`.

### 4.3 Server boundary

- `*.ts` — pure logic, isomorphic, unit-tested.
- `*.server.ts` — server-only; secrets read **inside** handlers, never at
  module scope.
- `*.functions.ts` — thin `createServerFn` wrappers: validate (Zod) →
  authorize → rate limit → `withSpan` → call a `.server.ts` implementation →
  map errors to safe codes. No business logic at this layer.
- `src/routes/api/public/*` — the only unauthenticated HTTP surface: webhooks
  (HMAC-verified), cron, metrics, vitals. Verification happens before any
  privileged read or write.

### 4.4 Data flow

Storefront events → event bus (`events` + `outbox`) → analytics ETL →
aggregate views. Webhooks are HMAC-signed with a consumer retry queue and DLQ.
Money is `currency_code` + `amount_minor_int`; charges, refunds, payouts and
POS sync are idempotent through Redis/DB keys, so a replay returns the original
verdict and never a second effect.

### 4.5 Resilience

- Per-isolate TTL cache with stale-while-revalidate and single-flight
  (`src/lib/cache.server.ts`) in front of Redis, so a Redis blip degrades
  latency instead of availability.
- Redis runs `maxmemory-policy noeviction` deliberately: evicting an
  idempotency key would turn a retry into a double charge. We fail loudly and
  page instead.
- Offline POS: local IndexedDB/SQLite shim, sync on reconnect with conflict
  resolution.
- Observability never takes a request down — transport failures are swallowed,
  sends are budgeted, label values bounded.

### 4.6 Storefront composition (Widget / Builder / Theme / Plugin / Runtime)

- **Widget = functionality/data/state/actions.** The closed `SectionType`
  registry is shared by every theme: `WidgetMeta` carries no theme field, so
  a widget authored for one vertical drops into any theme
  (`src/lib/widget-registry.ts:68`, pinned by
  `src/lib/definition-of-done.test.ts:102`).
- **Builder = composition + props + placement.** `parseAst`
  (`src/lib/builder-ast.ts:7463`) rebuilds persisted props field-by-field
  through `coerceProp` (`src/lib/builder-ast.ts:7251`), drops unknown keys,
  and accepts only responsive-capable breakpoint overrides; theme defaults
  merge under authored props via `withThemeWidgetDefaults`
  (`src/lib/builder-ast.ts:873`). Save → reload is byte-stable
  (`src/lib/builder-lifecycle.contract.test.tsx:108`).
- **Theme = presentation.** Three registries, all first-wins / never-throw /
  fallback-safe: `themeKey × widgetType` (`registerThemePresentation` in
  `src/lib/theme-presentations.ts:35`, resolved in
  `src/components/builder/SectionRenderer.tsx:272`); `themeKey × pluginKey`
  for themeable community widgets (`registerCommunityPresentation` in
  `src/lib/plugin-theme-contract.ts:165`); chrome surfaces (header shell via
  the `mega_menu` pair in `src/components/store/StoreHeader.tsx:316` with
  `GenericHeaderShell` fallback in `src/components/store/StoreHeader.tsx:840`,
  announcement in `src/components/store/StoreHeader.tsx:338`, menu rows via
  `src/lib/menus/menu.ts:427`, footer global blocks via
  `src/lib/builder-ast.ts:6555`). Theme CSS is token-only (`var(--theme-*)`,
  gated in `src/lib/themes/songoskriti/skins.test.ts:182`).
- **Plugin = extension.** Class A (isolated) renders in the sandboxed island
  and never dresses; Class B (themeable) declares the versioned
  schema/data/actions/slots/states contract and renders through the theme
  presentation when dressed, the generic island when not
  (`src/lib/plugin-theme-contract.ts:6`, `:58`, `:266`). Menu swaps need both
  `replace_menus` scope and review approval and fail open to theme markup
  (`decideMenuRenderer` in `src/lib/plugin-manifest.ts:102`,
  `selectPluginMenuRenderer` in `src/lib/plugin-menu-renderers.ts:120`).
- **Runtime = platform services.** Flow: AST → widget/plugin contract →
  active theme → theme presentation → storefront. No theme branches in shared
  code: registries name no theme and branch on no theme
  (`src/lib/theme-presentations.ts:18`,
  `src/lib/theme-presentations.test.tsx:194`), enforced alongside the renderer
  gate in `src/lib/definition-of-done.test.ts:138`.

---

## 5. Observability (self-hosted)

Configuration and bring-up: `ops/README.md`. Contract:

| Signal          | Produced                                                                             | Transported                      | Retention        |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------- | ---------------- |
| Metrics         | `incr`/`setGauge`/`observe`, exposed at `/api/public/metrics` behind `METRICS_TOKEN` | Prometheus scrape, 30s           | 30d / 20GB       |
| Logs            | `log()` — PII-scrubbed JSON on stdout with `trace_id`/`span_id`                      | Promtail (docker SD) → Loki      | 30d              |
| Errors & traces | `withSpan` / `withRequestTrace` → envelopes                                          | direct to self-hosted Sentry     | per Sentry quota |
| Alerts          | `alerts.rules.yml`, `slo.rules.yml`, `infra.rules.yml`                               | Alertmanager → PagerDuty / Slack | —                |

Correlation is the design goal: Grafana panel → Loki lines → `trace_id`
derived field → Sentry trace, in three clicks and no context switch.

Rules that keep the stack honest:

- Counters are per-isolate and monotonic only within an isolate — always
  `sum(rate(...))` across instances.
- Label cardinality is bounded (route, outcome, status class, widget type).
  Identifiers stay in log bodies or structured metadata, never in labels.
  `framique_metrics_dropped_series > 0` is a bug, not a capacity signal.
- `severity=page` is reserved for user-visible loss or imminent data risk;
  everything else is a ticket. Every rule carries a `runbook` annotation.
- The observability stack observes itself: exporter down, Loki ingestion
  stalled, Promtail dropping, Alertmanager failing to deliver.

SLOs: storefront availability 99.9%; P95 checkout settle < 2.5s; ingest→visible
analytics lag < 5m. Burn-rate rules drive the page, not raw error counts.

---

## 6. Security

- RLS on every public table plus explicit `GRANT`s per role; no policies means
  locked, and a table without grants is a runtime failure by design.
- No client-trusted decisions: price, discount, stock, tax, entitlement, risk
  and role resolve server-side only.
- Secrets never leave the server boundary and never appear in error bodies,
  logs, or metric labels; `scrubPayload`/`scrubText` run on every log line.
- Service-role access is privileged-only and loaded inside handlers after the
  caller is verified — never used as the default Data API client.
- Append-only audit rows (actor, before, after, reason) for every `[A]` action.
- Backups hourly with tested restore drills; migrations are forward + rollback
  tested in CI and never auto-rolled-back in production.

---

## 7. Design system

Full token table and component specs: `docs/00-meta/design-system.md`. The
invariants:

- **Tokens only.** Colour, gradient, shadow, radius and spacing values are
  semantic tokens in `src/styles.css`, consumed through shadcn variants. No
  `text-white`, no `bg-[#...]`, no hardcoded hex in components — that is how
  dark mode and per-merchant theming break.
- **Palette**: teal (primary), blush (accent), bondhu amber (highlight/promo),
  mint (success). Never invent a colour; extend the token set instead.
- **Typography**: Bangla display font required on at least one surface per
  theme; tabular numerals everywhere money appears; Bangla and English must
  render at the same optical size without layout shift.
- **Money**: `fmtBDT`/`fmtMoney` helpers only, `docs/06-payments/currency.md`
  §4. Never format money inline.
- **Accessibility**: WCAG 2.2 AA baseline, AAA on checkout, refund and auth.
  Focus is always visible; every interactive element is keyboard reachable;
  target ≥ 44px on mobile.
- **Mobile-first**: layouts designed at 360px and grown up, not squeezed down.
  Skeletons, not spinners; optimistic UI only where a rollback is safe.
- **Per-page truth**: each page's README "Design guidelines" section governs
  that page and beats general preference.

---

## 8. Decision record (why it is like this)

| #   | Decision                                           | Rationale                                                                                        | Cost accepted                                                   |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| D1  | Self-host everything                               | BD data residency, predictable cost in BDT, no provider can revoke our platform                  | We carry patching, capacity and on-call                         |
| D2  | Supabase self-hosted rather than bare Postgres     | RLS + Auth + Storage + Realtime in one pinned distribution; still plain Postgres underneath      | Upgrade cadence must be managed by us                           |
| D3  | RLS as the isolation mechanism                     | Isolation enforced by the database, not by remembering a `WHERE` clause                          | Policies must be tested (98 negative assertions)                |
| D4  | Integer minor units for money                      | Floats lose paisa and lose trust                                                                 | Every boundary must convert explicitly                          |
| D5  | Redis `noeviction`                                 | A dropped idempotency key is a double charge                                                     | Memory pressure pages instead of degrading silently             |
| D6  | `createServerFn` over edge functions               | Same language, same types, same repo, no vendor runtime                                          | Must keep function files thin so bundle splitting stays correct |
| D7  | Prometheus/Loki/Sentry self-hosted                 | Full-fidelity retention with no per-seat or per-event billing pressure on debugging              | We run the stack and its own alerts                             |
| D8  | Logs as JSON with trace ids                        | Correlation across three signals without a vendor APM                                            | Log lines must be produced through `log()`, never `console.log` |
| D9  | Bounded label cardinality                          | A cardinality explosion takes out monitoring exactly when it is needed                           | Some queries need `                                             | json` at read time instead of a label |
| D10 | Docs-first, gate-per-module                        | Ambiguity is caught before code, and `[A]` work ships with failure suites                        | Slower first commit, far fewer regressions                      |
| D11 | Immutable Docker artifacts with Blue/Green standby | Zero runtime drift, instant rollback to previous known-good image                                | Double compute overhead during deployment                       |
| D12 | Expand-and-Contract database migrations            | Backward-compatible schema evolution; zero downtime during DB changes                            | Requires 3 to 4 sequential releases per structural change       |
| D13 | Tenant-cohort canary deployment                    | Blast radius containment; prevents bad release from impacting thousands of stores                | Traffic router must inspect tenant context or cookie headers    |
| D14 | Time-Machine backup snapshots & continuous PITR    | Instant rewind if disk corrupts or deployment fails; RPO = 0, RTO < 15m                          | Storage overhead for WAL archiving and base backups             |
| D15 | ML training data immunity & decoupling shield      | User/merchant deletion never cascades to ML training data; PII-redacted AI assets stay permanent | Relational FKs set to null; surrogate cohort hashes maintained  |

---

## 9. How to run and verify

```bash
bun install && bun run dev            # app
docker network create framique
docker compose --env-file ops/.env -f ops/docker-compose.platform.yml      up -d
docker compose --env-file ops/.env -f ops/docker-compose.observability.yml up -d
(cd supabase/docker && docker compose up -d)   # self-hosted Supabase

bun run test         # unit + contract suites
bun run schema:check # repo migrations vs live schema fingerprint
```

Verification gates before claiming a flow complete: both `store_loop` and
`admin_loop` E2E suites green, Lighthouse a11y ≥ 90, no new
`framique_metrics_dropped_series`, and the owning doc's testing gate ticked in
`BUILD.md`.

---

## 10. Zero-Downtime SaaS CMS Deployment, Database Evolution & Time-Machine Resilience

For a high-concurrency, multi-tenant Cloud SaaS CMS running thousands of merchant storefronts (in the vein of Shopify and WordPress VIP), releases cannot rely on single-step "all or nothing" cutovers. A bug that surfaces only under live customer traffic and shopper checkouts must never take down every merchant simultaneously.

The Framique production deployment topology unifies **Immutable Container Artifacts**, **Blue/Green Environment Standbys**, **Traffic-Shifting Canaries**, **Tenant-Aware Cohorts**, **4-Stage Expand-and-Contract Database Migrations**, **Time-Machine Continuous Backup Snapshots**, and a strict **ML Data Immunity Shield**.

```
Git Push / Tag
 │
 ▼
CI/CD Pipeline (Lint, Tests, Contract Verification)
 │
 ▼
Build Immutable Artifact (Docker Image tagged with git-commit-SHA)
 │
 ▼
Deploy to GREEN (Target Environment)
 │
 ├── 1. Automated Health Probes (/api/healthz readiness)
 ├── 2. Automated Headless Smoke Tests (E2E cart, checkout, auth)
 ├── 3. Cache Pre-Warming (Redis product, theme, config catalogs)
 ├── 4. DB Compatibility Checks (Active schema matches both versions)
 └── 5. Time-Machine Backup Snapshot Hook (pg_basebackup + WAL checkpoint)
 │
 ▼
Canary Traffic Shifting (Weighted Edge Router / OpenResty / Envoy / Cloudflare)
 │
 ├── 1% Traffic   (10-minute soak; zero 5xx or unhandled Sentry errors)
 │    ▼
 ├── 5% Traffic   (15-minute soak; checkout completion & courier latency)
 │    ▼
 ├── 25% Traffic  (30-minute soak; DB pool stability & Redis overhead)
 │    ▼
 └── 100% Traffic (Global promotion to GREEN)
 │
 ▼
Keep BLUE Alive on Standby (Zero-Downtime Instant Rollback Gate)
```

---

### 10.1 Why Canary Blue/Green Beats Plain Blue/Green

Plain Blue/Green switching provides:

- Zero downtime during standard cutover
- Instant rollback to the previous cluster
- Conceptual simplicity

**The Fatal Flaw of Plain Blue/Green**:
Imagine a subtle defect or database lock issue that only manifests under real, concurrent customer traffic, live carrier webhooks, or high-volume payment callbacks. If 100% of traffic is switched to the new environment at once, **every single tenant is impacted simultaneously**. A bad deployment immediately triggers a company-wide, customer-facing outage across all stores.

**The Large-SaaS Release Combination (Shopify / WordPress VIP Standard)**:
Large-scale SaaS platforms avoid catastrophic releases by combining:

1. **Blue/Green infrastructure** (two warm, identical production clusters).
2. **Canary traffic shifting** (gradual percentage-based traffic routing).
3. **Tenant-aware cohort controls** (deploying to internal and pilot stores first).
4. **Feature flags** (decoupling code deployment from feature exposure).
5. **Expand-and-contract database migrations** (allowing old and new code to run concurrently).
6. **Automated circuit breakers and instant rollback** (reverting traffic in milliseconds if error thresholds breach).

This combination provides instant rollback capability while strictly bounding the **blast radius** of any release.

---

### 10.2 Tenant-Level Canary Rollouts (Cohort-Based Deployment)

Instead of (or in combination with) purely random percentage-based routing, Framique supports **Tenant-Level Canary Cohorts**. This deploys changes by customer group before touching the broader merchant base:

```
Internal Team & Dogfooding Stores
 │
 ▼
10 Beta Customers
 │
 ▼
100 Early-Adopter Stores
 │
 ▼
1,000 Production Stores
 │
 ▼
10,000+ Stores (All Merchants / Global)
```

1. **Routing Mechanism**: The edge router (OpenResty, Envoy, or Cloudflare Worker) inspects the store subdomain/slug or authenticated tenant context header (`X-Merchant-Id` / `X-Tenant-Cohort`).
2. **Blast Radius Containment**: If customer #17 uncovers an edge-case bug (e.g. an unexpected courier payload format or MFS callback timeout), rollout automatically stops before affecting the remaining thousands of merchants.
3. **Rollback Velocity**: Reverting a tenant cohort is instantaneous by repointing the router mapping back to the stable BLUE cluster.

---

### 10.3 Expand-and-Contract Database Migrations (The 4 Safe Releases)

> **"The hardest part isn't the application — it's the database."**  
> Most outages during "zero downtime" deployments happen because of schema changes.

Framique enforces a strict **4-Stage Expand-and-Contract Migration Sequence** across separate releases, ensuring that Version N (BLUE) and Version N+1 (GREEN) execute simultaneously against the exact same PostgreSQL database without query failures, lock contention, or data corruption:

```
Release 1: Expand       Release 2: Dual-Write       Release 3: Read New       Release 4: Contract
(Schema Additions)      (Old + New Active)         (Cutover Reads)           (Prune Deprecated)
 ┌───────────────┐       ┌───────────────┐          ┌───────────────┐         ┌───────────────┐
 │ + new_column  │       │ write: old    │          │ write: new    │          │ DROP old_col  │
 │ (nullable/def)│ ────> │ write: new    │  ─────>  │ read:  new    │ ─────>   │               │
 │ KEEP old_col  │       │ read:  old    │          │ Backfill runs │         │ ONLY new left │
 └───────────────┘       └───────────────┘          └───────────────┘         └───────────────┘
```

1. **Release 1 (Expand)**:
   - Add new columns, new tables, or new indexes.
   - All new columns must be `NULLABLE` or have a database-level `DEFAULT`.
   - **Do not remove or alter old columns or tables.**
   - Old code (running on BLUE) ignores the new columns; zero queries break.
2. **Release 2 (Dual-Write)**:
   - Deploy code that writes simultaneously to both the legacy schema and the new schema.
   - Reads continue from the stable legacy schema.
   - Both old and new structures remain in sync during the transition.
3. **Release 3 (Read-New & Backfill)**:
   - Background migration workers asynchronously backfill historical rows from legacy columns to new columns in bounded chunks (500 rows/batch with lock timeouts).
   - Application switches reads exclusively to the new schema.
   - The platform is now fully running on the new architecture.
4. **Release 4 (Contract)**:
   - Executed only after 100% of instances, canaries, and background workers have been upgraded and BLUE is retired.
   - Safe cleanup migration drops deprecated legacy columns, unused triggers, and temporary tables.

---

### 10.4 Core Production Infrastructure Stack

| Component                        | Technology                              | Role & Specification                                                                                           |
| :------------------------------- | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| **Container Orchestration**      | **Kubernetes** (or **HashiCorp Nomad**) | Schedules, auto-heals, and scales isolated container pods with declarative health probes.                      |
| **Environments**                 | **Blue & Green Pod Clusters**           | Dual active/standby clusters ensuring zero cold starts and instant rollback capability.                        |
| **Load Balancer & Edge**         | **OpenResty / Envoy / Cloudflare**      | Weighted canary traffic shifting, SNI SSL termination, automated ACME certificates, and tenant cohort routing. |
| **Immutable Artifacts**          | **Docker Container Images**             | Built in CI, pinned by immutable git commit SHA (`framique:sha-${GIT_SHA}`), zero runtime file mutation.       |
| **Data Tier**                    | **PostgreSQL (Supabase self-hosted)**   | Row Level Security (RLS) enforcement, multi-tenant isolation, ACID transaction guarantees.                     |
| **Cache & Realtime**             | **Redis (`noeviction`)**                | Dynamic configuration cache, distributed pub/sub invalidation, idempotency token store.                        |
| **Feature Flags**                | **Tenant-Scoped Flag Engine**           | Decouples code deployment from user-facing feature exposure per merchant.                                      |
| **Background Migration Workers** | **Chunked Asynchronous Workers**        | Non-blocking historical row backfills respecting database load and lock timeouts.                              |
| **Automatic Health Checks**      | **HTTP `/api/healthz` Probes**          | Pre-promotion validation of DB connection pool, Redis cache, and memory thresholds.                            |
| **Automatic Rollback**           | **Circuit Breaker Monitor**             | Instant reversion to BLUE (< 500ms) if 5xx error rate > 0.5% or p99 latency > 800ms.                           |
| **Tenant-Aware Controls**        | **Cohort Routing Middleware**           | Directs requests by tenant ID or slug (`internal → 10 → 100 → 1,000 → all`).                                   |

---

### 10.5 Whole-System Time-Machine Backup & Bare-Metal Restore Architecture (Disaster-Proof & Theft-Immune)

> **"Like a Time Machine"**: A continuous, 100%-verified recovery engine that captures the **entire system at that exact point in time**. If a production server is destroyed, confiscated, or stolen, an identical system can be reconstituted onto empty hardware anywhere in the world in under 15 minutes with zero data loss.

```
                  ┌────────────────────────────────────────────────────────┐
                  │       WHOLE-SYSTEM TIME-MACHINE SNAPSHOT SCOPE         │
                  ├────────────────────────────┬───────────────────────────┤
                  │ 1. PostgreSQL Cluster      │ Complete dump & globals   │
                  │    - Global Roles & Grants │ roles.sql (passwords/ACL) │
                  │    - GoTrue Auth Schema    │ auth.users, sessions, MFA │
                  │    - Storage Engine Schema │ storage.buckets & objects │
                  │    - Public Multi-Tenant   │ merchants, products, orders│
                  │    - Cryptographic Vault   │ vault, pgsodium, secrets  │
                  ├────────────────────────────┼───────────────────────────┤
                  │ 2. Supabase Storage Assets │ /var/lib/storage (zstd)   │
                  │    - Merchant product imgs │ Original & WebP assets    │
                  │    - Theme & builder files │ Custom templates & assets │
                  ├────────────────────────────┼───────────────────────────┤
                  │ 3. Configuration & State   │ Edge configs & certs      │
                  │    - OpenResty & ACME TLS  │ SSL keys & certificates   │
                  │    - Redis Dynamic State   │ Canary, limits, idem keys │
                  │    - Docker & Compose Spec │ Immutable topologies      │
                  └────────────────────────────┴───────────────────────────┘
                                       │
                                       ▼
                  ┌────────────────────────────────────────────────────────┐
                  │        CLIENT-SIDE ENVELOPE ENCRYPTION (AES-256)       │
                  │ (Theft Immunity: stolen physical hardware reveals 0 B) │
                  └────────────────────────────────────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
        ┌───────────────────────┐             ┌───────────────────────┐
        │  Local Storage (ZFS)  │             │ Multi-Cloud WORM S3   │
        │  Rolling 14-Day Disk  │             │ Immutable Object Lock │
        └───────────────────────┘             └───────────────────────┘
                    │
                    ▼
        ┌─────────────────────────────────────────────────────────────┐
        │        MANDATORY REHEARSAL RESTORE GATE ("No Rumours")      │
        │ - Spins up isolated sandbox stack (`framique-restore`)      │
        │ - Verifies all SHA-256 checksums against signed manifest    │
        │ - Restores roles, auth schema, storage objects, and tables  │
        │ - Asserts auth login readiness and table row counts         │
        │ - ONLY marks backup CERTIFIED if 100% assertions pass       │
        └─────────────────────────────────────────────────────────────┘
```

#### 1. Scope of the Whole-System Snapshot

A true disaster-proof backup is never just an application-level SQL dump of `public` tables. If the server is lost, an operator must be able to spin up a clean Linux host and restore 100% of state:

1. **PostgreSQL Complete Cluster (`db_cluster.dump` & `roles.sql`)**:
   - `roles.sql`: All database roles, passwords, grants, and connection limits (`pg_dumpall --roles-only`).
   - `db_cluster.dump`: Full database in custom format (`-Fc`) containing:
     - `auth`: GoTrue credentials, encrypted passwords, user IDs, active refresh tokens, and MFA keys.
     - `storage`: Storage bucket metadata, file names, access policies, and size records.
     - `public`: Tenant storefronts, catalog items, orders, financial ledger entries, and audit logs.
     - `vault` / `pgsodium`: Encryption keys and platform secrets.
   - Continuous WAL archiving (`pg_receivewal`) streaming write-ahead logs to secondary storage, enabling second-by-second Point-in-Time Recovery (PITR).
2. **Supabase Storage Objects (`storage.tar.zst`)**:
   - Physical archive of `/var/lib/storage` containing all merchant product photos, theme assets, invoices, and builder templates compressed using `zstd -T0`.
3. **Configurations, SSL Certificates & Edge State (`configs.tar.zst`)**:
   - OpenResty NGINX configuration, ACME account tokens, dynamic SSL private keys and Let's Encrypt certificates.
   - Docker Compose manifests and environment templates.
4. **Redis Dynamic Runtime State (`redis.rdb`)**:
   - Snapshots of Redis capturing active tenant rate-limiting states, idempotency fast-path cache, and canary cohort weights.
5. **Cryptographic Manifest (`manifest.json`)**:
   - SHA-256 hashes of every artifact, table row counts, `auth.users` count, Git commit SHA, timestamp, and duration.

#### 2. Server Loss & Hardware Theft Defense (Client-Side Envelope Encryption)

- **The Threat**: Physical server seizure, data center burglary, or stolen backup drives.
- **The Defense**: All backup artifacts are encrypted client-side using authenticated symmetric encryption (AES-256-GCM / ChaCha20-Poly1305 via `openssl` or `age`) before leaving RAM or hitting disk.
- **Key Separation**: The encryption uses a master key derived from an off-host secret or asymmetric public key. The private decryption key is **never stored on the application server**; it resides exclusively in an off-site physical security vault / hardware KMS.
- **Outcome**: A stolen server or exfiltrated backup drive yields zero readable plaintext rows, zero passwords, and zero customer data.

#### 3. 100% Restore Guarantee (The Rehearsal Gate)

> **"A backup nobody has restored is a rumour."**

- Every backup snapshot executed by the platform (hourly WAL checkpoints and nightly full snapshots) must undergo an automated **Rehearsal Restore** before it is declared valid.
- The rehearsal script (`ops/backup/rehearse.sh`):
  1. Launches an isolated throwaway Docker Compose stack (`COMPOSE_PROJECT_NAME=framique-restore`).
  2. Verifies cryptographic SHA-256 checksums of every component in `manifest.json`.
  3. Restores global roles, database schemas (`auth`, `storage`, `public`), and data.
  4. Restores storage files and verifies filesystem integrity.
  5. Executes automated read-back assertions:
     - `auth.users` count matches snapshot expectations.
     - Core business tables (`merchants`, `products`, `orders`, `order_items`, `payments`) are verified and non-empty.
     - PostgREST query test succeeds through the restored gateway.
  6. Measures precise **RTO** (Recovery Time Objective) and **RPO** (Recovery Point Objective).
  7. Tears down the sandbox stack and appends the certified verdict to `ops/backup/rehearsals.jsonl`.
  8. If any assertion fails, the backup is marked `INVALID`, an alert is dispatched, and traffic promotion is blocked.

#### 4. Cold-Metal Bare-Metal Recovery Runbook (< 15 Minutes)

If the entire server or hosting region is lost, the recovery procedure on a clean machine is completely deterministic:

1. **Provision Clean Host**: Standard Ubuntu/Debian Linux with Docker and `zstd` installed.
2. **Fetch Encrypted Snapshot**: Pull the latest certified backup set from the off-site WORM object store (`rclone copy s3:framique-backups/latest /var/backups/framique/latest`).
3. **Decrypt with Vault Key**: `openssl enc -d -aes-256-gcm` using the off-site master key.
4. **Execute 1-Click Restore**:
   ```bash
   ops/backup/restore.sh /var/backups/framique/latest --force
   ```
5. **Continuous PITR Replay (Optional)**: If recovering from corruption, replay WAL logs up to the exact target second:
   ```bash
   ops/backup/time-machine-snapshot.sh latest restore-pitr '2026-09-18 14:30:00 UTC'
   ```
6. **Bring Up Blue/Green Clusters**:
   ```bash
   docker compose -f ops/docker-compose.blue-green.yml up -d
   ```
7. **DNS Switchover**: Repoint domain A/AAAA records to the new host IP. System is 100% restored.

---

### 10.6 Disaster-Proof Blue/Green Deployment Algorithm

To guarantee that deployments **never fail** and cannot cause unexpected outages, Framique enforces an automated, gated 4-phase rollout pipeline:

```
[Phase 0: Pre-Promotion Zero-Failure Gate]
  ├── 1. Automated Health Probes (/api/healthz readiness, DB pool, Redis latency)
  ├── 2. Automated Headless Smoke Suite (Cart, checkout, store render, merchant auth)
  ├── 3. Expand-and-Contract DB Invariant Verification (Zero backward-incompatible DDL)
  └── 4. Mandatory Pre-Deployment Time-Machine Snapshot & Verified Rehearsal Drill
       │
       ▼ (Pass: 100% checks green; Fail: Release ABORTED, traffic untouched)
[Phase 1: Progressive Canary Shifting & Blast-Radius Containment]
  ├── Stage 1: 1% Traffic   (10m soak; internal & dogfood stores)
  ├── Stage 2: 5% Traffic   (15m soak; pilot merchant cohort)
  ├── Stage 3: 25% Traffic  (30m soak; broad production load)
  └── Stage 4: 100% Traffic (Global promotion to GREEN)
       │
       ▼ (Automated Circuit Breaker: 5xx > 0.5% OR p99 > 800ms)
       │ ──> INSTANT ROLLBACK (< 500ms) to warm BLUE standby
       ▼
[Phase 2: Post-Cutover Warm Standby & Graceful Draining]
  ├── Keep previous slot (BLUE) on warm standby for 60-120 minutes
  ├── Graceful TCP connection draining (zero dropped requests)
  └── Selective edge cache purge of modified storefront paths
```

1. **Pre-Promotion Zero-Failure Gate**:
   - Release candidates deployed to GREEN are subjected to rigorous synthetic smoke tests, database connection pool validation, and readiness probes.
   - **Snapshot Checkpoint**: A full-system backup snapshot must be taken and pass rehearsal restore verification before the canary gate will open.
2. **Canary Shifting with Sub-Second Circuit Breaker**:
   - Traffic splits gradually using OpenResty weighted upstreams.
   - If error rates exceed 0.5% or latency exceeds 800ms, Prometheus alerting and the internal circuit breaker trip, rolling back to BLUE in under 500ms.
3. **Warm Standby Retention**:
   - The previous environment is maintained warm and ready for instant fallback throughout the soak window.
   - Dual-version database compatibility guarantees that rolling back never corrupts newly written records.

### 10.7 ML & AI Training Data Immunity & Decoupling Shield

> **Core Invariant**: **If a user, customer, or merchant is deleted from normal/transactional tables, all ML training data, model trajectories, and fine-tuning datasets MUST REMAIN PERMANENTLY SAFE AND IMMUNE from deletion.**

In a commercial SaaS platform, merchants close stores, users delete accounts, and GDPR "Right to Erasure" requests are processed regularly. In standard relational designs with `ON DELETE CASCADE`, deleting a merchant or customer would wipe out valuable AI training turns, CSAT ratings, preference pairs, and RL reward trajectories.

Framique solves this via the **ML Data Immunity & Decoupling Shield**:

```
Transactional Database (Volatile)                ML Training Flywheel (Immutable / Permanent)
┌─────────────────────────────────┐               ┌──────────────────────────────────────────┐
│ public.merchants                │               │ public.ai_training_conversations         │
│  - id: 550e8400...              │               │  - id: gen_random_uuid()                 │
│  - store_slug: "fashion-bd"     │               │  - merchant_id: NULL (ON DELETE SET NULL)│
│  [DELETED / PURGED]             │ ──(FK unlink) │  - merchant_cohort_hash: "sha256:e3b0..."│
└─────────────────────────────────┘               │  - anonymized_actor_token: "tok_8f91..." │
                                                  │  - user_turn: "[PII-scrubbed text]"      │
┌─────────────────────────────────┐               │  - agent_reply: "[PII-scrubbed text]"    │
│ public.customers / users        │               │  - reward_score: 0.88                    │
│  - id: customer_99              │               │  - csat_rating: 5                        │
│  - phone: "01712345678"         │               │  - created_at: 2026-09-10T...            │
│  [DELETED / PURGED]             │               └──────────────────────────────────────────┘
```

1. **Foreign Key Decoupling (`ON DELETE SET NULL`)**:
   - `merchant_id` and `conversation_id` in `ai_training_conversations` use `ON DELETE SET NULL` instead of `CASCADE`.
   - Deleting a merchant, store, or customer record never deletes any training row.
2. **Synthetic Surrogate Cohort Hashes**:
   - Each training turn records an immutable `merchant_cohort_hash` (e.g. hashed merchant category/tier) and `anonymized_actor_token`.
   - When the relational merchant record is deleted, ML model trainers retain category and cohort context without referencing any deleted relational entity.
3. **Deterministic PII Sanitization at Entry**:
   - All inbound shopper queries and outbound agent replies are scrubbed of phone numbers, emails, credit cards, OTPs, and personal names via `redactPii()` before insertion.
   - Because no personal data exists in `ai_training_conversations`, the dataset complies fully with GDPR Article 17 ("Right to Erasure") and privacy regulations without needing to destroy training data.
4. **Permanent Flywheel Assets**:
   - Fine-tuning datasets (SFT ChatML/ShareGPT exports), DPO preference pairs (`{prompt, chosen, rejected}`), and RL reward trajectories remain permanent platform intelligence assets.

---

## 11. Framique AI Action Support Agent Architecture (OpenRouter Nemotron, Tool Actions & Continuous Data Flywheel)

> **Core Objective**: Provide an intelligent, grounded, and authoritative **Action Agent** for **Framique** (our multi-tenant Cloud Commerce CMS and headless platform) powered by OpenRouter's free Nvidia models, executing typed in-chat actions (ticket creation, callback scheduling, CSAT feedback) while continuously streaming anonymized conversational trajectories into a training data flywheel.

```
                      ┌────────────────────────────────────────┐
                      │ Storefront Widget / Admin Console Chat │
                      └───────────────────┬────────────────────┘
                                          │ Ask Question / Action
                                          ▼
                      ┌────────────────────────────────────────┐
                      │  Rate Limiting & Inbound Guardrails    │
                      │   (Prompt injection, jailbreak defense) │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │    PII Redaction & Sanitization Engine │
                      │   (BD phone, email, card numbers scrub)│
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │     Framique Action Agent Controller    │
                      │  (ReAct Cycle / Tool Execution Engine) │
                      └───────┬────────────────────────┬───────┘
                              │                        │
            ┌─────────────────┴────────┐      ┌────────┴─────────────────┐
            │  Knowledge Base Search   │      │    Typed Action Tools    │
            │  (pgvector / Llama Embed)│      │  (Tickets, Callbacks, CSAT)
            └─────────────────┬────────┘      └────────┬─────────────────┘
                              │                        │
                              ▼                        ▼
                      ┌────────────────────────────────────────┐
                      │      OpenRouter LLM Gateway            │
                      │  Primary: nemotron-3-ultra-550b:free   │
                      │  Fallback: nemotron-3.5-lightning:free │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │   Outbound Guardrails & Hallucination  │
                      │   Check (Verify against retrieved docs)│
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │       Storefront Widget UI Response     │
                      │ (Reply + Action Cards + CSAT Feedback) │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │   Continuous RLHF Training Flywheel    │
                      │  (ai_training_conversations, DPO/JSONL)│
                      └────────────────────────────────────────┘
```

---

### 11.1 Model Stack & OpenRouter Dynamic Gateway

The agent utilizes OpenRouter free tier models to maintain zero marginal inference cost while delivering state-of-the-art enterprise reasoning:

| Layer                      | Model / Endpoint                                         | Role & Specifications                                                                                              |
| :------------------------- | :------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| **Primary Chat Reasoning** | `nvidia/nemotron-3-ultra-550b-a55b:free`                 | 550B ultra-scale reasoning model for deep multi-turn support, intent parsing, and tool argument extraction.        |
| **Provider Fallback Tier** | `nvidia/nemotron-3.5-lightning:free` / `openrouter/free` | Automated fallback circuit in case upstream Nvidia provider instances encounter transient 404/502 outages.         |
| **Vector Embeddings**      | `nvidia/llama-nemotron-embed-vl-1b-v2:free`              | High-accuracy dense semantic vector embeddings for Framique CMS knowledge base indexing and retrieval.             |
| **Gateway URL**            | `https://openrouter.ai/api/v1`                           | OpenAI-compatible unified REST interface with streaming support.                                                   |
| **API Key Management**     | Dynamic Admin Vault (`platform_dynamic_config`)          | Dynamic hot-swappable key configuration from the Admin Dashboard; zero static `.env` dependencies; sealed at rest. |

---

### 11.2 Brand Identity & Product Scope (Framique)

The agent operates strictly as the **Official Framique Support Agent** with deep domain grounding in:

1. **Framique CMS Core**: Multi-tenant merchant architecture, visual page builder (AST-based), themes, sections, and global blocks.
2. **Catalog & Inventory Management**: Products, variants, SKU tracking, low-stock alerts, and category hierarchies.
3. **Bangladeshi Commerce & Payments**: Native checkout flows, bKash (merchant checkout + direct tokenized payment), Nagad, SSLCommerz, Shurjopay, and Cash on Delivery (COD).
4. **Bangladeshi Courier Logistics**: Real-time integration with SteadFast, Pathao, RedX, and Paperfly parcel booking, tracking, and automated consignment generation.
5. **SEO & High-Performance Storefronts**: Schema.org JSON-LD generation, Core Web Vitals optimization, server-rendered dynamic tags, sitemaps, and robots.txt.
6. **Platform APIs & Extensibility**: Webhooks, REST API endpoints, API key authentication, and audit logs.

---

### 11.3 Typed Action Tools & Execution Cycle

The Framique Support Agent is an active ReAct agent that evaluates customer intent and invokes real operational tools:

```typescript
// Core Action Tools Registry
export const SUPPORT_TOOLS = {
  // 1. Order and Tracking Lookup (Pinned Read-Only)
  lookup_order: {
    description:
      "Look up order status, items, payment state, and courier tracking details",
    parameters: { orderNumber: "string", phone: "string" },
  },

  // 2. Support Ticket Creation (Automated & Customer-Triggered)
  create_support_ticket: {
    description:
      "Open an official support ticket in Framique Support Desk with SLA assignment",
    parameters: {
      subject: "string",
      description: "string",
      priority: "low" | "normal" | "high" | "urgent",
      category: "billing" | "courier" | "payment" | "technical" | "general",
    },
  },

  // 3. Callback Request Form
  request_callback: {
    description:
      "Schedule a high-touch telephone callback with a Framique human specialist",
    parameters: {
      customerName: "string",
      contactPhone: "string", // BD format +8801...
      preferredWindow: "morning" | "afternoon" | "evening",
      issueSummary: "string",
    },
  },

  // 4. Chat Satisfaction Rating & Review
  rate_chat_satisfaction: {
    description:
      "Record customer satisfaction (CSAT) rating and qualitative feedback",
    parameters: {
      conversationId: "uuid",
      rating: 1 | 2 | 3 | 4 | 5,
      reviewText: "string?",
    },
  },

  // 5. Semantic Knowledge Base Retrieval
  retrieve_kb_articles: {
    description:
      "Semantic vector search against Framique documentation and merchant FAQs",
    parameters: { query: "string", limit: 4 },
  },
};
```

---

### 11.4 In-Chat Interactive UX & Components

The chat widget features rich, dynamic interactive forms rendered directly within the message stream:

1. **Interactive Ticket Confirmation Card**:
   - Displays Ticket ID (e.g. `#TKT-89421A`), assigned priority, estimated first response SLA time, and a tracking button.
2. **In-Chat Callback Request Form**:
   - Renders a clean card allowing the user to confirm/edit their name, mobile phone number (+880), preferred call window (e.g., 10:00 AM - 1:00 PM), and brief topic.
   - Submits directly via Server Function without redirecting the user or reloading the page.
3. **CSAT 5-Star Rating & Review Card**:
   - Interactive 1 to 5 star rating interface with micro-animations.
   - Optional text feedback field: "What could we improve?" or "What went well?".
   - Immediate asynchronous feedback submission with toast confirmation.

---

### 11.5 Continuous Data Flywheel & RLHF Training Pipeline

Every conversation turn is transformed into high-value machine learning training assets for future fine-tuning and model alignment:

1. **Deterministic PII Redaction Pipeline**:
   - Inbound queries and outbound responses are processed through `redactPii()`:
     - Bangladeshi phone numbers (`01[3-9]\d{8}`) replaced with `[PHONE]`.
     - Email addresses replaced with `[EMAIL]`.
     - Credit card / Debit card PANs replaced with `[CARD]`.
     - Sensitive OTPs and passwords masked.
2. **Database Schema (`ai_training_conversations`) — ML Data Immunity Decoupled**:
   ```sql
   CREATE TABLE public.ai_training_conversations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL, -- Immunity: unlinked, not deleted
     conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
     merchant_cohort_hash VARCHAR(64) NOT NULL, -- Permanent cohort fingerprint
     anonymized_actor_token VARCHAR(64), -- Synthetic PII-free session actor
     turn_index INTEGER NOT NULL DEFAULT 0,
     system_prompt TEXT NOT NULL,
     user_turn TEXT NOT NULL, -- Deterministically scrubbed of PII
     context_passages JSONB NOT NULL DEFAULT '[]'::jsonb,
     tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
     agent_reply TEXT NOT NULL, -- Scrubbed of PII
     latency_ms INTEGER NOT NULL DEFAULT 0,
     csat_rating SMALLINT CHECK (csat_rating BETWEEN 1 AND 5),
     csat_review TEXT,
     grounded BOOLEAN NOT NULL DEFAULT true,
     guardrail_blocked BOOLEAN NOT NULL DEFAULT false,
     loop_detected BOOLEAN NOT NULL DEFAULT false,
     reward_score DOUBLE PRECISION DEFAULT 0.0,
     status VARCHAR(30) DEFAULT 'unreviewed' CHECK (status IN ('unreviewed', 'approved', 'rejected')),
     created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
   );
   ```
3. **Dataset Export Formats**:
   - **Supervised Fine-Tuning (SFT)**: JSONL containing `messages: [{role: "system"}, {role: "user"}, {role: "assistant"}]` filtered for conversations with CSAT >= 4.
   - **Direct Preference Optimization (DPO)**: Triplet pairs `{prompt, chosen, rejected}` where `chosen` represents turns with 5-star ratings or verified tool hits, and `rejected` represents turns flagged or downvoted by customers.

---

### 11.6 Platform Owner Support Chat Moderation Console (`/root/ai`) & Human Takeover Engine

The Framique Platform Owner console features an omnichannel support moderation and intervention control room (`/root/ai`) designed for real-time supervision across all tenant storefronts and shopper conversations.

```
                  ┌───────────────────────────────────────────────────────────┐
                  │          Platform Owner Moderation Console (/root/ai)      │
                  │  (Split-Pane: Live Conversation Queue + Active Chat Stream│
                  └──────────────┬─────────────────────────────┬──────────────┘
                                 │                             │
                   Takeover Switch (AI ↔ Human)       Operator Live Messages
                                 │                             │
                                 ▼                             ▼
                  ┌───────────────────────────────┐   ┌───────────────────────────────┐
                  │    takeover_mode Controller   │   │  ownerSendAgentMessageFn()    │
                  │  ai: autonomous ReAct loop    │   │  Inserts role: 'agent'        │
                  │  human_takeover: AI paused    │   │  Real-time push to shopper    │
                  └──────────────┬────────────────┘   └───────────────────────────────┘
                                 │
                                 ▼
                  ┌───────────────────────────────────────────────────────────┐
                  │          Storefront Shopper Support Chat Widget           │
                  │ (Live turns show 'Agent' badge when human operator replies│
                  └───────────────────────────────────────────────────────────┘
```

#### 1. Real-Time Human Takeover Protocol (`takeover_mode`)

- **Dual Operating Modes**:
  - `ai` (Default): Inbound customer messages trigger the automated ReAct loop, knowledge retrieval, and tool execution.
  - `human_takeover`: The autonomous AI response loop is strictly paused. Inbound messages queue silently for the human operator. No automatic bot turns are dispatched.
- **Bi-Directional Handover**:
  - **Operator Intervenes**: Operator toggles takeover on `/root/ai`. `takeover_mode` flips to `'human_takeover'`. Chat status moves to `'in_progress'`.
  - **Operator Sends Live Message**: Dispatched via `ownerSendAgentMessageFn`. Appears in shopper's chat as `role: 'agent'` with a distinct green "Official Framique Staff" badge.
  - **Handback to AI**: When the operator resolves the critical query, they can toggle takeover back to `'ai'`. The ReAct agent automatically incorporates the operator's messages into its conversational memory window and resumes autonomous handling seamlessly.

#### 2. Human Real-Time Notifications & Audible Chimes

- **Instant Event Dispatch**:
  - Platform owners receive real-time notifications on:
    1. Escalated chats (`status = 'needs_agent'`).
    2. High/Urgent priority messages.
    3. New inbound messages in conversations where human takeover is active.
- **Multi-Sensory Notification Suite**:
  - **Auditory Chime**: Browser Web Audio API synthesizer tone (or HTML5 audio chime) plays on new inbound customer messages when the `/root/ai` tab is active or in background.
  - **Desktop Push Notifications**: Browser Web Notifications API (`Notification.requestPermission()`) for background notification alerts.
  - **Visual Badges & Unread Counters**: Dynamic red pill counter in the `/root` navigation bar and conversation drawer list showing unread/unassigned escalated messages.

#### 3. Priority Matrix & SLA Management

Every conversation is tagged with an SLA priority level:

- `urgent`: Payment/charge failures, security reports, orders stuck in transit during courier cutoff. Target first response: **< 15 minutes**.
- `high`: Escalated bot failures, angry customer sentiment, bulk B2B inquiries. Target first response: **< 1 hour**.
- `normal`: Routine store questions, shipping inquiry, product variant availability. Target first response: **< 4 hours**.
- `low`: General feedback, resolved check-ins. Target first response: **< 24 hours**.

#### 4. Conversation Status Lifecycle

State transitions follow a strict state machine:

```
  [Customer Initiates] ──▶ 'open' (AI Handling)
                             │
                             ├─▶ [Bot unsure / Transfer requested] ──▶ 'needs_agent' (Alert Sent)
                             │                                              │
                             │                                              ▼
                             ├──────────────────────────────────────▶ 'in_progress' (Human Takeover)
                             │                                              │
                             ▼                                              ▼
                        'resolved' / 'closed' ◀─────────────────────────────┘
                             │
                             └─▶ [Customer sends new message] ──▶ 'open'
```

#### 5. Private Operator Notes (`operator_notes`)

- Each conversation contains an internal `operator_notes` field stored directly in `ai_conversations`.
- Platform owners and staff use this field for internal collaboration (e.g. _"Customer called regarding order #5821 - courier returned due to incorrect phone, updated Steadfast tracking manually"_).
- Operator notes are strictly excluded from public and customer storefront queries via Postgres RLS and typed server functions.

---

### 11.7 Agent Epistemic Humility & "I Don't Know" Fallback Protocol

A core safety and brand integrity requirement of the Framique Support Agent is **epistemic humility**: the agent must never hallucinate, invent facts, or pretend to know an answer when grounded knowledge base data is unavailable.

#### 1. Hallucination Circuit Breaker & Uncertainty Detection

The agent assesses its own confidence before every turn:

- **Vector Retrieval Miss**: If semantic KB retrieval returns 0 results or top passage similarity is below threshold ($\text{cosine similarity} < 0.65$ / distance $> 0.35$).
- **Tool Resolution Ambiguity**: If order lookup or tracking ID cannot be verified in the database.
- **Scope Boundary**: If the user's inquiry relates to unsupported custom code, legal advice, banking passwords, or personal opinions.
- **Consecutive Unsure Turns**: If `unsureStreak >= 1`, the agent is prohibited from attempting further conversational guessing.

#### 2. Polite Bilingual Humility Admission

When the circuit breaker fires, the agent immediately outputs a polite, transparent admission of limitation:

- **Bangla (বাংলা)**:

  > _"আমি এই বিষয়ে নিশ্চিত নই এবং ভুল তথ্য এড়াতে কোনো অনুমান করতে চাই না। আপনি চাইলে আমি এখনই আপনাকে আমাদের কাস্টমার সাপোর্ট টিমের সাথে যুক্ত করে দিচ্ছি, অথবা একটি কলব্যাক শিডিউল করে দিতে পারি।"_

- **English**:
  > _"I don't have verified information to answer this question accurately. To ensure you receive the correct details, I can connect you directly with a human specialist, schedule a callback, or open an official support ticket."_

#### 3. Actionable In-Chat Escalation Pathways

Instead of dead-ending the user, the agent immediately renders interactive action options in the chat stream:

1. **Transfer to Human Agent (`action: "transfer_to_human"`)**:
   - Updates conversation status to `'needs_agent'`.
   - Sets priority to `'high'` (or `'urgent'`).
   - Dispatches real-time notification with chime to all active `/root` platform owner consoles.
   - Renders a queue status indicator in the shopper's chat: _"You are connected. A human specialist has been notified."_
2. **Request a Callback (`action: "request_callback"`)**:
   - Renders the interactive in-chat callback form with pre-filled customer name and Bangladeshi phone number.
3. **Open Support Ticket (`action: "create_support_ticket"`)**:
   - Renders the ticket creation card with assigned SLA tracking number.
4. **Direct Contact Card**:
   - Displays Framique direct hotline (`+880 9612-FRAMIQ`), WhatsApp support link, support email (`support@framique.com`), and official business hours (9:00 AM – 10:00 PM BST).

---

## 12. Platform Owner Control Plane & Sovereign Governance Architecture (`/root`)

The Platform Owner Control Plane (`/root`) is the topmost administrative shell in Framique's three-tier SaaS topology:

1. **Shopper / Storefront**: Edge-served public storefronts at `<slug>.framique.store` and verified custom domains.
2. **Merchant Admin (`/admin`, `/dashboard`)**: Tenant-scoped merchant console for products, orders, inventory, POS, settings, and theme customization.
3. **Platform Owner (`/root`)**: Sovereign root console granting platform administrators complete control over multi-tenant isolation, money engine conformance, 4-eyes payouts, AI customer support supervision, gateway rails, ad-fraud defense, and zero-downtime infrastructure operations.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   FRAMIQUE PLATFORM OWNER CONTROL PLANE (/root)                        │
│             Sovereign Global Control, 4-Eyes Governance, System Telemetry              │
└───────┬──────────────────────┬──────────────────────┬───────────────────┬──────────────┘
        │                      │                      │                   │
        ▼                      ▼                      ▼                   ▼
┌────────────────┐    ┌────────────────┐    ┌────────────────┐   ┌────────────────┐
│   Commercial   │    │  Multi-Tenant  │    │ Payments & MFS │   │ Trust, Risk    │
│   Governance   │    │  Isolation     │    │ Settlement     │   │ & AI Superv.   │
├────────────────┤    ├────────────────┤    ├────────────────┤   ├────────────────┤
│ • Revenue / MRR│    │ • Tenants Quota│    │ • 4-Eyes Payout│   │ • AI Takeover  │
│ • Plans Engine │    │ • Drift & Purge│    │ • Rails Config │   │ • Fraud Engine │
│ • Trial Ladder │    │ • RBAC Roster  │    │ • DLQ Monitor  │   │ • Honeypot     │
│ • Global Promo │    │ • Impersonation│    │ • Secret Burst │   │ • Consent Map  │
└────────────────┘    └────────────────┘    └────────────────┘   └────────────────┘
```

### 12.1 Perimeter, RBAC & Isolation Boundary

- **Standalone Route & Shell Isolation**: `/root` sits completely outside `_authenticated` and `dashboard`. It runs its own layout (`RootShell`), its own dedicated session gate, and its own authentication route (`/root/login`).
- **Security-Definer Authorization**: Access is strictly governed by `platform_admins` table membership and `public.is_platform_admin()` security-definer database functions. Role columns on user profiles are strictly forbidden. Non-admin users are rejected with `owner.forbidden` and never confirmed the existence of internal endpoints.
- **`merchant_id = 'platform'` RLS Scoping**: When platform administrators read or write platform-level metadata, queries explicitly use `merchant_id = 'platform'` to preserve RLS integrity across the entire schema.
- **Append-Only Owner Action Audit Ledger**: Every privileged operation (limit override, suspension, payout approval, kill-switch toggle, impersonation session) writes an immutable, append-only row to `owner_action_logs` with actor ID, IP hash, target entity, timestamp, before/after states, and mandatory justification reason.

### 12.2 The 16 Sovereign Control Desks

The platform owner panel provides 16 dedicated operational desks ensuring total mastery over the ecosystem:

1. **Executive Command Center (`/root/`)**:
   - High-level telemetry cockpit featuring live MRR, ARR, active paying vs trialing store counts, escalated AI support requests, and pending payouts.
   - Real-time emergency posture indicators with instant links to emergency controls and universal command palette (`Cmd+K`).
2. **Platform Revenue Desk (`/root/revenue`)**:
   - Live revenue analytics computed directly from active subscriptions and stored plan prices in integer minor units.
   - ARPA, plan distribution mix, and 30/90-day trailing logo churn. Foreign-currency contracts are isolated and never dynamically converted without explicit snapshot FX rates.
3. **Plans, Entitlements & Pricing Engine (`/root/plans`)**:
   - Draft-to-published pricing lifecycle with two-key sign-off (`owner_ack` + audit row).
   - Product catalog count caps, staff member limits, and hard DB constraint enforcement (`check_entitlement()` RPC).
4. **Trial Lifecycle Manager (`/root/trial`)**:
   - Funnel telemetry tracking progression: `signup → first order → paid subscriber`.
   - 5-day trial ladder governance with anti-abuse fingerprinting and audited 4-eyes trial extensions (`trial.extended.with_reason`).
5. **Global Coupons & Promotions (`/root/coupons`)**:
   - Platform-wide promotion oversight and vendor-quick fixes (global coupon revoking via four-eyes authorization).
   - Server-enforced discount percentage and minor-unit value ceilings (`offer.percent_cap_bdt`).
6. **Money Engine & Conformance Desk (`/root/money`)**:
   - Automated currency conformance auditor (`money_conformance()` RPC).
   - Float-column prevention check, ledger split reconciliation, and legal year VAT table validation.
7. **Tenants Directory & Quotas (`/root/tenants`)**:
   - Exhaustive directory of all hosted stores with search and filter (`?q=slug`).
   - Real-time resource meters (products used vs limit, staff used vs limit), subscription state, and audited limit overrides.
8. **Tenancy, Drift & Purge Desk (`/root/tenancy`)**:
   - Automated isolation posture monitoring and live schema drift detection (`schema_fingerprint()`).
   - Soft-delete tombstone counters across all 14 tenant tables and GDPR cooling window purge queue scheduler.
9. **Platform Users & RBAC Roster (`/root/users`)**:
   - Directory of platform staff, owners, and merchant account associations.
   - Granular RBAC permissions matrix, key revocation, and staff invitation queue.
10. **Privileged Access & Impersonation Desk (`/root/access`)**:
    - Merchant-consented, time-bounded support sessions (`owner_impersonation_grants`).
    - Explicit `read` vs `write` permission scopes with automated expiration and complete activity logging.
11. **Merchant Payouts & Settlement Queue (`/root/payouts`)**:
    - Four-eyes dual approval queue for merchant funds disbursement (MFS bKash/Nagad/Rocket and bank transfer).
    - Prevention of self-approval by the requesting operator; platform hold-on-fulfilment and cancellation workflows.
12. **Payment Gateways & Rails Governance (`/root/gateway`)**:
    - Per-gateway environment management: `mock → sandbox → pre-live sign-off → live`.
    - Live activation requires wallet ledger balance verification and four-eyes review.
    - Provider secret write-burst intrusion alerting (`ProviderSecretWriteBurst`).
13. **Fraud Defense & Risk Desk (`/root/fraud`)**:
    - Platform-wide fake-order and COD refusal velocity analysis.
    - Salted cross-merchant blacklist and honeypot network (`ad_network_signals`).
    - Scoring-engine fail-open emergency kill switch (`fraud_engine_enabled`).
14. **AI Omnichannel Moderation & Takeover Room (`/root/ai`)**:
    - Unified split-pane live conversation queue and active chat stream across all merchant storefronts.
    - Instant 1-click human intervention (`takeover_mode: 'human_takeover'`), audible chime synthesizer, and private operator notes.
15. **Operations, Job Runners & Cron Desk (`/root/ops`)**:
    - Unified dead-letter queue (DLQ) for payment, shipping, and webhook failures with replay capabilities.
    - Supercronic scheduler monitor, BullMQ worker fleet health, and automated data retention sweeps.
16. **Snapshots, Backups & Disaster Recovery (`/root/snapshots`)**:
    - Automated nightly snapshot backup drill verification.
    - Continuous WAL point-in-time recovery (PITR) ledger and single-tenant disaster restore rehearsals.

### 12.3 Emergency Platform Posture & Kill Switches

The platform owner console provides physical circuit breakers capable of halting or degrading specific subsystems without taking the commerce core down:

- **`ai_kill_switch`**: Instantly pauses autonomous AI support execution across all storefronts; escalates all inquiries to human ticketing.
- **`fraud_engine_enabled`**: Disables edge heuristic scoring and fails open to manual risk review to prevent false-positive checkout blockage during flash sales.
- **`consent_channel_switches`**: Global toggles for Email, SMS, and Push notification dispatches honoring recorded opt-outs.
- **`gateway_live_gate`**: Immediate rollback of live payment provider credentials to sandbox or mock rails during external gateway API disruptions.

### 12.4 Four-Eyes Principle (Dual-Operator Authorization)

For high-exposure actions that could cause irrecoverable data loss or unauthorized money movement:

- **Merchant Payouts**: The operator initiating a payout cannot approve the disbursement; a second distinct platform administrator must verify bank/MFS settlement before funds release.
- **Tenant Purge**: Irrevocable deletion of a tenant's database rows following the cooling window requires two independent keys.
- **Pricing Plan Publishing**: Modifying published subscription prices or tier limits requires draft review by a second administrator.

### 12.5 Universal Command Palette (`⌘K`)

The root console embeds a dedicated keyboard-first command engine (`RootCommandPalette`):

- **Destinations**: Instant fuzzy jump to any of the 16 desks.
- **Tenant Lookup**: Live cross-tenant search by merchant name, slug, or subscription status with direct deep-linking to tenant quota management (`/root/tenants?q=:slug`).
- **Keyboard Traversal**: Arrow-key navigation, `Enter` to open, `Esc` to dismiss, preserving operator flow without mouse reliance.

---

_See `docs/00-meta/PLAN.md` for build sequencing, `ops/README.md` for operational runbooks, `docs/17-owner-console/` for console specifications, and `TODO.md` for development tasks._
