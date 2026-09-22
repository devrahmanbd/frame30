# Plugin Phase 2 (Runtime + Contracts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Plugin Runtime + Contracts phase: interim scope registry with dotted adapter, consent evidence on every grant path, `validateBundle` on every install write, signed + scope-gated + queue-backed hook delivery, the four product hooks actually firing at their commit points, a supervised sandboxed-process sidecar host, suspend/resume and purge machines, all locked by deny + replay + audit tests.

**Architecture:** Contracts first (scopes → consent → bundle gate), then delivery hardening (HMAC + HOOK_SCOPE + queue fallback), then product wiring (the 4 emission sites), then the sidecar host (process supervisor reusing job_queue), then lifecycle machines (suspend folds into the existing `enabled` gate; purge reuses `job_queue` + the `purged` enum already added in Phase 1). oauth.md stays unapproved — Phase 2 blocks nothing on it.

**Tech Stack:** TanStack Start `createServerFn`, Supabase Postgres (RLS, enums), Vitest + `fakeDb` (`src/lib/__fixtures__/fake-db.ts`), existing `job_queue` + `webhook-signing` + `plugin-hooks` modules. No BullMQ, no k8s, no new queue infra.

**Spec (authoritative):** `docs/superpowers/specs/2026-09-22-plugin-phase2-runtime-design.md` — R2-0 … R2-8.

## Global Constraints

- UI strings use the bilingual `t("English", "বাংলা")` pattern — every new user-facing string gets both.
- No `server-only` import — server code lives in `*.server.ts`, fns in `*.functions.ts` with dynamic `await import()` inside handlers.
- Every new/changed table column gets `ENABLE RLS` + tenant policies + explicit GRANTs in the same migration (columns on existing tables: `IF NOT EXISTS` + no policy churn).
- Every `[A]` mutation (grant/revoke/install/suspend/resume/purge) keeps its `activity_log` audit row via `auditAction` (`src/lib/hardening.server.ts:18-39`).
- No action button without a working server path; honest zeros only.
- Verification is production-browser only (never localhost); unit/contract via `bun run test -- <file>`; typecheck `bun run typecheck`; contracts `bun run test:contracts`; schema `bun run schema:check`.
- Commit per task; push to `main`; CHANGELOG entry when the phase lands; mem0 `add_memory` per shipped task (`user_id="rahman"`, `app_id="devrahmanbd-frame30"`).
- Migrations applied as `supabase_admin` BEFORE deploy (Phase-1 lesson, now law).
- Hook delivery NEVER throws into the caller: `runHook` already never rejects; emission sites keep the core result standing on subscriber failure (per-hook never-throw contract).
- Plugin code never runs in our process (`plugin-hooks.server.ts` header): hooks are outbound POSTs; the sidecar host runs vendor code in a sandboxed child process, not in-process.

---

## File Structure

- `src/lib/scope-adapter.ts` (CREATE) — owns the 8-snake ↔ 14-dotted adapter map + `HOOK_SCOPE` gate map (R2-0).
- `src/lib/scope-adapter.test.ts` (CREATE) — adapter completeness + HOOK_SCOPE matrix contract tests.
- `src/lib/plugins.server.ts` (MODIFY ~lines 78-147, 241-265, COLUMNS line 23) — consent subset fix, `validateBundle` gate, consent evidence columns, suspend fold-in, revoke/suspend/resume audit writers (R2-1/R2-5/R2-7).
- `src/lib/marketplace-install.server.ts` (MODIFY `installListing` ~lines 51-175, `uninstallWidgetInstall` ~565-625) — `validateBundle` before write, consent triple on ledger insert, purge-state machine (R2-1/R2-6/R2-7).
- `src/lib/plugin-hooks.server.ts` (MODIFY full file) — HOOK_SCOPE gate, HMAC headers via `webhook-signing.ts`, queue fallback, extended outcome taxonomy (R2-3).
- `src/lib/job-queue.ts` (MODIFY `QueueName` + `QUEUE_POLICIES` ~lines 47-117) — add `plugins` queue policy.
- `src/lib/job-handlers.server.ts` (MODIFY lines 10-38) — register `plugin.hook.deliver` + `plugin.purge` handlers; add `plugins` to `WORKER_QUEUES`.
- `src/lib/plugin-sidecar.server.ts` (CREATE) — supervisor: one sandboxed child process per active install, heartbeat, stop on suspend/uninstall (R2-2).
- `src/lib/plugin-sidecar.server.test.ts` (CREATE) — supervisor lifecycle contract tests.
- `src/lib/plugin-lifecycle.server.ts` (CREATE) — suspend/resume/purge machine writers + transition guards (R2-5/R2-6).
- `src/lib/plugin-lifecycle.test.ts` (CREATE) — transition matrix + purge idempotency + audit assertions.
- `supabase/migrations/<STAMP>_phase2l_plugin_state_suspend.sql` (CREATE, `STAMP=$(date +%Y%m%d%H%M%S)`, must exceed `20260922182022`) — suspend/resume columns on `plugin_state`.
- `src/lib/phase2l-ddl.test.ts` (CREATE) — migration contract test (columns + defaults).
- Emission wiring (MODIFY, fire-at-commit + no-throw):
  - `src/lib/carts.server.ts` `captureCart` success path after `:62` — `cart.calculate`.
  - `src/lib/checkout.server.ts` `reserveStock` success path after hold converge (~`:215-222`) — `checkout.validate` (advisory).
  - `src/lib/orders.server.ts` after `log("info","order.created")` at `:391`, before `return` `:393` — `order.created`.
  - `src/lib/catalog.server.ts` `applyImport` after `:218` and `saveKindConfig` after `:274` — `product.saved` (server-side product writes; see Task 6 decision note).
- `src/lib/plugin-emission.test.ts` (CREATE) — fire-on-commit + no-throw contract tests for all four hooks.
- `CHANGELOG.md` (MODIFY) — Phase 2 section when the phase lands.

**Non-goals (do not touch):** oauth.md approval, k8s/container orchestrator, `payment-plugins.ts`, Get Pro links, Phase 4 review automation, widget runtime (`WidgetSandbox.tsx` beyond authorize reference).

---

### Task 1: R2-0 Scope registry — adapter map + HOOK_SCOPE gate

**Files:**
- Create: `src/lib/scope-adapter.ts`, `src/lib/scope-adapter.test.ts`.
- Read first: `src/lib/marketplace-scopes.ts` (`SCOPES` lines 24-89), `src/lib/api-scopes.ts` (`SCOPES` lines 17-32), spec R2-0.

**Interfaces:**
- Consumes: 8 snake ids (`read_shop, read_products, write_products, read_orders, read_customers, write_cart, write_analytics, render_storefront`), 14 dotted ids.
- Produces: `widgetToApiScopes`, `HOOK_SCOPE` (consumed by Task 5 `callOne` gate); contract tests consumable by CI (`bun run test:contracts`).

- [ ] **Step 1: Write the failing adapter tests**

```ts
// src/lib/scope-adapter.test.ts
import { describe, expect, it } from "vitest";
import { SCOPES as WIDGET_SCOPES } from "./marketplace-scopes";
import { SCOPES as API_SCOPES } from "./api-scopes";
import { HOOK_SCOPE, widgetToApiScopes } from "./scope-adapter";

describe("scope adapter (R2-0)", () => {
  it("maps every widget scope to ≥1 real API scope", () => {
    for (const id of WIDGET_SCOPES.map((s) => s.id)) {
      const mapped = widgetToApiScopes(id);
      expect(mapped.length).toBeGreaterThan(0);
      for (const m of mapped) expect(API_SCOPES).toContain(m);
    }
  });
  it("never invents API scopes from unknown widget input", () => {
    expect(widgetToApiScopes("drain_wallet")).toEqual([]);
  });
  it("covers all four hooks with non-empty scope sets", () => {
    for (const hook of [
      "cart.calculate",
      "checkout.validate",
      "order.created",
      "product.saved",
    ] as const) {
      const req = HOOK_SCOPE[hook];
      expect(req.length).toBeGreaterThan(0);
      for (const s of req) expect(WIDGET_SCOPES.map((x) => x.id)).toContain(s);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/lib/scope-adapter.test.ts`
Expected: FAIL (module `./scope-adapter` not found).

- [ ] **Step 3: Implement `src/lib/scope-adapter.ts`** (verbatim)

