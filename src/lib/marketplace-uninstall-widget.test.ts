/**
 * WordPress-parity plugin uninstall (R2-6): uninstall parks the ledger row on
 * transitional `uninstalling` and enqueues the durable `plugin.purge` job —
 * the plugin_state delete happens in the purge handler, never inline.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

const rec = vi.hoisted<{
  holder: { observability: Record<string, unknown> } | null;
}>(() => ({ holder: null }));
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
      plugin_state: [
        {
          id: "p-1",
          merchant_id: MERCHANT,
          plugin_id: "whatsapp-chat",
          enabled: true,
        },
      ],
    },
  });
}

beforeEach(() => recorder.reset());

describe("uninstallWidgetInstall", () => {
  it("refuses an unknown install without touching anything", async () => {
    const db = widgetDb();
    await expect(
      uninstallWidgetInstall(
        db.asClient(),
        MERCHANT,
        "00000000-0000-4000-a000-000000000000",
      ),
    ).rejects.toThrow("market_install_not_found");
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(db.rows("plugin_state")).toHaveLength(1);
  });

  it("parks the ledger on uninstalling and queues the purge job (no inline delete)", async () => {
    const db = widgetDb();
    const out = await uninstallWidgetInstall(
      db.asClient(),
      MERCHANT,
      INSTALL,
      "user-9",
    );
    expect(out.ok).toBe(true);
    expect(out.purging).toBe(true);
    expect(out.removedPlugin).toBe(false);
    // State row survives uninstall — the purge handler deletes it.
    expect(db.rows("plugin_state")).toHaveLength(1);
    expect(db.rows("marketplace_installs")[0].status).toBe("uninstalling");
    const jobs = db.rows("job_queue");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      queue: "plugins",
      name: "plugin.purge",
      idempotency_key: `purge:${MERCHANT}:${INSTALL}`,
    });
  });

  it("writes an uninstalling audit row attributing the actor", async () => {
    const db = widgetDb();
    await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL, "user-9");
    const rows = db.rows("activity_log");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      merchant_id: MERCHANT,
      actor: "user-9",
      action: "plugin.uninstalling",
      resource_type: "plugin",
    });
  });

  it("parks the ledger row even when no plugin row matches", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [
          {
            id: INSTALL,
            kind: "widget",
            listing_slug: "ghost",
            status: "paused",
            merchant_id: MERCHANT,
          },
        ],
        plugin_state: [],
      },
    });
    const out = await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL);
    expect(out.ok).toBe(true);
    expect(out.removedPlugin).toBe(false);
    expect(out.purging).toBe(true);
    expect(db.rows("marketplace_installs")[0].status).toBe("uninstalling");
  });

  it("decrements the widget install_count on uninstall", async () => {
    const db = fakeDb({
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
        plugin_state: [
          {
            id: "p-1",
            merchant_id: MERCHANT,
            plugin_id: "whatsapp-chat",
            enabled: true,
          },
        ],
        marketplace_widgets: [
          { id: "w-1", slug: "whatsapp-chat", install_count: 5 },
        ],
      },
    });
    await uninstallWidgetInstall(db.asClient(), MERCHANT, INSTALL, "user-9");
    expect(db.rows("marketplace_widgets")[0].install_count).toBe(4);
  });

  it("second uninstall of a purged row is a no-op (terminal stays terminal)", async () => {
    const db = fakeDb({
      tables: {
        marketplace_installs: [
          {
            id: INSTALL,
            kind: "widget",
            listing_slug: "whatsapp-chat",
            status: "purged",
            merchant_id: MERCHANT,
          },
        ],
        plugin_state: [],
      },
    });
    const out = await uninstallWidgetInstall(
      db.asClient(),
      MERCHANT,
      INSTALL,
      "user-9",
    );
    expect(out).toEqual({ ok: true, purged: false, reason: "already_purged" });
    expect(db.rows("marketplace_installs")[0].status).toBe("purged");
    expect(db.rows("job_queue")).toHaveLength(0);
    expect(db.rows("activity_log")).toHaveLength(0);
  });
});
