/**
 * Pass 3 — moderator server surface (TDD RED first).
 *
 * G4: `rollback()` and all moderator transitions had no DURABLE server
 * entry (the pure store is memory-only), and no Level B version-update flow
 * existed (only data-only `applyThemeUpdate`).
 *
 * Pinned here — every step through durable server entries in
 * `dev-theme-review.ts`, audits persisted via `insertDevThemeAuditRow`:
 * submit → review → publish → install → activate → rollback, plus the
 * version-update flow (new fingerprint → approval → install-over →
 * re-activate). Gates are never weakened: each entry mirrors the pure
 * store's gates (reviewer roles, approval binding, revoked-never-restores).
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
  DevThemeReviewError,
  insertDevThemeAuditRow,
  loadDevThemeApproval,
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
const { encodeReviewedThemeBundleForListing } =
  await import("./dev-theme-bundle-install");
const {
  activateDevThemeRelease,
  revokeDevThemeRelease,
  rollbackDevThemeRelease,
} = await import("./dev-theme-review");

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
const T2 = "2026-10-03T00:00:00.000Z";
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

function modDb() {
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

type ModClient = Parameters<typeof persistDevThemeSubmission>[0];

function auditActions(db: ReturnType<typeof modDb>): string[] {
  return db.rows("theme_audit").map((r) => String(r.action));
}

/** Full seller lane through server entries, audits persisted. */
async function sellerPublishes(
  db: ReturnType<typeof modDb>,
  hero = `export const h = 1;`,
) {
  const client = db.asClient() as ModClient;
  const v = validateDevThemeBundle(bundleInput(hero));
  expect(v.ok).toBe(true);
  if (!v.ok) throw new Error("fixture bundle rejected");
  const sub = await persistDevThemeSubmission(client, {
    merchantId: SELLER,
    themeId: THEME_SLUG,
    manifest: v.manifest,
    files: v.files,
    fingerprint: v.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  await insertDevThemeAuditRow(client, sub.audit);
  const rev = await persistDevThemeReview(client, {
    releaseId: "unresolved",
    merchantId: SELLER,
    themeId: THEME_SLUG,
    fingerprint: v.fingerprint,
    reviewer: { ...MOD },
    decision: "approve",
    reason: "clean scan, fallback proof attached",
    reviewedAt: T1,
  });
  await insertDevThemeAuditRow(client, rev.audit);
  const pub = await publishDevThemeRelease(client, {
    merchantId: SELLER,
    themeId: THEME_SLUG,
    fingerprint: v.fingerprint,
    actor: { ...MOD },
    publishedAt: T1,
  });
  await insertDevThemeAuditRow(client, pub.audit);
  return { fingerprint: v.fingerprint };
}

function sellerLists(
  db: ReturnType<typeof modDb>,
  fingerprint: string,
  hero = `export const h = 1;`,
) {
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
        bundle: encodeReviewedThemeBundleForListing(bundleInput(hero)),
      },
    },
  });
}

async function buyerInstalls(
  db: ReturnType<typeof modDb>,
  fingerprint: string,
  key: string,
) {
  const out = (await installListing(db.asClient(), MERCHANT, {
    kind: "theme",
    listingId: LISTING_ID,
    trial: false,
    idempotencyKey: key,
    grantedScopes: [],
    consentedBy: ACTOR,
    devThemeFingerprint: fingerprint,
  })) as unknown as { installId: string };
  const theme = db
    .rows("store_themes")
    .find(
      (r) =>
        (r as { source_install_id?: unknown }).source_install_id ===
        out.installId,
    ) as unknown as { id: string };
  return { installId: out.installId, themeId: theme.id };
}

beforeEach(() => recorder.reset());