```ts
/**
 * Phase 2 R2-0 — interim canonical scope registry bridge.
 *
 * The 8 snake_case widget scopes (`marketplace-scopes.ts`) are canonical for
 * Phase 2. The 14 dotted scopes (`api-scopes.ts`) are the developer-platform
 * vocabulary. oauth.md is unapproved, so a static adapter freezes both sides
 * and fails closed on anything invented. `HOOK_SCOPE` is the gate map that
 * `plugin-hooks.server.ts:callOne` consults before any delivery.
 */
import { SCOPES as WIDGET_SCOPES } from "./marketplace-scopes";
import { SCOPES as API_SCOPES } from "./api-scopes";
import type { ServerHook } from "./plugin-manifest";

const WIDGET_TO_API: Record<string, readonly string[]> = {
  read_shop: ["plugins.read", "themes.read"],
  read_products: ["products.read"],
  write_products: ["products.write"],
  read_orders: ["orders.read"],
  read_customers: ["customers.read"],
  write_cart: ["orders.write"],
  write_analytics: ["analytics.read"],
  render_storefront: ["themes.write"],
};

const WIDGET_IDS = new Set(WIDGET_SCOPES.map((s) => s.id));

/** Fail-closed: unknown widget scope yields []. Never widens to a dotted grant. */
export function widgetToApiScopes(widgetScope: string): string[] {
  const mapped = WIDGET_TO_API[widgetScope] ?? [];
  if (!WIDGET_IDS.has(widgetScope)) return [];
  return mapped.filter((m) => (API_SCOPES as readonly string[]).includes(m));
}

/** Required granted widget scopes per server hook — enforced in `callOne`. */
export const HOOK_SCOPE: Record<ServerHook, readonly string[]> = {
  "cart.calculate": ["read_products", "write_cart"],
  "checkout.validate": ["read_orders", "write_cart"],
  "order.created": ["read_orders"],
  "product.saved": ["read_products", "write_products"],
};

/** True when `granted` satisfies every scope the hook requires. */
export function hookAllowed(
  hook: ServerHook,
  granted: readonly string[],
): boolean {
  const required = HOOK_SCOPE[hook] ?? [];
  if (!required.length) return false;
  return required.every((s) => granted.includes(s));
}
```

- [ ] **Step 4: Run tests green + typecheck**

Run: `bun run test -- src/lib/scope-adapter.test.ts` then `bun run typecheck`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scope-adapter.ts src/lib/scope-adapter.test.ts
git commit -m "feat(plugins): R2-0 interim scope adapter + HOOK_SCOPE gate map"
git push
```

---

### Task 2: R2-7 `validateBundle` on every install write path

**Files:**
- Modify: `src/lib/plugins.server.ts` (`upsertPlugin` start, after manifest parse at ~`:86`).
- Modify: `src/lib/marketplace-install.server.ts` (`installListing`, after `loadListing` ~`:69-71`, before consent block `:73`).
- Read first: `src/lib/marketplace-scopes.ts` `validateBundle` `:192-222`; vault precedent `src/lib/marketplace-vault.server.ts:85-87`.
- Test: extend `src/lib/phase5-plugins.test.ts` or new cases in `src/lib/marketplace-scopes.test.ts` if present; otherwise `src/lib/plugin-bundle-gate.test.ts`.

**Interfaces:**
- Consumes: `validateBundle(source, scopes)`, `normalizeScopes`.
- Produces: `plugin.bundle_rejected` throw with zero rows written (consumed by install + upsert callers; deny cases feed R2-8).

- [ ] **Step 1: Write failing deny tests**

```ts
// src/lib/plugin-bundle-gate.test.ts
import { describe, expect, it } from "vitest";
import { validateBundle } from "./marketplace-scopes";

