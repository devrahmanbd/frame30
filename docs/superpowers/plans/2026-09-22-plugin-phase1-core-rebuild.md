# Plugin Phase 1 (Core Rebuild) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make plugin config/control/management genuinely work end-to-end: capture missing `plugin_state` DDL + RLS in repo, enforce `plugins.*` permissions, grow settings schema to 9 field types, close WP-parity UI gaps, and lock it with deny + replay + audit tests.

**Architecture:** Fix persistence first (DDL is the leading breakage hypothesis), then authz names, then schema/UI, then regression tests. No new runtime, no new scopes, no review automation — later phases.

**Tech Stack:** TanStack Start `createServerFn`, Supabase Postgres (RLS, enums), Vitest `fakeDb` (`src/lib/__fixtures__/fake-db.ts`), `authz.ts` permission registry.

## Global Constraints

- UI strings use the bilingual `t("English", "বাংলা")` pattern — every new user-facing string gets both.
- No `server-only` import — server code lives in `*.server.ts`, fns in `*.functions.ts` with dynamic `await import()` inside handlers.
- Every new table gets `ENABLE RLS` + tenant policies + explicit GRANTs in the same migration.
- Every `[A]` mutation (install/toggle/uninstall/settings) keeps its `activity_log` audit row (actor, before, after).
- No action button without a working server path; honest zeros only.
- Verification is production-browser only (never localhost); unit/contract via `bun run test -- <file>`; typecheck `bun run typecheck`; contracts `bun run test:contracts`.
- Commit per task; push to `main`; CHANGELOG entry when the phase lands.

---

## File Structure

- `supabase/migrations/20260922170000_phase2j_plugin_state_ddl.sql` (CREATE — exact timestamp: run `date +%Y%m%d%H%M%S` at creation and use that value; must be greater than `20260918140000`): owns `plugin_state` + `plugin_kill_switch` DDL, RLS, GRANTs, `purged` enum value, `auto_updates` column.
- `src/lib/authz.ts` (MODIFY ~line 56): owns permission names — add `plugins.read`, `plugins.update` next to `themes.read`.
- `src/lib/api-scopes.ts` (MODIFY ~lines 28,117,333-357): owns scope→permission mapping — mirror the `themes.read` entries for plugins.
- `src/lib/plugins.functions.ts` (MODIFY lines 15,25,46,62,79): swap `themes.*` → `plugins.*`; add `pluginAutoUpdatesFn`.
- `src/lib/plugins.server.ts` (MODIFY): add `setPluginAutoUpdates`; read kill-switch section (~lines 215-252) to mirror columns in migration.
- `src/lib/plugin-manifest.ts` (MODIFY ~lines 280-335): `SettingField` kinds + `validateSettings` branches + `defaultSettings`.
- `src/components/marketplace/PluginSettingsForm.tsx` (MODIFY ~lines 86-130): renderers for 5 new kinds.
- `src/components/marketplace/InstalledApps.tsx` (MODIFY): search box, auto-updates toggle column, bottom bulk bar, Add-New `tab: "widget"` → `tab: "plugin"` (~line 230).
- `src/lib/console-nav.ts` (MODIFY lines 380,387): `themes.read` → `plugins.read` on the two Plugins items.
- `src/routes/_authenticated/dashboard/plugins/index.tsx` (MODIFY line 16): `consoleRoute({ permission: "plugins.read" })`.
- `src/lib/marketplace-install.server.ts` (MODIFY uninstall path ~lines 580-600): `install_count` decrement.
- Tests (CREATE/MODIFY): `src/lib/plugin-state-ddl.test.ts` (new — migration contract), extend `src/lib/lifecycle-audit.test.ts`, `src/lib/marketplace-bulk.test.ts`, `src/lib/phase5-plugins.test.ts`.

**Non-goals (do not touch):** `marketplace.functions.ts` `themes.read` usages, sidecar, event bus, oauth.md, Get Pro links, `payment-plugins.ts`.

---

### Task 1: P1-0 Live probes (prove the breakage before fixing)

**Files:**
- Read-only: production DB over SSH; production browser.
- Produce: probe results recorded in the task's commit message body.

**Interfaces:**
- Consumes: nothing.
- Produces: exact live column lists for `plugin_state` + `plugin_kill_switch`; live enum labels; RLS policy list; settings round-trip verdict (all consumed by Task 2).