describe("Pass 3 — submit → review → publish → activate via server entries", () => {
  it("round-trips with an audit row per transition", async () => {
    const db = modDb();
    const client = db.asClient() as ModClient;
    const { fingerprint } = await sellerPublishes(db);
    sellerLists(db, fingerprint);
    expect(auditActions(db)).toEqual([
      "dev_theme.submitted",
      "dev_theme.reviewed",
      "dev_theme.published",
    ]);

    const { installId, themeId } = await buyerInstalls(
      db,
      fingerprint,
      "mod-roundtrip-1",
    );
    const out = await activateDevThemeRelease(db.asClient() as ModClient, {
      merchantId: MERCHANT,
      themeId,
      installId,
      releaseMerchantId: SELLER,
      releaseThemeId: THEME_SLUG,
      fingerprint,
      actorId: ACTOR,
    });
    expect(out).toMatchObject({ themeId, fingerprint });
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === themeId)!.is_active).toBe(true);
    expect(auditActions(db)).toEqual([
      "dev_theme.submitted",
      "dev_theme.reviewed",
      "dev_theme.published",
      "dev_theme.activated",
    ]);
    void client;
  });

  it("activation refuses an unknown fingerprint with no flag flip and no audit", async () => {
    const db = modDb();
    const { fingerprint } = await sellerPublishes(db);
    sellerLists(db, fingerprint);
    const { themeId } = await buyerInstalls(db, fingerprint, "mod-unknown-1");
    const err = await activateDevThemeRelease(db.asClient() as ModClient, {
      merchantId: MERCHANT,
      themeId,
      releaseMerchantId: SELLER,
      releaseThemeId: THEME_SLUG,
      fingerprint: "c".repeat(64),
      actorId: ACTOR,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DevThemeReviewError);
    expect((err as DevThemeReviewError).code).toBe(
      "dev_theme.approval_required",
    );
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === themeId)!.is_active).toBe(false);
    expect(
      db.rows("theme_audit").filter((r) => r.action === "dev_theme.activated"),
    ).toHaveLength(0);
  });
});

describe("Pass 3 — durable rollback restores the approved fingerprint", () => {
  it("rolls back to v1 after a bad v2, with a rolled_back audit row", async () => {
    const db = modDb();
    const client = db.asClient() as ModClient;
    const v1 = await sellerPublishes(db, `export const h = 1;`);
    sellerLists(db, v1.fingerprint, `export const h = 1;`);
    const first = await buyerInstalls(db, v1.fingerprint, "mod-rb-v1-1");
    await activateDevThemeRelease(db.asClient() as ModClient, {
      merchantId: MERCHANT,
      themeId: first.themeId,
      installId: first.installId,
      releaseMerchantId: SELLER,
      releaseThemeId: THEME_SLUG,
      fingerprint: v1.fingerprint,
      actorId: ACTOR,
    });

    // Bad v2 ships and activates (compromised latest).
    const v2 = await sellerPublishes(db, `export const evil = 1;`);
    expect(v2.fingerprint).not.toBe(v1.fingerprint);
    const listing = db.rows("marketplace_themes")[0]!;
    listing.manifest = {
      dev_theme: {
        theme_id: THEME_SLUG,
        fingerprint: v2.fingerprint,
        bundle: encodeReviewedThemeBundleForListing(
          bundleInput(`export const evil = 1;`),
        ),
      },
    };
    const second = await buyerInstalls(db, v2.fingerprint, "mod-rb-v2-1");
    await activateDevThemeRelease(db.asClient() as ModClient, {
      merchantId: MERCHANT,
      themeId: second.themeId,
      installId: second.installId,
      releaseMerchantId: SELLER,
      releaseThemeId: THEME_SLUG,
      fingerprint: v2.fingerprint,
      actorId: ACTOR,
    });

    // Moderator rolls back to the v1 fingerprint.
    const rb = await rollbackDevThemeRelease(db.asClient() as ModClient, {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      targetFingerprint: v1.fingerprint,
      actor: { ...MOD },
      rolledBackAt: T2,
    });
    expect(rb.release.status).toBe("published");
    await insertDevThemeAuditRow(client, rb.audit);
    expect(auditActions(db)).toContain("dev_theme.rolled_back");
    const rolled = db
      .rows("theme_audit")
      .find((r) => r.action === "dev_theme.rolled_back")! as unknown as {
      after: { rollback_of: string; fingerprint: string };
    };
    expect(rolled.after.fingerprint).toBe(v1.fingerprint);

    // Re-activating the v1 theme restores it live.
    await activateDevThemeRelease(db.asClient() as ModClient, {
      merchantId: MERCHANT,
      themeId: first.themeId,
      installId: first.installId,
      releaseMerchantId: SELLER,
      releaseThemeId: THEME_SLUG,
      fingerprint: v1.fingerprint,
      actorId: ACTOR,
    });
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === first.themeId)!.is_active).toBe(true);
    expect(themes.find((t) => t.id === second.themeId)!.is_active).toBe(false);
  });

  it("rollback to a revoked fingerprint refuses (revoked bytes never restore)", async () => {
    const db = modDb();
    const client = db.asClient() as ModClient;
    const v1 = await sellerPublishes(db);
    const rb = await revokeDevThemeRelease(db.asClient() as ModClient, {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      fingerprint: v1.fingerprint,
      actor: { ...MOD },
      reason: "license violation",
      revokedAt: T2,
    });
    await insertDevThemeAuditRow(client, rb.audit);
    expect(
      db
        .rows("dev_theme_releases")
        .find((r) => r.fingerprint === v1.fingerprint)!.status,
    ).toBe("revoked");
    const err = await rollbackDevThemeRelease(db.asClient() as ModClient, {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      targetFingerprint: v1.fingerprint,
      actor: { ...MOD },
      rolledBackAt: T2,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DevThemeReviewError);
    expect((err as DevThemeReviewError).code).toBe(
      "dev_theme.rollback_revoked",
    );
  });
});

