/**
 * Seed presence.
 *
 * The unit suite mocks Supabase, so it stays green against a completely empty
 * database — which is exactly how the demo tenant silently disappeared once
 * already. This suite asks the live Data API for real rows on the tables the
 * storefront, console and SEO work are verified against. If the demo store,
 * its catalogue, its published theme or its content are gone, the build fails
 * instead of passing 2000+ mocked tests over an empty schema.
 *
 * Re-seed with:
 *   psql "$SUPABASE_DB_URL" -f migration/0002_seed.sql   (base tenant)
 *   psql "$SUPABASE_DB_URL" -f migration/0003_demo_catalogue.sql
 */
import { describe, expect, it } from "vitest";

const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const key =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";

const d = url && key ? describe : describe.skip;

const service = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

const DEMO_SLUG = "frame19-demo";

/** Minimum row count per table for the demo tenant to be considered seeded. */
const MINIMUM: Array<[table: string, rows: number]> = [
  ["merchants", 1],
  ["merchant_settings?select=merchant_id", 1],
  ["categories", 4],
  ["products", 12],
  ["product_variants", 12],
  ["collections", 2],
  ["storefront_pages", 1],
  ["articles", 1],
];

/** Tables with no public read policy: only checked when a privileged key exists. */
const PRIVATE_MINIMUM: Array<[table: string, rows: number]> = [["theme_registry", 5]];

/** Exact row count via the PostgREST `count=exact` header (no rows fetched). */
async function count(table: string, apikey = key): Promise<number> {
  const sep = table.includes("?") ? "&" : "?select=*&";
  const res = await fetch(`${url}/rest/v1/${table}${sep}limit=1`, {
    headers: { apikey, Authorization: `Bearer ${apikey}`, Prefer: "count=exact" },
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  const range = res.headers.get("content-range") ?? "";
  return Number(range.split("/")[1] ?? 0);
}

async function rows<T>(path: string, apikey = key): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey, Authorization: `Bearer ${apikey}` },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

d("demo data is present", () => {
  it.each(MINIMUM)("%s has at least %i row(s)", async (table, minimum) => {
    expect(await count(table)).toBeGreaterThanOrEqual(minimum);
  });

  it("the demo store is active on its slug", async () => {
    const found = await rows<{ id: string; status: string }>(
      `merchants?slug=eq.${DEMO_SLUG}&select=id,status`,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.status).toBe("active");
  });

  it("the demo catalogue is buyable: active products with priced, in-stock variants", async () => {
    const variants = await rows<{ price_amount_minor_int: number; stock_quantity: number }>(
      "product_variants?select=price_amount_minor_int,stock_quantity&limit=200",
    );
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every((v) => v.price_amount_minor_int > 0)).toBe(true);
    expect(variants.some((v) => v.stock_quantity > 0)).toBe(true);
  });

  (service ? it : it.skip).each(PRIVATE_MINIMUM)(
    "%s has at least %i row(s)",
    async (table, minimum) => {
      expect(await count(table, service)).toBeGreaterThanOrEqual(minimum);
    },
  );

  (service ? it : it.skip)("a theme is published, so the storefront renders a real layout", async () => {
    const themes = await rows<{ is_active: boolean; published_version_id: string | null }>(
      "store_themes?select=is_active,published_version_id",
      service,
    );
    const live = themes.filter((t) => t.is_active);
    expect(live.length).toBe(1);
    expect(live[0]!.published_version_id).toBeTruthy();
  });
});
