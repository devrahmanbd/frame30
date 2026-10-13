/**
 * FB CAPI Purchase per-tenant correctness — hermetic TDD contract tests.
 *
 * Scope: order confirmation emits a server-side Meta Conversions API
 * Purchase tied to the ORDER's tenant pixel/token, exactly once per order,
 * without ever breaking commerce when analytics degrades.
 *
 * Hermetic: injected mock transport + in-memory mock Supabase admin. Global
 * `fetch` is stubbed to throw, so any attempt to touch the real network
 * (graph.facebook.com / connect.facebook.net) fails the suite. The pixel ID
 * 979224697785271 and all tokens below are fixture data only.
 *
 * Verified context:
 * - per-tenant pixel/token fan-out lives in
 *   analytics-warehouse.server.ts:905-921 (`loadMerchantAnalyticsConfig`) and
 *   deliver() posts `event_name` + `value_minor_int/100` + `currency_code` to
 *   `https://graph.facebook.com/v19.0/<pixel>/events` (:954-983);
 * - `queueConversion` enqueues via the `analytics_queue_conversion` RPC
 *   (:825-863) with SHA-256-hashed PII;
 * - GAP (reported, not fixed): `queueConversion` has no caller on the order
 *   placement/confirmation path (orders.server.ts / checkout.server.ts never
 *   reference it), and deliver() is module-private with no order-idempotency
 *   dedupe of its own. The `sendCapiPurchase` / `confirmOrderWithAnalytics`
 *   helpers below pin the contract the confirmation path MUST satisfy.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  loadMerchantAnalyticsConfig,
  queueConversion,
  queueFbPurchaseConversion,
} from "./analytics-warehouse.server";

/* ------------------------------------------------------------------ *
 * Hermetic doubles (no network, no clock, no DB).
 * ------------------------------------------------------------------ */

type MockTransportMode = "ok" | "http-500" | "timeout";

type TransportCall = { url: string; body: unknown };

function makeMockTransport(mode: MockTransportMode) {
  const calls: TransportCall[] = [];
  const transport = async (
    url: string,
    body: unknown,
  ): Promise<{ ok: boolean; status: number }> => {
    calls.push({ url, body });
    if (mode === "timeout") throw new Error("The operation was aborted");
    if (mode === "http-500") return { ok: false, status: 500 };
    return { ok: true, status: 200 };
  };
  return { calls, transport };
}

type TenantCreds = { pixelId: string; capiToken: string };

type CapiOutcome =
  | { ok: true; deduped: boolean }
  | { ok: false; error: string; degraded: true }
  | { skipped: true; reason: "pixel_not_configured" | "capi_token_missing" };

/** Order-level idempotency keys already delivered (event_id = order id). */
let deliveredEventIds = new Set<string>();
/** Hermetic stand-in for the degraded-analytics metric. */
let degradedAnalyticsTotal = 0;

function isValidPixelId(value: string): boolean {
  return /^\d{8,20}$/.test(value);
}

/**
 * Mirror of the deliver() contract (analytics-warehouse.server.ts:954-983):
 * Purchase payload addressed to the ORDER tenant's pixel, sent at most once
 * per order id, failures contained as degraded analytics — never thrown.
 */
async function sendCapiPurchase(
  order: { id: string; totalMinor: number; currency: string },
  creds: Partial<TenantCreds> | null,
  transport: (
    url: string,
    body: unknown,
  ) => Promise<{ ok: boolean; status: number }>,
): Promise<CapiOutcome> {
  const pixelId = (creds?.pixelId ?? "").trim();
  const capiToken = (creds?.capiToken ?? "").trim();
  if (!pixelId || !isValidPixelId(pixelId))
    return { skipped: true, reason: "pixel_not_configured" };
  if (!capiToken) return { skipped: true, reason: "capi_token_missing" };
  if (deliveredEventIds.has(order.id)) return { ok: true, deduped: true };
  const url =
    `https://graph.facebook.com/v19.0/${pixelId}/events` +
    `?access_token=${encodeURIComponent(capiToken)}`;
  const body = {
    data: [
      {
        event_name: "Purchase",
        event_id: order.id,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        user_data: {},
        custom_data: {
          value: order.totalMinor / 100,
          currency: order.currency,
        },
      },
    ],
  };
  try {
    const res = await transport(url, body);
    if (!res.ok) {
      degradedAnalyticsTotal += 1;
      return { ok: false, error: `facebook_${res.status}`, degraded: true };
    }
    deliveredEventIds.add(order.id);
    return { ok: true, deduped: false };
  } catch {
    degradedAnalyticsTotal += 1;
    return { ok: false, error: "facebook_transport_failed", degraded: true };
  }
}

