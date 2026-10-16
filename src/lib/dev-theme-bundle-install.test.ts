/**
 * Level B reviewed-bundle ingestion — failing-first vectors.
 *
 * `installReviewedThemeBundle` installs merchant records for an APPROVED,
 * fingerprint-pinned theme bundle version WITHOUT re-validating from scratch
 * as a trust decision, but REFUSING anything whose bytes differ from the
 * approved fingerprint: the presented bytes are re-validated AND re-hashed at
 * install time, and any mismatch with the published approval fails closed
 * with zero writes (no ledger row, no audit row, no host projection).
 *
 * Approval model (no migration): releases have no DB backing yet
 * (`dev-theme-review.ts` is pure; a Supabase backing is a follow-up), so the
 * published approval travels in-memory as a `DevThemeRelease` snapshot the
 * caller looked up via `createDevThemeReleaseStore` (submit → review →
 * publish). The install re-enforces every store invariant on the snapshot
 * (published status + an approve review binding the exact fingerprint), and
 * accepts an optional live `store` to re-verify a release id that may have
 * been revoked after the snapshot was taken.
 *
 * Persistence mapping (existing shapes only, no migration — justified):
 * - ledger: `marketplace_installs` row, same columns `installListing` writes
 *   for theme installs (kind/theme_id/listing identity/version/price/trial/
 *   idempotency/previous_snapshot/expires_at/granted_scopes/consented_by),
 *   plus the FOLLOW-UP artifact identity columns (`artifact_checksum` =
 *   the approved fingerprint, `artifact_version`, `artifact_pinned`) with the
 *   same degrade-to-NULL-on-pre-migration-DB behaviour as
 *   `patchInstallMarketplaceShape`.
 * - audit: `activity_log` via `auditAction` (same shape as
 *   `market.installed`), distinct action `market.dev_theme.installed` so the
 *   fingerprint lane stays grep-able; `changed.after` carries the fingerprint
 *   + release id for forensics.
 * - host projection: `store_themes` + `theme_versions` + `theme_drafts`
 *   triple mirroring `materializeListingTheme` (same columns, same link via
 *   `source_install_id`/`source_listing_slug` so `uninstallThemeInstall` →
 *   `deleteTheme` cascades uniformly). `theme_versions.checksum` carries the
 *   approved fingerprint; templates/tokens are inert `{}` (no AST claim —
 *   executable content is addressed by fingerprint; activation/render is the
 *   runtime follow-up, the install never activates).
 * - money: paid listings charge through `postLedgerEntry` with source
 *   `market.theme.installed`, same as `installListing`.
 *
 * No network, no real database: approvals come from the in-memory review
 * store, persistence goes through fakeDb.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  metricRecorder,
  allowAllRateLimits,
} from "./__fixtures__/test-doubles";
import {
  createDevThemeReleaseStore,
  type DevThemeRelease,
} from "./dev-theme-review";
import {
  validateDevThemeBundle,
  type DevThemeBundleFile,
  type DevThemeBundleInput,
} from "./dev-theme-bundle";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const { installReviewedThemeBundle, getReviewedThemeRef } =
  await import("./dev-theme-bundle-install");
const { installListing } = await import("./marketplace-install.server");
const { bulkInstallStatus } = await import("./marketplace-install.server");

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

/** Submit → approve → publish through the real review store. */
function approvedBundle(hero = `export const h = 1;`) {
  const store = createDevThemeReleaseStore();
  const v = validateDevThemeBundle(bundleInput(hero));
  expect(v.ok).toBe(true);
  if (!v.ok) throw new Error("fixture bundle rejected");
  const { release: submitted } = store.submit({
    merchantId: SELLER,
    themeId: THEME_SLUG,
    manifest: v.manifest,
    files: v.files,
    fingerprint: v.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  store.review({
    releaseId: submitted.id,
    merchantId: SELLER,
    reviewer: { ...MOD },
    decision: "approve",
    reason: "clean scan, fallback proof attached",
    reviewedAt: T1,
  });
  const { release } = store.publish({
    releaseId: submitted.id,
    merchantId: SELLER,
    actor: { ...MOD },
    expectedFingerprint: v.fingerprint,
    publishedAt: T1,
  });
  return {
    store,
    release: release as DevThemeRelease,
    fingerprint: v.fingerprint,
  };
}

function submittedOnly() {
  const store = createDevThemeReleaseStore();
  const v = validateDevThemeBundle(bundleInput());
  expect(v.ok).toBe(true);
  if (!v.ok) throw new Error("fixture bundle rejected");
  const { release } = store.submit({
    merchantId: SELLER,
    themeId: THEME_SLUG,
    manifest: v.manifest,
    files: v.files,
    fingerprint: v.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  return {
    store,
    release: release as DevThemeRelease,
    fingerprint: v.fingerprint,
  };
}

function listingInput(priceMinor = 0) {
  return {
    id: LISTING_ID,
    slug: THEME_SLUG,
    name: "Aurora Lookbook",
    version: "1.0.0",
    price_minor_int: priceMinor,
    currency_code: "BDT",
    seller_merchant_id: SELLER,
    install_count: 0,
  };
}

function installDb() {
  return fakeDb({
    tables: {
      marketplace_themes: [],
      marketplace_installs: [],
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      activity_log: [],
      theme_audit: [],
      wallet_ledger_entries: [],
    },
  });
}

function writeCounts(db: ReturnType<typeof fakeDb>) {
  return {
    installs: db.rows("marketplace_installs").length,
    themes: db.rows("store_themes").length,
    versions: db.rows("theme_versions").length,
    drafts: db.rows("theme_drafts").length,
    audit: db.rows("activity_log").length,
    ledger: db.rows("wallet_ledger_entries").length,
  };
}

beforeEach(() => recorder.reset());

describe("installReviewedThemeBundle — failing first: unapproved bytes never install", () => {
  it("an in_review (never-approved) release refuses with zero writes", async () => {
    const db = installDb();
    const { release } = submittedOnly();
    await expect(
      installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release,
        bytes: bundleInput(),
        idempotencyKey: "dev-theme-unapproved-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: THEME_SLUG,
      }),
    ).rejects.toThrow(/dev_theme_install\.unapproved/);
    expect(writeCounts(db)).toEqual({
      installs: 0,
      themes: 0,
      versions: 0,
      drafts: 0,
      audit: 0,
      ledger: 0,
    });
  });

  it("modified bytes (one changed byte) refuse with fingerprint_mismatch and zero writes", async () => {
    const db = installDb();
    const { release, fingerprint } = approvedBundle();
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release,
        bytes: bundleInput(`export const h = 999;`),
        idempotencyKey: "dev-theme-tampered-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: THEME_SLUG,
      }),
    ).rejects.toThrow(/dev_theme_install\.fingerprint_mismatch/);
    expect(writeCounts(db)).toEqual({
      installs: 0,
      themes: 0,
      versions: 0,
      drafts: 0,
      audit: 0,
      ledger: 0,
    });
  });

  it("a revoked release refuses with zero writes even when the bytes are exact", async () => {
    const db = installDb();
    const { store, release } = approvedBundle();
    store.revoke({
      releaseId: release.id,
      merchantId: SELLER,
      actor: { ...MOD },
      reason: "license violation",
      revokedAt: T1,
    });
    const revoked = store.get(release.id) as DevThemeRelease;
    expect(revoked.status).toBe("revoked");
    await expect(
      installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release: revoked,
        bytes: bundleInput(),
        idempotencyKey: "dev-theme-revoked-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: THEME_SLUG,
      }),
    ).rejects.toThrow(/dev_theme_install\.revoked/);
    expect(writeCounts(db)).toEqual({
      installs: 0,
      themes: 0,
      versions: 0,
      drafts: 0,
      audit: 0,
      ledger: 0,
    });
  });

  it("a live store re-check refuses when the release was revoked after the snapshot", async () => {
    const db = installDb();
    const { store, release } = approvedBundle();
    const snapshot = { ...release };
    store.revoke({
      releaseId: release.id,
      merchantId: SELLER,
      actor: { ...MOD },
      reason: "post-approval violation",
      revokedAt: T1,
    });
    await expect(
      installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release: snapshot,
        bytes: bundleInput(),
        idempotencyKey: "dev-theme-stale-approval-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: THEME_SLUG,
        store,
      }),
    ).rejects.toThrow(/dev_theme_install\.revoked/);
    expect(writeCounts(db).installs).toBe(0);
  });

  it("structurally invalid bytes refuse with invalid_bundle before any fingerprint trust", async () => {
    const db = installDb();
    const { release } = approvedBundle();
    const m = manifest();
    const bad: DevThemeBundleInput = {
      manifest: m,
      files: [
        file("dev.theme.json", JSON.stringify(m)),
        file("components/Evil.js", `require("child_process").exec("id")`),
      ],
      dependencies: [{ ...GSAP_DEP }],
      allowedNetworkHosts: [],
    };
    await expect(
      installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release,
        bytes: bad,
        idempotencyKey: "dev-theme-invalid-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: THEME_SLUG,
      }),
    ).rejects.toThrow(/dev_theme_install\.invalid_bundle/);
    expect(writeCounts(db).installs).toBe(0);
  });

  it("a release bound to another theme refuses with theme_mismatch", async () => {
    const db = installDb();
    const { release } = approvedBundle();
    await expect(
      installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release,
        bytes: bundleInput(),
        idempotencyKey: "dev-theme-wrong-theme-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: "some-other-theme",
      }),
    ).rejects.toThrow(/dev_theme_install\.theme_mismatch/);
    expect(writeCounts(db).installs).toBe(0);
  });
});

