/**
 * Pass 4 — adversarial vectors (TDD RED first).
 *
 * - Caller-supplied bytes ignored: with a seller attach + durable approval,
 *   attacker bytes AND an attacker approval snapshot for other bytes change
 *   nothing — the install carries the server-resolved checksum.
 * - Revoked-mid-serve (entry level): install-then-revoke → activate refuses;
 *   revoke-then-install refuses (route level is pinned in `t.$.test.ts`).
 * - Rollback-to-revoked/rejected/unreviewed: every non-approved target
 *   refuses before any write.
 * - Update version lies: a listing-row version the bytes do not carry never
 *   lands on the ledger; edited post-approval bytes refuse with zero writes.
 * - Concurrent submit races: a duplicate-key race re-reads the winner —
 *   one row, second call deduplicated.
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

function advDb() {
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

type AdvClient = Parameters<typeof persistDevThemeSubmission>[0];

async function sellerPublishes(
  db: ReturnType<typeof advDb>,
  hero: string,
  at: string = T1,
) {
  const client = db.asClient() as AdvClient;
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
    reason: "clean",
    reviewedAt: at,
  });
  await insertDevThemeAuditRow(client, rev.audit);
  const pub = await publishDevThemeRelease(client, {
    merchantId: SELLER,
    themeId: THEME_SLUG,
    fingerprint: v.fingerprint,
    actor: { ...MOD },
    publishedAt: at,
  });
  await insertDevThemeAuditRow(client, pub.audit);
  return { fingerprint: v.fingerprint };
}

function sellerLists(
  db: ReturnType<typeof advDb>,
  fingerprint: string,
  hero: string,
  version = "1.0.0",
) {
  db.rows("marketplace_themes").push({
    id: LISTING_ID,
    name: "Aurora Lookbook",
    slug: THEME_SLUG,
    version,
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

beforeEach(() => recorder.reset());

describe("Pass 4 — caller-supplied bytes AND approval are both ignored", () => {
  it("server resolution wins over attacker bytes + attacker snapshot", async () => {
    const db = advDb();
    const good = await sellerPublishes(db, `export const h = 1;`);
    const evil = await sellerPublishes(db, `export const evil = 1;`, T2);
    expect(evil.fingerprint).not.toBe(good.fingerprint);
    sellerLists(db, good.fingerprint, `export const h = 1;`);
    // Attacker crafts a fully valid approval for THEIR bytes (published
    // durably for another fingerprint) and hands both to the install.
    const evilApproval = db
      .rows("dev_theme_releases")
      .find((r) => r.fingerprint === evil.fingerprint)!;
    expect(evilApproval.status).toBe("published");
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING_ID,
      trial: false,
      idempotencyKey: "adv-ignored-1",
      grantedScopes: [],
      consentedBy: ACTOR,
      devThemeFingerprint: good.fingerprint,
      reviewedBundle: bundleInput(`export const evil = 1;`),
      reviewedRelease: {
        id: "attacker-snapshot",
        merchantId: SELLER,
        themeId: THEME_SLUG,
        version: "9.9.9",
        manifest: manifest({ version: "9.9.9" }),
        files: [],
        fileHashes: [],
        fingerprint: evil.fingerprint,
        status: "published",
        submittedBy: "attacker",
        submittedAt: T0,
        reviews: [],
        rollbackOf: null,
        publishedAt: T1,
      },
    } as never)) as unknown as {
      replayed: boolean;
      artifact: { checksum: string; version: string } | null;
    };
    expect(out.replayed).toBe(false);
    // Server truth only: good checksum, good (approval) version.
    expect(out.artifact?.checksum).toBe(good.fingerprint);
    expect(out.artifact?.version).toBe("1.0.0");
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });
});

describe("Pass 4 — revoked-mid-serve at the entry level", () => {
  it("install-then-revoke blocks activation; revoke-then-install refuses", async () => {
    const db = advDb();
    const client = db.asClient() as AdvClient;
    const { fingerprint } = await sellerPublishes(db, `export const h = 1;`);
    sellerLists(db, fingerprint, `export const h = 1;`);
    const first = (await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING_ID,
      trial: false,
      idempotencyKey: "adv-revoke-install-1",
      grantedScopes: [],
      consentedBy: ACTOR,
      devThemeFingerprint: fingerprint,
    })) as unknown as { installId: string };
    const theme = db.rows("store_themes")[0] as { id: string };

    // Moderator revokes between install and activation.
    const rb = await revokeDevThemeRelease(client, {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      fingerprint,
      actor: { ...MOD },
      reason: "post-install violation",
      revokedAt: T2,
    });
    await insertDevThemeAuditRow(client, rb.audit);

    const actErr = await activateDevThemeRelease(client, {
      merchantId: MERCHANT,
      themeId: theme.id,
      installId: first.installId,
      releaseMerchantId: SELLER,
      releaseThemeId: THEME_SLUG,
      fingerprint,
      actorId: ACTOR,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    // The REAL activation gate refuses (its own coded error — the gate is
    // read, never reimplemented).
    expect((actErr as { code?: string }).code).toBe(
      "dev_theme_activate.revoked",
    );
    expect(
      (db.rows("store_themes")[0] as { is_active: boolean }).is_active,
    ).toBe(false);

    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: LISTING_ID,
        trial: false,
        idempotencyKey: "adv-revoke-install-2",
        grantedScopes: [],
        consentedBy: ACTOR,
        devThemeFingerprint: fingerprint,
      }),
    ).rejects.toThrow(/dev_theme_install\.revoked/);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });
});

describe("Pass 4 — rollback refuses every non-approved target", () => {
  it("a rejected target never restores", async () => {
    const db = advDb();
    const client = db.asClient() as AdvClient;
    const v = validateDevThemeBundle(bundleInput());
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
      decision: "reject",
      reason: "malware pattern",
      reviewedAt: T1,
    });
    const err = await rollbackDevThemeRelease(client, {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      targetFingerprint: v.fingerprint,
      actor: { ...MOD },
      rolledBackAt: T2,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DevThemeReviewError);
    expect((err as DevThemeReviewError).code).toBe(
      "dev_theme.approval_required",
    );
  });

  it("an unreviewed (in_review, never approved) target never restores", async () => {
    const db = advDb();
    const client = db.asClient() as AdvClient;
    const v = validateDevThemeBundle(bundleInput());
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
    const err = await rollbackDevThemeRelease(client, {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      targetFingerprint: v.fingerprint,
      actor: { ...MOD },
      rolledBackAt: T2,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DevThemeReviewError);
    expect((err as DevThemeReviewError).code).toBe(
      "dev_theme.approval_required",
    );
  });
});

describe("Pass 4 — update version lies never land on the ledger", () => {
  it("a listing-row version the bytes do not carry is not claimed", async () => {
    const db = advDb();
    const { fingerprint } = await sellerPublishes(db, `export const h = 1;`);
    // Listing row lies about its version; the bundle + approval say 1.0.0.
    sellerLists(db, fingerprint, `export const h = 1;`, "9.9.9");
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING_ID,
      trial: false,
      idempotencyKey: "adv-version-lie-1",
      grantedScopes: [],
      consentedBy: ACTOR,
      devThemeFingerprint: fingerprint,
    })) as unknown as { replayed: boolean };
    expect(out.replayed).toBe(false);
    const row = db.rows("marketplace_installs")[0]!;
    expect(row.version).toBe("1.0.0");
    expect(row.artifact_version).toBe("1.0.0");
  });

  it("post-approval version edits refuse with zero writes", async () => {
    const db = advDb();
    const { fingerprint } = await sellerPublishes(db, `export const h = 1;`);
    sellerLists(db, fingerprint, `export const h = 1;`);
    // Edited bytes (version bumped after approval): a different fingerprint.
    const edited = bundleInput(`export const h = 1;`);
    (edited.manifest as Record<string, unknown>).version = "9.9.9";
    const tampered = {
      ...edited,
      files: [
        file("dev.theme.json", JSON.stringify(edited.manifest)),
        file("components/Hero.js", `export const h = 1;`),
      ],
    };
    // No attach for the edited bytes — but even hand-supplied, they refuse:
    // temporarily detach the seller bundle to prove the gate, not the setup.
    const listing = db.rows("marketplace_themes")[0]!;
    listing.manifest = {
      dev_theme: { theme_id: THEME_SLUG, fingerprint },
    };
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: LISTING_ID,
        trial: false,
        idempotencyKey: "adv-version-edit-1",
        grantedScopes: [],
        consentedBy: ACTOR,
        devThemeFingerprint: fingerprint,
        reviewedBundle: tampered,
      } as never),
    ).rejects.toThrow(/dev_theme_install\.fingerprint_mismatch/);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("theme_assets")).toHaveLength(0);
  });
});

describe("Pass 4 — concurrent submit races deduplicate", () => {
  it("a duplicate-key race on submission returns the existing row", async () => {
    const db = advDb();
    const client = db.asClient() as AdvClient;
    const v = validateDevThemeBundle(bundleInput());
    expect(v.ok).toBe(true);
    if (!v.ok) throw new Error("fixture bundle rejected");
    const input = {
      merchantId: SELLER,
      themeId: THEME_SLUG,
      manifest: v.manifest,
      files: v.files,
      fingerprint: v.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T0,
    };
    const first = await persistDevThemeSubmission(client, input);
    expect(first.deduplicated).toBe(false);
    // Hide the row from the read path once so the second call races past
    // the pre-check into the unique backstop.
    const t = db.asClient() as { from: (table: string) => unknown };
    const inner = t.from.bind(t);
    let hideOnce = true;
    const racy = {
      from: (table: string) => {
        const q = inner(table) as Record<string, (...a: never[]) => unknown>;
        if (table !== "dev_theme_releases" || !hideOnce) return q;
        hideOnce = false;
        return new Proxy(q, {
          get(
            qt: Record<string, (...a: never[]) => unknown>,
            qp: string | symbol,
          ) {
            if (qp === "maybeSingle")
              return async () => ({ data: null, error: null });
            const val = qt[qp as string];
            return typeof val === "function" ? val.bind(qt) : val;
          },
        });
      },
    } as unknown as AdvClient;
    const second = await persistDevThemeSubmission(racy, {
      ...input,
      submittedAt: T2,
    });
    expect(second.deduplicated).toBe(true);
    expect(second.release.id).toBe(first.release.id);
    expect(db.rows("dev_theme_releases")).toHaveLength(1);
  });
});