/**
 * Fail-closed confirmation wrapper: commerce commits first; analytics is
 * best-effort and can only degrade, never reject the order.
 */
async function confirmOrderWithAnalytics(
  order: { id: string; totalMinor: number; currency: string },
  creds: Partial<TenantCreds> | null,
  transport: (
    url: string,
    body: unknown,
  ) => Promise<{ ok: boolean; status: number }>,
): Promise<{ orderConfirmed: true; orderId: string; analytics: CapiOutcome }> {
  const orderConfirmed = true as const; // stock/ledger commit precedes this
  const analytics = await sendCapiPurchase(order, creds, transport);
  return { orderConfirmed, orderId: order.id, analytics };
}

/** Mock admin serving seo_settings per merchant + the queue RPC with dedupe. */
function makeMockAdmin(
  settingsByMerchant: Record<string, Record<string, unknown>>,
) {
  const seenEventIds = new Set<string>();
  const queuedCalls: Record<string, unknown>[] = [];
  const admin = {
    from: () => ({
      select: () => ({
        eq: (_col: string, merchantId: string) => ({
          maybeSingle: async () => ({
            data: settingsByMerchant[merchantId]
              ? { seo_settings: settingsByMerchant[merchantId] }
              : null,
            error: null,
          }),
        }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "analytics_queue_conversion") {
        queuedCalls.push(args);
        const eventId = String(args["_event_id"]);
        if (seenEventIds.has(eventId))
          return { data: { ok: true, queued: false, id: null }, error: null };
        seenEventIds.add(eventId);
        return {
          data: { ok: true, queued: true, id: `conv-${eventId}` },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
  return { admin, queuedCalls };
}

/* ------------------------------------------------------------------ *
 * Fixtures.
 * ------------------------------------------------------------------ */

// Fixture data only — asserted as strings, never transmitted.
const PIXEL_A = "979224697785271";
const PIXEL_B = "123456789012345";
const CAPI_A = "CAPI_ALPHA_FIXTURE_111";
const CAPI_B = "CAPI_BETA_FIXTURE_222";

beforeEach(() => {
  deliveredEventIds = new Set<string>();
  degradedAnalyticsTotal = 0;
  // Hermetic guard: the real network is unreachable by construction.
  vi.stubGlobal("fetch", async () => {
    throw new Error("network disabled in hermetic tests");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fb capi purchase per-tenant correctness", () => {
  it("emits the Purchase with the ORDER tenant's pixel/token, value and currency", async () => {
    const { transport, calls } = makeMockTransport("ok");
    const order = { id: "order-A-001", totalMinor: 259900, currency: "BDT" };

    const outcome = await sendCapiPurchase(
      order,
      { pixelId: PIXEL_A, capiToken: CAPI_A },
      transport,
    );

    expect(outcome).toEqual({ ok: true, deduped: false });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toContain(`graph.facebook.com/v19.0/${PIXEL_A}/events`);
    expect(call.url).toContain(`access_token=${encodeURIComponent(CAPI_A)}`);
    // …and NOT the other tenant's credentials:
    expect(call.url).not.toContain(PIXEL_B);
    expect(call.url).not.toContain(CAPI_B);
    const payload = call.body as {
      data: {
        event_name: string;
        event_id: string;
        custom_data: { value: number; currency: string };
      }[];
    };
    expect(payload.data[0]!.event_name).toBe("Purchase");
    expect(payload.data[0]!.event_id).toBe("order-A-001");
    expect(payload.data[0]!.custom_data.value).toBe(2599);
    expect(payload.data[0]!.custom_data.currency).toBe("BDT");
  });

  it("uses tenant B's credentials for B's orders (no cross-tenant bleed)", async () => {
    const { transport, calls } = makeMockTransport("ok");
    await sendCapiPurchase(
      { id: "order-B-001", totalMinor: 150000, currency: "BDT" },
      { pixelId: PIXEL_B, capiToken: CAPI_B },
      transport,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain(`v19.0/${PIXEL_B}/events`);
    expect(calls[0]!.url).not.toContain(PIXEL_A);
    expect(calls[0]!.url).not.toContain(CAPI_A);
  });

  it("sends once on replayed confirmation (order idempotency key dedupe)", async () => {
    const { transport, calls } = makeMockTransport("ok");
    const order = { id: "order-A-042", totalMinor: 99900, currency: "BDT" };
    const creds = { pixelId: PIXEL_A, capiToken: CAPI_A };

    const first = await sendCapiPurchase(order, creds, transport);
    const replay = await sendCapiPurchase(order, creds, transport);

    expect(first).toEqual({ ok: true, deduped: false });
    expect(replay).toEqual({ ok: true, deduped: true });
    expect(calls).toHaveLength(1);
  });

  it("transport timeout never breaks order confirmation (degraded metric bumps)", async () => {
    const { transport, calls } = makeMockTransport("timeout");
    const result = await confirmOrderWithAnalytics(
      { id: "order-A-007", totalMinor: 50000, currency: "BDT" },
      { pixelId: PIXEL_A, capiToken: CAPI_A },
      transport,
    );
    expect(result.orderConfirmed).toBe(true);
    expect(result.orderId).toBe("order-A-007");
    expect(result.analytics).toMatchObject({ ok: false, degraded: true });
    expect(calls).toHaveLength(1);
    expect(degradedAnalyticsTotal).toBe(1);
  });

  it("transport HTTP 5xx never breaks order placement (fail-closed commerce)", async () => {
    const { transport, calls } = makeMockTransport("http-500");
    const result = await confirmOrderWithAnalytics(
      { id: "order-A-008", totalMinor: 75000, currency: "BDT" },
      { pixelId: PIXEL_A, capiToken: CAPI_A },
      transport,
    );
    expect(result.orderConfirmed).toBe(true);
    expect(result.analytics).toEqual({
      ok: false,
      error: "facebook_500",
      degraded: true,
    });
    expect(calls).toHaveLength(1);
    expect(degradedAnalyticsTotal).toBe(1);
  });

  it("missing pixel/token → no CAPI attempted, no errors, order still confirmed", async () => {
    const { transport, calls } = makeMockTransport("ok");
    const order = { id: "order-C-001", totalMinor: 10000, currency: "BDT" };

    for (const creds of [
      null,
      {},
      { pixelId: "", capiToken: "" },
      { pixelId: PIXEL_A, capiToken: "" },
      { pixelId: "", capiToken: CAPI_A },
    ]) {
      const result = await confirmOrderWithAnalytics(order, creds, transport);
      expect(result.orderConfirmed).toBe(true);
      expect(result.analytics).toMatchObject({ skipped: true });
    }
    expect(calls).toHaveLength(0);
    expect(degradedAnalyticsTotal).toBe(0);
  });

  it("queueConversion carries Purchase fields with hashed PII; replay queues nothing", async () => {
    const { admin, queuedCalls } = makeMockAdmin({});
    const input = {
      merchantId: "merchant_capi_iso_A",
      provider: "facebook" as const,
      eventName: "Purchase",
      orderId: "order-A-100",
      eventId: "order-A-100",
      valueMinorInt: 259900,
      currencyCode: "BDT",
      email: "Shopper@Example.Com",
      phone: "+8801712345678",
    };

    const first = await queueConversion(admin as never, input);
    expect(first.queued).toBe(true);
    expect(queuedCalls).toHaveLength(1);
    const args = queuedCalls[0]!;
    expect(args["_merchant_id"]).toBe("merchant_capi_iso_A");
    expect(args["_event_name"]).toBe("Purchase");
    expect(args["_order_id"]).toBe("order-A-100");
    expect(args["_value_minor_int"]).toBe(259900);
    expect(args["_currency_code"]).toBe("BDT");
    const hashed = args["_hashed_payload"] as Record<string, string>;
    expect(hashed["em"]).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed["ph"]).toMatch(/^[0-9a-f]{64}$/);
    // Raw PII never reaches the outbox row:
    expect(JSON.stringify(args)).not.toContain("Shopper@Example.Com");
    expect(JSON.stringify(args)).not.toContain("8801712345678");

    // Replay of the same confirmation dedupes at the RPC:
    const replay = await queueConversion(admin as never, input);
    expect(replay.queued).toBe(false);
  });

  it("loadMerchantAnalyticsConfig isolates tenant pixel/token pairs", async () => {
    const { admin } = makeMockAdmin({
      merchant_capi_cfg_A: {
        facebook_pixel_id: PIXEL_A,
        facebook_capi_token: CAPI_A,
      },
      merchant_capi_cfg_B: {
        facebook_pixel_id: PIXEL_B,
        facebook_capi_token: CAPI_B,
      },
    });
    const cfgA = await loadMerchantAnalyticsConfig(
      admin as never,
      "merchant_capi_cfg_A",
    );
    const cfgB = await loadMerchantAnalyticsConfig(
      admin as never,
      "merchant_capi_cfg_B",
    );
    expect(cfgA.fbPixel).toBe(PIXEL_A);
    expect(cfgA.fbToken).toBe(CAPI_A);
    expect(cfgB.fbPixel).toBe(PIXEL_B);
    expect(cfgB.fbToken).toBe(CAPI_B);
    expect(cfgA.fbPixel).not.toBe(cfgB.fbPixel);
    expect(cfgA.fbToken).not.toBe(cfgB.fbToken);
  });

  it("only ever addresses the CAPI host (no pixel loader / third hosts)", async () => {
    const { transport, calls } = makeMockTransport("ok");
    await sendCapiPurchase(
      { id: "order-A-009", totalMinor: 1000, currency: "BDT" },
      { pixelId: PIXEL_A, capiToken: CAPI_A },
      transport,
    );
    for (const call of calls) {
      expect(call.url.startsWith("https://graph.facebook.com/")).toBe(true);
      expect(call.url).not.toContain("connect.facebook.net");
    }
  });
});

describe("queueFbPurchaseConversion (source order-confirmation entry)", () => {
  const merchantA = "merchant_capi_src_A";
  const merchantB = "merchant_capi_src_B";

  function srcAdmin(
    settingsByMerchant: Record<string, Record<string, unknown>>,
  ) {
    return makeMockAdmin(settingsByMerchant);
  }

  it("queues the Purchase with value/currency + hashed PII, keyed by order id", async () => {
    const { admin, queuedCalls } = srcAdmin({
      [merchantA]: {
        facebook_pixel_id: PIXEL_A,
        facebook_capi_token: CAPI_A,
      },
    });

    const outcome = await queueFbPurchaseConversion(admin as never, {
      merchantId: merchantA,
      orderId: "order-A-200",
      valueMinorInt: 259900,
      currencyCode: "BDT",
      email: "Shopper@Example.Com",
      phone: "+8801712345678",
    });

    expect(outcome).toEqual({
      ok: true,
      queued: true,
      deduped: false,
      id: "conv-order-A-200",
    });
    expect(queuedCalls).toHaveLength(1);
    const args = queuedCalls[0]!;
    expect(args["_merchant_id"]).toBe(merchantA);
    expect(args["_provider"]).toBe("facebook");
    expect(args["_event_name"]).toBe("Purchase");
    expect(args["_order_id"]).toBe("order-A-200");
    expect(args["_event_id"]).toBe("order-A-200");
    expect(args["_value_minor_int"]).toBe(259900);
    expect(args["_currency_code"]).toBe("BDT");
    const hashed = args["_hashed_payload"] as Record<string, string>;
    expect(hashed["em"]).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed["ph"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain("Shopper@Example.Com");
    expect(JSON.stringify(args)).not.toContain("8801712345678");
  });

  it("replayed confirmation queues nothing effective (RPC-dedupe idempotency)", async () => {
    const { admin, queuedCalls } = srcAdmin({
      [merchantA]: {
        facebook_pixel_id: PIXEL_A,
        facebook_capi_token: CAPI_A,
      },
    });
    const input = {
      merchantId: merchantA,
      orderId: "order-A-201",
      valueMinorInt: 99900,
      currencyCode: "BDT",
    };

    const first = await queueFbPurchaseConversion(admin as never, input);
    const replay = await queueFbPurchaseConversion(admin as never, input);

    expect(first).toMatchObject({ ok: true, queued: true, deduped: false });
    expect(replay).toMatchObject({ ok: true, queued: false, deduped: true });
    // One effective queue: only the first confirmation produced a queued row.
    expect(
      [first, replay].filter((o) => "ok" in o && o.ok && o.queued),
    ).toHaveLength(1);
    expect(queuedCalls.map((c) => c["_event_id"])).toEqual([
      "order-A-201",
      "order-A-201",
    ]);
  });

  it("isolates tenants: A and B queue under their own merchant rows", async () => {
    const { admin, queuedCalls } = srcAdmin({
      [merchantA]: {
        facebook_pixel_id: PIXEL_A,
        facebook_capi_token: CAPI_A,
      },
      [merchantB]: {
        facebook_pixel_id: PIXEL_B,
        facebook_capi_token: CAPI_B,
      },
    });

    await queueFbPurchaseConversion(admin as never, {
      merchantId: merchantA,
      orderId: "order-A-202",
      valueMinorInt: 1000,
      currencyCode: "BDT",
    });
    await queueFbPurchaseConversion(admin as never, {
      merchantId: merchantB,
      orderId: "order-B-202",
      valueMinorInt: 2000,
      currencyCode: "BDT",
    });

    expect(queuedCalls.map((c) => c["_merchant_id"])).toEqual([
      merchantA,
      merchantB,
    ]);
    // Pixel/token never ride the queue row — and no cross-tenant bleed.
    const blob = JSON.stringify(queuedCalls);
    expect(blob).not.toContain(PIXEL_A);
    expect(blob).not.toContain(PIXEL_B);
    expect(blob).not.toContain(CAPI_A);
    expect(blob).not.toContain(CAPI_B);
  });

  it("missing pixel/token skips with a reason and queues nothing", async () => {
    const { admin, queuedCalls } = srcAdmin({
      merchant_no_pixel: { facebook_capi_token: CAPI_A },
      merchant_no_token: { facebook_pixel_id: PIXEL_A },
      merchant_blank: { facebook_pixel_id: "   ", facebook_capi_token: "" },
    });

    expect(
      await queueFbPurchaseConversion(admin as never, {
        merchantId: "merchant_no_pixel",
        orderId: "order-C-201",
        valueMinorInt: 1000,
        currencyCode: "BDT",
      }),
    ).toEqual({ skipped: true, reason: "pixel_not_configured" });
    expect(
      await queueFbPurchaseConversion(admin as never, {
        merchantId: "merchant_no_token",
        orderId: "order-C-202",
        valueMinorInt: 1000,
        currencyCode: "BDT",
      }),
    ).toEqual({ skipped: true, reason: "capi_token_missing" });
    expect(
      await queueFbPurchaseConversion(admin as never, {
        merchantId: "merchant_blank",
        orderId: "order-C-203",
        valueMinorInt: 1000,
        currencyCode: "BDT",
      }),
    ).toEqual({ skipped: true, reason: "pixel_not_configured" });
    expect(
      await queueFbPurchaseConversion(admin as never, {
        merchantId: "merchant_unknown",
        orderId: "order-C-204",
        valueMinorInt: 1000,
        currencyCode: "BDT",
      }),
    ).toEqual({ skipped: true, reason: "pixel_not_configured" });
    expect(queuedCalls).toHaveLength(0);
  });

  it("malformed stored pixel IDs are ignored with a reason (never queued)", async () => {
    const hostile = [
      "<script>alert(1)</script>",
      `${PIXEL_A}"><script>alert(1)</script>`,
      "1234567",
      "123456789012345678901",
      "97922469778527a",
      "abc",
    ];
    for (const [index, pixel] of hostile.entries()) {
      const merchant = `merchant_hostile_${index}`;
      const { admin, queuedCalls } = srcAdmin({
        [merchant]: { facebook_pixel_id: pixel, facebook_capi_token: CAPI_A },
      });
      const outcome = await queueFbPurchaseConversion(admin as never, {
        merchantId: merchant,
        orderId: `order-H-${index}`,
        valueMinorInt: 1000,
        currencyCode: "BDT",
      });
      expect(outcome).toEqual({ skipped: true, reason: "pixel_id_invalid" });
      expect(queuedCalls).toHaveLength(0);
    }
  });

  it("queue/RPC failure degrades (never throws) so confirmation survives", async () => {
    const failingAdmin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                seo_settings: {
                  facebook_pixel_id: PIXEL_A,
                  facebook_capi_token: CAPI_A,
                },
              },
              error: null,
            }),
          }),
        }),
      }),
      rpc: async () => {
        throw new Error("db down");
      },
    };
    const outcome = await queueFbPurchaseConversion(failingAdmin as never, {
      merchantId: merchantA,
      orderId: "order-A-203",
      valueMinorInt: 1000,
      currencyCode: "BDT",
    });
    expect(outcome).toEqual({
      ok: false,
      degraded: true,
      error: "facebook_queue_failed",
    });

    const unreadableAdmin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              throw new Error("settings read failed");
            },
          }),
        }),
      }),
      rpc: async () => ({ data: null, error: null }),
    };
    const unreadable = await queueFbPurchaseConversion(
      unreadableAdmin as never,
      {
        merchantId: merchantA,
        orderId: "order-A-204",
        valueMinorInt: 1000,
        currencyCode: "BDT",
      },
    );
    expect(unreadable).toEqual({
      ok: false,
      degraded: true,
      error: "facebook_queue_failed",
    });
  });
});
