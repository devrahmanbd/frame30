/**
 * Phase 9.4 — query discipline against a 50 000-row tenant.
 *
 * §7 of the SEO roadmap claims that every admin list, every sitemap shard and
 * every dashboard card stays bounded no matter how big the catalogue gets.
 * That was an assertion in a document, not a test, so this file makes the
 * claim falsifiable: it runs the real production functions against the
 * deterministic large-tenant fixture through an in-memory client that records
 * the *shape* of every query, and fails when the shape degrades.
 *
 * What "discipline" means here, precisely:
 *
 *  1. **Constant query count.** The number of round-trips a surface makes must
 *     not depend on how many rows the tenant has. A per-row lookup (N+1) is the
 *     single most common way a page that is fast on a demo store dies on a real
 *     one, so every surface is run at two very different scales and the counts
 *     are compared.
 *  2. **Every read is bounded.** A `select()` with no `limit`, no `range`, no
 *     `maybeSingle()` and no `head: true` is a table scan. There are no
 *     exceptions granted below; if a new read needs to be unbounded it has to
 *     argue for itself here first.
 *  3. **Bounded payloads.** Beyond the query count, the number of rows actually
 *     transferred is asserted, because "one query" that returns 30 000 rows is
 *     not better than thirty queries that return one.
 *  4. **Protocol limits.** Sitemap shards stay under 5 000 rows read and 50 000
 *     URLs emitted; the bulk table never hands back more than 100 rows a page;
 *     the dashboard never scans more than 2 000 orders.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { fakeDb, type Call, type FakeDb } from "./__fixtures__/fake-db";
import {
  LARGE_TENANT_ID,
  LARGE_TENANT_SLUG,
  LARGE_TENANT_TOTAL_ROWS,
  countRows,
  largeTenantTables,
} from "./__fixtures__/large-tenant";

/* -------------------------------------------------------------------------- */
/* Test doubles                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One mutable handle the mocked `publicClient()` reads from. The storefront
 * paths resolve their own client instead of taking one, so this is the only
 * way to point them at the fixture without changing production signatures.
 */
const current: { db: FakeDb } = { db: fakeDb() };

// Caching would make the second scale run answer from the first one's memo and
// turn every count assertion into a tautology. Passing through keeps the test
// honest about what the code does on a cold cache — the case that hurts.
vi.mock("./cache.server", () => ({
  cached: async <T,>(_key: string, _ttl: number, load: () => Promise<T>) => load(),
  invalidate: () => {},
  cacheStats: () => ({ entries: 0, hits: 0, misses: 0 }),
}));

vi.mock("./pricing.server", () => ({
  publicClient: () => current.db.asClient<SupabaseClient<Database>>(),
}));

type Client = SupabaseClient<Database>;

const {
  listSeoEntities,
  listSeoBulk,
  loadSitemapByKind,
  SITEMAP_KINDS,
  SITEMAP_SHARD_MAX_ROWS,
  SITEMAP_MAX_URLS,
  BULK_PAGE_MAX,
  SEO_INDEX_LIMITS,
} = await import("./seo.server");
const { loadDashboardHome, DASHBOARD_ORDER_SCAN_LIMIT } = await import("./dashboard.server");

/* -------------------------------------------------------------------------- */
/* Shared assertions                                                          */
/* -------------------------------------------------------------------------- */

type Select = Extract<Call, { kind: "select" }>;

/** A read is bounded when the database can stop early. Everything else scans. */
function unbounded(reads: Select[]): Select[] {
  return reads.filter((r) => r.limit === null && r.range === null && !r.single && !r.head);
}

function describeRead(r: Select) {
  return `${r.table}.select(${r.columns.slice(0, 40)}) limit=${r.limit} range=${
    r.range ? `${r.range.from}-${r.range.to}` : "none"
  } returned=${r.returned}`;
}

function expectEveryReadBounded(db: FakeDb) {
  const offenders = unbounded(db.selects());
  expect(offenders.map(describeRead), "unbounded reads are table scans").toEqual([]);
}

