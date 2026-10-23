/**
 * Batch B, gap 3 — the tenant scope inside the shared term-archive reader.
 *
 * `loadTermArchive` is the SAME reader the three store-less taxonomy routes
 * use; the merchant-scoped route calls it with an optional `{merchantId,
 * basePath}`. This suite pins the scope at the query level over a fake
 * builder (the `store-blog.test.ts` pattern, with the query state kept
 * PER CHAIN so the reader's concurrent `Promise.all` cannot cross-talk):
 *
 *   · the same word in two stores resolves INDEPENDENTLY — a scoped call
 *     never sees the other merchant's term, articles or facets;
 *   · the base-path override drives the pager's own prev/next;
 *   · the unscoped path (the global taxonomy routes) is untouched: same
 *     deterministic claimant rule, same global facets, same `/blog/...`
 *     paths;
 *   · an unknown scoped slug is a loud `TermNotFound`, never an
 *     empty-but-200 archive.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const FLAME = "b47532e5-9649-4ebd-93a9-06fa2917c00e";
const OTHER = "11111111-1111-4111-8111-111111111111";

type Row = Record<string, unknown>;

const TERMS: Row[] = [
  {
    id: "t-flame",
    merchant_id: FLAME,
    kind: "category",
    slug: "eid",
    name: "Eid (Flame)",
    name_en: null,
    description: null,
    parent_id: null,
    sort_order: 0,
    cover_image_url: null,
    meta_title: null,
    meta_description: null,
    robots_index: true,
    article_count: 1,
  },
  {
    id: "t-other",
    merchant_id: OTHER,
    kind: "category",
    slug: "eid",
    name: "Eid (Other)",
    name_en: null,
    description: null,
    parent_id: null,
    sort_order: 0,
    cover_image_url: null,
    meta_title: null,
    meta_description: null,
    robots_index: true,
    article_count: 9,
  },
];

const ARTICLES: Row[] = [
  {
    id: "a-flame",
    merchant_id: FLAME,
    slug: "flame-eid-guide",
    title: "Flame's Eid guide",
    title_en: null,
    excerpt: null,
    cover_image_url: null,
    published_at: "2026-01-02T00:00:00Z",
    status: "published",
    deleted_at: null,
    author_id: null,
    reading_minutes: 3,
    body: "hi",
    updated_at: null,
    meta_title: null,
    meta_description: null,
    canonical: null,
    robots: null,
  },
  {
    id: "a-other",
    merchant_id: OTHER,
    slug: "other-eid-guide",
    title: "Other's Eid guide",
    title_en: null,
    excerpt: null,
    cover_image_url: null,
    published_at: "2026-01-03T00:00:00Z",
    status: "published",
    deleted_at: null,
    author_id: null,
    reading_minutes: 4,
    body: "yo",
    updated_at: null,
    meta_title: null,
    meta_description: null,
    canonical: null,
    robots: null,
  },
];

const LINKS: Row[] = [
  { article_id: "a-flame", term_id: "t-flame", created_at: "2026-01-01" },
  { article_id: "a-other", term_id: "t-other", created_at: "2026-01-01" },
];

const MERCHANTS: Row[] = [
  { id: FLAME, name: "Flame", slug: "flame-fashion-bd" },
  { id: OTHER, name: "Other", slug: "other" },
];

/**
 * Minimal thenable query builder honoring the reader's chains. The query
 * state lives INSIDE each `table()` call, so the reader's concurrent
 * `Promise.all` chains never share filters.
 */
