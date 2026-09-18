/**
 * WordPress-parity plugin uninstall (TDD): delete removes the plugin_state
 * row and retires the ledger row; unknown installs are refused.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { metricRecorder, allowAllRateLimits } from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { uninstallWidgetInstall } = await import("./marketplace-install.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const INSTALL = "33333333-3333-3333-3333-333333333333";

function widgetDb() {
  return fakeDb({
    tables: {
      marketplace_installs: [
        {
          id: INSTALL,
          kind: "widget",
          listing_slug: "whatsapp-chat",
          status: "installed",
          merchant_id: MERCHANT,
        },
      ],
      plugin_state: [{ id: "p-1", merchant_id: MERCHANT, plugin_id: "whatsapp-chat", enabled: true }],
    },
  });
}

beforeEach(() => recorder.reset());

describe("uninstallWidgetInstall", () => {
  it("refuses an unknown install without touching anything", async () => {
    const db = widgetDb();
    await expect(
      uninstallWidgetInstall(db.asClient(), MERCHANT, "00000000-0000-4000-a000-000000000000"),
    ).rejects.toThrow("market_install_not_found");
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(db.rows("plugin_state")).toHaveLength(1);
  });

  it("removes the plugin row and retires the ledger row", async () => {
    const db = widgetDb();
    const out: any = await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL, "user-9");
    expect(out.ok).toBe(true);
    expect(out.removedPlugin).toBe(true);
    expect(db.rows("plugin_state")).toHaveLength(0);
    expect(db.rows("marketplace_installs")[0].status).toBe("removed");
  });

  it("writes an audit row attributing the actor", async () => {
    const db = widgetDb();
    await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL, "user-9");
    const rows = db.rows("activity_log");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchant_id: MERCHANT,
      actor: "user-9",
      action: "plugin.uninstalled",
      resource_type: "plugin",
    });
  });

  it("retires the ledger row even when no plugin row matches", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [
          { id: INSTALL, kind: "widget", listing_slug: "ghost", status: "paused", merchant_id: MERCHANT },
        ],
        plugin_state: [],
      },
    });
    const out: any = await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL);
    expect(out.ok).toBe(true);
    expect(out.removedPlugin).toBe(false);
    expect(db.rows("marketplace_installs")[0].status).toBe("removed");
  });
});