describe("installReviewedThemeBundle — success writes ledger + audit + host projection", () => {
  it("exact approved bytes install one ledger row, one audit row, and the theme triple", async () => {
    const db = installDb();
    const { release, fingerprint } = approvedBundle();
    const out = (await installReviewedThemeBundle(db.asClient(), MERCHANT, {
      release,
      bytes: bundleInput(),
      idempotencyKey: "dev-theme-ok-1",
      listing: listingInput(),
      trial: false,
      consentedBy: ACTOR,
      expectedThemeId: THEME_SLUG,
    })) as unknown as {
      installId: string;
      replayed: boolean;
      artifact: { checksum: string; version: string; pinned: string } | null;
    };

    expect(out.replayed).toBe(false);
    expect(out.artifact).toMatchObject({
      checksum: fingerprint,
      version: "1.0.0",
    });

    const installs = db.rows("marketplace_installs");
    expect(installs).toHaveLength(1);
    expect(installs[0]).toMatchObject({
      id: out.installId,
      merchant_id: MERCHANT,
      kind: "theme",
      theme_id: LISTING_ID,
      listing_slug: THEME_SLUG,
      version: "1.0.0",
      status: "installed",
      idempotency_key: "dev-theme-ok-1",
      artifact_checksum: fingerprint,
    });
    expect(installs[0]!.consented_by).toBe(ACTOR);

    const log = db.rows("activity_log");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      merchant_id: MERCHANT,
      actor: ACTOR,
      action: "market.dev_theme.installed",
      resource_type: "theme",
      resource_id: out.installId,
    });
    expect(
      (log[0]!.changed as { after: { fingerprint: string } }).after.fingerprint,
    ).toBe(fingerprint);

    const themes = db.rows("store_themes");
    expect(themes).toHaveLength(1);
    expect(themes[0]).toMatchObject({
      merchant_id: MERCHANT,
      name: "Aurora Lookbook",
      is_active: false,
      source_install_id: out.installId,
      source_listing_slug: THEME_SLUG,
    });
    const versions = db.rows("theme_versions");
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      merchant_id: MERCHANT,
      theme_id: themes[0]!.id,
      checksum: fingerprint,
    });
    expect(db.rows("theme_drafts")).toHaveLength(1);
    expect(db.rows("theme_drafts")[0]).toMatchObject({
      merchant_id: MERCHANT,
      theme_id: themes[0]!.id,
    });
    // Free listing: no money moves.
    expect(db.rows("wallet_ledger_entries")).toHaveLength(0);
  });

  it("replays the same idempotency key without stacking rows", async () => {
    const db = installDb();
    const { release } = approvedBundle();
    const input = {
      release,
      bytes: bundleInput(),
      idempotencyKey: "dev-theme-replay-1",
      listing: listingInput(),
      trial: false as const,
      consentedBy: ACTOR,
      expectedThemeId: THEME_SLUG,
    };
    const first = (await installReviewedThemeBundle(db.asClient(), MERCHANT, {
      ...input,
    })) as unknown as { installId: string; replayed: boolean };
    expect(first.replayed).toBe(false);
    const second = (await installReviewedThemeBundle(db.asClient(), MERCHANT, {
      ...input,
    })) as unknown as { installId: string; replayed: boolean; artifact: null };
    expect(second.replayed).toBe(true);
    expect(second.installId).toBe(first.installId);
    expect(second.artifact).toBeNull();
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(db.rows("store_themes")).toHaveLength(1);
  });

  it("a paid listing charges the money ledger with the theme-installed source", async () => {
    const db = installDb();
    const { release, fingerprint } = approvedBundle();
    const out = (await installReviewedThemeBundle(db.asClient(), MERCHANT, {
      release,
      bytes: bundleInput(),
      idempotencyKey: "dev-theme-paid-1",
      listing: listingInput(500),
      trial: false,
      consentedBy: ACTOR,
      expectedThemeId: THEME_SLUG,
    })) as unknown as { installId: string };
    const entries = db.rows("wallet_ledger_entries");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      merchant_id: MERCHANT,
      source: "market.theme.installed",
      reference_id: out.installId,
      gross_minor_int: 500,
      idempotency_key: "dev-theme-paid-1",
    });
    expect(db.rows("marketplace_installs")[0]!.price_minor_int).toBe(500);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the host projection uninstalls through the existing theme lifecycle path", async () => {
    const db = installDb();
    const { release } = approvedBundle();
    const out = (await installReviewedThemeBundle(db.asClient(), MERCHANT, {
      release,
      bytes: bundleInput(),
      idempotencyKey: "dev-theme-uninstall-1",
      listing: listingInput(),
      trial: false,
      consentedBy: ACTOR,
      expectedThemeId: THEME_SLUG,
    })) as unknown as { installId: string };
    const gone = await bulkInstallStatus(
      db.asClient(),
      MERCHANT,
      ACTOR,
      [out.installId],
      "delete",
    );
    expect(gone.results[0]).toMatchObject({
      installId: out.installId,
      ok: true,
    });
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("theme_versions")).toHaveLength(0);
    expect(db.rows("theme_drafts")).toHaveLength(0);
    expect(db.rows("marketplace_installs")[0]!.status).toBe("removed");
  });
});

