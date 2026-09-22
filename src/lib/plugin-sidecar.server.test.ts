/**
 * Phase 2 R2-2 — sidecar supervisor contract tests.
 *
 * One worker per ACTIVE install (enabled AND not suspended AND not
 * kill-switched); heartbeat advances on re-sync; stop is idempotent;
 * vanished install rows are reaped.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  listSidecars,
  resetSidecars,
  stopSidecar,
  syncSidecars,
} from "./plugin-sidecar.server";

const MERCHANT = "m1";

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

function seedDb() {
  return fakeDb({
    tables: {
      plugin_state: [
        {
          id: "install-active",
          merchant_id: MERCHANT,
          plugin_id: "loyalty-lite",
          manifest: manifest("loyalty-lite"),
          scopes: ["read_shop"],
          settings: {},
          enabled: true,
          suspended: false,
        },
        {
          id: "install-suspended",
          merchant_id: MERCHANT,
          plugin_id: "reviews-pro",
          manifest: manifest("reviews-pro"),
          scopes: ["read_shop"],
          settings: {},
          enabled: true,
          suspended: true,
          suspended_reason: "scope_revoked",
          suspended_at: new Date().toISOString(),
        },
        {
          id: "install-disabled",
          merchant_id: MERCHANT,
          plugin_id: "badges",
          manifest: manifest("badges"),
          scopes: ["read_shop"],
          settings: {},
          enabled: false,
          suspended: false,
        },
      ],
      plugin_kill_switch: [],
    },
  });
}

beforeEach(() => resetSidecars());

describe("sidecar supervisor (R2-2)", () => {
  it("starts a worker only for active installs (enabled, not suspended, not killed)", async () => {
    const db = seedDb();
    const summary = await syncSidecars(db.asClient(), MERCHANT);
    expect(summary.started).toBe(1);
    expect(summary.skipped).toBe(2);
    const workers = listSidecars(MERCHANT);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.pluginId).toBe("loyalty-lite");
    expect(workers[0]?.installId).toBe("install-active");
    expect(workers[0]?.grantedScopes).toEqual(["read_shop"]);
  });

  it("stopSidecar removes the worker and is idempotent", async () => {
    const db = seedDb();
    await syncSidecars(db.asClient(), MERCHANT);
    stopSidecar(MERCHANT, "loyalty-lite");
    stopSidecar(MERCHANT, "loyalty-lite"); // no throw
    expect(listSidecars(MERCHANT)).toHaveLength(0);
  });

  it("heartbeat advances per worker on re-sync", async () => {
    const db = seedDb();
    await syncSidecars(db.asClient(), MERCHANT);
    const [before] = listSidecars(MERCHANT);
    const t0 = before!.lastBeatAt;
    const b0 = before!.beats;
    await new Promise((r) => setTimeout(r, 5));
    const summary = await syncSidecars(db.asClient(), MERCHANT);
    expect(summary.started).toBe(0);
    const [after] = listSidecars(MERCHANT);
    expect(after!.beats).toBe(b0 + 1);
    expect(after!.lastBeatAt).toBeGreaterThanOrEqual(t0);
  });

  it("reaps workers whose install rows vanished (uninstall)", async () => {
    const db = seedDb();
    await syncSidecars(db.asClient(), MERCHANT);
    expect(listSidecars(MERCHANT)).toHaveLength(1);
    db.tables["plugin_state"] = [];
    const summary = await syncSidecars(db.asClient(), MERCHANT);
    expect(summary.stopped).toBe(1);
    expect(listSidecars(MERCHANT)).toHaveLength(0);
  });
});
