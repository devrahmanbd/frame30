/**
 * Tenant blog readers (T5) — hermetic tests with a fake query builder:
 * scoping filters are applied, keys are tenant-prefixed, unknown
 * tenants/slugs resolve empty. Never cross-tenant.
 */
import { describe, expect, it } from "vitest";
import { loadStoreArticle, loadStoreBlogIndex } from "./store-blog.server";

const FLAME = "b47532e5-9649-4ebd-93a9-06fa2917c00e";
const OTHER = "11111111-1111-4111-8111-111111111111";
const NOBODY = "00000000-0000-0000-0000-000000000000";

type Row = Record<string, any>;

const ARTICLES: Row[] = [
  {
    id: "a1",
    slug: "hello",
    title: "Hello",
    title_en: null,
    excerpt: null,
    cover_image_url: null,
    published_at: "2026-01-01T00:00:00Z",
    merchant_id: FLAME,
    author_id: null,
    reading_minutes: 2,
    status: "published",
    deleted_at: null,
    body: "hi",
    updated_at: null,
    meta_title: null,
    meta_description: null,
    canonical: null,
    robots: null,
  },
  {
    id: "a2",
    slug: "hello",
    title: "Other Hello",
    title_en: null,
    excerpt: null,
    cover_image_url: null,
    published_at: "2026-01-02T00:00:00Z",
    merchant_id: OTHER,
    author_id: null,
    reading_minutes: 3,
    status: "published",
    deleted_at: null,
    body: "yo",
    updated_at: null,
    meta_title: null,
    meta_description: null,
    canonical: null,
    robots: null,
  },
];

/** Minimal thenable query builder honoring eq/lte/is/in/order/range/limit. */
function fakeDb() {
  const state = { table: "", filters: [] as Array<(r: Row) => boolean>, orderKey: "", orderAsc: true, rangeFrom: 0, rangeTo: 49, limitN: 1000, cols: "", countMode: false };
  const api: any = {};
  const apply = (rows: Row[]) => {
    let out = rows.filter((r) => state.filters.every((f) => f(r)));
    if (state.orderKey)
      out = [...out].sort((a, b) =>
        state.orderAsc
          ? String(a[state.orderKey] ?? "") < String(b[state.orderKey] ?? "") ? -1 : 1
          : String(a[state.orderKey] ?? "") > String(b[state.orderKey] ?? "") ? -1 : 1,
      );
    out = out.slice(state.rangeFrom, state.rangeTo + 1).slice(0, state.limitN);
    return out;
  };
  const table = (name: string) => {
    const rows =
      name === "articles"
        ? ARTICLES
        : name === "merchants"
          ? [
              { id: FLAME, name: "Flame", slug: "flame-fashion-bd" },
              { id: OTHER, name: "Other", slug: "other" },
            ]
          : [];
    const q: any = {
      select: (_c: string, _opts?: any) => q,
      eq: (k: string, v: unknown) => {
        state.filters.push((r) => r[k] === v);
        return q;
      },
      lte: (k: string, v: string) => {
        state.filters.push((r) => (r[k] ?? "") <= v);
        return q;
      },
      is: (k: string, v: null) => {
        state.filters.push((r) => r[k] === v);
        return q;
      },
      in: (k: string, vs: unknown[]) => {
        state.filters.push((r) => vs.includes(r[k]));
        return q;
      },
      gt: (k: string, v: number) => {
        state.filters.push((r) => Number(r[k] ?? 0) > v);
        return q;
      },
      order: (k: string, o?: any) => {
        state.orderKey = k;
        state.orderAsc = o?.ascending !== false;
        return q;
      },
      range: (f: number, t: number) => {
        state.rangeFrom = f;
        state.rangeTo = t;
        return thenable();
      },
      limit: (n: number) => {
        state.limitN = n;
        return thenable();
      },
      maybeSingle: () => Promise.resolve({ data: apply(rows)[0] ?? null }),
      then: (res: any, _rej: any) =>
        Promise.resolve({ data: apply(rows), count: apply(rows).length }).then(
          res,
        ),
    };
    const thenable = () => q;
    // fresh state per table() call
    state.filters = [];
    state.orderKey = "";
    state.orderAsc = true;
    state.rangeFrom = 0;
    state.rangeTo = 49;
    state.limitN = 1000;
    return q;
  };
  api.from = table;
  return api;
}

describe("loadStoreBlogIndex", () => {
  it("returns only the merchant's published articles", async () => {
    const listing = await loadStoreBlogIndex(FLAME, 1, fakeDb() as never);
    expect(listing.degraded).toBe(false);
    expect(listing.articles.map((a) => a.title)).toEqual(["Hello"]);
    for (const a of listing.articles) {
      expect(a.merchantSlug).toBe("flame-fashion-bd");
    }
  });

  it("resolves empty for an unknown merchant", async () => {
    const listing = await loadStoreBlogIndex(NOBODY, 1, fakeDb() as never);
    expect(listing.articles).toEqual([]);
  });
});

describe("loadStoreArticle", () => {
  it("loads a merchant article by slug without cross-tenant bleed", async () => {
    const mine = await loadStoreArticle(FLAME, "hello", fakeDb() as never);
    expect(mine?.title).toBe("Hello");
    const theirs = await loadStoreArticle(OTHER, "hello", fakeDb() as never);
    expect(theirs?.title).toBe("Other Hello");
  });

  it("returns null for unknown slugs and merchants", async () => {
    expect(await loadStoreArticle(FLAME, "nope", fakeDb() as never)).toBeNull();
    expect(await loadStoreArticle(NOBODY, "hello", fakeDb() as never)).toBeNull();
  });
});
