/**
 * T6 activation-to-visible latency (app-side only, edge untouched).
 *
 * - The `publishedTheme` pointer is a single-row indexed lookup, so it uses a
 *   4s fresh window (not 30s+30s SWR). Activation flips the row; shoppers must
 *   see the new version within seconds at the origin.
 * - `activateTheme` awaits the `purgeStorefront` shared-invalidate promise
 *   instead of fire-and-forget, so the HTTP response does not return while
 *   stale isolates/Redis still serve the old theme.
 *
 * Style follows activation-guard.test.ts (fakeDb + metricRecorder doubles).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, type FakeDb } from "../__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "../__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("../observability.server", () => rec.holder!.observability);
vi.mock("../rate-limit.server", () => allowAllRateLimits());

/**
 * Wrap the real cache: record every `cached` TTL, and make `invalidate`
 * gate-controllable so the "awaited purge" test can distinguish awaited from
 * fire-and-forget. L1 side effects still run via the original.
 */
const shared = vi.hoisted(() => ({
  cachedCalls: [] as Array<{ key: string; ttl: number }>,
  invalidateCalls: [] as string[],
  gate: null as Promise<void> | null,
  gateRelease: null as (() => void) | null,
}));

vi.mock("../cache.server", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../cache.server")>();
  return {
    ...orig,
    cached: async <T>(
      key: string,
      ttl: number,
      loader: () => Promise<T>,
      opts?: Parameters<typeof orig.cached>[3],
    ): Promise<T> => {
      shared.cachedCalls.push({ key, ttl });
      return orig.cached(key, ttl, loader, opts);
    },
    invalidate: (prefix: string): Promise<void> => {
      shared.invalidateCalls.push(prefix);
      // Preserve the synchronous L1 clear side effect.
      void orig.invalidate(prefix);
      if (shared.gate) return shared.gate;
      return Promise.resolve();
    },
  };
});

const { activateTheme } = await import("./appearance.server");
const { publishedTheme, purgeStorefront } = await import("../themes.server");
const { invalidate } = await import("../cache.server");
const { tenantCachePrefix } = await import("../storefront-cache");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const THEME = "44444444-4444-4444-4444-444444444444";
const OTHER = "77777777-7777-7777-7777-777777777777";

const NOW = 1_700_000_000_000;
let now = NOW;
let dateSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  recorder.reset();
  shared.cachedCalls.length = 0;
  shared.invalidateCalls.length = 0;
  shared.gate = null;
  shared.gateRelease = null;
  now = NOW;
  dateSpy?.mockRestore();
  dateSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
  // Fresh L1 per test (the mock delegates the clear to the original).
  // Use a unique merchant per test file run via the shared prefix clear.
  return invalidate(tenantCachePrefix(MERCHANT)).catch(() => undefined);
});

afterEach(() => {
  dateSpy?.mockRestore();
  dateSpy = null;
});

function pointerDb(): FakeDb {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Live",
          is_active: true,
          published_version_id: "v1",
          source_listing_slug: null,
        },
        { id: OTHER, merchant_id: MERCHANT, name: "Spare", is_active: false },
      ],
      theme_versions: [
        {
          id: "v1",
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 1,
          status: "published",
          templates: { index: { header: [], main: [], footer: [] } },
          tokens: {},
        },
        {
          id: "v2",
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 2,
          status: "published",
          templates: { index: { header: [], main: [], footer: [] } },
          tokens: {},
        },
      ],
      theme_drafts: [],
      theme_audit: [],
    },
  });
}

function guardDb(): FakeDb {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Target",
          is_active: false,
          published_version_id: "v1",
          source_listing_slug: null,
        },
        { id: OTHER, merchant_id: MERCHANT, name: "Live", is_active: true },
      ],
      theme_versions: [
        {
          id: "v1",
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 1,
          status: "published",
          templates: { index: { header: [], main: [], footer: [] } },
          tokens: {},
        },
      ],
      theme_drafts: [],
      theme_audit: [],
    },
  });
}