/** Largest number of rows any single read handed back. */
function widestRead(db: FakeDb) {
  return db.selects().reduce((max, r) => Math.max(max, r.returned), 0);
}

/**
 * Runs `fn` at two scales and returns both recordings. Everything the
 * discipline assertions need is derived from the pair: identical query counts
 * across a 50x row difference is the only real proof there is no N+1.
 */
async function atBothScales<T>(fn: (db: FakeDb) => Promise<T>) {
  const run = async (scale: number) => {
    const db = fakeDb({ tables: largeTenantTables({ scale }) });
    current.db = db;
    const result = await fn(db);
    return { db, result, rows: countRows(db.tables) };
  };
  const small = await run(0.02);
  const large = await run(1);
  return { small, large };
}

beforeEach(() => {
  current.db = fakeDb();
});

/* -------------------------------------------------------------------------- */

describe("large-tenant fixture", () => {
  it("really is large, and is deterministic", () => {
    const a = largeTenantTables();
    const b = largeTenantTables();
    // The declared shape covers the content tables; the merchant and its
    // settings row ride along on top of it.
    expect(countRows(a)).toBe(LARGE_TENANT_TOTAL_ROWS + 2);
    expect(countRows(a)).toBeGreaterThanOrEqual(50_000);
    // Same seed, same rows: a failure here is reproducible, not a flake.
    expect(b["products"]?.[17]?.["title"]).toBe(a["products"]?.[17]?.["title"]);
    expect(b["seo_meta"]?.[99]?.["meta_description"]).toBe(a["seo_meta"]?.[99]?.["meta_description"]);
  });
});

describe("admin SEO index — listSeoEntities", () => {
  it("issues a constant number of bounded reads at any catalogue size", async () => {
    const { small, large } = await atBothScales((db) =>
      listSeoEntities(db.asClient<Client>(), LARGE_TENANT_ID),
    );

    expect(large.rows).toBeGreaterThan(small.rows * 20);
    expect(large.db.selects().length).toBe(small.db.selects().length);
    expectEveryReadBounded(large.db);
    expectEveryReadBounded(small.db);
  });

  it("never fans out into a per-entity override lookup", async () => {
    const db = fakeDb({ tables: largeTenantTables() });
    current.db = db;
    const entities = await listSeoEntities(db.asClient<Client>(), LARGE_TENANT_ID);

    // One read per kind, one for the override table, plus the merchant rows.
    expect(db.selects("seo_meta")).toHaveLength(1);
    expect(db.selects().length).toBeLessThanOrEqual(8);
    // …and the panel is a page of work, not the whole catalogue.
    expect(entities.length).toBeLessThanOrEqual(
      1 +
        SEO_INDEX_LIMITS.products +
        SEO_INDEX_LIMITS.collections +
        SEO_INDEX_LIMITS.pages +
        SEO_INDEX_LIMITS.articles,
    );
    expect(widestRead(db)).toBeLessThanOrEqual(SEO_INDEX_LIMITS.meta);
  });
});

describe("bulk SEO table — listSeoBulk", () => {
  it("caps the page size at 100 however large a page the caller asks for", async () => {
    const db = fakeDb({ tables: largeTenantTables() });
    current.db = db;
    const page = await listSeoBulk(db.asClient<Client>(), LARGE_TENANT_ID, { pageSize: 5_000 });

    expect(page.pageSize).toBe(BULK_PAGE_MAX);
    expect(page.rows.length).toBeLessThanOrEqual(BULK_PAGE_MAX);
  });

  it("clamps hostile page sizes instead of trusting them", async () => {
    const db = fakeDb({ tables: largeTenantTables({ scale: 0.01 }) });
    current.db = db;
    const client = db.asClient<Client>();
    for (const pageSize of [0, -1, Number.NaN, 1e9]) {
      const page = await listSeoBulk(client, LARGE_TENANT_ID, { pageSize });
      expect(page.pageSize).toBeGreaterThanOrEqual(5);
      expect(page.pageSize).toBeLessThanOrEqual(BULK_PAGE_MAX);
      expect(page.rows.length).toBeLessThanOrEqual(page.pageSize);
    }
  });

  it("costs the same number of queries on page 1 and page 20", async () => {
    const db = fakeDb({ tables: largeTenantTables() });
    current.db = db;
    const client = db.asClient<Client>();

    await listSeoBulk(client, LARGE_TENANT_ID, { page: 1, pageSize: 50 });
    const first = db.selects().length;
    db.resetCalls();
    await listSeoBulk(client, LARGE_TENANT_ID, { page: 20, pageSize: 50 });
    expect(db.selects().length).toBe(first);
    expectEveryReadBounded(db);
  });

  it("keeps query count constant as the tenant grows", async () => {
    const { small, large } = await atBothScales((db) =>
      listSeoBulk(db.asClient<Client>(), LARGE_TENANT_ID, { pageSize: 25 }),
    );
    expect(large.db.selects().length).toBe(small.db.selects().length);
    expect(large.result.rows.length).toBeLessThanOrEqual(25);
  });
});

