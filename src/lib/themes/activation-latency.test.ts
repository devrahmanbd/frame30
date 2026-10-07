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
const {
  autosave,
  loadWorkspace,
  publishedTheme,
  purgeStorefront,
  resolveLiveVariation,
  setVariation,
} = await import("../themes.server");
const { persistedVariationKeyFromSettings } = await import(
  "../theme-variations"
);
const { registerStaticPreviewSource } = await import("../preview-sources");
const { songoskritiPreviewSource } = await import(
  "./songoskriti/preview"
);
const { somvabonaPreviewSource } = await import("./somvabona/preview");

// O2: static theme sources are build-time-only — this test file is a
// build-time context, so it wires the factories explicitly (live-variation
// resolution reads the registered table).
registerStaticPreviewSource("songoskriti", songoskritiPreviewSource);
registerStaticPreviewSource("somvabona", somvabonaPreviewSource);
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

/* ---------------- variation follow-through (Track T): server persistence +
 * live storefront. The key rides the settings document; the live path renders
 * the active variation, never the base, with unknown/unset falling back. */

function variationDb(
  slug: string | null,
  tokens: Record<string, unknown>,
  main: Array<Record<string, unknown>> = [],
): FakeDb {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Live",
          is_active: true,
          published_version_id: "v1",
          source_listing_slug: slug,
        },
      ],
      theme_versions: [
        {
          id: "v1",
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 1,
          status: "published",
          templates: {
            index: { header: [], main, footer: [] },
          },
          tokens,
        },
      ],
      theme_drafts: [],
      theme_audit: [],
    },
  });
}

describe("live theme variation follow-through", () => {
  it("applies the persisted variation tokens over the merchant base", async () => {
    const db = variationDb("songoskriti", {
      brand: "#123456",
      surface: "#123456",
      variation: "minimal",
    });
    const live = await publishedTheme(db.asClient(), MERCHANT);
    // Minimal overrides the surface; the merchant's own brand survives.
    expect(live?.tokens.surface).toBe("#FFFFFF");
    expect(live?.tokens.brand).toBe("#123456");
    expect(live?.variationKey).toBe("minimal");
  });

  it("falls back to base tokens when no variation is persisted", async () => {
    const db = variationDb("songoskriti", {
      brand: "#123456",
      surface: "#123456",
    });
    const live = await publishedTheme(db.asClient(), MERCHANT);
    expect(live?.tokens.surface).toBe("#123456");
    expect(live?.variationKey).toBeNull();
  });

  it("falls back to base tokens for an unknown persisted key", async () => {
    const db = variationDb("songoskriti", {
      brand: "#123456",
      surface: "#123456",
      variation: "nope",
    });
    const live = await publishedTheme(db.asClient(), MERCHANT);
    expect(live?.tokens.surface).toBe("#123456");
    expect(live?.variationKey).toBeNull();
  });

  it("fills unset skins with the variation default, authored choices win", async () => {
    const db = variationDb(
      "songoskriti",
      { brand: "#123456", variation: "minimal" },
      [
        { id: "r1", type: "product_rail", props: { heading: "Sale" } },
        {
          id: "r2",
          type: "product_rail",
          props: { heading: "Sale", skin: "compact" },
        },
      ],
    );
    const live = await publishedTheme(db.asClient(), MERCHANT);
    const main = live?.templates.index?.main ?? [];
    // Unset skin takes the variation; the explicit compact stays merchant-set.
    expect(main.find((s) => s.id === "r1")?.props["skin"]).toBe("minimal");
    expect(main.find((s) => s.id === "r2")?.props["skin"]).toBe("compact");
  });

  it("leaves sections alone for themes that ship no variations", async () => {
    const db = variationDb(
      "custom-upload",
      { brand: "#123456", variation: "minimal" },
      [{ id: "r1", type: "product_rail", props: { heading: "Sale" } }],
    );
    const live = await publishedTheme(db.asClient(), MERCHANT);
    const main = live?.templates.index?.main ?? [];
    // No variation applies: the skin stays the catalog parse default, and the
    // persisted key is dropped (unknown themes never resolve a variation).
    expect(main.find((s) => s.id === "r1")?.props["skin"]).toBe("editorial");
    expect(live?.variationKey).toBeNull();
  });

  it("resolveLiveVariation prefers request over persisted over base", () => {
    expect(
      resolveLiveVariation({ variation: "minimal" }, "songoskriti")
        .variationKey,
    ).toBe("minimal");
    expect(
      resolveLiveVariation(
        { variation: "minimal" },
        "songoskriti",
        "festive",
      ).variationKey,
    ).toBe("festive");
    expect(resolveLiveVariation({}, "songoskriti").variationKey).toBeNull();
    expect(
      resolveLiveVariation({ variation: "minimal" }, "unknown-theme")
        .variationKey,
    ).toBeNull();
  });
});

