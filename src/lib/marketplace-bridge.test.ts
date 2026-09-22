/**
 * Bridge: official theme presets appear in the marketplace catalog even when
 * the marketplace_themes table is empty, and install under `preset:<key>`
 * ids without touching the ledger flow.
 */
import { describe, expect, it, vi } from "vitest";
import { BUILTIN_PREFIX, listCatalog } from "./marketplace.server";

function chain(rows: unknown[]) {
  return {
    select: () => ({
      order: () => Promise.resolve({ data: rows, error: null }),
      eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }),
  };
}

describe("marketplace preset bridge", () => {
  it("lists only the curated offer keys (operator two-theme decision)", async () => {
    const db = { from: vi.fn(() => chain([])) } as never;
    const catalog = await listCatalog(
      db,
      "00000000-0000-4000-a000-000000000001",
    );
    const slugs = catalog.themes.map((t) => t.slug).sort();
    expect(slugs).toEqual(["clothing-heritage", "supershop"]);
    for (const entry of catalog.themes) {
      expect(entry.builtin).toBe(true);
      expect(entry.kind).toBe("theme");
      expect(entry.status).toBe("active");
      expect(entry.price_minor_int).toBe(0);
      expect(entry.compatible).toBe(true);
      expect(entry.mine).toBe(false);
    }
  });

  it("hides third-party rows outside the curated offer", async () => {
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
    const catalog = await listCatalog(
      db,
      "00000000-0000-4000-a000-000000000001",
    );
    expect(catalog.themes.map((t) => t.slug)).not.toContain("seller-theme");
  });

  it("prepends synthetic entries for official widgets", async () => {
    const { BUILTIN_PLUGINS } = await import("./builtin-plugins");
    const db = { from: vi.fn(() => chain([])) } as never;
    const catalog = await listCatalog(
      db,
      "00000000-0000-4000-a000-000000000001",
    );
    expect(catalog.widgets.length).toBe(BUILTIN_PLUGINS.length);
    expect(BUILTIN_PLUGINS.length).toBeGreaterThan(0);
    for (const [i, entry] of catalog.widgets.entries()) {
      expect(entry.builtin).toBe(true);
      expect(entry.id).toBe(
        `${BUILTIN_PREFIX}${BUILTIN_PLUGINS[i]!.manifest.id}`,
      );
      expect(entry.kind).toBe("widget");
      expect(entry.status).toBe("active");
      expect(entry.price_minor_int).toBe(0);
      expect(entry.compatible).toBe(true);
      expect(entry.mine).toBe(false);
      // No fabricated social proof: fresh plugins show zero installs.
      expect(entry.install_count).toBe(0);
      expect(entry.rating).toBeNull();
    }
  });

  it("ensures all builtin plugin manifests pass parseManifest validation", async () => {
    const { BUILTIN_PLUGINS } = await import("./builtin-plugins");
    const { parseManifest } = await import("./plugin-manifest");
    for (const p of BUILTIN_PLUGINS) {
      const verdict = parseManifest(p.manifest);
      expect(verdict.ok).toBe(true);
      if (!verdict.ok) {
        throw new Error(
          `Manifest for ${p.manifest.id} failed: ${verdict.errors.join(", ")}`,
        );
      }
    }
  });
});

describe("curated offer seller visibility", () => {
  it("keeps the seller's own listing even outside allowlisted slugs", async () => {
    const { listCatalog } = await import("./marketplace.server");
    const row = {
      id: "22222222-2222-4222-8222-222222222222",
      seller_merchant_id: "00000000-0000-4000-a000-000000000001",
      name: "My theme",
      slug: "my-theme",
      description: "",
      vendor_name: "Me",
      thumbnail_url: null,
      category: "general",
      version: "1.0.0",
      compatible_versions: [],
      price_minor_int: 0,
      currency_code: "BDT",
      trial_allowed: false,
      status: "active",
      manifest: null,
      version_history: [],
      install_count: 0,
      rating_sum: 0,
      rating_count: 0,
      created_at: new Date().toISOString(),
    };
    let n = 0;
    const empty = {
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
        eq: () => ({
          data: [],
          error: null,
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    };
    const db = {
      from: vi.fn(() => {
        n += 1;
        return n === 1
          ? {
              select: () => ({
                order: () => Promise.resolve({ data: [row], error: null }),
              }),
            }
          : empty;
      }),
    } as never;
    const catalog = await listCatalog(
      db,
      "00000000-0000-4000-a000-000000000001",
    );
    const kept = catalog.themes.find((t) => t.slug === "my-theme");
    expect(kept).toBeDefined();
    expect(kept!.mine).toBe(true);
  });
});
