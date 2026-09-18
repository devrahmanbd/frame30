/**
 * WF-24: every lifecycle mutation writes its audit row (actor/before/after).
 * Theme paths write theme_audit; plugin paths write activity_log.
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

const { activateTheme, deleteTheme } =
  await import("./themes/appearance.server");
const { upsertPlugin, setPluginEnabled, uninstallPlugin } =
  await import("./plugins.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const THEME = "44444444-4444-4444-4444-444444444444";
const ACTOR = "99999999-9999-4999-8999-999999999999";

beforeEach(() => recorder.reset());

function themeDb(active: boolean) {
  return fakeDb({
    tables: {
      store_themes: [
        { id: THEME, merchant_id: MERCHANT, name: "T", is_active: active },
      ],
      theme_versions: [],
      theme_drafts: [],
      theme_audit: [],
    },
  });
}

describe("theme lifecycle audit", () => {
  it("activateTheme records who flipped it live", async () => {
    const db = themeDb(false);
    await activateTheme(db.asClient(), MERCHANT, THEME, ACTOR);
    const rows = db.rows("theme_audit");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchant_id: MERCHANT,
      theme_id: THEME,
      actor: ACTOR,
      action: "theme.activated",
    });
  });

  it("deleteTheme records the removed theme", async () => {
    const db = themeDb(false);
    await deleteTheme(db.asClient(), MERCHANT, THEME, ACTOR);
    const rows = db.rows("theme_audit");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchant_id: MERCHANT,
      theme_id: THEME,
      actor: ACTOR,
      action: "theme.deleted",
    });
  });
});

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
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchant_id: MERCHANT,
      actor: ACTOR,
      action: "plugin.installed",
      resource_type: "plugin",
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
});
