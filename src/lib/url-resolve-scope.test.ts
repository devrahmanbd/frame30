/**
 * Task 5/6 — permalink redirect bleed.
 *
 * Regression contract: two merchants may own the SAME `from_path` with
 * different destinations. Resolution must never serve merchant A's rule to
 * merchant B's traffic, and an unknown tenant must resolve to null
 * (fail closed) rather than scanning every tenant's rows.
 *
 * Miss attribution must resolve the owning merchant from the request host
 * (custom domain) or the `/store/<slug>` prefix — never the first active
 * merchant in the table.
 */
import { describe, expect, it } from "vitest";
import {
  lookupRedirect,
  resolveTenantForUrl,
} from "./url-resolve.server";

type Row = Record<string, unknown>;

/** Minimal thenable query builder over in-memory tables. */
function fakeDb(tables: Record<string, Row[]>) {
  const query = (table: string, filters: ((r: Row) => boolean)[] = []) => {
    const rows = () => tables[table]!.filter((r) => filters.every((f) => f(r)));
    const builder: Record<string, (...a: never[]) => unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => query(table, [...filters, (r) => r[col] === val]),
      limit: () => builder,
      maybeSingle: async () => ({ data: rows()[0] ?? null }),
      // Best-effort hit accounting: `.update({...}).eq("id", …)` thenable.
      update: () => ({ eq: async () => ({}) }),
    };
    return builder;
  };
  return { from: (table: string) => query(table) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbOf = (tables: Record<string, Row[]>) => fakeDb(tables) as any;

const MERCHANT_A = "merchant-a";
const MERCHANT_B = "merchant-b";

function redirectTables(): Record<string, Row[]> {
  return {
    url_redirects: [
      { id: "a1", merchant_id: MERCHANT_A, from_path: "/old-sale", to_path: "/new-a", status_code: 301, hits: 0 },
      { id: "b1", merchant_id: MERCHANT_B, from_path: "/old-sale", to_path: "/new-b", status_code: 301, hits: 0 },
      // Chain fixtures: A owns /a→/b, B owns /b→/c. A's /a must stop at /b.
      { id: "a2", merchant_id: MERCHANT_A, from_path: "/a", to_path: "/b", status_code: 301, hits: 0 },
      { id: "b2", merchant_id: MERCHANT_B, from_path: "/b", to_path: "/c", status_code: 301, hits: 0 },
    ],
    merchants: [
      { id: MERCHANT_A, slug: "shop-a", status: "active" },
      { id: MERCHANT_B, slug: "shop-b", status: "active" },
    ],
  };
}

describe("lookupRedirect tenant isolation", () => {
  it("serves each merchant its own destination for the same from_path", async () => {
    const db = dbOf(redirectTables());
    await expect(lookupRedirect(db, "/old-sale", MERCHANT_A)).resolves.toEqual({
      type: "redirect",
      to: "/new-a",
      status: 301,
    });
    await expect(lookupRedirect(db, "/old-sale", MERCHANT_B)).resolves.toEqual({
      type: "redirect",
      to: "/new-b",
      status: 301,
    });
  });

  it("fails closed without a merchant — no cross-tenant scan", async () => {
    const db = dbOf(redirectTables());
    await expect(lookupRedirect(db, "/old-sale", null)).resolves.toBeNull();
  });

  it("returns null for a merchant with no rule instead of a neighbour's rule", async () => {
    const db = dbOf(redirectTables());
    await expect(
      lookupRedirect(db, "/old-sale", "merchant-stranger"),
    ).resolves.toBeNull();
  });

  it("does not follow chains across tenants", async () => {
    const db = dbOf(redirectTables());
    // A's /a→/b exists; /b→/c belongs to B only, so A's hop stops at /b.
    await expect(lookupRedirect(db, "/a", MERCHANT_A)).resolves.toEqual({
      type: "redirect",
      to: "/b",
      status: 301,
    });
  });

  it("honours a tenant-scoped 410", async () => {
    const tables = redirectTables();
    tables.url_redirects.push({
      id: "b3",
      merchant_id: MERCHANT_B,
      from_path: "/gone",
      to_path: null,
      status_code: 410,
      hits: 0,
    });
    const db = dbOf(tables);
    await expect(lookupRedirect(db, "/gone", MERCHANT_B)).resolves.toEqual({
      type: "gone",
    });
    await expect(lookupRedirect(db, "/gone", MERCHANT_A)).resolves.toBeNull();
  });
});

describe("resolveTenantForUrl miss attribution", () => {
  const merchants = () => [
    { id: MERCHANT_A, slug: "shop-a", status: "active" },
    { id: MERCHANT_B, slug: "shop-b", status: "active" },
  ];

  it("attributes /store/<slug> paths to the slug owner", async () => {
    const db = dbOf({ merchants: merchants() });
    await expect(
      resolveTenantForUrl(db, "/store/shop-b/p/rice", null),
    ).resolves.toBe(MERCHANT_B);
  });

  it("attributes custom-host paths via host resolution, not table order", async () => {
    const db = dbOf({ merchants: merchants() });
    const resolveHost = async () => ({ merchantId: MERCHANT_B });
    await expect(
      resolveTenantForUrl(db, "/journal/2026/08/x", "shop-b.example.com", resolveHost),
    ).resolves.toBe(MERCHANT_B);
  });

  it("returns null when neither slug nor host resolves — never first-active", async () => {
    const db = dbOf({ merchants: merchants() });
    const resolveHost = async () => null;
    await expect(
      resolveTenantForUrl(db, "/journal/2026/08/x", "unknown.example.com", resolveHost),
    ).resolves.toBeNull();
    await expect(
      resolveTenantForUrl(db, "/journal/2026/08/x", null, resolveHost),
    ).resolves.toBeNull();
  });
});
