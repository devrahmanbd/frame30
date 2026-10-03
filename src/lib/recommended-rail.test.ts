/**
 * Lane H — behavior-ranked `recommended` rails + shared money formatter.
 *
 * Cases only: ranking preference (viewed > cold), cold-start fallback,
 * bestseller fallback, co-occurrence, cache bounds (bounded queries, no PII
 * in keys/columns, one snapshot per merchant), merchant scoping, and merchant
 * currency passthrough (string presence via `formatDisplayMoney` — money
 * figures are never asserted arithmetically).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { newSection, type Section, type ThemeAst } from "./builder-ast";
import { collectWidgetRequests } from "./widget-data";
import {
  BEHAVIOR_BOUNDS,
  behaviorCacheKey,
  behaviorScore,
  emptyBehaviorSignals,
  loadBehaviorSignals,
  rankRailRows,
  resolveWidgetData,
} from "./widget-data.server";
import { formatDisplayMoney } from "./money-display";
import { fakeDb, type FakeDb } from "./__fixtures__/fake-db";

/* ------------------------------------------------------------------ doubles */

const current: { pub: FakeDb; admin: FakeDb } = {
  pub: fakeDb(),
  admin: fakeDb(),
};

vi.mock("./pricing.server", () => ({
  publicClient: () => current.pub.asClient(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return current.admin.asClient();
  },
}));

/* ------------------------------------------------------------------ helpers */

const ast = (main: Section[]): ThemeAst => ({ header: [], main, footer: [] });

function rail(
  id: string,
  props: Record<string, unknown> = {},
): Section {
  const section = newSection("product_rail");
  return {
    ...section,
    id,
    props: { ...section.props, limit: 6, ...props } as Section["props"],
  };
}

function product(
  merchantId: string,
  id: string,
  createdAt: string,
  price = 120000,
) {
  return {
    id,
    merchant_id: merchantId,
    status: "active",
    title: `Product ${id}`,
    slug: id,
    image_url: null,
    created_at: createdAt,
    tags: [],
    product_variants: [
      {
        id: `v-${id}`,
        price_amount_minor_int: price,
        compare_at_amount_minor_int: null,
        stock_quantity: 10,
      },
    ],
    collection_products: [],
  };
}

function viewEvent(merchantId: string, productId: string, at: string) {
  return {
    merchant_id: merchantId,
    entity: "product",
    action: "view",
    payload: { item_id: productId },
    occurred_at: at,
  };
}

function cartEvent(merchantId: string, variantId: string, at: string) {
  return {
    merchant_id: merchantId,
    entity: "cart",
    action: "add",
    payload: { variantId, quantity: 1 },
    occurred_at: at,
  };
}

function seedMerchant(pub: FakeDb, merchantId: string, currency = "BDT") {
  pub.tables["merchants"] = [{ id: merchantId, currency_code: currency }];
}

async function recommendedIds(merchantId: string, source: string) {
  const bundle = collectWidgetRequests(ast([rail("r1", { source })]));
  const map = await resolveWidgetData(merchantId, bundle);
  return (map[bundle.requests[0]!.key] ?? []).map((r) => r.id);
}

async function recommendedRows(merchantId: string, source: string) {
  const bundle = collectWidgetRequests(ast([rail("r1", { source })]));
  const map = await resolveWidgetData(merchantId, bundle);
  return map[bundle.requests[0]!.key] ?? [];
}

beforeEach(() => {
  current.pub = fakeDb();
  current.admin = fakeDb();
});

/* -------------------------------------------------------------------- cases */

