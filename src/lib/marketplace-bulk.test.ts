/**
 * WordPress-parity bulk actions on installs (TDD): enable/pause/delete apply
 * per row with individual results — one bad row never blocks the rest, and
 * every applied change is audited.
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

const { bulkInstallStatus } = await import("./marketplace-install.server");
const { savePluginSettings, setPluginAutoUpdates } =
  await import("./plugins.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const FOREIGN_MERCHANT = "99999999-9999-4999-a999-999999999999";

// Manifest declaring a numeric setting `level`, so validateSettings keeps
// { level: N } (unknown keys are dropped and KEY_RE requires a 2+ char key,
// so the brief's literal `{ a: N }` could never survive validation; rows also
// need a manifest or the server throws plugin_manifest_invalid before any
// guard is exercised).
const SETTINGS_MANIFEST = {
  id: "settings-probe",
  name: "Settings Probe",
  version: "1.0.0",
  api: "^3.0.0",
  permissions: ["render_storefront"],
  widgets: [],
  hooks: [],
  settings: [{ key: "level", label: "Level", kind: "number" }],
  i18n: { en: {}, bn: {} },
};

function settingsDb() {
  return fakeDb({
    tables: {
      plugin_state: [
        {
          merchant_id: MERCHANT,
          plugin_id: "settings-probe",
          manifest: SETTINGS_MANIFEST,
          settings: { level: 1 },
          enabled: true,
        },
      ],
      activity_log: [],
    },
  });
}
const W1 = "33333333-3333-3333-3333-333333333333";
const W2 = "44444444-4444-4444-4444-444444444444";

function bulkDb() {
  return fakeDb({
    tables: {
      marketplace_installs: [
        {
          id: W1,
          kind: "widget",
          listing_slug: "whatsapp-chat",
          status: "paused",
          merchant_id: MERCHANT,
        },
        {
          id: W2,
          kind: "widget",
          listing_slug: "loyalty-lite",
          status: "installed",
          merchant_id: MERCHANT,
        },
      ],
      plugin_state: [
        {
          id: "p-1",
          merchant_id: MERCHANT,
          plugin_id: "whatsapp-chat",
          enabled: false,
        },
      ],
      activity_log: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("bulkInstallStatus", () => {
  it("enables paused rows and reports each result", async () => {
    const db = bulkDb();
    const out: any = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [W1, W2],
      "enable",
    );
    expect(out.results).toHaveLength(2);
    expect(out.results.every((r: any) => r.ok)).toBe(true);
    const rows = db.rows("marketplace_installs");
    expect(rows.find((r) => r.id === W1)!.status).toBe("installed");
  });

  it("pauses installed rows", async () => {
    const db = bulkDb();
    const out: any = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [W2],
      "pause",
    );
    expect(out.results[0]).toMatchObject({ installId: W2, ok: true });
    expect(
      db.rows("marketplace_installs").find((r) => r.id === W2)!.status,
    ).toBe("paused");
  });

  it("isolates failures per row instead of aborting the batch", async () => {
    const db = bulkDb();
    const out: any = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [W1, "00000000-0000-4000-a000-000000000000"],
      "enable",
    );
    expect(out.results).toHaveLength(2);
    expect(out.results[0].ok).toBe(true);
    expect(out.results[1].ok).toBe(false);
    expect(out.results[1].error).toBe("market_install_not_found");
  });

  it("audits every applied change with the actor", async () => {
    const db = bulkDb();
    await bulkInstallStatus(db.asClient(), MERCHANT, ACTOR, [W1], "enable");
    const rows = db.rows("activity_log");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]).toMatchObject({ merchant_id: MERCHANT, actor: ACTOR });
  });

  it("deletes widget installs end to end (R2-6 two-phase: uninstalling → purged)", async () => {
    const db = bulkDb();
    const out: any = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [W1],
      "delete",
    );
    expect(out.results[0].ok).toBe(true);
    // Phase 1: transitional — state retained for the purge job, never deleted inline.
    expect(
      db.rows("marketplace_installs").find((r) => r.id === W1)!.status,
    ).toBe("uninstalling");
    expect(db.rows("plugin_state")).toHaveLength(1);
    expect(
      db.rows("job_queue").filter((r) => r.name === "plugin.purge"),
    ).toHaveLength(1);
    // Phase 2: the durable purge converges the ledger and destroys state.
    const { purgePluginJob } = await import("./plugin-lifecycle.server");
    const res = (await purgePluginJob(db.asClient(), {
      merchantId: MERCHANT,
      pluginId: "whatsapp-chat",
      installId: W1,
      actorId: ACTOR,
    })) as unknown as Record<string, unknown>;
    expect(res).toMatchObject({ ok: true, purged: true });
    expect(
      db.rows("marketplace_installs").find((r) => r.id === W1)!.status,
    ).toBe("purged");
    expect(db.rows("plugin_state")).toHaveLength(0);
  });

  it("persists the auto-updates flag per install", async () => {
    // NOTE(deviation from brief): brief uses "some-plugin", but bulkDb()
    // seeds only "whatsapp-chat" and the server impl is update-only, so an
    // unknown id could never flip GREEN. Same intent, existing row.
    const db = bulkDb();
    await setPluginAutoUpdates(
      db.asClient(),
      MERCHANT,
      "whatsapp-chat",
      true,
      ACTOR,
    );
    expect(
      db.rows("plugin_state").find((r: any) => r.plugin_id === "whatsapp-chat")
        ?.auto_updates,
    ).toBe(true);
  });

  it("deny: cross-merchant settings write touches nothing", async () => {
    // NOTE(deviation from brief): the bare `await savePluginSettings(...)`
    // in the brief would throw plugin_not_installed as an uncaught error
    // instead of asserting the denial. Asserting the refusal explicitly —
    // same deny intent, plus the untouched-row guard.
    const db = settingsDb();
    await expect(
      savePluginSettings(db.asClient(), FOREIGN_MERCHANT, "settings-probe", {
        level: 2,
      }),
    ).rejects.toThrow("plugin_not_installed");
    expect(db.rows("plugin_state")[0].settings).toEqual({ level: 1 });
  });

  it("replay: double settings save keeps one row, last wins", async () => {
    const db = settingsDb();
    await savePluginSettings(db.asClient(), MERCHANT, "settings-probe", {
      level: 1,
    });
    await savePluginSettings(db.asClient(), MERCHANT, "settings-probe", {
      level: 2,
    });
    expect(db.rows("plugin_state")).toHaveLength(1);
    expect(db.rows("plugin_state")[0].settings).toEqual({ level: 2 });
  });
});