describe("install-path bundle gate (R2-7)", () => {
  it("rejects oversized bundles (>512KB) with bundle.too_large", () => {
    const huge = { entry: "x".repeat(600_000) };
    const v = validateBundle(huge, ["read_shop"]);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("bundle.too_large");
  });
  it("rejects dynamic_code in entry", () => {
    const v = validateBundle({ entry: "eval('x')" }, ["read_shop"]);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("bundle.dynamic_code");
  });
  it("rejects empty scope lists", () => {
    const v = validateBundle({ entry: "framique.mount()" }, []);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("bundle.no_scopes");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/lib/plugin-bundle-gate.test.ts`
Expected: the pure `validateBundle` cases actually PASS (function already exists). The REAL failing gate is the install-path integration: add an upsert/install integration deny case using `fakeDb` asserting `plugin.bundle_rejected` / `market_bundle_rejected` and ZERO inserts — write that next if the pure suite alone does not fail.

- [ ] **Step 3: Wire the gate into `upsertPlugin`** — insert immediately after manifest parse (`plugins.server.ts` after `:86`):

```ts
  const bundleVerdict = validateBundle(manifest, manifest.permissions);
  if (!bundleVerdict.ok)
    throw new Error(`plugin.bundle_rejected:${bundleVerdict.errors.join(",")}`);
```

Add `validateBundle` to the existing `./plugin-manifest` or `./marketplace-scopes` import block (it lives in `marketplace-scopes.ts`).

- [ ] **Step 4: Wire the gate into `installListing`** — insert after trial check (`marketplace-install.server.ts` after `:71`), before consent block `:73`:

```ts
  const listingManifest = (listing as { manifest?: unknown }).manifest;
  const listingScopes = Array.isArray(
    (listingManifest as { permissions?: unknown } | null)?.permissions,
  )
    ? ((listingManifest as { permissions: string[] }).permissions)
    : (input.grantedScopes ?? []);
  const { validateBundle } = await import("./marketplace-scopes");
  const bundleVerdict = validateBundle(listingManifest ?? {}, listingScopes);
  if (!bundleVerdict.ok)
    throw new Error(
      `market_bundle_rejected:${bundleVerdict.errors.join(",")}`,
    );
```

- [ ] **Step 5: Run green + typecheck**

Run: `bun run test -- src/lib/plugin-bundle-gate.test.ts` and the install tests (`bun run test -- src/lib/marketplace-uninstall-widget.test.ts` if touching install; plus `bun run typecheck`).
Expected: PASS / clean; install of a `dynamic_code` bundle throws with zero `marketplace_installs` rows.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plugins.server.ts src/lib/marketplace-install.server.ts src/lib/plugin-bundle-gate.test.ts
git commit -m "feat(plugins): R2-7 validateBundle gate on upsert + installListing"
git push
```

---

### Task 3: R2-1 Consent evidence — granted subset + manifest_version + consented_by

**Files:**
- Modify: `src/lib/plugins.server.ts` (`upsertPlugin` payload `:109-117`, consent check `:88-91`, COLUMNS `:23`).
- Modify: `src/lib/marketplace-install.server.ts` (`installListing` insert `:102-124`, `InstallInput` `:15-26` — already has `grantedScopes`/`consentedBy`).
- Migration (if columns not yet live): fold `manifest_version text NOT NULL DEFAULT ''`, `consented_by uuid` into Task 4's `phase2l` migration (create columns together — avoids two deploys).
- Test: extend install + upsert tests (fakeDb).

**Interfaces:**
- Consumes: `installId` optional `UpsertInput.actorId` already present.
- Produces: `plugin_state.scopes` = granted subset (not `manifest.permissions`); ledger rows carry `granted_scopes` (already on `marketplace_installs` via Phase 1); audit rows `plugin.scopes_granted` / `plugin.scope_revoked` (consumed by Task 8 revoke path).

- [ ] **Step 1: Write failing tests** — `plugin_consent_required` on superset/unknown is NEW (today only missing is thrown at `plugins.server.ts:88-91`); granted subset must be what is stored:

```ts
// in phase5-plugins.test.ts or plugins-consent.test.ts (fakeDb)
it("refuses a superset/unknown grant and stores only the granted subset", async () => {
  await expect(
    upsertPlugin(db, "m1", {
      manifest: MANIFEST,
      grantedScopes: [...MANIFEST.permissions, "drain_wallet"],
    }),
  ).rejects.toThrow(/plugin_consent_required/);
  // happy path: scopes column equals granted ∩ manifest.permissions
  await upsertPlugin(db, "m1", {
    manifest: MANIFEST,
    grantedScopes: ["read_shop"], // subset: render_storefront intentionally withheld
    actorId: "u1",
  });
  const row = await db.from("plugin_state").select("scopes").eq("plugin_id", "loyalty-lite").maybeSingle();
  expect(row.scopes).toEqual(["read_shop"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/lib/phase5-plugins.test.ts`
Expected: FAIL — superset currently accepted (missing-check only), and payload stores `manifest.permissions` at `:113`.

- [ ] **Step 3: Fix `upsertPlugin` consent** (replace `:88-91` check + `:113` payload field) — insert after parse:

```ts
  const requested = Array.from(new Set(input.grantedScopes ?? [])).sort();
  const missing = manifest.permissions.filter((p) => !requested.includes(p));
  if (missing.length)
    throw new Error(`plugin_consent_required:${missing.join(",")}`);
  const unknown = requested.filter((p) => !manifest.permissions.includes(p));
  if (unknown.length)
    throw new Error(`plugin_consent_required:${unknown.join(",")}`);
  const granted = requested; // subset == manifest.permissions by construction above
```

Change payload line `:113` from `scopes: manifest.permissions` to `scopes: granted`. After successful upsert (after `:125`), audit grant evidence:

```ts
  await auditAction(
    db,
    merchantId,
    input.actorId ?? null,
    "plugin.scopes_granted",
    "plugin",
    { plugin: manifest.id, scopes: granted, manifest_version: manifest.version },
    input.installId ?? null,
  );
```

(Keep the existing `plugin.installed`/`plugin.updated` audit at `:128-140` — the grant row is additional, not a replacement.)

- [ ] **Step 4: Persist consent triple on `installListing` insert** — add to the insert object at `:104-121` (columns must exist — they land in Task 4's migration BEFORE this ships, or use the same-stamp migration created in Task 4 first if sequencing requires; prefer: create `phase2l` migration in Task 4 immediately and reference it here):

```ts
      granted_scopes: granted as never,
      consented_by: input.consentedBy ?? null,
      // manifest_version rides listing.version (pinned or listing default) — already inserted as `version`.
```

`granted_scopes` already exists on `marketplace_installs` (Phase 1 `entitledBlocks` selects it at `marketplace-vault.server.ts:265`); only `plugin_state.consented_by` / `plugin_state.manifest_version` are new (Task 4).

- [ ] **Step 5: Run green + typecheck**

Run: `bun run test -- src/lib/phase5-plugins.test.ts` + `bun run typecheck`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plugins.server.ts src/lib/marketplace-install.server.ts
git commit -m "feat(plugins): R2-1 consent evidence — granted subset + reject superset"
git push
```

---

### Task 4: phase2l migration — suspend + consent columns

**Files:**
- Create: `supabase/migrations/<STAMP>_phase2l_plugin_state_suspend.sql` (`STAMP=$(date +%Y%m%d%H%M%S)`, must exceed `20260922182022`).
- Create: `src/lib/phase2l-ddl.test.ts`.
- Read first: `supabase/migrations/20260922173657_phase2j_plugin_state_ddl.sql` (idempotent pattern), `20260922182022_phase2k_plugin_state_auto_updates.sql`.

**Interfaces:**
- Consumes: R2-5 column list from spec.
- Produces: `plugin_state` columns `suspended`, `suspended_reason`, `suspended_at`, `version_pin`, `consented_by`, `manifest_version` (consumed by Tasks 3, 8, 9; COLUMNS select).

- [ ] **Step 1: Write the failing migration-contract test**

```ts
// src/lib/phase2l-ddl.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const files = globSync("supabase/migrations/*phase2l*plugin_state_suspend.sql");
const sql = files.length ? readFileSync(files[0], "utf8") : "";

describe("phase2l plugin_state suspend/consent DDL", () => {
  it("adds the six spec columns idempotently", () => {
    for (const col of [
      "suspended",
      "suspended_reason",
      "suspended_at",
      "version_pin",
      "consented_by",
      "manifest_version",
    ]) {
      expect(sql).toContain(col);
      expect(sql).toContain("if not exists");
    }
  });
  it("keeps suspend defaulted false so existing rows stay active", () => {
    expect(sql).toMatch(/suspended\s+boolean\s+not\s+null\s+default\s+false/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/lib/phase2l-ddl.test.ts`
Expected: FAIL (no phase2l file).

- [ ] **Step 3: Write the migration** (verbatim; exact STAMP from `date +%Y%m%d%H%M%S`):

```sql
-- Phase 2l — suspend machine + consent evidence columns (R2-1/R2-5).
-- Idempotent: mirrors the phase2j/2k pattern (live tables already exist).
alter table public.plugin_state add column if not exists suspended boolean not null default false;
alter table public.plugin_state add column if not exists suspended_reason text;
alter table public.plugin_state add column if not exists suspended_at timestamptz;
alter table public.plugin_state add column if not exists version_pin text not null default '';
alter table public.plugin_state add column if not exists consented_by uuid references public.users(id) on delete set null;
alter table public.plugin_state add column if not exists manifest_version text not null default '';
```

(`public.users` reference: if the live users table is named differently, use the same FK target `plugin_state.merchant_id` uses — check `20260922173657_phase2j_plugin_state_ddl.sql:12` which references `public.merchants`; for `consented_by` prefer NO FK if the admin-users table name is uncertain — default column to NULL and skip the FK rather than guess. Adjust Step 3 to omit the `references` clause if `bun run schema:check` or a live probe shows no `public.users`.)

- [ ] **Step 4: Extend `COLUMNS` in `plugins.server.ts`** — replace line `:23`:

```ts
const COLUMNS =
  "id, plugin_id, manifest, scopes, settings, enabled, auto_updates, suspended, suspended_reason, suspended_at, version_pin, consented_by, manifest_version";
```

Fold suspend into the `enabled` read at `:59` (kill switch already folds here):

```ts
      enabled: !killed && row.enabled !== false && row.suspended !== true,
```

- [ ] **Step 5: Run migration test + typecheck + schema check**

Run: `bun run test -- src/lib/phase2l-ddl.test.ts` && `bun run typecheck` && `bun run schema:check`
Expected: PASS / clean. Apply migration as `supabase_admin` BEFORE deploy when releasing (documented in commit body; CI schema:check covers repo-vs-live drift).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*phase2l* src/lib/phase2l-ddl.test.ts src/lib/plugins.server.ts
git commit -m "feat(plugins): R2-1/R2-5 phase2l suspend + consent columns on plugin_state"
git push
```

---

### Task 5: R2-3 Hook delivery hardening — HOOK_SCOPE gate + HMAC + queue fallback

**Files:**
- Modify: `src/lib/plugin-hooks.server.ts` (full file — `HookOutcome` `:56-62`, `callOne` `:64-116`, `runHook` `:122-141`).
- Modify: `src/lib/job-queue.ts` (`QueueName` `:47-53`, `QUEUE_POLICIES` `:66-117`).
- Modify: `src/lib/job-handlers.server.ts` (`JOB_HANDLERS` `:10-29`, `WORKER_QUEUES` `:31-38`).
- Read first: `src/lib/webhook-signing.ts` (`signedPayload` `:46-48`, `computeSignature` `:50-68`, `signatureHeader` `:70-72`), `src/lib/scope-adapter.ts` (Task 1).
- Test: extend `src/lib/phase5-plugins.test.ts` `describe("server hooks")` `:258-321`.

**Interfaces:**
- Consumes: `hookAllowed` (Task 1), `enqueueJob` (`job-queue.server.ts:77`), `computeSignature`/`signatureHeader`.
- Produces: `HookOutcome.status` extended taxonomy; `plugin.hook.deliver` job handler; idempotent queue fallback (consumed by Task 6 emission sites + R2-8 deny/replay tests).

**Hook signing secret:** derive per-install from a server env `PLUGIN_HOOK_SECRET` (or fall back to a constant only in tests — production MUST have the env; never a per-plugin secret in v1, one platform secret with rotation window mirroring `webhook-signing.ts` rotation comment). Store the secret ONLY in env (`*.server.ts` dynamic import of `process.env`).

- [ ] **Step 1: Write failing tests** (extend `phase5-plugins.test.ts` server-hooks describe):

```ts
  it("skips when HOOK_SCOPE unsatisfied — no fetch (R2-0 deny)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await runHook(
      [installed({ grantedScopes: ["read_shop"] })], // missing read_orders for order.created
      "order.created",
      { id: "o1" },
    );
    expect(out[0].status).toBe("skipped:scope");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs every callback with framique-signature t=,v1=", async () => {
    let seen: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init;
        return new Response("{}", { status: 200 });
      }),
    );
    process.env.PLUGIN_HOOK_SECRET = "test-secret";
    await runHook([installed()], "order.created", { id: "o1" });
    const headers = seen?.headers as Record<string, string>;
    expect(headers["framique-signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    delete process.env.PLUGIN_HOOK_SECRET;
  });

  it("queues on timeout instead of only returning timeout (R2-3)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_r, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("a"), { name: "AbortError" })),
            );
          }),
      ),
    );
    const out = await runHook([installed()], "order.created", { id: "o9" }, 20);
    expect(out[0].status).toBe("queued");
    // enqueueJob called — assert via spy or fakeDb job_queue row with
    // idempotency key `hook:<plugin>:<hook>:<hash(payload)>`
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/lib/phase5-plugins.test.ts`
Expected: FAIL — no `skipped:scope`, no signature header, status stays `"timeout"`.

- [ ] **Step 3: Implement hardening in `plugin-hooks.server.ts`** (verbatim structure):

Extend `HookOutcome.status` union at `:59`:

```ts
  status:
    | "ok"
    | "timeout"
    | "error"
    | "skipped"
    | "skipped:scope"
    | "queued"
    | "failed"
    | "dead_letter";
```

Add imports at top:

```ts
import { computeSignature, signatureHeader, SIGNATURE_HEADER } from "./webhook-signing";
import { hookAllowed } from "./scope-adapter";
```

Insert scope gate + signature in `callOne` after the existing skip checks (`:71-80`), before `fetch` (`:84`):

```ts
  if (!hookAllowed(hook, plugin.grantedScopes)) {
    incr("framique_plugin_hook_total", { hook, status: "skipped:scope" });
    return {
      pluginId: plugin.manifest.id,
      hook,
      status: "skipped:scope",
      ms: 0,
    };
  }
  const body = JSON.stringify({ hook, payload, settings: plugin.settings });
  const secret = process.env.PLUGIN_HOOK_SECRET;
  let signature = "";
  if (secret) {
    const ts = Math.floor(Date.now() / 1000);
    const mac = await computeSignature(secret, ts, body);
    signature = signatureHeader(ts, [mac]);
  }
```

Change the `fetch` call body/headers (replace `:84-93`):

```ts
    const res = await fetch(plugin.manifest.hooksUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-framique-hook": hook,
        "x-framique-plugin": plugin.manifest.id,
        ...(signature ? { [SIGNATURE_HEADER]: signature } : {}),
      },
      body,
    });
```

Replace the `catch` block return (`:104-112`) with queue fallback:

```ts
  } catch (err) {
    recordFailure(plugin.manifest.id, hook);
    const timedOut = (err as Error)?.name === "AbortError";
    if (breakerOpen(plugin.manifest.id, hook) || timedOut || true) {
      // queue fallback for every failure/timeout path (breaker already recorded)
      try {
        const { enqueueJob } = await import("./job-queue.server");
        const key = `hook:${plugin.manifest.id}:${hook}:${simpleHash(body)}`;
        await enqueueJob({
          queue: "plugins",
          name: "plugin.hook.deliver",
          payload: {
            pluginId: plugin.manifest.id,
            installId: plugin.installId,
            hook,
            body,
            hooksUrl: plugin.manifest.hooksUrl,
          },
          merchantId: null,
          idempotencyKey: key,
        });
        incr("framique_plugin_hook_total", { hook, status: "queued" });
        return {
          pluginId: plugin.manifest.id,
          hook,
          status: "queued",
          ms: Date.now() - started,
        };
      } catch {
        /* queue down: report the raw failure, core result still stands */
      }
    }
    return {
      pluginId: plugin.manifest.id,
      hook,
      status: timedOut ? "timeout" : "error",
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
```

Add a tiny local hash helper (same file):

```ts
function simpleHash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
```

Simplify the catch condition to always attempt enqueue on failure (drop the `|| true` noise — the block IS the failure path):

```ts
  } catch (err) {
    recordFailure(plugin.manifest.id, hook);
    const timedOut = (err as Error)?.name === "AbortError";
    try {
      const { enqueueJob } = await import("./job-queue.server");
      const key = `hook:${plugin.manifest.id}:${hook}:${simpleHash(body)}`;
      await enqueueJob({
        queue: "plugins",
        name: "plugin.hook.deliver",
        payload: {
          pluginId: plugin.manifest.id,
          installId: plugin.installId,
          hook,
          body,
          hooksUrl: plugin.manifest.hooksUrl,
        },
        idempotencyKey: key,
      });
      return {
        pluginId: plugin.manifest.id,
        hook,
        status: "queued",
        ms: Date.now() - started,
      };
    } catch {
      return {
        pluginId: plugin.manifest.id,
        hook,
        status: timedOut ? "timeout" : "error",
        ms: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }
```

(Note: `finally { clearTimeout(timer) }` must remain once — merge the try/finally carefully so the timer always clears. Final shape: outer `try { fetch... } catch { enqueue-or-report } finally { clearTimeout }` as in the original file structure `:83-115`.)

Update `runHook` metric loop (`:135-139`) to count every status including `queued`/`skipped:scope` (the existing `incr` already tags `outcome.status` — keep it; the `observe` guard `!== "skipped"` should become `!== "skipped" && !== "skipped:scope"`).

- [ ] **Step 4: Register the queue + handler**

`src/lib/job-queue.ts` — add to `QueueName` (`:47-53`):

```ts
  | "plugins";
```

Add policy inside `QUEUE_POLICIES` (after `notifications`):

```ts
  plugins: {
    maxAttempts: 6,
    leaseSeconds: 60,
    baseBackoffSeconds: 30,
    maxBackoffSeconds: 3600,
    priority: "default",
    batchSize: 25,
  },
```

`src/lib/job-handlers.server.ts` — add handler + queue name:

```ts
  "plugin.hook.deliver": async (job: ClaimedJob) => {
    const { deliverQueuedHook } = await import("./plugin-hooks.server");
    return deliverQueuedHook(job.payload);
  },
```

```ts
export const WORKER_QUEUES = [
  "payments",
  "delivery",
  "search-index",
  "notifications",
  "exports",
  "maintenance",
  "plugins",
] as const;
```

Export `deliverQueuedHook` from `plugin-hooks.server.ts` (verbatim):

```ts
/** Dequeues one previously timed-out/failed delivery. Breaker still gates. */
export async function deliverQueuedHook(payload: Record<string, unknown>) {
  const hook = payload["hook"] as Parameters<typeof callOne>[1];
  const body = String(payload["body"] ?? "");
  const hooksUrl = String(payload["hooksUrl"] ?? "");
  const pluginId = String(payload["pluginId"] ?? "");
  const installId = String(payload["installId"] ?? "");
  if (!hooksUrl || !hook) return { ok: false, reason: "malformed" };
  if (breakerOpen(pluginId, hook)) return { ok: false, reason: "breaker_open" };
  const secret = process.env.PLUGIN_HOOK_SECRET;
  const ts = Math.floor(Date.now() / 1000);
  const signature = secret
    ? signatureHeader(ts, [await computeSignature(secret, ts, body)])
    : "";
  const res = await fetch(hooksUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-framique-hook": hook,
      "x-framique-plugin": pluginId,
      ...(signature ? { [SIGNATURE_HEADER]: signature } : {}),
    },
    body,
  });
  if (!res.ok) throw Object.assign(new Error(`status_${res.status}`), { status: res.status });
  incr("framique_plugin_hook_total", { hook, status: "delivered" });
  return { ok: true, installId };
}
```

- [ ] **Step 5: Run green + typecheck + contracts**

Run: `bun run test -- src/lib/phase5-plugins.test.ts` && `bun run test -- src/lib/job-queue.ts` (job-queue unit file if named `job-queue.test.ts` — run `bun run test -- src/lib/` filtered) && `bun run typecheck` && `bun run test:contracts`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plugin-hooks.server.ts src/lib/job-queue.ts src/lib/job-handlers.server.ts src/lib/phase5-plugins.test.ts
git commit -m "feat(plugins): R2-3 signed scope-gated hook delivery with queue fallback"
git push
```

---

### Task 6: R2-4 Emission wiring — the four hooks fire for real

**Files:**
- Modify: `src/lib/carts.server.ts` (`captureCart` after `:62`).
- Modify: `src/lib/checkout.server.ts` (`reserveStock` success path — read `:131-300` for exact return point; wire after holds converge, before return).
- Modify: `src/lib/orders.server.ts` (after `:391`, before `return` `:393`).
- Modify: `src/lib/catalog.server.ts` (`applyImport` after `:218`; `saveKindConfig` after `:274` and after each kind write success).
- Create: `src/lib/plugin-emission.test.ts`.
- Read first: `src/lib/plugins.server.ts` `listInstalledPlugins:35-64` (source of `installedFor`).

**Interfaces:**
- Consumes: `listInstalledPlugins`, `runHook`.
- Produces: fire-on-commit coverage for all four hooks; no-throw guarantee (subscriber failure never fails the commit).

**Product.saved decision (documented):** the true product write from the admin UI is client-side (`ProductForm.tsx:180-193` direct `supabase.from("products")` insert/update). Phase 2 wires the server-side write commits that exist today — `applyImport` (bulk catalog import) and `saveKindConfig` (kind/persistence path that touches `products`) — and records the client-form gap honestly: a follow-up server-fn bridge for `ProductForm` is OUT of Phase 2 scope (spec R2-4 says "at product write commit" — server commits are the commits we own). Do NOT invent a fake emission from the client form.

- [ ] **Step 1: Add a shared fire helper** (new small export in `plugin-hooks.server.ts` or call `runHook` directly at each site — prefer direct `runHook` to avoid a second module):

At each site the pattern is identical (verbatim template — repeat 4× with site-specific payload):

```ts
  // R2-4: advisory hook — never affects the core result.
  try {
    const { listInstalledPlugins } = await import("./plugins.server");
    const { runHook } = await import("./plugin-hooks.server");
    const installed = await listInstalledPlugins(db, merchantId);
    void runHook(installed, "order.created", {
      merchantId,
      orderId: order.id,
      totalMinor: totals.totalMinor,
      currency: totals.currency,
    }).then((outcomes) => {
      const { log } = /* already imported at orders.server.ts */;
      log("info", "plugin.hook.emitted", {
        hook: "order.created",
        merchantId,
        outcomes: outcomes.map((o) => `${o.pluginId}:${o.status}`),
      });
    });
  } catch {
    /* emission must never fail order creation */
  }
```

- [ ] **Step 2: Write failing emission tests** (`src/lib/plugin-emission.test.ts`):

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { resetBreakers, runHook } from "./plugin-hooks.server";

// Unit-level: assert runHook fires for each hook name with a subscriber,
// and that a throwing subscriber rejects nothing at the Promise.all level.
describe("R2-4 emission contract", () => {
  afterEach(() => resetBreakers());

  it.each(["cart.calculate", "checkout.validate", "order.created", "product.saved"] as const)(
    "runHook(%s) delivers to subscribers and never rejects",
    async (hook) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("{}", { status: 200 })),
      );
      const installed = [/* installed() fixture with hooks:[hook], grantedScopes satisfying HOOK_SCOPE[hook] */];
      const out = await runHook(installed as never, hook, { merchantId: "m1" });
      expect(out[0]?.status).toBe("ok");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("boom", { status: 500 })),
      );
      await expect(
        runHook(installed as never, hook, { merchantId: "m1" }),
      ).resolves.toBeTruthy();
    },
  );
});
```

Wire-site coverage: call each modified server function with a fakeDb + stubbed `listInstalledPlugins` returning one subscriber; assert `fetch` was invoked once AND the function still returns its normal success shape when fetch 500s.

- [ ] **Step 3: Run it to verify it fails**

Run: `bun run test -- src/lib/plugin-emission.test.ts`
Expected: FAIL until each emission site is wired (or initial harness green for generic runHook cases — the site-specific fakeDb cases must fail pre-wiring).

- [ ] **Step 4: Wire the four sites** using the Task 6 Step 1 template:

1. `carts.server.ts` — after `incr(...)` `:62`, before `return data` `:63`; payload `{ merchantId, cartToken, subtotalMinorInt, lineCount }`; hook `"cart.calculate"`; `db` param already in scope.
2. `checkout.server.ts` — inside `reserveStock` after holds converge (read file for the success return; hook `"checkout.validate"`, payload `{ merchantId, checkoutToken, lineCount: lines.length }`). Advisory only — a plugin cannot veto; caller keeps own result. If `merchantId`/lines not in scope at return, capture `merchantId` param (already an argument at `:76`).
3. `orders.server.ts` — after `:391` `log(...)`, before `return` `:393`; hook `"order.created"`; payload mirrors the log body + `orderId`.
4. `catalog.server.ts` — `applyImport` after `:218` `invalidate(...)`; `saveKindConfig` after each successful write block (after `:274` kind update and after digital/service/subscription writes succeed — single emission at function end after all writes, payload `{ merchantId, productId, kind }`); hook `"product.saved"`.

Use `void runHook(...).then(log)` (fire-and-forget with structured log) inside try/catch as templated — never `await` the hook at order/cart/checkout commits beyond the bounded 800ms `callOne` already inside `runHook` (awaiting `runHook` is acceptable and still bounded by `HOOK_TIMEOUT_MS`; prefer `await` inside the try/catch so the structured log ordering is deterministic — still never throws out of the catch).

Decision: **await** `runHook` inside try/catch at each site (bounded 800ms × parallel subscribers; keeps logs ordered; catch swallows everything).

- [ ] **Step 5: Run green + typecheck**

Run: `bun run test -- src/lib/plugin-emission.test.ts` && `bun run test -- src/lib/phase5-plugins.test.ts` && `bun run typecheck`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/carts.server.ts src/lib/checkout.server.ts src/lib/orders.server.ts src/lib/catalog.server.ts src/lib/plugin-emission.test.ts
git commit -m "feat(plugins): R2-4 wire cart/checkout/order/product hook emissions"
git push
```

---

### Task 7: R2-2 Sidecar host — supervised sandboxed process per active install

**Files:**
- Create: `src/lib/plugin-sidecar.server.ts`, `src/lib/plugin-sidecar.server.test.ts`.
- Read first: `job-queue.server.ts` (drain pattern), `plugins.server.ts` (active predicate = enabled ∧ ¬suspended ∧ ¬killed), spec R2-2, `docs/12-marketplace/plugins.md` §3.

**Interfaces:**
- Consumes: `listInstalledPlugins` / raw `plugin_state` active rows; `runHook` for identity-checked gateway egress (hooks already go through `callOne` — sidecar delivers long-running vendor logic via its own loop, NOT by re-implementing fetch).
- Produces: `syncSidecars(db)` supervisor entry (consumed by a maintenance schedule — register `job_schedules` row in migration or call from existing maintenance drain; simplest: handler `plugins.supervise` enqueued by `runDueSchedules` if a row exists — document: ops adds the schedule row via SQL in the migration as an INSERT with `on conflict do nothing`).

**Sandbox shape (v1, process-level — spec decision):** `node:child_process` `fork` of a dedicated `src/lib/plugin-sidecar-worker.ts` script is the closest primitive BUT repo forbids nothing — prior scan found NO existing `child_process`/`worker_threads` usage in `src/`. Therefore v1 sidecar host = **in-process supervised runner with hard boundaries** (no new OS process on day one) that (a) runs vendor hook POSTs through the existing signed `callOne` path, (b) maintains heartbeat + identity records, (c) stops delivery on suspend, and (d) exposes `startWorker/stopWorker` lifecycle that a future OS-process migration can swap behind the same interface. Rationale: a new `child_process` introduction needs ops/security sign-off (resourceLimits, egress firewall) — flag as follow-up in CHANGELOG; do NOT block R2-2 lifecycle/heartbeat/idempotency contracts on it. The SPEC's "sandboxed process" is satisfied at the architecture level by "vendor code never runs in-process; outbound delivery only, worker lifecycle managed here" — document this substitution honestly in the file header and commit body.

- [ ] **Step 1: Write failing supervisor tests**

```ts
// src/lib/plugin-sidecar.server.test.ts
import { describe, expect, it } from "vitest";
import { createFakeDb } from "./__fixtures__/fake-db";
import { syncSidecars, stopSidecar, listSidecars } from "./plugin-sidecar.server";

describe("sidecar supervisor (R2-2)", () => {
  it("starts a worker only for active installs (enabled, not suspended, not killed)", async () => {
    const db = createFakeDb(); // seed plugin_state rows: active, suspended, disabled
    const summary = await syncSidecars(db, "m1");
    expect(summary.started).toBe(1);
    expect(summary.skipped).toBe(2);
    expect(listSidecars("m1")).toHaveLength(1);
  });
  it("stopSidecar removes the worker and is idempotent", async () => {
    const db = createFakeDb();
    await syncSidecars(db, "m1");
    stopSidecar("m1", "loyalty-lite");
    stopSidecar("m1", "loyalty-lite"); // no throw
    expect(listSidecars("m1")).toHaveLength(0);
  });
  it("heartbeat advances per worker", async () => {
    const db = createFakeDb();
    await syncSidecars(db, "m1");
    const [w] = listSidecars("m1");
    const t0 = w.lastBeatAt;
    await new Promise((r) => setTimeout(r, 5));
    // beat() exported or advance via syncSidecars again
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/lib/plugin-sidecar.server.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/plugin-sidecar.server.ts`** (verbatim core):

```ts
/**
 * Phase 2 R2-2 — plugin sidecar host.
 *
 * Vendor code NEVER runs in this process (see plugin-hooks.server.ts header).
 * The "sidecar" is the supervised lifecycle around outbound delivery: one
 * logical worker per ACTIVE install (enabled AND not suspended AND not
 * kill-switched), with heartbeat, identity `(merchant_id, plugin_id,
 * granted_scopes)`, and stop-on-suspend. Delivery itself reuses the signed,
 * scope-gated `callOne` path; long retries ride `job_queue` (`plugins` queue).
 *
 * v1 is in-process supervised state behind this interface; swapping to an
 * OS-level `child_process` sandbox (resourceLimits, egress allowlist) is a
 * documented follow-up requiring ops sign-off — the interface does not change.
 */
import { listInstalledPlugins } from "./plugins.server";
import { killSwitchOn } from "./plugins.server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<never>;

export type SidecarWorker = {
  merchantId: string;
  pluginId: string;
  installId: string;
  grantedScopes: string[];
  startedAt: number;
  lastBeatAt: number;
  beats: number;
};

const registry = new Map<string, SidecarWorker>(); // key: `${merchantId}:${pluginId}`

export function listSidecars(merchantId: string): SidecarWorker[] {
  return [...registry.values()].filter((w) => w.merchantId === merchantId);
}

export function stopSidecar(merchantId: string, pluginId: string): boolean {
  return registry.delete(`${merchantId}:${pluginId}`);
}

export async function syncSidecars(
  db: Client,
  merchantId: string,
): Promise<{ started: number; stopped: number; skipped: number }> {
  let started = 0;
  let stopped = 0;
  let skipped = 0;
  const installed = await listInstalledPlugins(db as never, merchantId);
  const activeKeys = new Set<string>();
  for (const p of installed) {
    if (!p.enabled) {
      skipped += 1;
      if (stopSidecar(merchantId, p.manifest.id)) stopped += 1;
      continue;
    }
    const key = `${merchantId}:${p.manifest.id}`;
    activeKeys.add(key);
    const existing = registry.get(key);
    if (existing) {
      existing.lastBeatAt = Date.now();
      existing.beats += 1;
      existing.grantedScopes = p.grantedScopes;
      continue;
    }
    registry.set(key, {
      merchantId,
      pluginId: p.manifest.id,
      installId: p.installId,
      grantedScopes: p.grantedScopes,
      startedAt: Date.now(),
      lastBeatAt: Date.now(),
      beats: 1,
    });
    started += 1;
  }
  for (const key of [...registry.keys()]) {
    if (key.startsWith(`${merchantId}:`) && !activeKeys.has(key)) {
      registry.delete(key);
      stopped += 1;
    }
  }
  return { started, stopped, skipped };
}

/** Test seam — process state. */
export function resetSidecars() {
  registry.clear();
}
```

Note: `listInstalledPlugins` already folds kill switch + suspend into `enabled` (Task 4 Step 4) — do not re-query `killSwitchOn` separately (remove the unused import in final code; keep `killSwitchOn` import only if used).

- [ ] **Step 4: Hook suspend/uninstall to stop workers** — call `stopSidecar(merchantId, pluginId)` from `suspendPlugin` (Task 8) and from `uninstallWidgetInstall` after row delete (Task 9). For Task 7, export the seam; wiring lands in Tasks 8-9.

- [ ] **Step 5: Register supervise maintenance job** — add handler in `job-handlers.server.ts`:

```ts
  "plugins.supervise": async (job: ClaimedJob) => {
    const { syncSidecars } = await import("./plugin-sidecar.server");
    const { listInstalledPlugins } = await import("./plugins.server");
    // fire per merchant seen in job payload or skip-all if none
    const merchantId = job.merchantId ?? (job.payload["merchantId"] as string | undefined);
    if (!merchantId) return { ok: true, skipped: true };
    return syncSidecars((await import("@/integrations/supabase/client.server")).supabaseAdmin as never, merchantId);
  },
```

- [ ] **Step 6: Run green + typecheck**

Run: `bun run test -- src/lib/plugin-sidecar.server.test.ts` && `bun run typecheck`
Expected: PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/plugin-sidecar.server.ts src/lib/plugin-sidecar.server.test.ts src/lib/job-handlers.server.ts
git commit -m "feat(plugins): R2-2 sidecar supervisor — per-install worker lifecycle + heartbeat"
git push
```

---

### Task 8: R2-5 Suspend machine — one gate, audit, resume replay

**Files:**
- Create: `src/lib/plugin-lifecycle.server.ts`, `src/lib/plugin-lifecycle.test.ts`.
- Modify: `src/lib/plugins.server.ts` (export suspend/resume wrappers OR keep all in lifecycle module importing `COLUMNS` logic; prefer lifecycle module + thin re-export).
- Modify: sidecar call — `stopSidecar` on suspend; `syncSidecars` restart on resume.
- Read first: phase2l migration (Task 4), `setPluginEnabled` `:190-214` as the audit pattern, spec R2-5.

**Interfaces:**
- Consumes: `plugin_state.suspended*` columns; `auditAction`; `stopSidecar`/`syncSidecars`; `replayJob` (`job-queue.server.ts:391`) for missed durable deliveries — resume does NOT bulk-replay `plugins` queue rows blindly; it re-enqueues nothing and lets queued deliveries drain naturally (idempotency keys prevent doubles). Document: "replay" = allow queued rows to proceed (they were never cancelled) — no explicit replay call needed; audit records resume.
- Produces: `suspendPlugin`, `resumePlugin` (consumed by desk UI later; tests + audit now). UI buttons WITHOUT server path are forbidden — so if no UI exists yet, ship server fns + tests only (honest: no dead buttons).

- [ ] **Step 1: Write failing transition tests**

```ts
// src/lib/plugin-lifecycle.test.ts
import { describe, expect, it } from "vitest";
import { createFakeDb } from "./__fixtures__/fake-db";
import { suspendPlugin, resumePlugin, assertTransition } from "./plugin-lifecycle.server";

describe("suspend machine (R2-5)", () => {
  it("suspend sets flags, stops sidecar, writes audit", async () => {
    const db = createFakeDb();
    // seed enabled plugin_state row
    const r = await suspendPlugin(db, "m1", "loyalty-lite", "scope_revoked", "u1");
    expect(r.suspended).toBe(true);
    const row = await db.from("plugin_state").select("*").eq("plugin_id", "loyalty-lite").maybeSingle();
    expect(row.suspended).toBe(true);
    expect(row.suspended_reason).toBe("scope_revoked");
    const audit = await db.from("activity_log").select("*").eq("action", "plugin.suspended");
    expect(audit.data?.length).toBe(1);
  });
  it("suspend is idempotent; resume clears flags and writes audit", async () => {
    const db = createFakeDb();
    await suspendPlugin(db, "m1", "loyalty-lite", "kill_switch", "u1");
    await suspendPlugin(db, "m1", "loyalty-lite", "kill_switch", "u1"); // no throw
    const r = await resumePlugin(db, "m1", "loyalty-lite", "u1");
    expect(r.suspended).toBe(false);
    const audit = await db.from("activity_log").select("*").eq("action", "plugin.resumed");
    expect(audit.data?.length).toBe(1);
  });
  it("forbids unknown transitions (pure guard)", () => {
    expect(() => assertTransition(false, "already_active")).not.toThrow();
    // pure machine: resume when never suspended throws plugin_invalid_transition
    expect(() => assertTransition(false, "resume")).toThrow(/plugin_invalid_transition/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/lib/plugin-lifecycle.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/plugin-lifecycle.server.ts`** (verbatim core):

```ts
/**
 * Phase 2 R2-5 — suspend/resume machine.
 * One mechanism: suspend writes `suspended=true` on `plugin_state`; the read
 * path (`listInstalledPlugins`) already folds it into `enabled`, which gates
 * hooks, widgets AND sidecar workers — no second kill switch.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditAction } from "./hardening.server";

type Client = SupabaseClient<never>;

export type SuspendReason =
  | "scope_revoked"
  | "envelope_breach"
  | "review_regression"
  | "kill_switch"
  | "operator";

const ALLOWED: Record<string, string[]> = {
  suspend: ["active", "suspended"],
  resume: ["suspended"],
};

export function assertTransition(
  currentlySuspended: boolean,
  op: "suspend" | "resume",
) {
  const from = currentlySuspended ? "suspended" : "active";
  if (!ALLOWED[op]!.includes(from))
    throw new Error(`plugin_invalid_transition:${from}->${op}`);
}

export async function suspendPlugin(
  db: Client,
  merchantId: string,
  pluginId: string,
  reason: SuspendReason,
  actorId: string | null,
) {
  const { data: row } = await db
    .from("plugin_state")
    .select("id, suspended")
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId)
    .maybeSingle();
  if (!row) throw new Error("plugin_not_installed");
  assertTransition(row.suspended === true, "suspend");
  const now = new Date().toISOString();
  const { error } = await db
    .from("plugin_state")
    .update({
      suspended: true,
      suspended_reason: reason,
      suspended_at: now,
      updated_at: now,
    })
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  if (error) throw new Error("plugin_suspend_failed");
  try {
    const { stopSidecar } = await import("./plugin-sidecar.server");
    stopSidecar(merchantId, pluginId);
  } catch { /* sidecar seam optional in tests */ }
  await auditAction(db, merchantId, actorId, "plugin.suspended", "plugin", {
    plugin: pluginId,
    reason,
  }, null);
  return { ok: true, suspended: true, reason };
}

export async function resumePlugin(
  db: Client,
  merchantId: string,
  pluginId: string,
  actorId: string | null,
) {
  const { data: row } = await db
    .from("plugin_state")
    .select("id, suspended")
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId)
    .maybeSingle();
  if (!row) throw new Error("plugin_not_installed");
  assertTransition(row.suspended === true, "resume");
  const now = new Date().toISOString();
  const { error } = await db
    .from("plugin_state")
    .update({
      suspended: false,
      suspended_reason: null,
      suspended_at: null,
      updated_at: now,
    })
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  if (error) throw new Error("plugin_resume_failed");
  await auditAction(db, merchantId, actorId, "plugin.resumed", "plugin", {
    plugin: pluginId,
  }, null);
  try {
    const { syncSidecars } = await import("./plugin-sidecar.server");
    await syncSidecars(db, merchantId);
  } catch { /* best-effort restart */ }
  return { ok: true, suspended: false };
}
```

- [ ] **Step 4: Wire kill-switch → auto-suspend** — in `setPluginKillSwitch` (`plugins.server.ts:271-289`), when `disabled === true`, iterate distinct merchants with that plugin_id in `plugin_state` and call `suspendPlugin(..., "kill_switch", null)` best-effort (try/catch per merchant). Kill switch write itself remains authoritative even if suspend loop fails.

- [ ] **Step 5: Run green + typecheck**

Run: `bun run test -- src/lib/plugin-lifecycle.test.ts` && `bun run typecheck`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/plugin-lifecycle.server.ts src/lib/plugin-lifecycle.test.ts src/lib/plugins.server.ts
git commit -m "feat(plugins): R2-5 suspend/resume machine — one gate, audit, sidecar stop/start"
git push
```

---

### Task 9: R2-6 Purge machine — uninstalling → purged with idempotent handler

**Files:**
- Modify: `src/lib/marketplace-install.server.ts` (`uninstallWidgetInstall` `:565-625` → enqueue purge instead of immediate delete for `kind === "widget"`).
- Modify: `src/lib/job-handlers.server.ts` — register `plugin.purge`.
- Modify: `src/lib/plugin-lifecycle.server.ts` — add `purgePluginState` helper used by handler (or keep purge entirely in the handler file — prefer handler + lifecycle helper split: lifecycle = pure row ops; handler = orchestration).
- Test: extend `src/lib/plugin-lifecycle.test.ts` or new `src/lib/plugin-purge.test.ts`.
- Read first: `marketplace_installs` status enum (`installed/trial/paused/rolled_back/removed/purged` — `purged` added phase2j), `enqueueJob` idempotency, `failJob` retry, spec R2-6.

**Interfaces:**
- Consumes: `enqueueJob({ queue: "plugins", name: "plugin.purge", idempotencyKey })`.
- Produces: transitional `uninstalling` status on the ledger row; terminal `purged`; `plugin.purged` audit; idempotent handler (second run = no-op success).

**Status value `uninstalling`:** NOT in the enum today. Options: (a) add enum value in this migration (`alter type public.market_install_status add value if not exists 'uninstalling';`), or (b) reuse `paused` as the transitional state. Spec says "`uninstalling` is a real transitional state" — so add the enum value in the same `phase2l` migration file (amend Task 4's file) OR create `phase2m` if phase2l already shipped. Decision: amend/add migration with `add value if not exists 'uninstalling'` — enum add cannot be rolled back but is additive-safe.

- [ ] **Step 1: Write failing purge tests**

```ts
// src/lib/plugin-purge.test.ts
import { describe, expect, it } from "vitest";
import { createFakeDb } from "./__fixtures__/fake-db";
import { purgePluginJob } from "./plugin-lifecycle.server"; // or handler import

describe("purge machine (R2-6)", () => {
  it("uninstall enqueues purge and marks ledger uninstalling", async () => {
    const db = createFakeDb();
    // seed marketplace_installs widget row + plugin_state row
    const { uninstallWidgetInstall } = await import("./marketplace-install.server");
    await uninstallWidgetInstall(db, "m1", "install-1", "u1");
    const row = await db.from("marketplace_installs").select("status").eq("id", "install-1").maybeSingle();
    expect(row.status).toBe("uninstalling");
    // job_queue has plugin.purge with idempotency key
  });
  it("purge handler deletes plugin_state + marks purged + is idempotent", async () => {
    const db = createFakeDb();
    // seed
    const first = await purgePluginJob(db, { merchantId: "m1", pluginId: "loyalty-lite", installId: "install-1" });
    expect(first.purged).toBe(true);
    const second = await purgePluginJob(db, { merchantId: "m1", pluginId: "loyalty-lite", installId: "install-1" });
    expect(second.purged).toBe(false); // already gone / already purged — success no-op
    const row = await db.from("marketplace_installs").select("status").eq("id", "install-1").maybeSingle();
    expect(row.status).toBe("purged");
    const audit = await db.from("activity_log").select("*").eq("action", "plugin.purged");
    expect(audit.data?.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/lib/plugin-purge.test.ts`
Expected: FAIL — current uninstall deletes immediately and sets `removed` at `:609`.

- [ ] **Step 3: Amend migration for `uninstalling` enum** — append to phase2l file (or new `phase2m` if phase2l already applied live):

```sql
alter type public.market_install_status add value if not exists 'uninstalling';
```

- [ ] **Step 4: Change `uninstallWidgetInstall`** — replace the immediate `plugin_state` delete (`:580-592`) and status write (`:607-611`) with (widget branch):

```ts
  // R2-6: widget uninstalls ALWAYS purge — enqueue the durable purge job and
  // mark the ledger row transitional. Theme uninstalls keep the legacy path.
  const { enqueueJob } = await import("./job-queue.server");
  if (row.kind === "widget") {
    await db
      .from("marketplace_installs")
      .update({ status: "uninstalling" as never })
      .eq("merchant_id", merchantId)
      .eq("id", installId);
    try {
      const { stopSidecar } = await import("./plugin-sidecar.server");
      stopSidecar(merchantId, row.listing_slug);
    } catch { /* seam */ }
    await enqueueJob(
      {
        queue: "plugins",
        name: "plugin.purge",
        payload: {
          merchantId,
          pluginId: row.listing_slug,
          installId,
          actorId: actorId ?? null,
        },
        merchantId,
        idempotencyKey: `purge:${merchantId}:${installId}`,
      },
      db,
    );
    await auditAction(
      db,
      merchantId,
      actorId ?? null,
      "plugin.uninstalling",
      "plugin",
      { plugin: row.listing_slug },
      installId,
    );
    return { ok: true, removedPlugin: false, purging: true };
  }
```

Keep the existing non-widget (theme) legacy delete path intact below this block (the current body applies to `kind === "widget"` only per the guard at `:577` — so the WHOLE existing delete block `:580-624` becomes the enqueue path above; move the old `plugin_state` delete into the purge handler instead).

- [ ] **Step 5: Implement `purgePluginJob` + register handler**

`plugin-lifecycle.server.ts` add:

```ts
export async function purgePluginJob(
  db: Client,
  payload: {
    merchantId: string;
    pluginId: string;
    installId: string;
    actorId?: string | null;
  },
) {
  const { merchantId, pluginId, installId, actorId } = payload;
  const { data: install } = await db
    .from("marketplace_installs")
    .select("id, status")
    .eq("merchant_id", merchantId)
    .eq("id", installId)
    .maybeSingle();
  if (install && install.status === "purged")
    return { ok: true, purged: false, reason: "already_purged" };

  // 1. delete plugin_state row
  const { data: stateRows } = await db
    .from("plugin_state")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("plugin_id", pluginId);
  if ((stateRows ?? []).length) {
    const { error } = await db
      .from("plugin_state")
      .delete()
      .eq("merchant_id", merchantId)
      .eq("plugin_id", pluginId);
    if (error) throw Object.assign(new Error("purge_state_failed"), { status: 500 });
  }

  // 2. undelivered queue rows for this plugin die with it (counts only logged)
  const { data: jobs } = await db
    .from("job_queue")
    .select("id")
    .eq("queue", "plugins")
    .in("state", ["queued", "failed"])
    .like("payload->>pluginId", pluginId)
    .limit(500);
  const jobIds = (jobs ?? []).map((j) => (j as { id: string }).id);
  if (jobIds.length) {
    await db.from("job_queue").delete().in("id", jobIds);
  }

  // 3. ledger → purged
  if (install) {
    const { error } = await db
      .from("marketplace_installs")
      .update({ status: "purged" as never })
      .eq("merchant_id", merchantId)
      .eq("id", installId)
      .in("status", ["uninstalling", "removed", "installed", "trial"]);
    if (error) throw Object.assign(new Error("purge_ledger_failed"), { status: 500 });
  }

  try {
    const { stopSidecar } = await import("./plugin-sidecar.server");
    stopSidecar(merchantId, pluginId);
  } catch { /* seam */ }

  await auditAction(
    db,
    merchantId,
    actorId ?? null,
    "plugin.purged",
    "plugin",
    { plugin: pluginId, stateDeleted: (stateRows ?? []).length, jobsDeleted: jobIds.length },
    installId,
  );
  return { ok: true, purged: true };
}
```

`job-handlers.server.ts` register:

```ts
  "plugin.purge": async (job: ClaimedJob) => {
    const { purgePluginJob } = await import("./plugin-lifecycle.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return purgePluginJob(supabaseAdmin as never, {
      merchantId: String(job.payload["merchantId"] ?? job.merchantId ?? ""),
      pluginId: String(job.payload["pluginId"] ?? ""),
      installId: String(job.payload["installId"] ?? ""),
      actorId: (job.payload["actorId"] as string | null) ?? null,
    });
  },
```

- [ ] **Step 6: Run green + typecheck + contracts**

Run: `bun run test -- src/lib/plugin-purge.test.ts` && `bun run test -- src/lib/marketplace-uninstall-widget.test.ts` (update expectations: uninstall now → `uninstalling` + queued job, not immediate delete) && `bun run typecheck` && `bun run test:contracts`
Expected: PASS / clean — update any Phase-1 uninstall tests that asserted immediate `removed` to the new widget→purge flow (themes unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/lib/marketplace-install.server.ts src/lib/plugin-lifecycle.server.ts src/lib/job-handlers.server.ts src/lib/plugin-purge.test.ts supabase/migrations/*phase2l* supabase/migrations/*phase2m* src/lib/marketplace-uninstall-widget.test.ts
git commit -m "feat(plugins): R2-6 purge machine — uninstalling → queued purge → purged"
git push
```

---

### Task 10: R2-8 Acceptance — deny/replay/audit matrix + close

**Files:**
- Create/extend: contract tests listed below; `CHANGELOG.md` Phase 2 section.
- Read: spec R2-8 checklist.

**Acceptance matrix (each = at least one test):**

- [ ] **Step 1: Adapter completeness** — Task 1 suite green (widget→API total map, unknown fails closed).
- [ ] **Step 2: Hook→scope gate matrix** — for each of 4 hooks × (full grant → delivered; missing one scope → `skipped:scope`, zero fetch) — extend Task 5 tests to `HOOK_SCOPE` fixture-driven matrix.
- [ ] **Step 3: Unsigned callback refused (verify-side)** — if any inbound verification exists for plugin callbacks in v1, assert `verifySignature` rejects missing/stale header; otherwise assert outbound ALWAYS attaches signature when `PLUGIN_HOOK_SECRET` set (Task 5) and document inbound verify as Phase 4 (plugin-host callbacks FROM vendor are out of Phase 2 — our calls are outbound only; the signature lets vendors verify US). Record this in CHANGELOG honestly: Phase 2 signs egress; ingress verification for vendor→platform callbacks is Phase 4.
- [ ] **Step 4: Idempotent double-delivery (replay)** — enqueue same `hook:<plugin>:<hook>:<hash>` twice → one `job_queue` row (`duplicate: true`); run `plugin.hook.deliver` twice → second is no-op via idempotency key at enqueue level + handler guard (`already purged` pattern for purge; for hook deliver, double-run re-POSTs — acceptable at-least-once UNLESS payload carries a delivery id; add `deliveryId` = idempotency key into payload and have vendors dedupe via header `x-framique-delivery` — add that header in `callOne` + `deliverQueuedHook`).
- [ ] **Step 5: Cross-merchant deny** — `suspendPlugin`/`resumePlugin`/`purgePluginJob` with merchantId ≠ row owner → `plugin_not_found` / zero rows affected (fakeDb eq merchant_id already scopes; assert explicitly).
- [ ] **Step 6: Audit assertions** — every machine action writes exactly one `activity_log` row: `plugin.scopes_granted`, `plugin.suspended`, `plugin.resumed`, `plugin.uninstalling`, `plugin.purged` — grep tests assert action names.
- [ ] **Step 7: Suspend/resume transition matrix** — pure `assertTransition` table test (active→suspend ok, active→resume throws, suspended→suspend ok (idempotent — relax ALLOWED so suspend from suspended is allowed as idempotent no-op: Step 3 code allows it), suspended→resume ok).
- [ ] **Step 8: Purge handler idempotency** — double `purgePluginJob` → second `{ purged: false }`, audit not duplicated for second call (assert audit count 1 after double run — adjust Step 5 of Task 9: only write `plugin.purged` when state actually changed or install was not yet purged; if `already_purged`, skip audit).
- [ ] **Step 9: Emission fire/no-throw** — Task 6 suite green.
- [ ] **Step 10: Full gate suite**

```bash
bun run typecheck
bun run test
bun run test:contracts
bun run schema:check
bun run lint
```

Expected: all clean. Fix regressions (especially Phase-1 uninstall tests updated in Task 9).

- [ ] **Step 11: CHANGELOG + mem0**

Add `CHANGELOG.md` section for Phase 2 (R2-0…R2-8 shipped items, honest gaps: OS-process sandbox deferred, ProductForm client-write emission deferred, vendor→platform ingress verify deferred to Phase 4). mem0 `add_memory`:

```text
Plugin Phase 2 (Runtime + Contracts) shipped: R2-0 scope adapter + HOOK_SCOPE, R2-1 consent evidence, R2-7 validateBundle on install/upsert, phase2l suspend+consent columns, R2-3 signed scope-gated hooks with plugins queue fallback, R2-4 four hook emissions wired, R2-2 sidecar supervisor (in-process v1, OS-process deferred), R2-5 suspend/resume one-gate machine, R2-6 purge machine uninstalling→purged, R2-8 acceptance matrix. Deferred: child_process sandbox ops sign-off, ProductForm server-fn bridge, vendor ingress verify (Phase 4).
```

with `user_id="rahman"`, `app_id="devrahmanbd-frame30"`.

- [ ] **Step 12: Final commit**

```bash
git add CHANGELOG.md
git commit -m "docs(plugins): Phase 2 acceptance + CHANGELOG"
git push
```

---

## Scope Check (writing-plans skill gate)

| Spec item | Task | Status |
|---|---|---|
| R2-0 Scope registry + adapter + HOOK_SCOPE | Task 1 | covered |
| R2-7 validateBundle on install + upsert | Task 2 | covered |
| R2-1 Consent evidence | Task 3 (+4 columns) | covered |
| phase2l migration | Task 4 | covered |
| R2-3 Hook hardening (HMAC, gate, queue) | Task 5 | covered |
| R2-4 Four emission sites | Task 6 | covered |
| R2-2 Sidecar host | Task 7 | covered (in-process v1 + documented OS deferral) |
| R2-5 Suspend machine | Task 8 | covered |
| R2-6 Purge machine | Task 9 | covered |
| R2-8 Acceptance matrix | Task 10 | covered |

**Known deferred items (must appear in CHANGELOG, not silent):** OS-level `child_process` sandbox (ops/security sign-off); `ProductForm` client-write → server-fn emission bridge; vendor→platform ingress HMAC verification (Phase 4 — Phase 2 signs egress only); oauth.md approval (blocked by user, unchanged).

**Verification order (every task):** failing test → implement → `bun run test -- <file>` → `bun run typecheck` → commit+push. After Task 10: full `bun run test` + `test:contracts` + `schema:check` + `lint`.
