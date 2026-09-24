/**
 * Songoskriti marketplace listing (Task 4, TDD): the `songoskriti` key is
 * installable end-to-end — a real catalogue card (not the fallback), a demo
 * catalogue that resolves through the same install path the import RPCs use
 * (`demoCatalogFor`, consumed by `theme-imports.server.ts` +
 * `preview-demo-data.ts`), and a static seed migration that parses against
 * the demo-seed conventions (fixed UUIDs, ON CONFLICT, BDT minor units,
 * file refs only — never remote URLs).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_CATALOGS, demoCatalogFor } from "./demo-catalog";
import { CATALOG_META, catalogMeta } from "./themes/catalog-meta";

const SEED_SQL = readFileSync(
  new URL(
    "../../supabase/migrations/20260924_songoskriti_demo.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("songoskriti marketplace listing", () => {
  it("ships a real catalogue card (not the fallback)", () => {
    expect(CATALOG_META.songoskriti).toBeDefined();
    const meta = catalogMeta("songoskriti");
    expect(meta.author.length).toBeGreaterThan(0);
    expect(meta.subjects).toContain("fashion");
    expect(meta.tags).toContain("songoskriti");
    // No-fabrication rule: honest zeros until real telemetry exists.
    expect(meta.installs).toBe(0);
    expect(meta.rating).toBe(0);
  });

  it("install path resolves the songoskriti demo catalogue", () => {
    const catalog = demoCatalogFor("songoskriti");
    expect(catalog).toBe(DEMO_CATALOGS.songoskriti);
    expect(catalog.categories.length).toBeGreaterThanOrEqual(1);
    expect(catalog.collections.length).toBeGreaterThanOrEqual(1);
    expect(catalog.products.length).toBeGreaterThanOrEqual(1);
  });
});

describe("songoskriti seed migration", () => {
  it("seeds the demo merchant catalogue tables idempotently", () => {
    for (const table of [
      "public.merchants",
      "public.categories",
      "public.brands",
      "public.products",
      "public.product_variants",
      "public.collections",
      "public.collection_products",
    ]) {
      expect(SEED_SQL, table).toMatch(`insert into ${table}`);
    }
    // Idempotent fixed-UUID convention: every insert carries an ON CONFLICT guard.
    const inserts = SEED_SQL.match(/^insert into /gim) ?? [];
    const guards = SEED_SQL.match(/^on conflict /gim) ?? [];
    expect(inserts.length).toBeGreaterThan(0);
    expect(guards.length).toBe(inserts.length);
    // Reversible demo: every catalogue row is flagged is_demo for theme_purge_demo.
    expect(SEED_SQL).toMatch(/is_demo/);
    expect(SEED_SQL).not.toMatch(/delete from/i);
  });

  it("references asset files only, never remote URLs", () => {
    expect(SEED_SQL).not.toMatch(/https?:\/\//);
    const refs = [
      ...SEED_SQL.matchAll(/\/ph\/songoskriti\/[\w-]+\.(?:png|svg)/g),
    ].map((m) => m[0]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs)
      expect(ref.startsWith("/ph/songoskriti/")).toBe(true);
  });

  it("stays consistent with the TypeScript demo catalogue", () => {
    const catalog = DEMO_CATALOGS.songoskriti;
    for (const product of catalog.products) {
      expect(SEED_SQL, product.slug).toMatch(product.slug);
    }
    for (const category of catalog.categories) {
      expect(SEED_SQL, category.slug).toMatch(category.slug);
    }
  });
});
