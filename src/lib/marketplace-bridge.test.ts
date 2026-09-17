/**
 * Bridge: official theme presets appear in the marketplace catalog even when
 * the marketplace_themes table is empty, and install under `preset:<key>`
 * ids without touching the ledger flow.
 */
import { describe, expect, it, vi } from "vitest";
import { BUILTIN_PREFIX, listCatalog } from "./marketplace.server";
import { THEME_PRESETS } from "./theme-presets";

function chain(rows: unknown[]) {
  return {
    select: () => ({
      order: () => Promise.resolve({ data: rows, error: null }),
      eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }),
  };
}

describe("marketplace preset bridge", () => {
  it("prepends one synthetic entry per official preset", async () => {
    const db = { from: vi.fn(() => chain([])) } as never;
    const catalog = await listCatalog(db, "00000000-0000-4000-a000-000000000001");
    expect(catalog.themes.length).toBe(THEME_PRESETS.length);
    expect(THEME_PRESETS.length).toBeGreaterThan(0);
    for (const [i, entry] of catalog.themes.entries()) {
      expect(entry.builtin).toBe(true);
      expect(entry.id).toBe(`${BUILTIN_PREFIX}${THEME_PRESETS[i]!.key}`);
      expect(entry.kind).toBe("theme");
      expect(entry.status).toBe("active");
      expect(entry.price_minor_int).toBe(0);
      expect(entry.compatible).toBe(true);
      expect(entry.mine).toBe(false);
    }
  });

  it("keeps third-party rows after the presets", async () => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      seller_merchant_id: "00000000-0000-4000-a000-000000000002",
      name: "Seller theme",
      slug: "seller-theme",
      description: "",
      vendor_name: "Seller",
      thumbnail_url: null,
      category: "general",
      version: "1.0.0",
      compatible_versions: [],
      price_minor_int: 50000,
      currency_code: "BDT",
      trial_allowed: false,
      status: "active",
      manifest: null,
      version_history: [],
      install_count: 3,
      rating_sum: 0,
      rating_count: 0,
      created_at: new Date().toISOString(),
    };
    let n = 0;
    const db = {
      from: vi.fn(() => {
        n += 1;
        return n <= 2 ? chain(n === 1 ? [row] : []) : chain([]);
      }),
    } as never;
    const catalog = await listCatalog(db, "00000000-0000-4000-a000-000000000001");
    expect(catalog.themes.length).toBe(THEME_PRESETS.length + 1);
    const last = catalog.themes[catalog.themes.length - 1]!;
    expect(last.builtin).toBe(false);
    expect(last.id).toBe(row.id);
  });
});
