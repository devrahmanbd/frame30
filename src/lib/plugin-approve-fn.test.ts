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
const { approvePluginVersion, setPluginEnabled, isPluginVersionApproved } =
  await import("./plugins.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const PLUGIN = "audit-probe";
const VERSION = "1.0.0";

const FUNCTIONS_SRC = "/opt/frame28/src/lib/plugins.functions.ts";

const SECRET = "sk-" + "abcdefghij0123456789ABCDEFGH0123";

/** Secret-bearing manifest: Tier-0, never merchant-approvable. */
const SECRET_MANIFEST = {
  id: PLUGIN,
  name: "Audit Probe",
  version: VERSION,
  api: "^3.0.0",
  permissions: ["render_storefront"],
  widgets: [
    {
      key: "probe",
      label: "Probe",
      slots: ["main"],
      entry: `framique.mount(document.createElement('div')) // ${SECRET}`,
    },
  ],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
};

/** Info-only manifest (external URL, no secret): approvable, clean verdict. */
const URL_MANIFEST = {
  id: PLUGIN,
  name: "Audit Probe",
  version: VERSION,
  api: "^3.0.0",
  description: "See https://docs.example.com/probe for help.",
  permissions: ["render_storefront"],
  widgets: [],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
};

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

  function manifestDb(manifest: unknown) {
    return fakeDb({
      tables: {
        plugin_state: [
          {
            merchant_id: MERCHANT,
            plugin_id: PLUGIN,
            manifest,
            manifest_version: VERSION,
            enabled: false,
          },
        ],
        activity_log: [],
      },
    });
  }

  it("refuses secret-flagged content with plugin.approval_forbidden and writes no audit", async () => {
    const db = manifestDb(SECRET_MANIFEST);
    await expect(
      approvePluginVersion(db.asClient(), MERCHANT, PLUGIN, VERSION, ACTOR),
    ).rejects.toThrow(/plugin\.approval_forbidden/);
    expect(
      db.rows("activity_log").filter((a) => a.action === "plugin.approved"),
    ).toHaveLength(0);
  });

  it("still approves info-only findings (external URL, no secret)", async () => {
    const db = manifestDb(URL_MANIFEST);
    const out = await approvePluginVersion(
      db.asClient(),
      MERCHANT,
      PLUGIN,
      VERSION,
      ACTOR,
    );
    expect(out).toEqual({ ok: true });
    expect(
      db.rows("activity_log").filter((a) => a.action === "plugin.approved"),
    ).toHaveLength(1);
  });

  it("enabling still refuses secret content covered by a legacy approval", async () => {
    const db = fakeDb({
      tables: {
        plugin_state: [
          {
            merchant_id: MERCHANT,
            plugin_id: PLUGIN,
            manifest: SECRET_MANIFEST,
            manifest_version: VERSION,
            enabled: false,
          },
        ],
        // Pre-policy approval row: must not unlock Tier-0 content.
        activity_log: [
          {
            merchant_id: MERCHANT,
            actor: ACTOR,
            action: "plugin.approved",
            resource_type: "plugin",
            resource_id: null,
            changed: { plugin: PLUGIN, manifest_version: VERSION },
          },
        ],
      },
    });
    await expect(
      setPluginEnabled(db.asClient(), MERCHANT, PLUGIN, true, ACTOR),
    ).rejects.toThrow(/plugin\.approval_forbidden/);
    expect(
      db.rows("plugin_state").find((r) => r.plugin_id === PLUGIN)?.enabled,
    ).toBe(false);
  });
});

describe("plugin approval binds manifest content hash", () => {
  function manifestDb(manifest: unknown) {
    return fakeDb({
      tables: {
        plugin_state: [
          {
            merchant_id: MERCHANT,
            plugin_id: PLUGIN,
            manifest,
            manifest_version: VERSION,
            enabled: false,
          },
        ],
        activity_log: [],
      },
    });
  }

  it("approvePluginVersion records the canonical content hash", async () => {
    const { contentHash } = await import("./package-scan");
    const db = manifestDb(URL_MANIFEST);
    await approvePluginVersion(db.asClient(), MERCHANT, PLUGIN, VERSION, ACTOR);
    const rows = db
      .rows("activity_log")
      .filter((a) => a.action === "plugin.approved");
    expect(rows).toHaveLength(1);
    expect(rows[0].changed).toMatchObject({
      plugin: PLUGIN,
      manifest_version: VERSION,
      content_hash: contentHash(URL_MANIFEST),
    });
  });

  it("clean manifest update under the same version still enables (no clean-path regression)", async () => {
    const db = manifestDb(URL_MANIFEST);
    await approvePluginVersion(db.asClient(), MERCHANT, PLUGIN, VERSION, ACTOR);
    // Same version string, different clean content: the enable gate scans
    // clean and passes without consulting approvals.
    db.rows("plugin_state").find((r) => r.plugin_id === PLUGIN)!.manifest = {
      ...URL_MANIFEST,
      description: "Updated help text.",
    };
    await setPluginEnabled(db.asClient(), MERCHANT, PLUGIN, true, ACTOR);
    expect(
      db.rows("plugin_state").find((r) => r.plugin_id === PLUGIN)?.enabled,
    ).toBe(true);
  });

  it("legacy approval row without content hash never authorizes", () => {
    // Pure matcher units: the gate consults approvals only for flagged
    // content (unproducible for plugin.json without secrets, which are
    // always forbidden), so the triple-match is pinned here directly.
    // Rows nest fields under `changed`, exactly as the gate selects them.
    const row = (changed: unknown) => ({ changed });
    expect(
      isPluginVersionApproved(
        [row({ plugin: PLUGIN, manifest_version: VERSION })],
        PLUGIN,
        VERSION,
        "abc123",
      ),
    ).toBe(false);
    expect(isPluginVersionApproved([], PLUGIN, VERSION, "abc123")).toBe(false);
    expect(
      isPluginVersionApproved(
        [
          row({
            plugin: PLUGIN,
            manifest_version: VERSION,
            content_hash: "wrong",
          }),
        ],
        PLUGIN,
        VERSION,
        "abc123",
      ),
    ).toBe(false);
    expect(
      isPluginVersionApproved(
        [
          row({
            plugin: PLUGIN,
            manifest_version: VERSION,
            content_hash: "abc123",
          }),
        ],
        PLUGIN,
        VERSION,
        "abc123",
      ),
    ).toBe(true);
  });
});
