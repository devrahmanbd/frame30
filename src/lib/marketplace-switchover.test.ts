/**
 * SWITCHOVER-2 — marketplace distributes exact ZIP artifacts.
 *
 * Cases only (no fixture/server changes):
 * - exact-artifact install: a widget listing with a full plugin manifest
 *   installs THROUGH the package pipeline — one ledger row, assets under the
 *   pipeline namespace `plugins/<slug>/<artifact8>/`, and the result checksum
 *   equals the sha256 of the listing-derived ZIP;
 * - legacy fallback: bundle-shaped/empty manifests keep the historical
 *   ledger-only install (documented, never a crash, no asset rows);
 * - idempotent replay: same key replays without stacking rows or assets;
 * - version pin: a pinned vault version's `source` supplies the exact bytes;
 * - catalog refs: built-ins and exact rows expose checksums, legacy rows null.
 *
 * No network, no real database: all persistence goes through fakeDb.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { fakeDb, type Row } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { installListing } = await import("./marketplace-install.server");
const { listCatalog } = await import("./marketplace.server");
const { exportPluginManifestZip } = await import("./plugin-package");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const SELLER = "11111111-1111-1111-1111-111111111111";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const LISTING_EXACT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LISTING_LEGACY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Full plugin manifest: passes both the marketplace bundle gate and the
 * package pipeline gate, so the listing resolves to exact ZIP bytes. */
function exactManifest(version = "1.0.0") {
  return {
    id: "acme-reviews",
    name: "Acme Reviews",
    version,
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets: [
      {
        key: "reviews",
        label: "Customer Reviews",
        slots: ["main"],
        entry: "framique.mount(document.createElement('div'))",
      },
    ],
    hooks: [],
    settings: [
      { key: "title", label: "Title", kind: "text", default: "Reviews" },
    ],
    i18n: { en: { title: "Title" }, bn: { title: "শিরোনাম" } },
    budget: { jsKb: 10, mainThreadMs: 5 },
  };
}

function exactRow() {
  return {
    id: LISTING_EXACT,
    name: "Acme Reviews",
    slug: "sticky-cart",
    version: "1.0.0",
    status: "active",
    seller_merchant_id: SELLER,
    price_minor_int: 0,
    currency_code: "BDT",
    trial_allowed: false,
    compatible_versions: [],
    install_count: 0,
    manifest: exactManifest(),
  };
}

function legacyRow() {
  return {
    id: LISTING_LEGACY,
    name: "Legacy widget",
    slug: "legacy-widget",
    version: "1.0.0",
    status: "active",
    seller_merchant_id: SELLER,
    price_minor_int: 0,
    currency_code: "BDT",
    trial_allowed: false,
    compatible_versions: [],
    install_count: 0,
    manifest: { entry: "framique.mount()", permissions: ["read_shop"] },
  };
}

function shopDb(widgets: Row[], versions: Row[] = []) {
  return fakeDb({
    tables: {
      marketplace_widgets: widgets,
      marketplace_versions: versions,
      marketplace_installs: [],
      theme_assets: [],
      theme_audit: [],
      activity_log: [],
      plugin_state: [],
    },
  });
}

const GRANTED = ["read_shop", "render_storefront"];

beforeEach(() => recorder.reset());