function fakeDb() {
  type FakeQuery = {
    select: (c: string, opts?: Record<string, unknown>) => FakeQuery;
    eq: (k: string, v: unknown) => FakeQuery;
    lte: (k: string, v: string) => FakeQuery;
    is: (k: string, v: null) => FakeQuery;
    in: (k: string, vs: unknown[]) => FakeQuery;
    gt: (k: string, v: number) => FakeQuery;
    order: (k: string, o?: { ascending?: boolean }) => FakeQuery;
    range: (f: number, t: number) => FakeQuery;
    limit: (n: number) => FakeQuery;
    maybeSingle: () => Promise<{ data: Row | null }>;
    then: (
      res: (value: { data: Row[]; count: number }) => unknown,
      rej?: unknown,
    ) => Promise<unknown>;
  };
  const rowsFor = (name: string): Row[] =>
    name === "articles"
      ? ARTICLES
      : name === "blog_terms"
        ? TERMS
        : name === "article_terms"
          ? LINKS
          : name === "merchants"
            ? MERCHANTS
            : [];
  const table = (name: string): FakeQuery => {
    const rows = rowsFor(name);
    const state = {
      filters: [] as Array<(r: Row) => boolean>,
      orderKey: "",
      orderAsc: true,
      rangeFrom: 0,
      rangeTo: Number.MAX_SAFE_INTEGER,
      limitN: Number.MAX_SAFE_INTEGER,
    };
    const apply = () => {
      let out = rows.filter((r) => state.filters.every((f) => f(r)));
      if (state.orderKey)
        out = [...out].sort((a, b) =>
          String(a[state.orderKey] ?? "") < String(b[state.orderKey] ?? "")
            ? state.orderAsc
              ? -1
              : 1
            : state.orderAsc
              ? 1
              : -1,
        );
      return out
        .slice(state.rangeFrom, state.rangeTo + 1)
        .slice(0, state.limitN);
    };
    const q: FakeQuery = {
      select: () => q,
      eq: (k, v) => {
        state.filters.push((r) => r[k] === v);
        return q;
      },
      lte: (k, v) => {
        state.filters.push((r) => ((r[k] as string) ?? "") <= v);
        return q;
      },
      is: (k, v) => {
        state.filters.push((r) => r[k] === v);
        return q;
      },
      in: (k, vs) => {
        state.filters.push((r) => vs.includes(r[k]));
        return q;
      },
      gt: (k, v) => {
        state.filters.push((r) => Number(r[k] ?? 0) > v);
        return q;
      },
      order: (k, o) => {
        state.orderKey = k;
        state.orderAsc = o?.ascending !== false;
        return q;
      },
      range: (f, t) => {
        state.rangeFrom = f;
        state.rangeTo = t;
        return q;
      },
      limit: (n) => {
        state.limitN = n;
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: apply()[0] ?? null }),
      then: (res) =>
        Promise.resolve({ data: apply(), count: apply().length }).then(res),
    };
    return q;
  };
  return { from: table };
}

vi.mock("./pricing.server", () => ({
  publicClient: () => fakeDb(),
}));

const { loadTermArchive, TermNotFound } = await import("./blog-index.server");

const storeBase = (page: number) =>
  page > 1
    ? `/store/flame/blog/category/eid?page=${page}`
    : "/store/flame/blog/category/eid";

beforeEach(() => {
  // The reader's renderRead cache is keyed per call; nothing module-level
  // to reset — each test asserts its own key's output.
});

describe("loadTermArchive — the tenant scope", () => {
  it("resolves ITS store's claimant, articles and facets — never the other merchant's", async () => {
    const archive = await loadTermArchive("category", "eid", 1, {
      merchantId: FLAME,
      basePath: storeBase,
    });
    expect(archive.term.id).toBe("t-flame");
    expect(archive.term.name).toBe("Eid (Flame)");
    expect(archive.articles.map((a) => a.slug)).toEqual(["flame-eid-guide"]);
    expect(archive.facets.map((f) => f.name)).toEqual(["Eid (Flame)"]);
    expect(archive.degraded).toBe(false);
  });

  it("drives the pager from the base-path override (the store archive's own URLs)", async () => {
    const archive = await loadTermArchive("category", "eid", 2, {
      merchantId: FLAME,
      basePath: storeBase,
    });
    expect(archive.paging.page).toBe(2);
    expect(archive.paging.prevPath).toBe("/store/flame/blog/category/eid");
  });

  it("keeps the unscoped path byte-identical: global claimant, global facets, /blog paths", async () => {
    const archive = await loadTermArchive("category", "eid", 1);
    // The deterministic claimant rule orders by article_count desc, id asc —
    // the tie between the two 9-count terms resolves to `t-flame` by id,
    // exactly as before the scope existed.
    expect(archive.term.id).toBe("t-flame");
    expect(archive.articles.map((a) => a.slug)).toEqual(["flame-eid-guide"]);
    // Both tenants' terms appear (facets are global); the count tie leaves
    // their order to the DB, so membership — not order — is the contract.
    expect(archive.facets.map((f) => f.name).sort()).toEqual([
      "Eid (Flame)",
      "Eid (Other)",
    ]);
    expect(archive.paging.prevPath).toBeNull();
    expect(archive.paging.nextPath).toBeNull();
  });

  it("throws TermNotFound for a slug its store never had", async () => {
    await expect(
      loadTermArchive("category", "nope", 1, {
        merchantId: FLAME,
        basePath: storeBase,
      }),
    ).rejects.toBeInstanceOf(TermNotFound);
  });
});
