/**
 * Pass 1 — reachable Level B install entry (TDD RED first).
 *
 * G1: `marketInstallFn` never supplies `reviewedBundle`/`reviewedRelease`
 * (its zod validator strips unknown keys), so the reviewed lane in
 * `installListing` always threw `bytes_required` — no reachable upload path
 * for `dev.theme.json` bundles existed.
 *
 * Fixed contract pinned here: the SELLER attaches the bundle to the listing
 * row (`manifest.dev_theme.bundle`, JSON-safe base64), the buyer names ONLY
 * an optional consent pin (`devThemeFingerprint`), and `installListing`
 * resolves bytes + approval server-side from the listing row + the durable
 * review rows (`dev_theme_releases`/`dev_theme_reviews`). Caller-supplied
 * bytes are never trusted: an attached bundle always wins, and over HTTP no
 * raw-bytes key exists at all (zod strips unknown keys).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";
import {
  validateDevThemeBundle,
  type DevThemeBundleFile,
  type DevThemeBundleInput,
} from "./dev-theme-bundle";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";
import {
  persistDevThemeReview,
  persistDevThemeSubmission,
  publishDevThemeRelease,
} from "./dev-theme-review";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { installListing } = await import("./marketplace-install.server");
const {
  encodeReviewedThemeBundleForListing,
  decodeReviewedThemeListingBundle,
} = await import("./dev-theme-bundle-install");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const SELLER = "11111111-1111-1111-1111-111111111111";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const LISTING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THEME_SLUG = "aurora-lookbook";

const GSAP_DEP = {
  name: "gsap",
  version: "3.15.0",
  license: "MIT",
  integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";
const MOD = { id: "reviewer-1", role: "moderator" } as const;

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: THEME_SLUG,
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation"],
    dependencies: [{ ...GSAP_DEP }],
    sections: [],
    settings: [],
    ...over,
  };
}

function file(path: string, text: string): DevThemeBundleFile {
  return { path, bytes: new TextEncoder().encode(text) };
}

function bundleInput(hero = `export const h = 1;`): DevThemeBundleInput {
  const m = manifest();
  return {
    manifest: m,
    files: [
      file("dev.theme.json", JSON.stringify(m)),
      file("components/Hero.js", hero),
    ],
    dependencies: [{ ...GSAP_DEP }],
    allowedNetworkHosts: [],
  };
}

function entryDb() {
  return fakeDb({
    tables: {
      dev_theme_releases: [],
      dev_theme_reviews: [],
      marketplace_themes: [],
      marketplace_installs: [],
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      activity_log: [],
      theme_audit: [],
      wallet_ledger_entries: [],
      theme_assets: [],
    },
    unique: [
      {
        table: "dev_theme_releases",
        columns: ["merchant_id", "theme_id", "fingerprint"],
      },
      {
        table: "dev_theme_reviews",
        columns: ["merchant_id", "theme_id", "fingerprint", "decision"],
      },
    ],
  });
}

type EntryClient = Parameters<typeof persistDevThemeSubmission>[0];

/** Seller lane: durable submit → approve → publish (no memory store). */
async function sellerPublishes(
  db: ReturnType<typeof entryDb>,
  hero = `export const h = 1;`,
) {
  const client = db.asClient() as EntryClient;
  const v = validateDevThemeBundle(bundleInput(hero));
  expect(v.ok).toBe(true);
  if (!v.ok) throw new Error("fixture bundle rejected");
  await persistDevThemeSubmission(client, {
    merchantId: SELLER,
    themeId: THEME_SLUG,
    manifest: v.manifest,
    files: v.files,
    fingerprint: v.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  await persistDevThemeReview(client, {
    releaseId: "unresolved",
    merchantId: SELLER,
    themeId: THEME_SLUG,
    fingerprint: v.fingerprint,
    reviewer: { ...MOD },
    decision: "approve",
    reason: "clean scan, fallback proof attached",
    reviewedAt: T1,
  });
  await publishDevThemeRelease(client, {
    merchantId: SELLER,
    themeId: THEME_SLUG,
    fingerprint: v.fingerprint,
    actor: { ...MOD },
    publishedAt: T1,
  });
  return { fingerprint: v.fingerprint };
}

/** Seller lists with the bundle attached to the listing row. */
function sellerLists(db: ReturnType<typeof entryDb>, fingerprint: string) {
  db.rows("marketplace_themes").push({
    id: LISTING_ID,
    name: "Aurora Lookbook",
    slug: THEME_SLUG,
    version: "1.0.0",
    status: "active",
    seller_merchant_id: SELLER,
    price_minor_int: 0,
    currency_code: "BDT",
    trial_allowed: false,
    compatible_versions: [],
    install_count: 0,
    manifest: {
      dev_theme: {
        theme_id: THEME_SLUG,
        fingerprint,
        bundle: encodeReviewedThemeBundleForListing(bundleInput()),
      },
    },
  });
}

beforeEach(() => recorder.reset());

describe("Pass 1 — listing-marker bundle encode/decode round-trip", () => {
  it("encodes to JSON-safe rows and decodes back to identical bytes", () => {
    const encoded = encodeReviewedThemeBundleForListing(bundleInput());
    expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
    const decoded = decodeReviewedThemeListingBundle({
      dev_theme: {
        theme_id: THEME_SLUG,
        fingerprint: "a".repeat(64),
        bundle: encoded,
      },
    });
    expect(decoded).not.toBeNull();
    const want = bundleInput();
    expect(decoded!.files.map((f) => f.path)).toEqual(
      want.files.map((f) => f.path),
    );
    for (const f of want.files) {
      const hit = decoded!.files.find((d) => d.path === f.path)!;
      expect(Array.from(hit.bytes)).toEqual(Array.from(f.bytes));
    }
  });

  it("decodes null for missing/ malformed bundles (lane not entered blind)", () => {
    expect(decodeReviewedThemeListingBundle({})).toBeNull();
    expect(decodeReviewedThemeListingBundle(null)).toBeNull();
    expect(
      decodeReviewedThemeListingBundle({
        dev_theme: { theme_id: THEME_SLUG, fingerprint: "a".repeat(64) },
      }),
    ).toBeNull();
    expect(
      decodeReviewedThemeListingBundle({
        dev_theme: {
          theme_id: THEME_SLUG,
          fingerprint: "a".repeat(64),
          bundle: { files: [{ path: "x.js" }] },
        },
      }),
    ).toBeNull();
  });
});

describe("Pass 1 — reachable install entry (server-resolved bytes + approval)", () => {
  it("installs with ZERO caller bytes: attach + durable approval resolve server-side", async () => {
    const db = entryDb();
    const { fingerprint } = await sellerPublishes(db);
    sellerLists(db, fingerprint);
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING_ID,
      trial: false,
      idempotencyKey: "entry-reachable-1",
      grantedScopes: [],
      consentedBy: ACTOR,
      devThemeFingerprint: fingerprint,
    })) as unknown as {
      installId: string;
      replayed: boolean;
      artifact: { checksum: string } | null;
    };
    expect(out.replayed).toBe(false);
    expect(out.artifact?.checksum).toBe(fingerprint);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")[0]!.checksum).toBe(fingerprint);
    expect(
      db
        .rows("activity_log")
        .filter((r) => r.action === "market.dev_theme.installed"),
    ).toHaveLength(1);
  });

  it("installs without even naming the pin (marker fingerprint resolves)", async () => {
    const db = entryDb();
    const { fingerprint } = await sellerPublishes(db);
    sellerLists(db, fingerprint);
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING_ID,
      trial: false,
      idempotencyKey: "entry-no-pin-1",
      grantedScopes: [],
      consentedBy: ACTOR,
    })) as unknown as { replayed: boolean };
    expect(out.replayed).toBe(false);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });

  it("a buyer pin for other bytes refuses before any write (consent mismatch)", async () => {
    const db = entryDb();
    const { fingerprint } = await sellerPublishes(db);
    sellerLists(db, fingerprint);
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: LISTING_ID,
        trial: false,
        idempotencyKey: "entry-pin-lie-1",
        grantedScopes: [],
        consentedBy: ACTOR,
        devThemeFingerprint: "b".repeat(64),
      }),
    ).rejects.toThrow(/market_consent_mismatch/);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("activity_log")).toHaveLength(0);
  });

  it("attached bytes win: tampered caller bytes are ignored, install succeeds", async () => {
    const db = entryDb();
    const { fingerprint } = await sellerPublishes(db);
    sellerLists(db, fingerprint);
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING_ID,
      trial: false,
      idempotencyKey: "entry-caller-ignored-1",
      grantedScopes: [],
      consentedBy: ACTOR,
      devThemeFingerprint: fingerprint,
      // Attacker-controlled bytes for other content: must be ignored.
      reviewedBundle: bundleInput(`export const h = 999;`),
    } as never)) as unknown as {
      replayed: boolean;
      artifact: { checksum: string } | null;
    };
    expect(out.replayed).toBe(false);
    expect(out.artifact?.checksum).toBe(fingerprint);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });

  it("a revoked durable approval refuses even with attached bytes (server wins)", async () => {
    const db = entryDb();
    const { fingerprint } = await sellerPublishes(db);
    sellerLists(db, fingerprint);
    // Moderator revokes after the seller published (direct row transition;
    // the server entry lands in Pass 3 — state shape is what matters here).
    const row = db
      .rows("dev_theme_releases")
      .find((r) => r.fingerprint === fingerprint)!;
    row.status = "revoked";
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: LISTING_ID,
        trial: false,
        idempotencyKey: "entry-revoked-1",
        grantedScopes: [],
        consentedBy: ACTOR,
        devThemeFingerprint: fingerprint,
      }),
    ).rejects.toThrow(/dev_theme_install\.revoked/);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("no attach + no caller bytes still fails closed (legacy preserved)", async () => {
    const db = entryDb();
    const { fingerprint } = await sellerPublishes(db);
    db.rows("marketplace_themes").push({
      id: LISTING_ID,
      name: "Aurora Lookbook",
      slug: THEME_SLUG,
      version: "1.0.0",
      status: "active",
      seller_merchant_id: SELLER,
      price_minor_int: 0,
      currency_code: "BDT",
      trial_allowed: false,
      compatible_versions: [],
      install_count: 0,
      // Marker only: approval exists durably but no bytes are attached.
      manifest: {
        dev_theme: { theme_id: THEME_SLUG, fingerprint },
      },
    });
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: LISTING_ID,
        trial: false,
        idempotencyKey: "entry-no-bytes-1",
        grantedScopes: [],
        consentedBy: ACTOR,
      }),
    ).rejects.toThrow(/dev_theme_install\.bytes_required/);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });
});
