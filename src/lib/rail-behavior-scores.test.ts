/**
 * `rail_behavior_scores` RPC follow-up — cases only.
 *
 * Covers the switch in `loadBehaviorSignals`: RPC scoring order (one
 * security-definer call, zero inline reads), the RPC-missing fallback to the
 * current inline reads, velocity riding along for the bestseller fallback,
 * cold-RPC collection order, and the missing-function classifier.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { newSection, type Section, type ThemeAst } from "./builder-ast";
import { collectWidgetRequests } from "./widget-data";
import {
  behaviorScore,
  emptyBehaviorSignals,
  isMissingRailScoresError,
  loadBehaviorSignals,
  resolveWidgetData,
} from "./widget-data.server";
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

function rail(id: string, props: Record<string, unknown> = {}): Section {
  const section = newSection("product_rail");
  return {
    ...section,
    id,
    props: { ...section.props, limit: 6, ...props } as Section["props"],
  };
}

function product(merchantId: string, id: string, createdAt: string) {
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
        price_amount_minor_int: 120000,
        compare_at_amount_minor_int: null,
        stock_quantity: 10,
      },
    ],
    collection_products: [],
  };
}

function viewEvent(merchantId: string, productId: string) {
  return {
    merchant_id: merchantId,
    entity: "product",
    action: "view",
    payload: { item_id: productId },
    occurred_at: "2026-07-01T00:00:00Z",
  };
}

/** Admin double whose RPC returns fixed score rows (migration "applied"). */
function rpcAdmin(rows: unknown[]) {
  const db = fakeDb({
    rpc: (fn) =>
      fn === "rail_behavior_scores"
        ? { data: rows, error: null }
        : { data: null, error: { message: `rpc_not_stubbed:${fn}` } },
  });
  return db;
}

/** Admin double whose RPC fails as if the migration were never applied. */
function missingRpcAdmin() {
  return fakeDb({
    rpc: () => ({
      data: null,
      error: {
        code: "PGRST202",
        message:
          "Could not find the function public.rail_behavior_scores in the schema cache",
      },
    }),
  });
}

function seedMerchant(m: string) {
  current.pub.tables["merchants"] = [{ id: m, currency_code: "BDT" }];
  current.pub.tables["products"] = [
    product(m, "p-old", "2026-01-01T00:00:00Z"),
    product(m, "p-new", "2026-06-01T00:00:00Z"),
  ];
}

async function recommendedIds(merchantId: string, source: string) {
  const bundle = collectWidgetRequests(ast([rail("r1", { source })]));
  const map = await resolveWidgetData(merchantId, bundle);
  return (map[bundle.requests[0]!.key] ?? []).map((r) => r.id);
}

beforeEach(() => {
  current.pub = fakeDb();
  current.admin = fakeDb();
});

/* -------------------------------------------------------------------- cases */

describe("rail_behavior_scores RPC path", () => {
  it("ranks by RPC score with zero inline reads", async () => {
    const m = "m-railrpc-score";
    seedMerchant(m);
    current.admin = rpcAdmin([
      { product_id: "p-old", score: 8, velocity: 0 },
      { product_id: "p-new", score: 1, velocity: 0 },
    ]);

    expect(await recommendedIds(m, "recommended")).toEqual(["p-old", "p-new"]);
    expect(
      current.admin.rpcCalls("rail_behavior_scores"),
    ).toHaveLength(1);
    // The aggregate came from the RPC: no analytics/order/variant selects.
    expect(current.admin.selects()).toHaveLength(0);
  });

  it("falls back to inline reads when the RPC is missing", async () => {
    const m = "m-railrpc-fallback";
    seedMerchant(m);
    current.admin = missingRpcAdmin();
    current.admin.tables["analytics_events"] = [
      viewEvent(m, "p-old"),
      viewEvent(m, "p-old"),
    ];

    // Same ranking as the inline path would produce on its own.
    expect(await recommendedIds(m, "recommended")).toEqual(["p-old", "p-new"]);
    expect(
      current.admin.rpcCalls("rail_behavior_scores"),
    ).toHaveLength(1);
    // Fallback issued the current inline reads.
    expect(current.admin.selects().length).toBeGreaterThan(0);
    expect(
      current.admin.selects().map((s) => s.table),
    ).toContain("analytics_events");
  });

  it("keeps the bestseller fallback from RPC velocity when scores are cold", async () => {
    const m = "m-railrpc-velocity";
    seedMerchant(m);
    // Behavior cold (score 0) but orders exist — velocity must ride along.
    current.admin = rpcAdmin([
      { product_id: "p-old", score: 0, velocity: 1 },
      { product_id: "p-new", score: 0, velocity: 9 },
    ]);

    expect(await recommendedIds(m, "recommended")).toEqual(["p-new", "p-old"]);
    expect(await recommendedIds(m, "bestsellers")).toEqual(["p-new", "p-old"]);
    expect(current.admin.selects()).toHaveLength(0);
  });

  it("cold RPC keeps collection order without further reads", async () => {
    const m = "m-railrpc-cold";
    seedMerchant(m);
    current.admin = rpcAdmin([]);

    expect(await recommendedIds(m, "recommended")).toEqual(["p-new", "p-old"]);
    expect(current.admin.selects()).toHaveLength(0);
  });

  it("prefers RPC totals in behaviorScore and keeps inline math otherwise", async () => {
    const viaRpc = emptyBehaviorSignals();
    viaRpc.scores.set("p-a", 11);
    viaRpc.views.set("p-a", 100);
    expect(behaviorScore(viaRpc, "p-a")).toBe(11);
    expect(behaviorScore(viaRpc, "p-cold")).toBe(0);

    const inline = emptyBehaviorSignals();
    inline.views.set("p-a", 2);
    expect(behaviorScore(inline, "p-a")).toBe(2);
  });

  it("loads RPC rows directly with velocity, skipping inline tables", async () => {
    const db = rpcAdmin([
      { product_id: "p-a", score: 8, velocity: 0 },
      { product_id: "p-b", score: 0, velocity: 4 },
      { product_id: "", score: 99, velocity: 99 },
    ]);
    const signals = await loadBehaviorSignals("m-railrpc-direct", db);
    expect(signals.scores.get("p-a")).toBe(8);
    expect(signals.velocity.get("p-b")).toBe(4);
    expect(signals.velocity.has("p-a")).toBe(false);
    expect(signals.scores.has("")).toBe(false);
    expect(db.selects()).toHaveLength(0);
  });
});

describe("isMissingRailScoresError", () => {
  it("matches only missing-function failures", () => {
    expect(
      isMissingRailScoresError({
        code: "PGRST202",
        message:
          "Could not find the function public.rail_behavior_scores in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingRailScoresError({
        code: "42883",
        message:
          "function public.rail_behavior_scores(uuid) does not exist",
      }),
    ).toBe(true);
    expect(
      isMissingRailScoresError(new Error("rail_behavior_scores: not found")),
    ).toBe(true);
  });

  it("rejects real errors and unrelated functions", () => {
    expect(
      isMissingRailScoresError({
        code: "42501",
        message: "permission denied for function rail_behavior_scores",
      }),
    ).toBe(false);
    expect(
      isMissingRailScoresError({
        code: "PGRST202",
        message:
          "Could not find the function public.support_kb_hybrid_search in the schema cache",
      }),
    ).toBe(false);
    expect(isMissingRailScoresError(new Error("connection refused"))).toBe(
      false,
    );
    expect(isMissingRailScoresError(null)).toBe(false);
  });
});