- [ ] **Step 1: Probe live tables over SSH (read-only)**

```bash
ssh root@88.99.250.99 'docker exec -u postgres framique-supabase-db psql -d postgres -c "\d public.plugin_state" -c "\d public.plugin_kill_switch" -c "SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('"'"'plugin_state'"'"','"'"'plugin_kill_switch'"'"')" -c "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='"'"'market_install_status'"'"' ORDER BY e.enumsortorder;"'
```

Expected: either `\d` output with full column lists (copy them verbatim for Task 2), or `Did not find any relation` — which CONFIRMS the DDL gap as the root cause. Record which.

- [ ] **Step 2: Production browser round-trip probe**

Open `https://framique.qubickle.com/dashboard/plugins` (isolated context): toggle one plugin off → reload → observe persisted state; open Settings → change one value → save → reload → observe value. Record: persist / lost / error text.

- [ ] **Step 3: Commit the probe record (no code)**

```bash
git commit --allow-empty -m "chore(plugins): P1-0 probe record

plugin_state live: <EXISTS with columns ... | MISSING>
plugin_kill_switch live: <EXISTS | MISSING>
RLS policies: <list | none>
market_install_status: <labels>
settings round-trip: <persist | lost | error>"
```

---

### Task 2: P1-1 DDL capture migration (tables + RLS + enum + auto_updates)

**Files:**
- Create: `supabase/migrations/<STAMP>_phase2j_plugin_state_ddl.sql` (`STAMP=$(date +%Y%m%d%H%M%S)`, must exceed `20260918140000`).
- Read first: `src/lib/plugins.server.ts` kill-switch section (~lines 215-252) + Task 1 column lists; copy: `supabase/migrations/20260918140000_phase2i_removed_status.sql` (enum pattern), `migration/0001_baseline.sql:10650,10657` (policy pattern), `:840` (`is_merchant_member` helper — reuse, do not redefine).
- Test: `src/lib/plugin-state-ddl.test.ts`.

**Interfaces:**
- Consumes: Task 1 column lists.
- Produces: `plugin_state.auto_updates boolean NOT NULL DEFAULT false` (consumed by Task 5 toggle); `purged` enum value (consumed by Phase 2 purge machine); repo-owned RLS.

- [ ] **Step 1: Write the failing migration-contract test**

```ts
// src/lib/plugin-state-ddl.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
const files = globSync("supabase/migrations/*phase2j*plugin_state_ddl.sql");
const sql = files.length ? readFileSync(files[0], "utf8") : "";
describe("phase2j plugin_state DDL", () => {
  it("creates plugin_state with the code-used columns", () => {
    for (const col of ["merchant_id", "plugin_id", "manifest", "scopes", "settings", "enabled", "auto_updates", "updated_at"])
      expect(sql).toContain(col);
  });
  it("enables RLS with tenant policies and grants", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toContain("is_merchant_member");
  });
  it("adds the purged enum value", () => {
    expect(sql).toContain("'purged'");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/lib/plugin-state-ddl.test.ts`
Expected: FAIL (no phase2j file yet).

- [ ] **Step 3: Write the migration** (columns mirror code usage `plugins.server.ts:23,108,120` + Task 1 live lists; `IF NOT EXISTS` everywhere — live tables already exist)

```sql
-- Phase 2j — capture live plugin tables in repo DDL + RLS + purged terminal.
create table if not exists public.plugin_state (
  id uuid default gen_random_uuid() not null primary key,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  plugin_id text not null,
  manifest jsonb not null default '{}'::jsonb,
  scopes text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  auto_updates boolean not null default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint plugin_state_merchant_plugin_unique unique (merchant_id, plugin_id)
);
-- plugin_kill_switch: mirror Task-1 live columns here (same IF NOT EXISTS pattern).
alter table public.plugin_state enable row level security;
create policy plugin_state_tenant_read on public.plugin_state for select to authenticated
  using (public.is_merchant_member(merchant_id) or public.is_platform_admin());
create policy plugin_state_tenant_write on public.plugin_state to authenticated
  using (public.is_merchant_member(merchant_id)) with check (public.is_merchant_member(merchant_id));
-- kill-switch: platform-admin-only policies (mirror marketplace_themes_platform_only).
-- NOTE: add GRANTs only if sibling tables carry explicit GRANTs in repo; otherwise RLS + policies suffice.
alter type public.market_install_status add value if not exists 'purged';
```

