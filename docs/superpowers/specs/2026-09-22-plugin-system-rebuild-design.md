# Plugin System Rebuild — Program Design (master spec)

- **Date:** 2026-09-22 ~17:00 +06:00 (Asia/Dhaka)
- **Scope decision:** one combined program — config/control/management + SDK + review gate (user chose C, 2026-09-22 16:40 +06:00)
- **Scale decision:** implement ALL verticals eventually (user chose C); phases 1–4 specced here, phase 5 tracked in `ROADMAP.md` (user confirmed, 16:47 +06:00)
- **Runtime decision:** "complete" = real worker-sidecar, full docs/12 vision, no shortcuts (16:50 +06:00)
- **Sequencing:** strict sequential 1→2→3→4 (approach A, matches "1-4 then 5")
- **Status refs:** `REPORT.md` (audit), `docs/12-marketplace/plugins.md` (depth spec), `docs/12-marketplace/marketplace.md` (listing/review), `docs/13-export-sdk/oauth.md` (unapproved dependency), `progress.md:59,116-117` (queue)

## §1 Program architecture & phase map — APPROVED 16:52 +06:00

One system, four phases, one data spine: `marketplace_installs` (ledger, repo DDL exists) → `plugin_state` (projection) → `activity_log` (audit). Cross-phase rules: no button without a server path; every `[A]` mutation ships deny + replay + audit assertions; honest zeros; push/pull + mem0 + CHANGELOG per phase.

## §2 Phase 1 — Core rebuild (config / control / management)

**Context findings (subagent-verified 2026-09-22 17:00 +06:00, evidence-backed):**

1. UI is BETTER than the report claims: `InstalledApps.tsx` is already a `plugins.php` parity desk (table, All/Active/Inactive views + counts, bulk Activate/Deactivate/Delete, per-row Activate|Deactivate|Settings|Delete, confirm dialogs); `pluginUninstallFn` IS wired (single + bulk). `REPORT.md:71` (WF-05) is stale. Route `/dashboard/plugins` + top-level Plugins nav exist.
2. The REAL gap is persistence: `plugin_state` + `plugin_kill_switch` have **zero repo DDL** (live-only tables; `docs/schema-drift-audit.md:65-70` confirms "a restore loses them"), zero RLS/policies in repo. This is the leading explanation for "they don't do what they're supposed to do."
3. Enum `market_install_status` = `installed|trial|paused|rolled_back|removed`; `purged`/`uninstalled` absent.
4. Settings schema supports only 4 field types (`text|number|boolean|select`).
5. Hooks are unsigned, advisory-only, in-memory breaker, 4 hooks vs 7 doc events.
6. Gaps: `install_count` never decremented on uninstall; capabilities use `themes.read` (no `plugins.*`); Add-New target inconsistent (`tab=widget` header vs `tab=plugin` in `new.tsx`); no search box, no auto-updates toggle, single bulk bar.

**Phase 1 build list:**

- **P1-0 Live probes first (systematic-debugging):** prove `plugin_state` exists live; settings save→reload round-trip; toggle flips storefront behavior. Probes decide whether this is a DDL gap, a write-path bug, or both.
- **P1-1 DDL capture migration:** `CREATE TABLE IF NOT EXISTS plugin_state` + `plugin_kill_switch` (columns mirror live), `ENABLE RLS` + tenant read/write policies (`is_merchant_member`, `is_platform_admin` mirroring `marketplace_installs_tenant_*`), explicit GRANTs. `ALTER TYPE market_install_status ADD VALUE 'purged'` (terminal purge state; `removed` stays the uninstall terminal).
- **P1-2 Authz parity (WF-19):** `requirePermission("plugins.*")` on all `plugins.functions.ts` fns; console-nav capability `themes.read` → `plugins.read` on Plugins routes.
- **P1-3 Settings schema v1.5:** add `textarea | color | media | url | date` to `PluginSettingsForm` + `validateSettings` (tolerant readers: unknown keys dropped, numbers clamped — existing semantics kept).
- **P1-4 Parity remainder:** search box; auto-updates toggle column (per-install flag, persisted); bottom bulk bar; unify Add-New on one tab (verify tab exists first); `install_count` decrement on uninstall (close reconciliation gap).
- **P1-5 Regression tests:** settings round-trip, toggle effect, uninstall removes row + retires ledger to `removed` + writes audit; deny (non-member refused) + replay (idempotency key) + audit assertions per `[A]`.
- **Explicitly NOT in phase 1:** sidecar, new scopes, event bus, review automation (later phases); Get Pro links (YAGNI — Docs link via `manifest.homepage` only).

## §3 Phase 2 — Runtime + contracts (real sidecar)