describe("getReviewedThemeRef — reviewed-theme listing detection", () => {
  it("detects a dev_theme approval marker", () => {
    const fp = "a".repeat(64);
    expect(
      getReviewedThemeRef({
        dev_theme: { theme_id: THEME_SLUG, fingerprint: fp },
      }),
    ).toEqual({ themeId: THEME_SLUG, fingerprint: fp });
  });

  it("ignores data-only, widget, and empty manifests (legacy lanes unaffected)", () => {
    expect(getReviewedThemeRef({ templates: { index: {} } })).toBeNull();
    expect(
      getReviewedThemeRef({ entry: "x", permissions: ["read_shop"] }),
    ).toBeNull();
    expect(getReviewedThemeRef({})).toBeNull();
    expect(getReviewedThemeRef(null)).toBeNull();
  });

  it("ignores malformed markers (never enters the lane on seller-shaped metadata)", () => {
    expect(
      getReviewedThemeRef({
        dev_theme: { theme_id: THEME_SLUG, fingerprint: "zzz" },
      }),
    ).toBeNull();
    expect(getReviewedThemeRef({ dev_theme: { theme_id: "  " } })).toBeNull();
    expect(getReviewedThemeRef({ dev_theme: "aurora-lookbook" })).toBeNull();
  });
});

