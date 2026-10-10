/**
 * Threat-defense — per-merchant persisted-asset storage quota.
 *
 * Package installs persist versioned assets per merchant; without a cap,
 * repeated max-size uploads exhaust storage. The quota is flat and
 * fail-closed (repo precedent: domain quotas), computed over everything
 * persisted in `theme_assets` for the merchant.
 */
import { describe, expect, it } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  MERCHANT_ASSET_QUOTA_BYTES,
  merchantAssetBytes,
} from "./package-store.server";

const MERCHANT = "99999999-9999-4999-8999-999999999999";
const OTHER = "88888888-8888-4888-8888-888888888888";

describe("package storage quota accounting", () => {
  it("exposes a positive flat quota", () => {
    expect(MERCHANT_ASSET_QUOTA_BYTES).toBeGreaterThan(0);
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