describe("variation persistence through the builder write path", () => {
  it("autosave preserves the variation key into the stored tokens", async () => {
    const seen: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const db = fakeDb({
      tables: {},
      rpc: (fn, args) => {
        seen.push({ fn, args });
        if (fn === "theme_autosave")
          return { data: { revision: 2, applied: true }, error: null };
        return { data: null, error: { message: `rpc_not_stubbed:${fn}` } };
      },
    });
    await autosave(db.asClient(), MERCHANT, {
      themeId: THEME,
      templates: {},
      tokens: { brand: "#123456", variation: "minimal" },
      revision: 1,
    });
    const call = seen.find((c) => c.fn === "theme_autosave");
    expect(call).toBeDefined();
    expect(
      (call!.args._tokens as Record<string, unknown>).variation,
    ).toBe("minimal");
    expect((call!.args._tokens as Record<string, unknown>).brand).toBe(
      "#123456",
    );
  });

  function draftDb(tokens: Record<string, unknown>): FakeDb {
    return fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME,
            merchant_id: MERCHANT,
            name: "Live",
            is_active: true,
            published_version_id: null,
            source_listing_slug: "songoskriti",
          },
        ],
        theme_drafts: [
          {
            merchant_id: MERCHANT,
            theme_id: THEME,
            revision: 1,
            templates: {},
            tokens,
            updated_at: new Date().toISOString(),
          },
        ],
        theme_versions: [],
        theme_schedules: [],
        theme_audit: [],
      },
    });
  }

  it("setVariation persists the pick and the workspace round-trips it", async () => {
    const db = draftDb({ brand: "#123456" });
    const saved = await setVariation(db.asClient(), MERCHANT, {
      themeId: THEME,
      variation: "minimal",
    });
    expect(saved).toEqual({ id: THEME, variation: "minimal" });
    const stored = db.rows("theme_drafts").find((r) => r.theme_id === THEME);
    expect(stored!.tokens).toMatchObject({
      brand: "#123456",
      variation: "minimal",
    });
    const workspace = await loadWorkspace(db.asClient(), MERCHANT);
    expect(persistedVariationKeyFromSettings(workspace.tokens)).toBe("minimal");
  });

  it("setVariation(null) clears only the variation field", async () => {
    const db = draftDb({ brand: "#123456", variation: "minimal" });
    await setVariation(db.asClient(), MERCHANT, {
      themeId: THEME,
      variation: null,
    });
    const stored = db.rows("theme_drafts").find((r) => r.theme_id === THEME);
    expect(stored!.tokens).toEqual({ brand: "#123456" });
  });

  it("setVariation rejects malformed keys and foreign themes", async () => {
    const db = draftDb({ brand: "#123456" });
    await expect(
      setVariation(db.asClient(), MERCHANT, {
        themeId: THEME,
        variation: "Minimal!",
      }),
    ).rejects.toMatchObject({ code: "builder.variation_invalid" });
    await expect(
      setVariation(db.asClient(), "99999999-9999-9999-9999-999999999999", {
        themeId: THEME,
        variation: "minimal",
      }),
    ).rejects.toMatchObject({ code: "builder.theme_missing" });
  });
});

/* ---------------- T2.1 last-good auto-serve: a dangling published pointer
 * serves the most recent prior published pin for the same merchant+theme;
 * with no prior pin the live path keeps the crash contract (null → $fallback
 * builtin). Every fallback choice is audit-logged (log + metric + audit row).
 * The explicit rollbackVersion() path is untouched (see qubickle predicates).
 */

