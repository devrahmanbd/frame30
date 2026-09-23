/**
 * WF-24: every lifecycle mutation writes its audit row (actor/before/after).
 * Theme paths retired with the Sept 2026 purge; plugin paths write activity_log.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const {
  upsertPlugin,
  savePluginSettings,
  setPluginAutoUpdates,
  setPluginEnabled,
  uninstallPlugin,
} =
  await import("./plugins.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const ACTOR = "99999999-9999-4999-8999-999999999999";

beforeEach(() => recorder.reset());

const MANIFEST = {
  id: "audit-probe",
  name: "Audit Probe",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["render_storefront"],
  widgets: [],
  hooks: [],
  settings: [],
  i18n: { en: {}, bn: {} },
};

function pluginDb() {
  return fakeDb({
    tables: {
      plugin_state: [],
      activity_log: [],
    },
  });
}

describe("plugin lifecycle audit", () => {
  it("upsertPlugin distinguishes install from update", async () => {
    const db = pluginDb();
    await upsertPlugin(db.asClient(), MERCHANT, {
      manifest: MANIFEST,
      grantedScopes: ["render_storefront"],
      actorId: ACTOR,
    });
    const rows = db.rows("activity_log");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      merchant_id: MERCHANT,
      actor: ACTOR,
      action: "plugin.installed",
      resource_type: "plugin",
    });
    expect(rows[1]).toMatchObject({
      merchant_id: MERCHANT,
      actor: ACTOR,
      action: "plugin.scopes_granted",
      resource_type: "plugin",
      changed: {
        plugin: "audit-probe",
        scopes: ["render_storefront"],
        manifest_version: "1.0.0",
      },
    });
  });

  it("setPluginEnabled records toggles", async () => {
    const db = fakeDb({
      tables: {
        plugin_state: [
          { merchant_id: MERCHANT, plugin_id: "audit-probe", enabled: true },
        ],
        activity_log: [],
      },
    });
    await setPluginEnabled(
      db.asClient(),
      MERCHANT,
      "audit-probe",
      false,
      ACTOR,
    );
    const rows = db.rows("activity_log");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "plugin.disabled", actor: ACTOR });
  });

  it("uninstallPlugin records removal", async () => {
    const db = fakeDb({
      tables: {
        plugin_state: [
          { merchant_id: MERCHANT, plugin_id: "audit-probe", enabled: true },
        ],
        activity_log: [],
      },
    });
    await uninstallPlugin(db.asClient(), MERCHANT, "audit-probe", ACTOR);
    expect(db.rows("plugin_state")).toHaveLength(0);
    const rows = db.rows("activity_log");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "plugin.uninstalled",
      actor: ACTOR,
    });
  });

  it("audit: settings save and auto-updates toggle write rows", async () => {
    // NOTE(deviation from brief): rows carry a manifest declaring numeric
    // setting `level` — without it the server throws plugin_manifest_invalid
    // before any audit path runs, and validateSettings would drop the
    // brief's literal `{ a: N }` as an unknown key (KEY_RE needs 2+ chars).
    // Same audit intent, exercisable seed.
    const manifest = {
      ...MANIFEST,
      id: "settings-probe",
      settings: [{ key: "level", label: "Level", kind: "number" }],
    };
    const db = fakeDb({
      tables: {
        plugin_state: [
          {
            merchant_id: MERCHANT,
            plugin_id: "settings-probe",
            manifest,
            settings: {},
            enabled: true,
            auto_updates: false,
          },
        ],
        activity_log: [],
      },
    });
    await savePluginSettings(db.asClient(), MERCHANT, "settings-probe", { level: 1 }, ACTOR);
    await setPluginAutoUpdates(db.asClient(), MERCHANT, "settings-probe", true, ACTOR);
    const actions = db.rows("activity_log").map((r: any) => r.action);
    expect(actions).toContain("plugin.settings_saved");
    expect(actions).toContain("plugin.auto_updates_enabled");
  });
});
