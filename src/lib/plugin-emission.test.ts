/**
 * R2-4 emission contract — the four hooks fire at their commit points and
 * subscriber failure never fails the commit.
 *
 * Unit level: `runHook` delivers to a subscriber of each hook name and never
 * rejects, even when the subscriber 500s and the queue is down.
 *
 * Wire-site level: each modified server function is called with a fakeDb and
 * a stubbed `listInstalledPlugins` returning one subscriber; `fetch` must be
 * invoked AND the function must still return its normal success shape when
 * the subscriber 500s.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";
import type { InstalledPlugin, ServerHook } from "./plugin-manifest";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

const enqueueJobMock = vi.hoisted(() => vi.fn());
const listInstalledPluginsMock = vi.hoisted(() => vi.fn());
const priceCartMock = vi.hoisted(() => vi.fn());
const adminHolder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("./observability.server", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  ...rec.holder!.observability,
}));
vi.mock("./rate-limit.server", () => allowAllRateLimits());
vi.mock("./job-queue.server", () => ({ enqueueJob: enqueueJobMock }));
vi.mock("./plugins.server", () => ({
  listInstalledPlugins: listInstalledPluginsMock,
}));
vi.mock("./pricing.server", () => ({
  priceCart: priceCartMock,
  publicClient: vi.fn(() => null),
}));
vi.mock("./fraud.server", () => ({
  assessCheckout: vi.fn(async () => ({
    action: "allow",
    score: 0,
    decisiveCode: null,
  })),
  recordHoneypotTrip: vi.fn(async () => {}),
  recordOrderVerdict: vi.fn(async () => null),
}));
vi.mock("./identity.server", () => ({
  resolveRequestUserId: vi.fn(async () => null),
}));
vi.mock("./analytics-warehouse.server", () => ({
  ingestBeacons: vi.fn(async () => {}),
}));
vi.mock("./geo.server", () => ({ requestGeo: vi.fn(async () => ({})) }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => null),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminHolder.db;
  },
}));
vi.mock("./redis-lock.server", () => ({
  withTenantLock: async <T>(
    _tenantId: string,
    _resource: string,
    _ttlMs: number,
    fn: (handle: never) => Promise<T>,
  ): Promise<T> => fn({} as never),
}));
vi.mock("./cache.server", () => ({
  cached: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidate: vi.fn(async () => {}),
}));

// Queue-down by default: failures report raw error/timeout, never hang.
enqueueJobMock.mockRejectedValue(new Error("queue_down"));

// Dynamic: static imports would evaluate the (mocked) observability graph
// before `rec.holder` is assigned — see plugins-consent.test.ts precedent.
const { parseManifest, defaultSettings } = await import("./plugin-manifest");
const { HOOK_SCOPE } = await import("./scope-adapter");
const { resetBreakers, runHook } = await import("./plugin-hooks.server");
const { captureCart } = await import("./carts.server");
const { reserveStock } = await import("./checkout.server");
const { createOrder } = await import("./orders.server");
const { applyImport, saveKindConfig } = await import("./catalog.server");

afterEach(() => {
  resetBreakers();
  vi.unstubAllGlobals();
  recorder.reset();
  listInstalledPluginsMock.mockReset();
  priceCartMock.mockReset();
  enqueueJobMock.mockReset();
  enqueueJobMock.mockRejectedValue(new Error("queue_down"));
  adminHolder.db = null;
});

function subscriber(hook: ServerHook): InstalledPlugin {
  const verdict = parseManifest({
    id: "r2-4-probe",
    name: "R2-4 Probe",
    version: "1.0.0",
    api: "^3.0.0",
    permissions: [...HOOK_SCOPE[hook]],
    widgets: [],
    hooks: [hook],
    hooksUrl: "https://apps.example.com/hooks",
    settings: [],
    i18n: { en: {}, bn: {} },
  });
  if (!verdict.ok) throw new Error(verdict.errors.join(","));
  return {
    installId: "install-r24",
    manifest: verdict.manifest,
    grantedScopes: [...HOOK_SCOPE[hook]],
    settings: defaultSettings(verdict.manifest.settings),
    enabled: true,
  };
}

function stubFetchOk() {
  const mock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response("{}", { status: 200 }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function stubFetch500() {
  const mock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response("boom", { status: 500 }),
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function fetchBody(fetchMock: ReturnType<typeof stubFetchOk>) {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
    payload: Record<string, unknown>;
  };
}

describe("R2-4 emission contract", () => {
  it.each([
    "cart.calculate",
    "checkout.validate",
    "order.created",
    "product.saved",
  ] as const)(
    "runHook(%s) delivers to subscribers and never rejects",
    async (hook) => {
      stubFetchOk();
      const installed = [subscriber(hook)];
      const out = await runHook(installed, hook, { merchantId: "m1" });
      expect(out[0]?.status).toBe("ok");
      stubFetch500();
      await expect(
        runHook(installed, hook, { merchantId: "m1" }),
      ).resolves.toBeTruthy();
    },
  );
});

describe("R2-4 cart.calculate emission (captureCart)", () => {
  function cartDb() {
    return fakeDb({
      rpc: (fn) =>
        fn === "abandoned_cart_capture"
          ? { data: { id: "cart-1" }, error: null }
          : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
    });
  }

  const input = {
    merchantId: "m1",
    cartToken: "tok-1",
    email: "shopper@example.com",
    lines: [
      {
        variantId: "v1",
        title: "Shari",
        quantity: 1,
        unitPriceMinorInt: 50000,
      },
    ],
    subtotalMinorInt: 50000,
  };

  it("fires cart.calculate and keeps the capture result", async () => {
    const fetchMock = stubFetchOk();
    listInstalledPluginsMock.mockResolvedValue([subscriber("cart.calculate")]);
    const out = await captureCart(cartDb().asClient(), input);
    expect(out).toEqual({ id: "cart-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recorder.logs.map((l) => l.event)).toContain("plugin.hook.emitted");
  });

  it("still captures when the subscriber 500s, with no PII in the payload", async () => {
    const fetchMock = stubFetch500();
    listInstalledPluginsMock.mockResolvedValue([subscriber("cart.calculate")]);
    const out = await captureCart(cartDb().asClient(), input);
    expect(out).toEqual({ id: "cart-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchBody(fetchMock);
    expect(body.payload.merchantId).toBe("m1");
    expect(body.payload.cartToken).toBe("tok-1");
    expect(JSON.stringify(body.payload)).not.toContain("shopper@example.com");
  });
});

describe("R2-4 checkout.validate emission (reserveStock)", () => {
  function stockDb() {
    return fakeDb({
      tables: {
        product_variants: [{ id: "v1", merchant_id: "m1", stock_quantity: 10 }],
        stock_holds: [],
      },
    });
  }

  it("fires checkout.validate and keeps the hold result", async () => {
    const fetchMock = stubFetchOk();
    const db = stockDb();
    adminHolder.db = db.asClient();
    listInstalledPluginsMock.mockResolvedValue([
      subscriber("checkout.validate"),
    ]);
    const out = await reserveStock(
      "m1",
      "tok-1",
      [{ variantId: "v1", quantity: 2 }],
      "subject-1",
    );
    expect(out.token).toBe("tok-1");
    expect(typeof out.expires_at).toBe("string");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recorder.logs.map((l) => l.event)).toContain("plugin.hook.emitted");
  });

  it("still holds stock when the subscriber 500s", async () => {
    const fetchMock = stubFetch500();
    const db = stockDb();
    adminHolder.db = db.asClient();
    listInstalledPluginsMock.mockResolvedValue([
      subscriber("checkout.validate"),
    ]);
    const out = await reserveStock(
      "m1",
      "tok-1",
      [{ variantId: "v1", quantity: 2 }],
      "subject-1",
    );
    expect(out.token).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("R2-4 order.created emission (createOrder)", () => {
  function orderDb() {
    return fakeDb({
      tables: {
        orders: [],
        order_items: [],
        payments: [],
        coupon_redemptions: [],
        coupons: [],
        order_events: [],
        customers: [],
        stock_holds: [],
        product_variants: [{ id: "v1", merchant_id: "m1", stock_quantity: 10 }],
      },
    });
  }

  function seedPricing() {
    priceCartMock.mockResolvedValue({
      merchant: { id: "m1" },
      totals: {
        currency: "BDT",
        subtotalMinor: 1000,
        discountMinor: 0,
        shippingMinor: 0,
        codSurchargeMinor: 0,
        vatMinor: 0,
        vatMode: "exclusive",
        vatRateBasisPoints: 0,
        vatResolved: true,
        totalMinor: 1000,
        freeShippingThresholdMinor: null,
        freeShippingRemainingMinor: 0,
        coupon: null,
        coupons: [],
        lines: [
          {
            variantId: "v1",
            productTitle: "Shari",
            variantName: "Default",
            sku: null,
            unitPriceMinor: 1000,
            quantity: 1,
            lineTotalMinor: 1000,
            stock: 9,
            vatMinor: 0,
          },
        ],
      },
    });
  }

  const input = {
    slug: "shop",
    cart: [{ variantId: "v1", quantity: 1 }],
    paymentMethod: "cod" as const,
    idempotencyKey: "idem-r24-1",
    checkoutToken: "ctok-r24-1",
    customer: {
      name: "Ayesha",
      phone: "01700000000",
      addressLine: "Dhaka",
      city: "Dhaka",
    },
  };

  it("fires order.created and keeps the order result", async () => {
    const fetchMock = stubFetchOk();
    adminHolder.db = orderDb().asClient();
    seedPricing();
    listInstalledPluginsMock.mockResolvedValue([subscriber("order.created")]);
    const out = await createOrder(input, "subject-1");
    expect(out.orderId).toBeTruthy();
    expect(out.orderNumber).toMatch(/^FQ-/);
    expect(out.accessToken).toBeTruthy();
    // Only order.created fires: the subscriber declares no other hook.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recorder.logs.map((l) => l.event)).toContain("plugin.hook.emitted");
  });

  it("still creates the order when the subscriber 500s, with no PII in the payload", async () => {
    const fetchMock = stubFetch500();
    adminHolder.db = orderDb().asClient();
    seedPricing();
    listInstalledPluginsMock.mockResolvedValue([subscriber("order.created")]);
    const out = await createOrder(
      { ...input, idempotencyKey: "idem-r24-2", checkoutToken: "ctok-r24-2" },
      "subject-1",
    );
    expect(out.orderId).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchBody(fetchMock);
    expect(body.payload.orderId).toBe(out.orderId);
    expect(body.payload.totalMinor).toBe(1000);
    expect(JSON.stringify(body.payload)).not.toContain("01700000000");
    expect(JSON.stringify(body.payload)).not.toContain("Ayesha");
  });
});

describe("R2-4 product.saved emission (catalog)", () => {
  function importDb() {
    return fakeDb({
      rpc: (fn) => {
        if (fn === "has_merchant_role") return { data: true, error: null };
        if (fn === "catalog_import_apply")
          return {
            data: { replayed: false, summary: {} },
            error: null,
          };
        return { data: null, error: { message: `rpc_not_stubbed:${fn}` } };
      },
    });
  }

  it("fires product.saved on applyImport and keeps the result", async () => {
    const fetchMock = stubFetchOk();
    listInstalledPluginsMock.mockResolvedValue([subscriber("product.saved")]);
    const out = await applyImport(importDb().asClient(), "m1", "job-1");
    expect(out).toEqual({ replayed: false, summary: {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recorder.logs.map((l) => l.event)).toContain("plugin.hook.emitted");
  });

  it("still applies the import when the subscriber 500s", async () => {
    const fetchMock = stubFetch500();
    listInstalledPluginsMock.mockResolvedValue([subscriber("product.saved")]);
    const out = await applyImport(importDb().asClient(), "m1", "job-1");
    expect(out).toEqual({ replayed: false, summary: {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fires product.saved on saveKindConfig and keeps the result", async () => {
    const fetchMock = stubFetchOk();
    const db = fakeDb({
      tables: {
        products: [{ id: "p1", merchant_id: "m1", product_kind: "physical" }],
        digital_assets: [],
      },
      rpc: (fn) =>
        fn === "has_merchant_role"
          ? { data: true, error: null }
          : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
    });
    listInstalledPluginsMock.mockResolvedValue([subscriber("product.saved")]);
    const out = await saveKindConfig(db.asClient(), {
      merchantId: "m1",
      productId: "p1",
      kind: "digital",
      digital: {
        fileName: "f.zip",
        storagePath: "p/f.zip",
        maxDownloads: 3,
        expiryHours: 48,
      },
    });
    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchBody(fetchMock);
    expect(body.payload).toMatchObject({
      merchantId: "m1",
      productId: "p1",
      kind: "digital",
    });
  });

  it("still saves kind config when the subscriber 500s", async () => {
    const fetchMock = stubFetch500();
    const db = fakeDb({
      tables: {
        products: [{ id: "p1", merchant_id: "m1", product_kind: "physical" }],
        digital_assets: [],
      },
      rpc: (fn) =>
        fn === "has_merchant_role"
          ? { data: true, error: null }
          : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
    });
    listInstalledPluginsMock.mockResolvedValue([subscriber("product.saved")]);
    const out = await saveKindConfig(db.asClient(), {
      merchantId: "m1",
      productId: "p1",
      kind: "digital",
      digital: {
        fileName: "f.zip",
        storagePath: "p/f.zip",
        maxDownloads: 3,
        expiryHours: 48,
      },
    });
    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