describe("recommended rail behavior ranking", () => {
  it("prefers a viewed product over a newer cold one", async () => {
    const m = "m-laneh-viewed";
    seedMerchant(current.pub, m);
    current.pub.tables["products"] = [
      product(m, "p-old", "2026-01-01T00:00:00Z"),
      product(m, "p-new", "2026-06-01T00:00:00Z"),
    ];
    current.admin.tables["analytics_events"] = [
      viewEvent(m, "p-old", "2026-07-01T00:00:00Z"),
      viewEvent(m, "p-old", "2026-07-02T00:00:00Z"),
    ];

    expect(await recommendedIds(m, "recommended")).toEqual(["p-old", "p-new"]);
  });

  it("ranks a cart add above a lone view", async () => {
    const m = "m-laneh-cart";
    seedMerchant(current.pub, m);
    current.pub.tables["products"] = [
      product(m, "p-viewed", "2026-01-01T00:00:00Z"),
      product(m, "p-carted", "2026-01-02T00:00:00Z"),
    ];
    current.admin.tables["analytics_events"] = [
      viewEvent(m, "p-viewed", "2026-07-01T00:00:00Z"),
      cartEvent(m, "v-p-carted", "2026-07-01T00:00:00Z"),
    ];
    current.admin.tables["product_variants"] = [
      { id: "v-p-carted", product_id: "p-carted", merchant_id: m },
    ];

    expect(await recommendedIds(m, "recommended")).toEqual([
      "p-carted",
      "p-viewed",
    ]);
  });

  it("ranks bought-together products above a solo seller", async () => {
    const m = "m-laneh-co";
    seedMerchant(current.pub, m);
    current.pub.tables["products"] = [
      product(m, "p-solo", "2026-01-01T00:00:00Z"),
      product(m, "p-a", "2026-01-02T00:00:00Z"),
      product(m, "p-b", "2026-01-03T00:00:00Z"),
    ];
    current.admin.tables["order_items"] = [
      {
        merchant_id: m,
        order_id: "o-1",
        variant_id: "v-p-a",
        quantity: 1,
        created_at: "2026-07-01T00:00:00Z",
      },
      {
        merchant_id: m,
        order_id: "o-1",
        variant_id: "v-p-b",
        quantity: 1,
        created_at: "2026-07-01T00:00:00Z",
      },
      {
        merchant_id: m,
        order_id: "o-2",
        variant_id: "v-p-solo",
        quantity: 1,
        created_at: "2026-07-02T00:00:00Z",
      },
    ];
    current.admin.tables["product_variants"] = [
      { id: "v-p-a", product_id: "p-a", merchant_id: m },
      { id: "v-p-b", product_id: "p-b", merchant_id: m },
      { id: "v-p-solo", product_id: "p-solo", merchant_id: m },
    ];

    const ids = await recommendedIds(m, "recommended");
    expect(ids.slice(0, 2).sort()).toEqual(["p-a", "p-b"]);
    expect(ids[2]).toBe("p-solo");
  });

  it("cold start keeps collection (newest) order for both rail kinds", async () => {
    const m = "m-laneh-cold";
    seedMerchant(current.pub, m);
    current.pub.tables["products"] = [
      product(m, "p-old", "2026-01-01T00:00:00Z"),
      product(m, "p-new", "2026-06-01T00:00:00Z"),
    ];

    expect(await recommendedIds(m, "recommended")).toEqual(["p-new", "p-old"]);
    expect(await recommendedIds(m, "bestsellers")).toEqual(["p-new", "p-old"]);
    // The untouched default still resolves newest-first too.
    expect(await recommendedIds(m, "collection")).toEqual(["p-new", "p-old"]);
  });

  it("falls back to bestseller velocity when behavior is cold", async () => {
    const m = "m-laneh-velocity";
    seedMerchant(current.pub, m);
    current.pub.tables["products"] = [
      product(m, "p-slow", "2026-06-01T00:00:00Z"),
      product(m, "p-hot", "2026-01-01T00:00:00Z"),
    ];
    current.admin.tables["order_items"] = [
      {
        merchant_id: m,
        order_id: "o-1",
        variant_id: "v-p-hot",
        quantity: 9,
        created_at: "2026-07-01T00:00:00Z",
      },
      {
        merchant_id: m,
        order_id: "o-2",
        variant_id: "v-p-slow",
        quantity: 1,
        created_at: "2026-07-02T00:00:00Z",
      },
    ];
    current.admin.tables["product_variants"] = [
      { id: "v-p-hot", product_id: "p-hot", merchant_id: m },
      { id: "v-p-slow", product_id: "p-slow", merchant_id: m },
    ];

    // No views/carts: behavior is cold, but orders exist.
    expect(await recommendedIds(m, "recommended")).toEqual(["p-hot", "p-slow"]);
    expect(await recommendedIds(m, "bestsellers")).toEqual(["p-hot", "p-slow"]);
  });

  it("never leaks one merchant's behavior into another's rail", async () => {
    const a = "m-laneh-iso-a";
    const b = "m-laneh-iso-b";
    for (const m of [a, b]) {
      seedMerchant(current.pub, m);
      current.pub.tables["products"] = [
        ...(current.pub.tables["products"] ?? []),
        product(m, `${m}-old`, "2026-01-01T00:00:00Z"),
        product(m, `${m}-new`, "2026-06-01T00:00:00Z"),
      ];
    }
    current.admin.tables["analytics_events"] = [
      viewEvent(a, `${a}-old`, "2026-07-01T00:00:00Z"),
    ];

    expect(await recommendedIds(a, "recommended")).toEqual([
      `${a}-old`,
      `${a}-new`,
    ]);
    // Merchant B has no signals: newest first, unaffected by A's views.
    expect(await recommendedIds(b, "recommended")).toEqual([
      `${b}-new`,
      `${b}-old`,
    ]);
  });
});