- **Sidecar host:** per-tenant worker process/VM running ONLY active plugins; resource envelope (CPU/mem/egress caps) enforced by host — exact numbers set in the phase-2 plan with the infra owner, enforced from day one (breach → `suspended`, never crash).
- **Scope registry:** `docs/13-export-sdk/oauth.md` is unapproved (Planning, paper review TBD). Phase 2 opens by EITHER approving it OR minting an interim scope registry — decision recorded in the phase-2 plan, never left dangling. Rule: installs requesting unknown scopes fail closed.
- **Event bus:** the 7 enumerated server-beacon events (`plugins.md` §8); at-least-once delivery with idempotency keys; subscribe-list ⊆ enum enforced at install AND review.
- **Hook hardening:** HMAC-sign all `hooksUrl` callbacks; distributed (Redis) breaker replaces the in-memory one; idempotency keys + DLQ.
- **Suspend machine:** scope-revoke / envelope-breach / review-regression → `suspended` (worker stopped, data retained, merchant-visible reason).
- **Purge machine:** `uninstalling → enqueue_purge → purge_running → purge_complete | purge_failed(+retry)`; terminal ledger state `purged`; queue drains worker workspace + pipeline rows; logs are key-only (PII-minimal).
- **State machine completion:** installs move `installing → active ⇄ suspended → uninstalling → purged` with `scopes_granted`, `consent_ref`, `version_pin` recorded (replaces today's upsert-overwrite).

## §4 Phase 3 — Plugin SDK

- **Manifest v2** (extends `src/lib/plugin-manifest.ts`): add `engines`, `runtime: 'worker-sidecar'`, `sandbox_claims`, `version_pin`, `payload_checksum`; wire the EXISTING `validateBundle` (512 KB cap, `bundle.dynamic_code`) into the install path — it exists but is never called.
- **Subscribe alignment:** reconcile 4 code hooks (`cart.calculate, checkout.validate, order.created, product.saved`) with the 7 doc events — adapter with deprecation headers, no silent rename.
- **Settings schema v2:** the 5 new field types from P1-3, documented with validation semantics + i18n label conventions.
- **Registration APIs:** widgets (exists, keep), server hooks (exists, hardened in phase 2), event subscriptions (new).
- **`docs/plugins/sdk.md`** (integrator reference: lifecycle fns, tables, seed pipeline, error catalog, versioning/rollback/schedule) + **one sample plugin built SDK-only** — dogfood gate: sample must use zero internal imports (lint-enforced).
- **Payments note:** `payment-plugins.ts` is a 35-line stub. Phase 3 defines the gateway plugin INTERFACE (charge/refund/webhook contract); implementation follows the payments program. Recorded as dependency, not scope creep.

## §5 Phase 4 — Review gate

- **Automated checks (all fail-closed):** manifest validity; scopes ⊆ registry; subscribe ⊆ event enum; checksum pinning; sandbox-claim bounds; settings-schema validity; SDK-only import check for submitted bundles.
- **Human workflow** per `marketplace.md:99-113`: four-eyes, no self-approval, append-only rounds, `draft → in-review → listed → deprecated | removed`; new version = new review round; scope/runtime change = breaking re-review.
- **Wire `kind=plugin`** through the existing listing pipeline (themes/widgets already flow through it).

## §6 Phase 5 → ROADMAP.md (new Horizon section, dependency-ordered)

Add Horizon "Plugin Verticals (post-platform)" + priority-matrix rows, each one line + link to this spec as platform prerequisite: Forms & Leads → Custom OTP (order confirm + login) → Custom payment gateway → Subscriptions → Memberships → Customer dashboards → Affiliates → Security & optimization suite → Complete management (scope TBD at that time).

## §7 Acceptance + repo rules (all phases)

TDD (RED watched → GREEN), `typecheck` → `test` → `test:contracts` on touched files, CircleCI `unit-contract`, production browser verification (never localhost), deploy via `/opt/frame28` script, GitHub push/pull + mem0 + CHANGELOG per phase. Every `[A]` feature: deny + replay + audit.

**Per-phase gate:** each phase (§2–§5) gets its own detailed spec → `writing-plans` implementation plan → build cycle. This master spec is the program contract; no phase starts building without its own approved phase spec.

## Decisions log

| Time (+06:00) | Decision |
|---|---|
| 16:40 | One combined spec (config + SDK + review gate), option C |
| 16:44 | Full docs/12 vision incl. sidecar-capable plugin kinds, option C; verticals listed as customization scope |
| 16:45 | Implement ALL verticals (option C) as phased program |
| 16:47 | Phases 1–4 specced; phase 5 in ROADMAP.md |
| 16:50 | "Complete" = real sidecar, no shortcuts |
| 16:52 | Sequential 1→2→3→4 (approach A); §1 approved |
| 17:00 | Subagent context sweep: UI parity mostly exists, DDL gap is the real P1 target; spec written |
