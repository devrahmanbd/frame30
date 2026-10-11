/**
 * Threat-defense — per-merchant persisted-asset storage quota.
 *
 * Package installs persist versioned assets per merchant; without a cap,
 * repeated max-size uploads exhaust storage. The quota is plan-tiered and
 * fail-closed (missing/unknown subscriptions read as launch), computed over
 * everything persisted in `theme_assets` for the merchant.
 */
import { describe, expect, it } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  ASSET_QUOTA_BY_PLAN,
  assetQuotaForPlan,
  MERCHANT_ASSET_QUOTA_BYTES,
  merchantAssetBytes,
  merchantPlanKey,
  quotaForMerchant,
} from "./package-store.server";

const MERCHANT = "99999999-9999-4999-8999-999999999999";
const OTHER = "88888888-8888-4888-8888-888888888888";

describe("package storage quota accounting", () => {
  it("exposes a positive launch-tier quota", () => {
    expect(MERCHANT_ASSET_QUOTA_BYTES).toBeGreaterThan(0);
    expect(ASSET_QUOTA_BY_PLAN.launch).toBe(MERCHANT_ASSET_QUOTA_BYTES);
  });

  it("sums persisted bytes per merchant, isolating tenants", async () => {
    const db = fakeDb({
      tables: {
        theme_assets: [
          { merchant_id: MERCHANT, name: "themes/a/x.png", bytes: 100 },
          { merchant_id: MERCHANT, name: "themes/a/y.png", bytes: 50 },
          { merchant_id: OTHER, name: "themes/b/x.png", bytes: 1 << 30 },
        ],
      },
    });
    expect(await merchantAssetBytes(db.asClient(), MERCHANT)).toBe(150);
    expect(await merchantAssetBytes(db.asClient(), OTHER)).toBe(1 << 30);
  });

  it("empty merchants use zero bytes", async () => {
    const db = fakeDb({ tables: { theme_assets: [] } });
    expect(await merchantAssetBytes(db.asClient(), MERCHANT)).toBe(0);
  });
});

describe("plan-tiered asset quotas", () => {
  const GIB = 1 << 30;

  it("tiers quotas by plan with launch pinned to the exported const", () => {
    expect(ASSET_QUOTA_BY_PLAN).toEqual({
      launch: 1 * GIB,
      growth: 5 * GIB,
      business: 20 * GIB,
      enterprise: 100 * GIB,
    });
  });

  it("assetQuotaForPlan fails closed to launch on unknown/blank input", () => {
    expect(assetQuotaForPlan("growth")).toBe(5 * GIB);
    expect(assetQuotaForPlan("business")).toBe(20 * GIB);
    expect(assetQuotaForPlan("enterprise")).toBe(100 * GIB);
    expect(assetQuotaForPlan("launch")).toBe(MERCHANT_ASSET_QUOTA_BYTES);
    for (const bad of ["", "   ", "unknown", "LAUNCH", "free", "null"]) {
      expect(assetQuotaForPlan(bad)).toBe(MERCHANT_ASSET_QUOTA_BYTES);
    }
  });

  function subDb(plan: unknown) {
    return fakeDb({
      tables: {
        subscriptions:
          plan === undefined ? [] : [{ merchant_id: MERCHANT, plan }],
      },
    });
  }

  it("merchantPlanKey reads the subscriptions plan, failing closed to launch", async () => {
    expect(await merchantPlanKey(subDb("growth").asClient(), MERCHANT)).toBe(
      "growth",
    );
    expect(
      await merchantPlanKey(subDb("enterprise").asClient(), MERCHANT),
    ).toBe("enterprise");
    expect(await merchantPlanKey(subDb(undefined).asClient(), MERCHANT)).toBe(
      "launch",
    );
    expect(await merchantPlanKey(subDb("nope").asClient(), MERCHANT)).toBe(
      "launch",
    );
    expect(await merchantPlanKey(subDb("").asClient(), MERCHANT)).toBe(
      "launch",
    );
    expect(await merchantPlanKey(subDb(null).asClient(), MERCHANT)).toBe(
      "launch",
    );
  });

  it("quotaForMerchant tier matrix (missing subscription fails closed)", async () => {
    const cases: [unknown, number][] = [
      ["launch", 1 * GIB],
      ["growth", 5 * GIB],
      ["business", 20 * GIB],
      ["enterprise", 100 * GIB],
      [undefined, 1 * GIB],
      ["unknown", 1 * GIB],
    ];
    for (const [plan, want] of cases) {
      const db = subDb(plan);
      expect(await quotaForMerchant(db.asClient(), MERCHANT)).toBe(want);
    }
  });
});