describe("behavior snapshot bounds", () => {
  it("issues a constant, bounded read set per snapshot", async () => {
    const m = "m-laneh-bounds";
    seedMerchant(current.pub, m);
    current.pub.tables["products"] = [product(m, "p-1", "2026-01-01T00:00:00Z")];
    // More events than the window: the snapshot must still scan bounded.
    current.admin.tables["analytics_events"] = Array.from(
      { length: BEHAVIOR_BOUNDS.events + 50 },
      (_, i) => viewEvent(m, "p-1", `2026-07-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`),
    );

    await recommendedIds(m, "recommended");
    const selects = current.admin.selects();
    expect(selects.length).toBeGreaterThan(0);
    expect(selects.length).toBeLessThanOrEqual(3);
    for (const s of selects) {
      expect(
        s.limit !== null || s.single,
        `unbounded read: ${s.table}`,
      ).toBe(true);
      expect(s.returned).toBeLessThanOrEqual(
        Math.max(BEHAVIOR_BOUNDS.events, BEHAVIOR_BOUNDS.items),
      );
    }
  });

  it("second rail reuses the cached snapshot instead of re-querying", async () => {
    const m = "m-laneh-cache";
    seedMerchant(current.pub, m);
    current.pub.tables["products"] = [product(m, "p-1", "2026-01-01T00:00:00Z")];
    current.admin.tables["analytics_events"] = [
      viewEvent(m, "p-1", "2026-07-01T00:00:00Z"),
    ];

    await recommendedIds(m, "recommended");
    const first = current.admin.selects().length;
    expect(first).toBeGreaterThan(0);
    await recommendedIds(m, "recommended");
    expect(current.admin.selects().length).toBe(first);
  });

  it("keeps shopper identifiers out of keys and columns", async () => {
    const m = "m-laneh-nopii";
    const sessionKey = "abc123def456ghi789";
    seedMerchant(current.pub, m);
    current.pub.tables["products"] = [product(m, "p-1", "2026-01-01T00:00:00Z")];

    const key = behaviorCacheKey(m);
    expect(key).toContain(m);
    expect(key).not.toContain(sessionKey);

    await recommendedIds(m, "recommended");
    const pii = ["visitor_hash", "session_key", "email", "phone", "token"];
    for (const s of current.admin.selects()) {
      for (const bad of pii) {
        expect(
          s.columns.toLowerCase(),
          `${s.table} selects ${bad}`,
        ).not.toContain(bad);
      }
    }
  });
});

describe("rail ranking pure helpers", () => {
  it("scores intent above cold and keeps ties stable", () => {
    const signals = emptyBehaviorSignals();
    signals.views.set("p-a", 2);
    expect(behaviorScore(signals, "p-a")).toBeGreaterThan(
      behaviorScore(signals, "p-cold"),
    );
    expect(behaviorScore(signals, "p-cold")).toBe(0);

    const rows = [{ id: "x" }, { id: "y" }, { id: "z" }];
    const { rows: out, mode } = rankRailRows(rows, signals, "recommended");
    expect(mode).toBe("collection");
    expect(out.map((r) => r.id)).toEqual(["x", "y", "z"]);
  });

  it("caps output to the input window", async () => {
    const signals = await loadBehaviorSignals("m-laneh-empty", fakeDb());
    const rows = [{ id: "a" }, { id: "b" }];
    const { rows: out } = rankRailRows(rows, signals, "recommended");
    expect(out).toHaveLength(2);
  });
});

describe("merchant currency passthrough", () => {
  it("stamps rail rows with the merchant currency for formatDisplayMoney", async () => {
    const m = "m-laneh-usd";
    seedMerchant(current.pub, m, "USD");
    current.pub.tables["products"] = [product(m, "p-1", "2026-01-01T00:00:00Z")];

    const rows = await recommendedRows(m, "collection");
    expect(rows[0]!.currency).toBe("USD");
    // String presence only — never arithmetic on money figures.
    expect(
      formatDisplayMoney(rows[0]!.priceMinor, {
        currency: rows[0]!.currency,
      }),
    ).toContain("$");
  });

  it("falls back to BDT when the merchant row carries none", async () => {
    const m = "m-laneh-nocur";
    current.pub.tables["merchants"] = [{ id: m }];
    current.pub.tables["products"] = [product(m, "p-1", "2026-01-01T00:00:00Z")];

    const rows = await recommendedRows(m, "collection");
    expect(rows[0]!.currency).toBe("BDT");
    expect(
      formatDisplayMoney(rows[0]!.priceMinor, {
        currency: rows[0]!.currency,
      }),
    ).toContain("৳");
  });
});
