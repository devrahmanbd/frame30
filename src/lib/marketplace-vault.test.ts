/**
 * Marketplace vault, consent and creator payouts — [A2]/[A6] failure suite.
 *
 * Three exposures live here: republishing identical bytes must not fork the
 * vault, an install must never receive a scope the merchant did not see, and a
 * payout must settle once.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import { metricRecorder, allowAllRateLimits } from "./__fixtures__/test-doubles";

const rec = vi.hoisted(() => ({ holder: null as any }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { publishVersion, settlePayout, accruePayout, sha256Hex } = await import(
  "./marketplace-vault.server"
);
const { installListing } = await import("./marketplace-install.server");

const SELLER = "11111111-1111-1111-1111-111111111111";
const BUYER = "22222222-2222-2222-2222-222222222222";
const LISTING = "listing-1";

const source = { entry: "export default function Widget() { return null; }", assets: {} };

function vaultDb(versions: any[] = []) {
  return fakeDb({
    tables: {
      marketplace_widgets: [
        {
          id: LISTING,
          name: "Sticky cart",
          slug: "sticky-cart",
          version: "1.0.0",
          seller_merchant_id: SELLER,
        },
      ],
      marketplace_versions: versions,
      marketplace_app_blocks: [],
    },
  });
}

const publishInput = {
  kind: "widget" as const,
  listingId: LISTING,
  version: "1.1.0",
  changelog: "faster",
  scopes: ["read_products", "render_storefront"],
  source,
  blocks: [],
};

beforeEach(() => recorder.reset());

describe("publishVersion", () => {
  it("denies an unknown scope (deny)", async () => {
    const db = vaultDb();
    await expect(
      publishVersion(db.asClient(), SELLER, { ...publishInput, scopes: ["read_products", "drain_wallet"] }),
    ).rejects.toThrow(/market_unknown_scopes:drain_wallet/);
    expect(db.rows("marketplace_versions")).toHaveLength(0);
  });

  it("denies a bundle that ships dynamic code", async () => {
    const db = vaultDb();
    await expect(
      publishVersion(db.asClient(), SELLER, {
        ...publishInput,
        source: { entry: "const m = eval('2+2');" },
      }),
    ).rejects.toThrow(/market_bundle_invalid:.*dynamic_code/);
  });

  it("denies publishing to a listing owned by another seller (tenant deny)", async () => {
    const db = vaultDb();
    await expect(publishVersion(db.asClient(), BUYER, publishInput)).rejects.toThrow(
      "market_listing_not_found",
    );
  });

  it("denies a version that is not forward of the latest", async () => {
    const db = vaultDb([
      { id: "v-2", kind: "widget", listing_id: LISTING, version: "2.0.0", content_hash: "other", status: "active" },
    ]);
    await expect(publishVersion(db.asClient(), SELLER, publishInput)).rejects.toThrow(
      /market_version_not_forward:2\.0\.0/,
    );
  });

  it("creates one immutable version and hashes the content (audit)", async () => {
    const db = vaultDb();
    const out = await publishVersion(db.asClient(), SELLER, publishInput);
    expect(out.replayed).toBe(false);
    expect(out.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const row = db.rows("marketplace_versions")[0]!;
    expect(row["status"]).toBe("review");
    expect(row["seller_merchant_id"]).toBe(SELLER);
    expect(row["scopes"]).toEqual(["read_products", "render_storefront"]);
    expect(recorder.of("framique_market_publish_total", ["outcome", "created"])).toHaveLength(1);
  });

  it("republishing identical bytes returns the original version (replay)", async () => {
    const db = vaultDb();
    const first = await publishVersion(db.asClient(), SELLER, publishInput);
    recorder.reset();
    const second = await publishVersion(db.asClient(), SELLER, {
      ...publishInput,
      version: "1.2.0",
      changelog: "different note, same bytes",
    });

    expect(second.replayed).toBe(true);
    expect(second.versionId).toBe(first.versionId);
    expect(second.contentHash).toBe(first.contentHash);
    expect(db.rows("marketplace_versions")).toHaveLength(1);
    expect(recorder.of("framique_market_publish_total", ["outcome", "replayed"])).toHaveLength(1);
  });

  it("hashes key order independently so a reformat is still a replay", async () => {
    const a = await sha256Hex(JSON.stringify({ a: 1, b: 2 }));
    const b = await sha256Hex(JSON.stringify({ a: 1, b: 2 }));
    expect(a).toBe(b);

    const db = vaultDb();
    const first = await publishVersion(db.asClient(), SELLER, publishInput);
    const reordered = await publishVersion(db.asClient(), SELLER, {
      ...publishInput,
      version: "1.3.0",
      source: { assets: {}, entry: source.entry },
      scopes: ["render_storefront", "read_products"],
    });
    expect(reordered.contentHash).toBe(first.contentHash);
    expect(reordered.replayed).toBe(true);
  });
});

describe("installListing consent gate", () => {
  function installDb(versionScopes: string[]) {
    return fakeDb({
      tables: {
        marketplace_widgets: [
          {
            id: LISTING,
            name: "Sticky cart",
            slug: "sticky-cart",
            version: "1.1.0",
            status: "active",
            seller_merchant_id: SELLER,
            price_minor_int: 0,
            currency_code: "BDT",
            trial_allowed: true,
            compatible: [],
          },
        ],
        marketplace_versions: [
          {
            id: "v-1",
            kind: "widget",
            listing_id: LISTING,
            version: "1.1.0",
            status: "active",
            scopes: versionScopes,
          },
        ],
        marketplace_installs: [],
      },
    });
  }

  const input = {
    kind: "widget" as const,
    listingId: LISTING,
    versionId: "v-1",
    idempotencyKey: "install-key-1",
    trial: false,
    consentedBy: "user-1",
    grantedScopes: ["read_products"],
  };

  it("denies an install whose version needs a scope the merchant never granted (deny)", async () => {
    const db = installDb(["read_products", "read_orders"]);
    await expect(installListing(db.asClient(), BUYER, input as any)).rejects.toThrow(
      /market_consent_required:read_orders/,
    );
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("records the pinned version scopes and a consent timestamp (audit)", async () => {
    const db = installDb(["read_products"]);
    const out: any = await installListing(db.asClient(), BUYER, input as any);
    expect(out.replayed).toBe(false);
    const row = db.rows("marketplace_installs")[0]!;
    expect(row["granted_scopes"]).toEqual(["read_products"]);
    expect(row["consented_at"]).toBeTruthy();
    expect(row["consented_by"]).toBe("user-1");
    expect(row["merchant_id"]).toBe(BUYER);
  });

  it("is idempotent on the install key (replay)", async () => {
    const db = installDb(["read_products"]);
    const first: any = await installListing(db.asClient(), BUYER, input as any);
    const second: any = await installListing(db.asClient(), BUYER, input as any);
    expect(second.replayed).toBe(true);
    expect(second.installId).toBe(first.installId);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });

  it("denies pinning a version that is still in review", async () => {
    const db = installDb(["read_products"]);
    db.rows("marketplace_versions")[0]!["status"] = "review";
    await expect(installListing(db.asClient(), BUYER, input as any)).rejects.toThrow(
      "market_version_not_published",
    );
  });
});

describe("creator payouts", () => {
  it("settles once and reports a replay on the second attempt (replay)", async () => {
    let calls = 0;
    const db = fakeDb({
      rpc: (fn) => {
        if (fn !== "market_payout_settle") return { data: null, error: { message: "unexpected" } };
        calls += 1;
        return { data: { ok: true, replayed: calls > 1, status: "paid" }, error: null };
      },
    });
    const first = await settlePayout(db.asClient(), "payout-1", "paid", "TRX-1", null);
    const second = await settlePayout(db.asClient(), "payout-1", "paid", "TRX-1", null);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.status).toBe("paid");
    expect(recorder.of("framique_market_payout_total", ["action", "paid"])).toHaveLength(2);
  });

  it("denies a settle the ledger refuses (deny)", async () => {
    const db = fakeDb({ rpc: () => ({ data: null, error: { message: "payout_already_paid" } }) });
    await expect(settlePayout(db.asClient(), "payout-1", "paid", null, null)).rejects.toThrow(
      "market_payout_settle_failed",
    );
  });

  it("counts accrual separately from settlement (audit)", async () => {
    const db = fakeDb({ rpc: () => ({ data: { ok: true, payout_id: "p-1" }, error: null }) });
    await accruePayout(db.asClient(), SELLER);
    expect(recorder.of("framique_market_payout_total", ["action", "accrue"])).toHaveLength(1);
    expect(db.rpcCalls("market_payout_accrue")[0]!.args["_seller_merchant_id"]).toBe(SELLER);
  });
});