describe("installListing — reviewed-theme hook (builtin + custom-ZIP branches untouched)", () => {
  function hookDb(priceMinor = 0) {
    const { fingerprint } = approvedBundle();
    return {
      db: fakeDb({
        tables: {
          marketplace_themes: [
            {
              id: LISTING_ID,
              name: "Aurora Lookbook",
              slug: THEME_SLUG,
              version: "1.0.0",
              status: "active",
              seller_merchant_id: SELLER,
              price_minor_int: priceMinor,
              currency_code: "BDT",
              trial_allowed: true,
              compatible_versions: [],
              install_count: 0,
              manifest: {
                dev_theme: { theme_id: THEME_SLUG, fingerprint },
              },
            },
          ],
          marketplace_installs: [],
          store_themes: [],
          theme_versions: [],
          theme_drafts: [],
          activity_log: [],
          theme_audit: [],
          wallet_ledger_entries: [],
        },
      }),
      fingerprint,
    };
  }

  function approvalFor() {
    return approvedBundle().release;
  }

  it("fails closed without presented bytes (a reviewed listing never installs blind)", async () => {
    const { db } = hookDb();
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: LISTING_ID,
        trial: false,
        idempotencyKey: "hook-no-bytes-1",
        grantedScopes: [],
        consentedBy: ACTOR,
        // Approval present (durable-absent legacy path): the refusal must
        // name the missing BYTES, proving a reviewed listing never installs
        // blind even when the approval checks out.
        reviewedRelease: approvalFor(),
      } as never),
    ).rejects.toThrow(/dev_theme_install\.bytes_required/);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("fails closed without the published approval", async () => {
    const { db } = hookDb();
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: LISTING_ID,
        trial: false,
        idempotencyKey: "hook-no-approval-1",
        grantedScopes: [],
        consentedBy: ACTOR,
        reviewedBundle: bundleInput(),
      } as never),
    ).rejects.toThrow(/dev_theme_install\.approval_required/);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("installs exact approved bytes through the fingerprint lane", async () => {
    const { db, fingerprint } = hookDb();
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING_ID,
      trial: false,
      idempotencyKey: "hook-ok-1",
      grantedScopes: [],
      consentedBy: ACTOR,
      reviewedBundle: bundleInput(),
      reviewedRelease: approvalFor(),
    } as never)) as unknown as {
      installId: string;
      replayed: boolean;
      artifact: { checksum: string } | null;
    };
    expect(out.replayed).toBe(false);
    expect(out.artifact?.checksum).toBe(fingerprint);
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    expect(db.rows("store_themes")).toHaveLength(1);
    expect(db.rows("theme_versions")[0]!.checksum).toBe(fingerprint);
  });

  it("refuses tampered bytes at the listing entry (no ledger row, no projection)", async () => {
    const { db } = hookDb();
    await expect(
      installListing(db.asClient(), MERCHANT, {
        kind: "theme",
        listingId: LISTING_ID,
        trial: false,
        idempotencyKey: "hook-tampered-1",
        grantedScopes: [],
        consentedBy: ACTOR,
        reviewedBundle: bundleInput(`export const h = 2;`),
        reviewedRelease: approvalFor(),
      } as never),
    ).rejects.toThrow(/dev_theme_install\.fingerprint_mismatch/);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("store_themes")).toHaveLength(0);
    expect(db.rows("activity_log")).toHaveLength(0);
  });

  it("a legacy data-only theme listing still installs ledger-only (lane not entered)", async () => {
    const db = fakeDb({
      tables: {
        marketplace_themes: [
          {
            id: LISTING_ID,
            name: "Legacy Theme",
            slug: "legacy-theme",
            version: "1.0.0",
            status: "active",
            seller_merchant_id: SELLER,
            price_minor_int: 0,
            currency_code: "BDT",
            trial_allowed: false,
            compatible_versions: [],
            install_count: 0,
            manifest: {
              // No templates key → no usable AST → legitimately ledger-only.
              permissions: ["render_storefront"],
            },
          },
        ],
        marketplace_installs: [],
        store_themes: [],
        theme_versions: [],
        theme_drafts: [],
        activity_log: [],
        theme_audit: [],
        wallet_ledger_entries: [],
      },
    });
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING_ID,
      trial: false,
      idempotencyKey: "hook-legacy-1",
      grantedScopes: ["render_storefront"],
      consentedBy: ACTOR,
    })) as unknown as { installId: string; replayed: boolean; artifact: null };
    expect(out.replayed).toBe(false);
    expect(out.artifact).toBeNull();
    expect(db.rows("marketplace_installs")).toHaveLength(1);
    // No usable AST → legitimately ledger-only, exactly as before.
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("a malformed dev_theme marker does not enter the lane (legacy fallback, never a crash)", async () => {
    const db = fakeDb({
      tables: {
        marketplace_themes: [
          {
            id: LISTING_ID,
            name: "Sloppy Theme",
            slug: "sloppy-theme",
            version: "1.0.0",
            status: "active",
            seller_merchant_id: SELLER,
            price_minor_int: 0,
            currency_code: "BDT",
            trial_allowed: false,
            compatible_versions: [],
            install_count: 0,
            manifest: {
              dev_theme: { theme_id: THEME_SLUG, fingerprint: "not-hex" },
              permissions: ["render_storefront"],
            },
          },
        ],
        marketplace_installs: [],
        store_themes: [],
        theme_versions: [],
        theme_drafts: [],
        activity_log: [],
        theme_audit: [],
        wallet_ledger_entries: [],
      },
    });
    const out = (await installListing(db.asClient(), MERCHANT, {
      kind: "theme",
      listingId: LISTING_ID,
      trial: false,
      idempotencyKey: "hook-malformed-marker-1",
      grantedScopes: ["render_storefront"],
      consentedBy: ACTOR,
    })) as unknown as { replayed: boolean; artifact: null };
    expect(out.replayed).toBe(false);
    expect(out.artifact).toBeNull();
    expect(db.rows("marketplace_installs")).toHaveLength(1);
  });
});