describe("SWITCHOVER-2 exact-artifact install", () => {
  it("installs listing bytes through the pipeline: one ledger row + namespaced assets + matching checksum", async () => {
    const db = shopDb([exactRow(), legacyRow()]);
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "widget",
      listingId: LISTING_EXACT,
      trial: false,
      idempotencyKey: "switch-key-1",
      versionId: null,
      grantedScopes: GRANTED,
      consentedBy: ACTOR,
    })) as unknown as {
      installId: string;
      replayed: boolean;
      artifact: {
        checksum: string;
        version: string;
        fileName: string;
        pinned: string;
      } | null;
    };

    expect(out.replayed).toBe(false);
    const expected = sha256(exportPluginManifestZip(exactManifest()));
    expect(out.artifact).toMatchObject({
      checksum: expected,
      version: "1.0.0",
      fileName: "sticky-cart.zip",
      pinned: "manifest",
    });

    // Convergence: exactly one ledger row (pipeline wrote it, marketplace
    // patched it to listing identity) and assets under the pipeline
    // namespace keyed by manifest slug + artifact prefix.
    const installs = db.rows("marketplace_installs");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      id: out.installId,
      kind: "widget",
      merchant_id: MERCHANT,
      widget_id: LISTING_EXACT,
      listing_slug: "sticky-cart",
      version: "1.0.0",
      status: "installed",
      idempotency_key: "switch-key-1",
    });
    expect(installs[0]!.granted_scopes).toEqual(GRANTED);
    expect(installs[0]!.consented_by).toBe(ACTOR);

    const prefix = `plugins/acme-reviews/${expected.slice(0, 8)}/assets/`;
    const assets = db.rows("theme_assets");
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets) {
      expect(a.merchant_id).toBe(MERCHANT);
      expect(String(a.name).startsWith(prefix)).toBe(true);
    }
  });

  it("installs the pinned version's bytes when versionId points at a full-manifest source", async () => {
    const db = shopDb([exactRow()], [
      {
        id: "v-2",
        kind: "widget",
        listing_id: LISTING_EXACT,
        version: "1.1.0",
        status: "active",
        scopes: GRANTED,
        source: exactManifest("1.1.0"),
      },
    ]);
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "widget",
      listingId: LISTING_EXACT,
      trial: false,
      idempotencyKey: "switch-key-pinned",
      versionId: "v-2",
      grantedScopes: GRANTED,
      consentedBy: ACTOR,
    })) as unknown as { installId: string; artifact: { checksum: string; version: string; pinned: string } | null };

    const expected = sha256(exportPluginManifestZip(exactManifest("1.1.0")));
    expect(out.artifact).toMatchObject({
      checksum: expected,
      version: "1.1.0",
      pinned: "version:v-2",
    });
    const row = db.rows("marketplace_installs")[0]!;
    expect(row.version).toBe("1.1.0");
    const assets = db.rows("theme_assets");
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets) {
      expect(
        String(a.name).startsWith(
          `plugins/acme-reviews/${expected.slice(0, 8)}/assets/`,
        ),
      ).toBe(true);
    }
  });

  it("falls back to the listing manifest when the pinned version has no usable source", async () => {
    const db = shopDb([exactRow()], [
      {
        id: "v-bundle",
        kind: "widget",
        listing_id: LISTING_EXACT,
        version: "1.0.0",
        status: "active",
        scopes: ["read_shop"],
        source: { entry: "framique.mount()", assets: {} },
      },
    ]);
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "widget",
      listingId: LISTING_EXACT,
      trial: false,
      idempotencyKey: "switch-key-bundle-pin",
      versionId: "v-bundle",
      grantedScopes: ["read_shop"],
      consentedBy: ACTOR,
    })) as unknown as { artifact: { pinned: string } | null };
    // Vault bundle sources are not installable ZIPs: the listing manifest
    // supplies the bytes instead of crashing.
    expect(out.artifact?.pinned).toBe("manifest");
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });
});

describe("SWITCHOVER-2 legacy fallback", () => {
  it("installs bundle-shaped rows ledger-only: no crash, no assets, artifact null", async () => {
    const db = shopDb([exactRow(), legacyRow()]);
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "widget",
      listingId: LISTING_LEGACY,
      trial: false,
      idempotencyKey: "switch-key-legacy",
      versionId: null,
      grantedScopes: ["read_shop"],
      consentedBy: ACTOR,
    })) as unknown as { installId: string; replayed: boolean; artifact: null };

    expect(out.replayed).toBe(false);
    expect(out.artifact).toBeNull();
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(db.rows("theme_assets")).toHaveLength(0);
    const row = db.rows("marketplace_installs")[0]!;
    expect(row.listing_slug).toBe("legacy-widget");
    expect(row.granted_scopes).toEqual(["read_shop"]);
  });
});