describe("Pass 3 — version-update flow (new fingerprint → approval → install-over → re-activate)", () => {
  it("installs v2 over v1 and re-activates, retiring the old theme", async () => {
    const db = modDb();
    const v1 = await sellerPublishes(db, `export const h = 1;`);
    sellerLists(db, v1.fingerprint, `export const h = 1;`);
    const first = await buyerInstalls(db, v1.fingerprint, "mod-up-v1-1");
    await activateDevThemeRelease(db.asClient() as ModClient, {
      merchantId: MERCHANT,
      themeId: first.themeId,
      installId: first.installId,
      releaseMerchantId: SELLER,
      releaseThemeId: THEME_SLUG,
      fingerprint: v1.fingerprint,
      actorId: ACTOR,
    });

    // Seller ships v2: new fingerprint → new approval → listing moves.
    const v2 = await sellerPublishes(db, `export const h = 2;`);
    expect(v2.fingerprint).not.toBe(v1.fingerprint);
    const loaded = await loadDevThemeApproval(
      db.asClient() as ModClient,
      SELLER,
      THEME_SLUG,
      v2.fingerprint,
    );
    expect(loaded!.release.status).toBe("published");
    const listing = db.rows("marketplace_themes")[0]!;
    listing.version = "1.0.1";
    listing.manifest = {
      dev_theme: {
        theme_id: THEME_SLUG,
        fingerprint: v2.fingerprint,
        bundle: encodeReviewedThemeBundleForListing(
          bundleInput(`export const h = 2;`),
        ),
      },
    };

    // Buyer installs over (new key) and re-activates.
    const second = await buyerInstalls(db, v2.fingerprint, "mod-up-v2-1");
    expect(second.installId).not.toBe(first.installId);
    await activateDevThemeRelease(db.asClient() as ModClient, {
      merchantId: MERCHANT,
      themeId: second.themeId,
      installId: second.installId,
      releaseMerchantId: SELLER,
      releaseThemeId: THEME_SLUG,
      fingerprint: v2.fingerprint,
      actorId: ACTOR,
    });

    const installs = db.rows("marketplace_installs") as {
      id: string;
      version: string;
    }[];
    expect(installs).toHaveLength(2);
    expect(installs.find((r) => r.id === second.installId)!.version).toBe(
      "1.0.0",
    );
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === second.themeId)!.is_active).toBe(true);
    expect(themes.find((t) => t.id === first.themeId)!.is_active).toBe(false);
    expect(
      db.rows("theme_audit").filter((r) => r.action === "dev_theme.activated"),
    ).toHaveLength(2);
  });
});