describe("T6 pointer freshness", () => {
  it("uses a 4s pointer TTL while version bodies stay at 300s", async () => {
    const db = pointerDb();
    const first = await publishedTheme(db.asClient(), MERCHANT);
    expect(first?.versionId).toBe("v1");

    const pointerCalls = shared.cachedCalls.filter((c) =>
      c.key.includes("pointer"),
    );
    expect(pointerCalls.length).toBeGreaterThanOrEqual(1);
    for (const c of pointerCalls) expect(c.ttl).toBe(4);

    const versionCalls = shared.cachedCalls.filter(
      (c) => !c.key.includes("pointer"),
    );
    expect(versionCalls.length).toBeGreaterThanOrEqual(1);
    for (const c of versionCalls) expect(c.ttl).toBe(300);
  });

  it("refreshes the pointer within the new window (9s > 4s+4s SWR, < old 60s)", async () => {
    const db = pointerDb();
    const first = await publishedTheme(db.asClient(), MERCHANT);
    expect(first?.versionId).toBe("v1");

    // Another writer (activation) flips the pointer row. Replace the row object
    // rather than mutating it in place: the L1 entry holds a reference to the
    // loaded row, so in-place mutation would also rewrite the cached value and
    // make this test tautological.
    const themeRows = db.rows("store_themes");
    const idx = themeRows.findIndex((r) => r.id === THEME);
    themeRows[idx] = {
      ...themeRows[idx],
      published_version_id: "v2",
    };

    // Fresh window: still serves v1 without re-reading the pointer row.
    const pointerSelectsBefore = db.selects("store_themes").length;
    const immediate = await publishedTheme(db.asClient(), MERCHANT);
    expect(immediate?.versionId).toBe("v1");
    expect(db.selects("store_themes").length).toBe(pointerSelectsBefore);

    // Past fresh (4s) + SWR (4s): must re-read and see v2. Under the old
    // 30s+30s window this same 9s advance would still serve stale v1.
    now += 9_000;
    const after = await publishedTheme(db.asClient(), MERCHANT);
    expect(after?.versionId).toBe("v2");
    expect(db.selects("store_themes").length).toBeGreaterThan(
      pointerSelectsBefore,
    );
  });
});

describe("T6 purge is awaited, not fire-and-forget", () => {
  it("invalidate and purgeStorefront return the shared-invalidate promise (no void)", async () => {
    const inv = invalidate(tenantCachePrefix(MERCHANT));
    expect(inv).toBeInstanceOf(Promise);
    await expect(inv).resolves.toBeUndefined();

    const purged = purgeStorefront("test", MERCHANT);
    expect(purged).toBeInstanceOf(Promise);
    await expect(purged).resolves.toBeUndefined();
    expect(shared.invalidateCalls).toContain(tenantCachePrefix(MERCHANT));
  });

  it("activateTheme does not resolve until the purge promise settles", async () => {
    const db = guardDb();
    let release!: () => void;
    shared.gate = new Promise<void>((r) => {
      release = r;
    });
    shared.gateRelease = release;

    let settled = false;
    const pending = activateTheme(db.asClient(), MERCHANT, THEME).then(
      (out) => {
        settled = true;
        return out;
      },
    );

    // Give every non-gated hop (DB writes, audit, fork-skip) time to finish.
    // A fire-and-forget purge would let `pending` settle during this window.
    await new Promise((r) => setTimeout(r, 20));
    expect(settled).toBe(false);
    expect(shared.invalidateCalls).toContain(tenantCachePrefix(MERCHANT));

    release();
    const out: any = await pending;
    expect(settled).toBe(true);
    expect(out.id).toBe(THEME);
    expect(db.rows("store_themes").find((r) => r.id === THEME)!.is_active).toBe(
      true,
    );
  });
});
