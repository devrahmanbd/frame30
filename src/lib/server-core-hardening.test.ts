/**
 * Permanent regression pins for the server-core hardening pass (the
 * implementing run proved these with temp tests, then removed them):
 * gateway DB-down 503 (not 401), canary-alert fail-closed + alertname
 * allowlist, boot env validation, and handler installation. Rate-limit
 * wiring on metrics/error-alert is covered by the rate-limit suites'
 * contract, not re-pinned here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { ingestWebhook } from "./gateway.server";
import {
  allowlistedFiringAlerts,
  assertBootEnv,
  installBootHandlers,
} from "../server";

const MERCHANT = "22222222-2222-2222-2222-222222222222";

function body(): string {
  return JSON.stringify({
    webhookId: "wh-pin-1",
    type: "payment.captured",
    merchantId: MERCHANT,
    ts: new Date().toISOString(),
    amountMinorInt: 15000,
  });
}

function gatewayDb() {
  return fakeDb({
    tables: {
      gateway_accounts: [
        {
          merchant_id: MERCHANT,
          provider: "bkash",
          webhook_secret: "test-secret",
          active: true,
        },
      ],
      webhook_events: [],
    },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("gateway DB-down handling", () => {
  it("returns 503 db_unavailable when the account lookup faults", async () => {
    const db = gatewayDb();
    const innerFrom = db.from.bind(db);
    (db as unknown as { from: typeof db.from }).from = ((table: string) => {
      const q = innerFrom(table) as unknown as {
        failWith(m: string): unknown;
      };
      if (table === "gateway_accounts") return q.failWith("conn refused");
      return q;
    }) as typeof db.from;
    const out = await ingestWebhook(
      db.asClient(),
      "bkash",
      body(),
      "sig-present",
    );
    expect(out.http).toBe(503);
    expect(out.reason).toBe("db_unavailable");
  });

  it("still returns 401 for a genuinely unknown account", async () => {
    const db = fakeDb({
      tables: { gateway_accounts: [], webhook_events: [] },
    });
    const out = await ingestWebhook(
      db.asClient(),
      "bkash",
      body(),
      "sig-present",
    );
    expect(out.http).toBe(401);
    expect(out.reason).toBe("unknown_gateway_account");
  });
});

describe("canary-alert fail-closed", () => {
  it("drops non-allowlisted firing alerts", () => {
    const kept = allowlistedFiringAlerts({
      alerts: [
        { status: "firing", labels: { alertname: "EvilAlert" } },
        { status: "firing", labels: { alertname: "CanaryHigh5xxRate" } },
        { status: "resolved", labels: { alertname: "CanaryHigh5xxRate" } },
      ],
    });
    expect(kept).toHaveLength(1);
    expect(kept[0].labels?.["alertname"]).toBe("CanaryHigh5xxRate");
  });

  it("answers 404 with no secret configured", async () => {
    vi.stubEnv("CANARY_WEBHOOK_SECRET", "");
    const server = (await import("../server")).default;
    const res = await server.fetch(
      new Request("http://localhost/api/canary-alert", { method: "POST" }),
      {},
      {},
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("acknowledges but never trips on unknown firing alerts", async () => {
    vi.stubEnv("CANARY_WEBHOOK_SECRET", "test-secret");
    const server = (await import("../server")).default;
    const res = await server.fetch(
      new Request("http://localhost/api/canary-alert", {
        method: "POST",
        headers: { "x-canary-secret": "test-secret" },
        body: JSON.stringify({
          alerts: [{ status: "firing", labels: { alertname: "EvilAlert" } }],
        }),
      }),
      {},
      {},
    );
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ tripped: false });
  });
});

describe("boot policy", () => {
  it("throws on missing required env", () => {
    expect(() =>
      assertBootEnv({ SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "x" }),
    ).toThrow(/SUPABASE_URL/);
  });

  it("warns (not throws) on missing optional env", () => {
    const out = assertBootEnv({
      SUPABASE_URL: "https://x.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "k",
      SUPABASE_PUBLISHABLE_KEY: "p",
    });
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it("installBootHandlers is idempotent", () => {
    const before = process.listenerCount("unhandledRejection");
    installBootHandlers();
    installBootHandlers();
    const after = process.listenerCount("unhandledRejection");
    expect(after - before).toBeLessThanOrEqual(1);
    process.removeAllListeners("unhandledRejection");
    process.removeAllListeners("uncaughtException");
  });
});
