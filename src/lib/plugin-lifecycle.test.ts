/**
 * Phase 2 R2-5 — suspend/resume machine contract tests.
 *
 * One gate: suspend writes `suspended=true` on `plugin_state`; the read path
 * (`listInstalledPlugins`) folds it into `enabled`, which gates hooks,
 * widgets AND sidecar workers — no second kill switch.
 *
 * "Replay" on resume = allow queued `plugins` rows to drain naturally (they
 * were never cancelled; idempotency keys prevent doubles) — no explicit
 * replay call; the resume audit row records the event.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  assertTransition,
  resumePlugin,
  suspendPlugin,
} from "./plugin-lifecycle.server";
import { listInstalledPlugins, setPluginKillSwitch } from "./plugins.server";
import {
  listSidecars,
  resetSidecars,
  syncSidecars,
} from "./plugin-sidecar.server";

const MERCHANT = "m1";
const PLUGIN = "loyalty-lite";

function manifest(id: string) {
  return {
    id,
    name: id,
    version: "1.2.0",
    api: "^3.0.0",
    permissions: ["read_shop"],
    widgets: [],
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
  };
}

function seedDb(extraState: Record<string, unknown> = {}) {
  return fakeDb({
    tables: {
      plugin_state: [
        {
          id: "install-1",
          merchant_id: MERCHANT,
          plugin_id: PLUGIN,
          manifest: manifest(PLUGIN),
          scopes: ["read_shop"],
          settings: {},
          enabled: true,
          suspended: false,
          suspended_reason: null,
          suspended_at: null,
          ...extraState,
        },
      ],
      plugin_kill_switch: [],
    },
  });
}

async function auditRows(db: ReturnType<typeof fakeDb>, action: string) {
  const { data } = await db
    .from("activity_log")
    .select("*")
    .eq("action", action);
  return (data ?? []) as Record<string, unknown>[];
}

beforeEach(() => resetSidecars());

describe("suspend machine (R2-5)", () => {
  it("suspend sets flags, stops sidecar, writes audit", async () => {
    const db = seedDb();
    await syncSidecars(db.asClient(), MERCHANT);
    expect(listSidecars(MERCHANT)).toHaveLength(1);

    const r = await suspendPlugin(
      db.asClient(),
      MERCHANT,
      PLUGIN,
      "scope_revoked",
      "u1",
    );
    expect(r.suspended).toBe(true);

    const { data: row } = await db
      .from("plugin_state")
      .select("*")
      .eq("plugin_id", PLUGIN)
      .maybeSingle();
    expect(row?.suspended).toBe(true);
    expect(row?.suspended_reason).toBe("scope_revoked");
    expect(row?.suspended_at).toBeTruthy();

    // Sidecar worker is gone — delivery stops via the same gate.
    expect(listSidecars(MERCHANT)).toHaveLength(0);

    const audit = await auditRows(db, "plugin.suspended");
    expect(audit).toHaveLength(1);
    expect(audit[0]?.merchant_id).toBe(MERCHANT);
  });

  it("suspend is idempotent; resume clears flags, restarts sidecar, writes audit", async () => {
    const db = seedDb();
    await suspendPlugin(db.asClient(), MERCHANT, PLUGIN, "kill_switch", "u1");
    await suspendPlugin(db.asClient(), MERCHANT, PLUGIN, "kill_switch", "u1"); // no throw

    const r = await resumePlugin(db.asClient(), MERCHANT, PLUGIN, "u1");
    expect(r.suspended).toBe(false);

    const { data: row } = await db
      .from("plugin_state")
      .select("*")
      .eq("plugin_id", PLUGIN)
      .maybeSingle();
    expect(row?.suspended).toBe(false);
    expect(row?.suspended_reason).toBeNull();
    expect(row?.suspended_at).toBeNull();

    // Resume re-syncs workers: the install is active again.
    expect(listSidecars(MERCHANT)).toHaveLength(1);

    const resumed = await auditRows(db, "plugin.resumed");
    expect(resumed).toHaveLength(1);
  });

  it("suspended plugins stop receiving hooks via the existing enabled gate", async () => {
    const db = seedDb();
    const before = await listInstalledPlugins(db.asClient(), MERCHANT);
    expect(before[0]?.enabled).toBe(true);

    await suspendPlugin(db.asClient(), MERCHANT, PLUGIN, "operator", "u1");

    const after = await listInstalledPlugins(db.asClient(), MERCHANT);
    expect(after[0]?.enabled).toBe(false);

    await resumePlugin(db.asClient(), MERCHANT, PLUGIN, "u1");
    const back = await listInstalledPlugins(db.asClient(), MERCHANT);
    expect(back[0]?.enabled).toBe(true);
  });

  it("forbids unknown transitions (pure guard transition table)", () => {
    // Allowed: active->suspend, suspended->suspend (idempotent), suspended->resume.
    expect(() => assertTransition(false, "suspend")).not.toThrow();
    expect(() => assertTransition(true, "suspend")).not.toThrow();
    expect(() => assertTransition(true, "resume")).not.toThrow();
    // Forbidden: active->resume — fail closed, never silent.
    expect(() => assertTransition(false, "resume")).toThrow(
      /plugin_invalid_transition:active->resume/,
    );
  });

  it("suspend/resume refuse unknown installs (fail closed)", async () => {
    const db = seedDb();
    await expect(
      suspendPlugin(db.asClient(), MERCHANT, "ghost-plugin", "operator", "u1"),
    ).rejects.toThrow(/plugin_not_installed/);
    await expect(
      resumePlugin(db.asClient(), MERCHANT, "ghost-plugin", "u1"),
    ).rejects.toThrow(/plugin_not_installed/);
  });

  it("resume when never suspended throws plugin_invalid_transition", async () => {
    const db = seedDb();
    await expect(
      resumePlugin(db.asClient(), MERCHANT, PLUGIN, "u1"),
    ).rejects.toThrow(/plugin_invalid_transition:active->resume/);
    expect(await auditRows(db, "plugin.resumed")).toHaveLength(0);
  });

  it("kill-switch engage auto-suspends every merchant install (best-effort)", async () => {
    const db = seedDb();
    await syncSidecars(db.asClient(), MERCHANT);
    expect(listSidecars(MERCHANT)).toHaveLength(1);

    const r = await setPluginKillSwitch(db.asClient(), PLUGIN, true, "malware");
    expect(r.disabled).toBe(true);

    const { data: row } = await db
      .from("plugin_state")
      .select("*")
      .eq("plugin_id", PLUGIN)
      .maybeSingle();
    expect(row?.suspended).toBe(true);
    expect(row?.suspended_reason).toBe("kill_switch");

    // Kill switch + suspend both fold into enabled; sidecar is stopped.
    const installed = await listInstalledPlugins(db.asClient(), MERCHANT);
    expect(installed[0]?.enabled).toBe(false);
    expect(listSidecars(MERCHANT)).toHaveLength(0);

    const audit = await auditRows(db, "plugin.suspended");
    expect(audit).toHaveLength(1);
  });

  it("kill-switch release does not suspend", async () => {
    const db = seedDb();
    await setPluginKillSwitch(db.asClient(), PLUGIN, false, null);
    const { data: row } = await db
      .from("plugin_state")
      .select("*")
      .eq("plugin_id", PLUGIN)
      .maybeSingle();
    expect(row?.suspended).toBe(false);
    expect(await auditRows(db, "plugin.suspended")).toHaveLength(0);
  });
});