describe("SWITCHOVER-2 idempotency", () => {
  it("replays the same key without stacking ledger rows or assets", async () => {
    const db = shopDb([exactRow(), legacyRow()]);
    const input = {
      kind: "widget" as const,
      listingId: LISTING_EXACT,
      trial: false,
      idempotencyKey: "switch-key-replay",
      versionId: null,
      grantedScopes: GRANTED,
      consentedBy: ACTOR,
    };
    const first = (await installListing(db.asClient(), MERCHANT, {
      ...input,
    })) as unknown as { installId: string; replayed: boolean };
    const assetsAfterFirst = db.rows("theme_assets").length;
    expect(first.replayed).toBe(false);
    expect(assetsAfterFirst).toBeGreaterThan(0);

    const second = (await installListing(db.asClient(), MERCHANT, {
      ...input,
    })) as unknown as {
      installId: string;
      replayed: boolean;
      artifact: null;
    };
    expect(second.replayed).toBe(true);
    expect(second.installId).toBe(first.installId);
    expect(second.artifact).toBeNull();
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(db.rows("theme_assets")).toHaveLength(assetsAfterFirst);
  });

  it("refuses a reused key bound to a different listing (conflict, never a replay)", async () => {
    const db = shopDb([exactRow(), legacyRow()]);
    await installListing(db.asClient(), MERCHANT, {
      kind: "widget",
      listingId: LISTING_EXACT,
      trial: false,
      idempotencyKey: "switch-key-conflict",
      versionId: null,
      grantedScopes: GRANTED,
      consentedBy: ACTOR,
    });
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "widget",
        listingId: LISTING_LEGACY,
        trial: false,
        idempotencyKey: "switch-key-conflict",
        versionId: null,
        grantedScopes: ["read_shop"],
        consentedBy: ACTOR,
      }),
    ).rejects.toThrow("market_idempotency_conflict");
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });
});

describe("SWITCHOVER-2 catalog artifact refs", () => {
  function chain(widgets: unknown[], installs: unknown[] = []) {
    let n = 0;
    return {
      from: vi.fn(() => {
        n += 1;
        return n === 1
          ? {
              select: () => ({
                order: () => Promise.resolve({ data: widgets, error: null }),
              }),
            }
          : {
              select: () => ({
                eq: () => ({
                  order: () => Promise.resolve({ data: installs, error: null }),
                }),
              }),
            };
      }),
    } as never;
  }

  it("exposes exact checksums for built-ins and manifest rows, null for legacy rows", async () => {
    const { BUILTIN_PLUGINS } = await import("./builtin-plugins");
    const catalog = await listCatalog(
      chain([exactRow(), legacyRow()]),
      "00000000-0000-4000-a000-000000000001",
    );

    for (const [i, entry] of catalog.widgets
      .filter((w) => (w as { builtin?: boolean }).builtin)
      .entries()) {
      const art = (entry as { artifact: { checksum: string; version: string; pinned: string } | null }).artifact;
      expect(art?.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(art?.version).toBe(BUILTIN_PLUGINS[i]!.manifest.version);
      expect(art?.pinned).toBe(
        `builtin:${BUILTIN_PLUGINS[i]!.manifest.id}`,
      );
    }

    const dbRows = catalog.widgets.filter(
      (w) => !(w as { builtin?: boolean }).builtin,
    );
    expect(dbRows).toHaveLength(2);
    const exact = dbRows.find(
      (w) => (w as { slug?: string }).slug === "sticky-cart",
    ) as unknown as { artifact: { checksum: string; pinned: string } | null };
    const expected = sha256(exportPluginManifestZip(exactManifest()));
    expect(exact.artifact?.checksum).toBe(expected);
    expect(exact.artifact?.pinned).toBe("manifest");
    const legacy = dbRows.find(
      (w) => (w as { slug?: string }).slug === "legacy-widget",
    ) as unknown as { artifact: null };
    expect(legacy.artifact).toBeNull();
  });
});
