/**
 * Threat-defense approval server fn (TDD).
 *
 * `pluginApproveFn` exposes the existing `approvePluginVersion`
 * (`plugins.server.ts`, a read-only neighbour) through TanStack Start so
 * the plugins desk can record explicit merchant approval of a flagged
 * plugin version. The fn is a thin delegate: permission + input shape live
 * here, approval logic stays in the server module. Errors propagate as-is
 * (`plugin_not_found` / `plugin_version_mismatch`).
 *
 * NOTE(deviation from brief): no test in this repo invokes a TanStack Start
 * server fn directly — grep finds zero tests referencing `themeActivateFn`
 * or `pluginToggleFn`, and no harness faking `{ context: { supabase, userId
 * } }`. The wiring half is therefore pinned by source assertions (the
 * `official-plugins-frame30.test.ts` precedent); the behaviour half drives
 * the delegated server function on `fakeDb`.
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import { fakeDb } from "./__fixtures__/fake-db";

const { pluginApproveFn } = await import("./plugins.functions");
const { approvePluginVersion } = await import("./plugins.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const PLUGIN = "audit-probe";
const VERSION = "1.0.0";

const FUNCTIONS_SRC = "/opt/frame28/src/lib/plugins.functions.ts";

function approveDb() {
  return fakeDb({
    tables: {
      plugin_state: [
        {
          merchant_id: MERCHANT,
          plugin_id: PLUGIN,
          manifest_version: VERSION,
          enabled: false,
        },
      ],
      activity_log: [],
    },
  });
}

describe("pluginApproveFn wiring", () => {
  it("is exported from the plugins functions module", () => {
    expect(typeof pluginApproveFn).toBe("function");
  });

  it("sits behind plugins.update and delegates to approvePluginVersion", () => {
    const src = fs.readFileSync(FUNCTIONS_SRC, "utf8");
    expect(src).toContain("pluginApproveFn");
    expect(src).toContain('requirePermission("plugins.update")');
    expect(src).toContain("approvePluginVersion");
  });

  it("validates { pluginId, manifestVersion min 1 max 32 } inputs", () => {
    const src = fs.readFileSync(FUNCTIONS_SRC, "utf8");
    expect(src).toMatch(
      /pluginApproveFn[\s\S]*?pluginId[\s\S]*?manifestVersion/,
    );
    expect(src).toContain("z.string().min(1).max(32)");
  });
});

describe("plugin approval delegation", () => {
  it("records the approval audit and returns ok", async () => {
    const db = approveDb();
    const out = await approvePluginVersion(
      db.asClient(),
      MERCHANT,
      PLUGIN,
      VERSION,
      ACTOR,
    );
    expect(out).toEqual({ ok: true });
    const rows = db.rows("activity_log");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchant_id: MERCHANT,
      actor: ACTOR,
      action: "plugin.approved",
      resource_type: "plugin",
      changed: { plugin: PLUGIN, manifest_version: VERSION },
    });
  });

  it("refuses an unknown plugin with plugin_not_found", async () => {
    const db = approveDb();
    await expect(
      approvePluginVersion(
        db.asClient(),
        MERCHANT,
        "unknown-plugin",
        VERSION,
        ACTOR,
      ),
    ).rejects.toThrow("plugin_not_found");
    expect(db.rows("activity_log")).toHaveLength(0);
  });

  it("refuses a version mismatch with plugin_version_mismatch", async () => {
    const db = approveDb();
    await expect(
      approvePluginVersion(db.asClient(), MERCHANT, PLUGIN, "2.0.0", ACTOR),
    ).rejects.toThrow("plugin_version_mismatch");
    expect(db.rows("activity_log")).toHaveLength(0);
  });

  it("refuses another merchant's row", async () => {
    const db = approveDb();
    await expect(
      approvePluginVersion(db.asClient(), OTHER, PLUGIN, VERSION, ACTOR),
    ).rejects.toThrow("plugin_not_found");
    expect(db.rows("activity_log")).toHaveLength(0);
  });
});
