/**
 * WordPress-parity bulk actions on installs (TDD): enable/pause/delete apply
 * per row with individual results — one bad row never blocks the rest, and
 * every applied change is audited.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { metricRecorder, allowAllRateLimits } from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { bulkInstallStatus } = await import("./marketplace-install.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const W1 = "33333333-3333-3333-3333-333333333333";
const W2 = "44444444-4444-4444-4444-444444444444";

function bulkDb() {
  return fakeDb({
    tables: {
      marketplace_installs: [
        { id: W1, kind: "widget", listing_slug: "whatsapp-chat", status: "paused", merchant_id: MERCHANT },
        { id: W2, kind: "widget", listing_slug: "loyalty-lite", status: "installed", merchant_id: MERCHANT },
      ],
      plugin_state: [
        { id: "p-1", merchant_id: MERCHANT, plugin_id: "whatsapp-chat", enabled: false },
      ],
      activity_log: [],
    },
  });
}

beforeEach(() => recorder.reset());

describe("bulkInstallStatus", () => {
  it("enables paused rows and reports each result", async () => {
    const db = bulkDb();
    const out: any = await bulkInstallStatus(db.asClient(), MERCHANT, ACTOR, [W1, W2], "enable");
    expect(out.results).toHaveLength(2);
    expect(out.results.every((r: any) => r.ok)).toBe(true);
    const rows = db.rows("marketplace_installs");
    expect(rows.find((r) => r.id === W1)!.status).toBe("installed");
  });

  it("pauses installed rows", async () => {
    const db = bulkDb();
    const out: any = await bulkInstallStatus(db.asClient(), MERCHANT, ACTOR, [W2], "pause");
    expect(out.results[0]).toMatchObject({ installId: W2, ok: true });
    expect(db.rows("marketplace_installs").find((r) => r.id === W2)!.status).toBe("paused");
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

  it("deletes widget installs end to end", async () => {
    const db = bulkDb();
    const out: any = await bulkInstallStatus(db.asClient(), MERCHANT, ACTOR, [W1], "delete");
    expect(out.results[0].ok).toBe(true);
    expect(db.rows("marketplace_installs").find((r) => r.id === W1)!.status).toBe("removed");
    expect(db.rows("plugin_state")).toHaveLength(0);
  });
});