describe("sitemap shards — loadSitemapByKind", () => {
  it("reads at most 5 000 rows and emits at most 50 000 URLs per shard", async () => {
    for (const kind of SITEMAP_KINDS) {
      const db = fakeDb({ tables: largeTenantTables() });
      current.db = db;
      const urls = await loadSitemapByKind(LARGE_TENANT_SLUG, kind);

      expect(urls, `${kind} shard should exist`).not.toBeNull();
      expect(urls!.length).toBeLessThanOrEqual(SITEMAP_MAX_URLS);
      expect(widestRead(db), `${kind} read too many rows`).toBeLessThanOrEqual(SITEMAP_SHARD_MAX_ROWS);
      expectEveryReadBounded(db);
      // Content reads only: no per-URL override or permalink lookup.
      expect(db.selects().length).toBeLessThanOrEqual(6);
    }
  });

  it("does not issue one query per URL as the catalogue grows", async () => {
    const { small, large } = await atBothScales((db) => {
      void db;
      return loadSitemapByKind(LARGE_TENANT_SLUG, "products");
    });
    expect(large.db.selects().length).toBe(small.db.selects().length);
    expect(large.result!.length).toBeGreaterThan(small.result!.length);
  });

  it("returns an empty shard rather than throwing for an unknown store", async () => {
    const db = fakeDb({ tables: largeTenantTables({ scale: 0.01 }) });
    current.db = db;
    await expect(loadSitemapByKind("no-such-store", "pages")).resolves.toBeNull();
  });
});

describe("dashboard home — loadDashboardHome", () => {
  it("scans a bounded order window, not the tenant's history", async () => {
    const db = fakeDb({ tables: largeTenantTables() });
    current.db = db;
    const home = await loadDashboardHome(db.asClient<Client>(), LARGE_TENANT_ID);

    const orderReads = db.selects("orders").filter((r) => !r.head);
    expect(orderReads).toHaveLength(1);
    expect(orderReads[0]!.limit).toBe(DASHBOARD_ORDER_SCAN_LIMIT);
    expect(orderReads[0]!.returned).toBeLessThanOrEqual(DASHBOARD_ORDER_SCAN_LIMIT);

    // Lifetime volume is a COUNT, so it transfers no rows at all.
    const counts = db.selects("orders").filter((r) => r.head);
    expect(counts).toHaveLength(1);
    expect(counts[0]!.returned).toBe(0);
    expect(home.lifetimeOrders).toBeGreaterThan(0);

    // The cards themselves are capped regardless of how much matched.
    expect(home.needs.length).toBeLessThanOrEqual(12);
    expect(home.feed.length).toBeLessThanOrEqual(12);
    expectEveryReadBounded(db);
  });

  it("keeps the same query count at both scales", async () => {
    const { small, large } = await atBothScales((db) =>
      loadDashboardHome(db.asClient<Client>(), LARGE_TENANT_ID),
    );
    expect(large.db.selects().length).toBe(small.db.selects().length);
    expect(large.db.rowsReturned()).toBeLessThanOrEqual(
      DASHBOARD_ORDER_SCAN_LIMIT + 200,
    );
  });
});