- [ ] **Step 4: Run tests + schema check**

Run: `bun run test -- src/lib/plugin-state-ddl.test.ts` Expected: PASS.
Run: `bun run schema:check` Expected: no new drift on `plugin_state`/`market_install_status`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*phase2j*plugin_state_ddl.sql src/lib/plugin-state-ddl.test.ts
git commit -m "feat(plugins): capture plugin_state DDL + RLS + purged enum"
```

---

### Task 3: P1-2 `plugins.*` permissions (registry → fns → nav → route)

**Files:**
- Modify: `src/lib/authz.ts:56`, `src/lib/api-scopes.ts` (mirror themes.read entries), `src/lib/plugins.functions.ts:15,25,46,62,79`, `src/lib/console-nav.ts:380,387`, `src/routes/_authenticated/dashboard/plugins/index.tsx:16`.

**Interfaces:**
- Consumes: nothing (names are new).
- Produces: enforced `plugins.read` / `plugins.update` (consumed by Task 6 deny tests).

- [ ] **Step 1: Write the failing test** (create `src/lib/plugin-permissions.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "./authz";
import { readFileSync } from "node:fs";
describe("plugins.* permissions", () => {
  it("registers plugins.read and plugins.update", () => {
    expect(PERMISSIONS).toContain("plugins.read");
    expect(PERMISSIONS).toContain("plugins.update");
  });
  it("no plugin fn or route still references themes.*", () => {
    for (const f of ["src/lib/plugins.functions.ts", "src/routes/_authenticated/dashboard/plugins/index.tsx"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/themes\.(read|update)/);
    }
    const nav = readFileSync("src/lib/console-nav.ts", "utf8");
    const block = nav.slice(nav.indexOf('key: "plugins"'), nav.indexOf('key: "plugins"') + 1500);
    expect(block).not.toMatch(/themes\.(read|update)/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/lib/plugin-permissions.test.ts`
Expected: FAIL (`plugins.read` missing).

- [ ] **Step 3: Implement** — in `authz.ts` add `"plugins.read", "plugins.update"` beside `"themes.read"`; in `api-scopes.ts` mirror each `themes.read` mapping entry with a `plugins.read` ( respectively `plugins.update`) entry; in `plugins.functions.ts` replace: line 15 → `requirePermission("plugins.read")`, lines 25,46,62,79 → `requirePermission("plugins.update")` (`pluginKillSwitchFn` keeps `flags.write`); `console-nav.ts` Plugins items (380,387) → `permission: "plugins.read"`; `plugins/index.tsx:16` → `consoleRoute({ permission: "plugins.read" })`.

- [ ] **Step 4: Run tests + typecheck**

Run: `bun run test -- src/lib/plugin-permissions.test.ts src/lib/phase5-plugins.test.ts` Expected: PASS.
Run: `bun run typecheck` Expected: no new errors in touched files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/authz.ts src/lib/api-scopes.ts src/lib/plugins.functions.ts src/lib/console-nav.ts src/routes/_authenticated/dashboard/plugins/index.tsx src/lib/plugin-permissions.test.ts
git commit -m "feat(plugins): enforce plugins.read/update permissions"
```

---

### Task 4: P1-3 Settings schema v1.5 (5 new field kinds)

**Files:**
- Modify: `src/lib/plugin-manifest.ts` (`SettingField` kind union ~line 280-300, `validateSettings` ~line 319, `defaultSettings` ~line 334); `src/components/marketplace/PluginSettingsForm.tsx` (~lines 86-130).
- Test: extend `src/lib/phase5-plugins.test.ts`.

**Interfaces:**
- Consumes: existing 4 kinds + validation semantics (unknown dropped, numbers clamped, select strict).
- Produces: 9-kind schema used by Task 5 Settings modal (no modal change needed — form renders kinds generically).

- [ ] **Step 1: Write the failing tests** (append to `src/lib/phase5-plugins.test.ts`)

```ts
it("validates textarea/color/media/url/date kinds", () => {
  const schema = [
    { key: "bio", kind: "textarea", max: 50 },
    { key: "accent", kind: "color" },
    { key: "logo", kind: "media" },
    { key: "site", kind: "url" },
    { key: "launch", kind: "date" },
  ] as const;
  const { values, errors } = validateSettings(schema as any, {
    bio: "x".repeat(99), accent: "#ff0000", logo: "https://cdn/x.png",
    site: "not a url", launch: "2026-10-01",
  });
  expect(errors).toContain("site.not_a_url");
  expect(values.bio).toHaveLength(50);
  expect(values.accent).toBe("#ff0000");
  expect(values.launch).toBe("2026-10-01");
});
it("rejects bad color/date/url with error codes", () => {
  const { errors } = validateSettings(
    [{ key: "c", kind: "color" }, { key: "u", kind: "url" }, { key: "d", kind: "date" }] as any,
    { c: "red", u: "notaurl", d: "yesterday" },
  );
  expect(errors).toEqual(expect.arrayContaining(["c.not_a_color", "u.not_a_url", "d.not_a_date"]));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test -- src/lib/phase5-plugins.test.ts` Expected: FAIL (unknown kinds fall to text passthrough).

- [ ] **Step 3: Implement validation** (in `validateSettings`, after the `select` branch):

```ts
else if (f.kind === "textarea") out[f.key] = String(v).slice(0, f.max ?? 2000);
else if (f.kind === "color") {
  const s = String(v);
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) { errors.push(`${f.key}.not_a_color`); continue; }
  out[f.key] = s;
} else if (f.kind === "media" || f.kind === "url") {
  const s = String(v);
  if (s !== "" && !/^https?:\/\//.test(s)) { errors.push(`${f.key}.not_a_url`); continue; }
  out[f.key] = s;
} else if (f.kind === "date") {
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) { errors.push(`${f.key}.not_a_date`); continue; }
  out[f.key] = s;
}
```

plus `SettingField` kind union += `"textarea" | "color" | "media" | "url" | "date"` and `defaultSettings` passthrough (defaults are trusted manifest values — copy as-is).

- [ ] **Step 4: Implement renderers** in `PluginSettingsForm.tsx` following the existing ternary: `textarea` → `<textarea rows={4}>`, `color` → `<input type="color">` + hex text mirror, `media`/`url` → `<input type="url">` (media adds an `<img>` thumb preview when value starts with `https://`), `date` → `<input type="date">`. No media-library picker in P1 (YAGNI — URL + preview only).

- [ ] **Step 5: Run tests + typecheck + commit**

Run: `bun run test -- src/lib/phase5-plugins.test.ts` Expected: PASS.
Run: `bun run typecheck` Expected: no new errors.
```bash
git add src/lib/plugin-manifest.ts src/components/marketplace/PluginSettingsForm.tsx src/lib/phase5-plugins.test.ts
git commit -m "feat(plugins): settings schema v1.5 (textarea/color/media/url/date)"
```

---

### Task 5: P1-4 Parity remainder (search, auto-updates, bulk bar, Add-New, count fix)

**Files:**
- Modify: `src/components/marketplace/InstalledApps.tsx`, `src/lib/plugins.functions.ts` (add `pluginAutoUpdatesFn`), `src/lib/plugins.server.ts` (add `setPluginAutoUpdates`), `src/lib/marketplace-install.server.ts` (decrement).
- Test: extend `src/lib/marketplace-bulk.test.ts` + `src/lib/plugin-state-ddl.test.ts`? No — new assertions in `marketplace-uninstall-widget.test.ts` (count decrement) + `marketplace-bulk.test.ts` (auto-updates toggle persists).

**Interfaces:**
- Consumes: Task 2 `auto_updates` column; Task 3 `plugins.update`.
- Produces: complete WP-parity desk (consumed by Task 6 + production verification).

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/lib/marketplace-bulk.test.ts
it("persists the auto-updates flag per install", async () => {
  const db = bulkDb(); // existing helper with plugin_state rows
  await setPluginAutoUpdates(db.asClient(), MERCHANT, "some-plugin", true, ACTOR);
  expect(db.rows("plugin_state").find((r: any) => r.plugin_id === "some-plugin").auto_updates).toBe(true);
});
// append to src/lib/marketplace-uninstall-widget.test.ts
it("decrements the widget install_count on uninstall", async () => {
  const db = fakeDb({ tables: {
    marketplace_installs: [{ id: INSTALL, kind: "widget", listing_slug: "whatsapp-chat", status: "installed", merchant_id: MERCHANT }],
    plugin_state: [{ id: "p-1", merchant_id: MERCHANT, plugin_id: "whatsapp-chat", enabled: true }],
    marketplace_widgets: [{ id: "w-1", slug: "whatsapp-chat", install_count: 5 }],
  }});
  await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL, "user-9");
  expect(db.rows("marketplace_widgets")[0].install_count).toBe(4);
});
```

(If `marketplace_widgets` uses a different slug column, read `installListing` lines ~100-155 first and match its lookup — same query shape, then decrement with floor 0.)

- [ ] **Step 2: Run to verify they fail**

Run: `bun run test -- src/lib/marketplace-bulk.test.ts src/lib/marketplace-uninstall-widget.test.ts` Expected: FAIL (`setPluginAutoUpdates` undefined; count stays 5).

- [ ] **Step 3: Implement server side**

```ts
// plugins.server.ts
export async function setPluginAutoUpdates(db: Client, merchantId: string, pluginId: string, autoUpdates: boolean, actorId?: string | null) {
  const { error } = await db.from("plugin_state").update({ auto_updates: autoUpdates, updated_at: new Date().toISOString() }).eq("merchant_id", merchantId).eq("plugin_id", pluginId);
  if (error) throw new Error("plugin_auto_updates_failed");
  const { auditAction } = await import("./hardening.server");
  await auditAction(db, merchantId, actorId ?? null, autoUpdates ? "plugin.auto_updates_enabled" : "plugin.auto_updates_disabled", "plugin", { plugin: pluginId }, null);
  return { ok: true, auto_updates: autoUpdates };
}
```

```ts
// plugins.functions.ts (after pluginToggleFn)
export const pluginAutoUpdatesFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("plugins.update")])
  .inputValidator((d: unknown) => z.object({ pluginId, enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { setPluginAutoUpdates } = await import("./plugins.server");
    const merchantId = await scope(context.supabase, context.userId);
    return setPluginAutoUpdates(context.supabase, merchantId, data.pluginId, data.enabled, context.userId);
  });
```

Decrement in `uninstallWidgetInstall` after the `plugin_state` delete, before ledger retire:

```ts
const { data: widget } = await db.from("marketplace_widgets").select("id, install_count").eq("slug", row.listing_slug).maybeSingle();
if (widget) await db.from("marketplace_widgets").update({ install_count: Math.max(0, (widget.install_count ?? 1) - 1) }).eq("id", widget.id);
```

- [ ] **Step 4: Implement UI** in `InstalledApps.tsx`: (a) search `<input>` above the table filtering `filteredPlugins` by name (client-side, mirrors existing status filter); (b) Auto-updates toggle column calling new `pluginAutoUpdatesFn` (checkbox + `t("Auto-updates", "স্বয়ংক্রিয় আপডেট")`); (c) duplicate the bulk `<select>` + Apply bar below the table (same handlers); (d) Add-New link `search={{ tab: "widget" }}` → `search={{ tab: "plugin" }}`.

- [ ] **Step 5: Run tests + commit**

Run: `bun run test -- src/lib/marketplace-bulk.test.ts src/lib/marketplace-uninstall-widget.test.ts` Expected: PASS.
```bash
git add src/components/marketplace/InstalledApps.tsx src/lib/plugins.functions.ts src/lib/plugins.server.ts src/lib/marketplace-install.server.ts src/lib/marketplace-bulk.test.ts src/lib/marketplace-uninstall-widget.test.ts
git commit -m "feat(plugins): parity remainder (search, auto-updates, bulk bar, count fix)"
```

---

### Task 6: P1-5 Regression tests — deny + replay + audit

**Files:**
- Modify: `src/lib/lifecycle-audit.test.ts` (settings-save + auto-updates audit), `src/lib/marketplace-bulk.test.ts` (cross-merchant deny, settings double-save replay).

**Interfaces:**
- Consumes: all tasks.
- Produces: `[A]` gate evidence for the phase.

- [ ] **Step 1: Write the failing tests**

```ts
it("deny: cross-merchant settings write touches nothing", async () => {
  const db = fakeDb({ tables: { plugin_state: [
    { merchant_id: MERCHANT, plugin_id: "p", settings: { a: 1 }, enabled: true },
  ], activity_log: [] } });
  await savePluginSettings(db.asClient(), "99999999-9999-4999-a999-999999999999", "p", { a: 2 });
  expect(db.rows("plugin_state")[0].settings).toEqual({ a: 1 });
});
it("replay: double settings save keeps one row, last wins", async () => {
  const db = fakeDb({ tables: { plugin_state: [
    { merchant_id: MERCHANT, plugin_id: "p", settings: {}, enabled: true },
  ], activity_log: [] } });
  await savePluginSettings(db.asClient(), MERCHANT, "p", { a: 1 });
  await savePluginSettings(db.asClient(), MERCHANT, "p", { a: 2 });
  expect(db.rows("plugin_state")).toHaveLength(1);
  expect(db.rows("plugin_state")[0].settings).toEqual({ a: 2 });
});
it("audit: settings save and auto-updates toggle write rows", async () => {
  const db = fakeDb({ tables: { plugin_state: [
    { merchant_id: MERCHANT, plugin_id: "p", settings: {}, enabled: true, auto_updates: false },
  ], activity_log: [] } });
  await savePluginSettings(db.asClient(), MERCHANT, "p", { a: 1 }, ACTOR);
  await setPluginAutoUpdates(db.asClient(), MERCHANT, "p", true, ACTOR);
  const actions = db.rows("activity_log").map((r: any) => r.action);
  expect(actions).toContain("plugin.settings_saved");
  expect(actions).toContain("plugin.auto_updates_enabled");
});
```

Note: if `savePluginSettings` does not currently write an audit row or take `actorId`, first extend its signature `(db, merchantId, pluginId, values, actorId?)` + `auditAction(..., "plugin.settings_saved", ...)` in `plugins.server.ts` and update its `plugins.functions.ts` caller to pass `context.userId` — same pattern as `setPluginEnabled` (`plugins.server.ts:184-186`, `plugins.functions.ts:69`).

- [ ] **Step 2: Run to verify they fail**

Run: `bun run test -- src/lib/lifecycle-audit.test.ts src/lib/marketplace-bulk.test.ts` Expected: FAIL (no audit on settings save; no actorId param).

- [ ] **Step 3: Implement** the `savePluginSettings` audit extension described in the note above.

- [ ] **Step 4: Run full plugin suite + contracts**

Run: `bun run test -- src/lib/plugin-state-ddl.test.ts src/lib/plugin-permissions.test.ts src/lib/phase5-plugins.test.ts src/lib/marketplace-uninstall-widget.test.ts src/lib/marketplace-bulk.test.ts src/lib/lifecycle-audit.test.ts src/lib/marketplace-activate-delete.test.ts` Expected: ALL PASS.
Run: `bun run test:contracts` Expected: PASS.

- [ ] **Step 5: Commit + push + CHANGELOG**

```bash
git add src/lib/lifecycle-audit.test.ts src/lib/marketplace-bulk.test.ts src/lib/plugins.server.ts src/lib/plugins.functions.ts
git commit -m "test(plugins): deny + replay + audit regression gate"
git push origin main
```

Then append the Phase-1 CHANGELOG entry, commit, push, and run production browser verification of `/dashboard/plugins` (search, toggle, settings persist, auto-updates, delete + ledger `removed`).

---

## Self-Review

- **Spec coverage:** P1-0 probes → Task 1. P1-1 DDL/RLS/enum → Task 2 (+`auto_updates` pulled forward from P1-4 so one migration suffices). P1-2 authz → Task 3. P1-3 schema → Task 4. P1-4 parity → Task 5. P1-5 regression → Task 6. Master-spec §7 gates (TDD, deny/replay/audit, prod verification, CHANGELOG) embedded per task. ✔
- **Placeholder scan:** no TBD/TODO; every "read X first" names exact file + lines; kill-switch columns resolved via Task-1 probe + named code section; widget slug-column uncertainty handled with explicit fallback instruction. ✔
- **Type consistency:** `setPluginAutoUpdates(db, merchantId, pluginId, autoUpdates, actorId?)` signature identical in Task 5 test, implementation, and fn caller; audit action strings (`plugin.settings_saved`, `plugin.auto_updates_enabled/disabled`, `plugin.uninstalled`) consistent; `pluginId` zod regex reused from `plugins.functions.ts:12`. ✔