function lastGoodDb(): FakeDb {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Live",
          is_active: true,
          published_version_id: "v-broken", // dangling: no such row
          source_listing_slug: null,
        },
      ],
      theme_versions: [
        {
          id: "v1",
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 1,
          status: "published",
          templates: { index: { header: [], main: [], footer: [] } },
          tokens: { brand: "#111111" },
        },
        {
          id: "v2",
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 2,
          status: "published",
          templates: { index: { header: [], main: [], footer: [] } },
          tokens: { brand: "#222222" },
        },
        // Not servable priors: a newer draft and another theme's pin.
        {
          id: "v3",
          merchant_id: MERCHANT,
          theme_id: THEME,
          version: 3,
          status: "draft",
          templates: { index: { header: [], main: [], footer: [] } },
          tokens: { brand: "#333333" },
        },
        {
          id: "v9",
          merchant_id: MERCHANT,
          theme_id: OTHER,
          version: 9,
          status: "published",
          templates: { index: { header: [], main: [], footer: [] } },
          tokens: { brand: "#999999" },
        },
      ],
      theme_drafts: [],
      theme_audit: [],
    },
  });
}

function noPriorDb(): FakeDb {
  return fakeDb({
    tables: {
      store_themes: [
        {
          id: THEME,
          merchant_id: MERCHANT,
          name: "Live",
          is_active: true,
          published_version_id: "v-broken",
          source_listing_slug: null,
        },
      ],
      theme_versions: [],
      theme_drafts: [],
      theme_audit: [],
    },
  });
}

describe("T2.1 last-good auto-serve", () => {
  it("serves the newest prior published pin when the pointer dangles", async () => {
    const db = lastGoodDb();
    const live = await publishedTheme(db.asClient(), MERCHANT);
    // v3 is newer but a draft, v9 belongs to another theme: v2 wins.
    expect(live?.versionId).toBe("v2");
    expect(live?.tokens.brand).toBe("#222222");
  });

  it("audit-logs the fallback choice (log + metric + audit row)", async () => {
    const db = lastGoodDb();
    const live = await publishedTheme(db.asClient(), MERCHANT);
    expect(live?.versionId).toBe("v2");

    const events = recorder.logs.filter((l) => l.event === "theme.serve_fallback");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: "warn",
      fields: expect.objectContaining({
        merchant_id: MERCHANT,
        theme_id: THEME,
        broken_version_id: "v-broken",
        fallback_version_id: "v2",
        via: "prior_pin",
      }),
    });
    expect(recorder.of("framique_theme_serve_fallback", ["result", "prior_pin"]))
      .toHaveLength(1);

    const audits = db
      .rows("theme_audit")
      .filter((r) => r.action === "theme.serve_fallback");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      merchant_id: MERCHANT,
      theme_id: THEME,
      action: "theme.serve_fallback",
      before: { version_id: "v-broken" },
      after: { version_id: "v2", via: "prior_pin" },
    });
  });

  it("falls through to the crash contract (null) with no prior pin", async () => {
    const db = noPriorDb();
    const live = await publishedTheme(db.asClient(), MERCHANT);
    expect(live).toBeNull();

    const events = recorder.logs.filter((l) => l.event === "theme.serve_fallback");
    expect(events).toHaveLength(1);
    expect(events[0]?.fields).toMatchObject({
      broken_version_id: "v-broken",
      fallback_version_id: null,
      via: "builtin",
    });
    expect(recorder.of("framique_theme_serve_fallback", ["result", "builtin"]))
      .toHaveLength(1);
    const audits = db
      .rows("theme_audit")
      .filter((r) => r.action === "theme.serve_fallback");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.after).toEqual({ version_id: null, via: "builtin" });
  });

  it("healthy pointer serves the pin with no fallback audit", async () => {
    const db = pointerDb();
    const live = await publishedTheme(db.asClient(), MERCHANT);
    expect(live?.versionId).toBe("v1");
    expect(
      recorder.logs.filter((l) => l.event === "theme.serve_fallback"),
    ).toHaveLength(0);
    expect(recorder.of("framique_theme_serve_fallback")).toHaveLength(0);
    expect(
      db.rows("theme_audit").filter((r) => r.action === "theme.serve_fallback"),
    ).toHaveLength(0);
  });
});
