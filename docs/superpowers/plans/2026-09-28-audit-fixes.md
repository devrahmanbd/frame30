# Audit Fixes Implementation Plan (2 Critical + 9 Important)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 2 verified Criticals and 9 Importants from the 2026-09-28 recheck
(reports in `/tmp/opencode/recheck/.recheck-reports/`), with TDD + review per task.
Minors parked explicitly at the bottom.

**Architecture:** Minimal root-cause fixes in place; new SQL migration for the
idempotency constraint (expand-and-contract aware: additive unique index only,
no column changes); no API/contract reshapes unless specified.

**Tech Stack:** TypeScript ESM, Vitest, Supabase Postgres (migrations in
`supabase/migrations/`), Bun. No new deps.

**Spec:** Recheck reports (`core-engine.md`, `page-builder.md`, `ecommerce.md`)
with file:line evidence — the reports ARE the spec; each task cites its rows.

## Global Constraints

- Bun ESM, no `require()`; TDD red→green (failures reproduce live or in-test — record RED evidence); zero NEW lint/typecheck violations vs origin/main per file.
- NEVER weaken assertions; money paths need deny + replay + audit coverage per AGENTS.md Testing §.
- Migrations: additive only (new unique index / RPC change backward-compatible); never rewrite history; test on a scratch DB if available, else gate with transaction-safe `IF NOT EXISTS`.
- Each task: own branch `fix/audit-<slug>` from `origin/main 2de914a`, push branch (merge/deploy on user go-ahead only).
- No `.github/` changes.

## Review Focus

- `paid` must be unreachable before settlement for online rails (grep for other writers of `paid` status).
- Parse round-trip byte-fidelity for hero/faq/footer items incl. twins.
- Forge-proof callbacks: amount-only acceptance gone for aamarPay/bKash.
- No duplicate orders under concurrent same-key submits (test with parallel inserts if harness allows, else unique-constraint proof).
- Retry/remount keys stable across the session.

---

### T1: Paid-at-placement → pending until settlement (CRITICAL)

**Files:** `src/lib/orders.server.ts` (:178, :247-259), `src/lib/payments.server.ts` (any reader assuming paid-at-placement — check `applySignedReturn`, fulfilment queries), tests colocated.
- [ ] RED: test asserting online order creates with non-paid status + NO payment row (currently fails).
- [ ] Create online orders as `pending`/`payment_pending` (match COD `confirmed` semantics — check what fulfilment expects; COD stays as-is), insert NO payment row until settlement.
- [ ] Audit script (read-only report, not migration): list existing `paid`-without-settlement-intent orders for ops review.
- [ ] GREEN incl. neighbouring order/payment suites. Commit `fix(orders): pending until settlement`, push branch.

### T2: upgradeAstV2ToV3 repeater-safe (CRITICAL)

**Files:** `src/lib/builder-ast.ts` (:7049-7068), round-trip tests.
- [ ] RED: parse→serialize fixture with hero/faq/footer `items` + twins (currently mangles).
- [ ] Only promote `items`/`sections` to `children` for container types or node-shaped rows; data rows pass through untouched.
- [ ] GREEN incl. builder suites. Commit `fix(builder): parse preserves repeater items`, push branch.

### T3: Provider revalidation for aamarPay/bKash callbacks

**Files:** `src/lib/live-gateway.server.ts` (:273-274), `src/lib/live-gateway.ts` (:469-479), tests.
- [ ] RED: forged callback with valid intent id + exact amount must NOT settle (currently does).
- [ ] Validate against provider API where available, else hold as `pending` (never settle on amount-only). Keep SSLCommerz/PipraPay behavior identical.
- [ ] GREEN. Commit, push branch.

### T4: Atomic order creation on idempotency key (+ coupon counters)

**Files:** new migration (unique `(merchant_id, idempotency_key)` on orders + `ON CONFLICT DO NOTHING` returning existing), `src/lib/orders.server.ts` (:63-79, :185-212, :261-288), coupon atomic increment guarded by `usage_limit` in SQL.
- [ ] RED: concurrent same-key submits (parallel-insert test or constraint-proof).
- [ ] Implement; GREEN. Commit (code + migration), push branch.

### T5: Stable retry/remount keys

**Files:** checkout page key init (`store.$slug.checkout.tsx:93-97`), retry buttons (`order.$orderId.tsx:83`, `store.$slug.order.$orderId.tsx:91`), server attempt counting.
- [ ] RED: refresh+resubmit and double-click produce duplicate intents/orders.
- [ ] Single session-persisted order key; deterministic retry keys per order+attempt with server-side attempt counting.
- [ ] GREEN. Commit, push branch.

### T6: Stock rollback sign + release scoping

**Files:** `src/lib/checkout.server.ts` (:217-220 sign, :288-326 scoping), `store.$slug.checkout.tsx` token gen (:88-92).
- [ ] RED: failed-hold rollback double-decrements; unscoped token releases foreign holds (unit-test with fake store).
- [ ] `+ delta` fix; bind token to merchant (token format change with backward-compat read for in-flight tokens, or document cutover).
- [ ] GREEN. Commit, push branch.

### T7: Quick wins batch (one task)

- zod enum → full `WidgetDataSource` union (`widget-data.functions.ts:9-16`).
- `site.server.ts` placeholder → explicit throw (pricing.server pattern).
- `ratio` vocab normalize (`/`→`-` both spellings + 4/5,3/4,auto).
- `BITEXT_FIELDS.footer_sitemap` += `cNLinks` + brand-zone keys.
- Each with RED→GREEN; single commit `fix(quick-wins batch)`; push branch.

### Parked minors (documented, not scheduled)

Percent-coupon half-up, free-shipping base mismatch, orderNumber collision retry, invoice RPC verifiability, COD ledger key uniqueness, master-key fallback coupling, DataGrid empty-state locale, device-hidden mechanism, studio str locale, coverage repeater walk, account-slot context threading, shared error components, subbrand_bar decision, stale skins comment. Revisit post-launch.
