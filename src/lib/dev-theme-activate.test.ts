/**
 * Level B install → activation — failing-first vectors.
 *
 * Install writes merchant rows WITHOUT activating (`is_active: false`;
 * pinned by `dev-theme-bundle-install.test.ts`). Activation is a separate
 * fingerprint-bound step (`dev-theme-activate.ts`): only a `published`
 * release carrying an `approve` review for its EXACT fingerprint flips the
 * live flag, and the flip additionally requires the installed rows to carry
 * that same fingerprint (`marketplace_installs.artifact_checksum` +
 * `theme_versions.checksum`). Unapproved, tampered, revoked, or wrong-theme
 * releases refuse BEFORE any flag flips or audit row lands.
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

const {
  resolveDevThemeActivation,
  bindDevThemeRuntime,
  activateDevThemeInstall,
  DevThemeActivationError,
} = await import("./dev-theme-activate");
const { installReviewedThemeBundle } =
  await import("./dev-theme-bundle-install");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const SELLER = "11111111-1111-1111-1111-111111111111";
const ACTOR = "99999999-9999-4999-8999-999999999999";
const LISTING_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THEME_SLUG = "aurora-lookbook";
const ORIGIN = "https://themes.example-cdn.com";

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
    capabilities: ["presentation", "animation"],
    dependencies: [{ ...GSAP_DEP }],
    sections: [{ key: "hero", slot: "main", component: "HeroCanvas" }],
    settings: [{ key: "headline", label: "Headline", type: "text" }],
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

function installedDb() {
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

/** Install exact approved bytes; returns install + host theme ids. */
async function installed(
  db: ReturnType<typeof installedDb>,
  release: DevThemeRelease,
  key: string,
) {
  const out = (await installReviewedThemeBundle(db.asClient(), MERCHANT, {
    release,
    bytes: bundleInput(),
    idempotencyKey: key,
    listing: listingInput(),
    trial: false,
    consentedBy: ACTOR,
    expectedThemeId: THEME_SLUG,
  })) as unknown as { installId: string; artifact: { checksum: string } };
  const theme = db
    .rows("store_themes")
    .find(
      (r) =>
        (r as { source_install_id?: unknown }).source_install_id ===
        out.installId,
    );
  expect(theme).toBeDefined();
  return { installId: out.installId, themeId: (theme as { id: string }).id };
}

beforeEach(() => recorder.reset());

describe("resolveDevThemeActivation — pure approval binding", () => {
  it("resolves a published approval for its exact fingerprint", () => {
    const { release, fingerprint } = approvedBundle();
    const out = resolveDevThemeActivation({
      release,
      expectedFingerprint: fingerprint,
      expectedThemeId: THEME_SLUG,
    });
    expect(out).toMatchObject({
      themeId: THEME_SLUG,
      fingerprint,
      version: "1.0.0",
      runtime: DEV_THEME_RUNTIME_VERSION,
    });
  });

  it("an in_review (never-approved) release never resolves", () => {
    const { release, fingerprint } = submittedOnly();
    expect(() =>
      resolveDevThemeActivation({ release, expectedFingerprint: fingerprint }),
    ).toThrowError(DevThemeActivationError);
    expect(() =>
      resolveDevThemeActivation({ release, expectedFingerprint: fingerprint }),
    ).toThrow(/unapproved/);
  });

  it("a tampered fingerprint never resolves under an old approval", () => {
    const { release } = approvedBundle();
    expect(() =>
      resolveDevThemeActivation({
        release,
        expectedFingerprint: "b".repeat(64),
      }),
    ).toThrow(/fingerprint_mismatch/);
  });

  it("a revoked release never resolves even with exact bytes", () => {
    const { store, release, fingerprint } = approvedBundle();
    store.revoke({
      releaseId: release.id,
      merchantId: SELLER,
      actor: { ...MOD },
      reason: "license violation",
      revokedAt: T1,
    });
    const revoked = store.get(release.id) as DevThemeRelease;
    expect(() =>
      resolveDevThemeActivation({
        release: revoked,
        expectedFingerprint: fingerprint,
      }),
    ).toThrow(/revoked/);
  });

  it("a stale snapshot refuses once the live store revoked it", () => {
    const { store, release, fingerprint } = approvedBundle();
    const snapshot = { ...release };
    store.revoke({
      releaseId: release.id,
      merchantId: SELLER,
      actor: { ...MOD },
      reason: "post-approval violation",
      revokedAt: T1,
    });
    expect(() =>
      resolveDevThemeActivation({
        release: snapshot,
        expectedFingerprint: fingerprint,
        store,
      }),
    ).toThrow(/revoked/);
  });

  it("an approval for another theme never resolves", () => {
    const { release, fingerprint } = approvedBundle();
    expect(() =>
      resolveDevThemeActivation({
        release,
        expectedFingerprint: fingerprint,
        expectedThemeId: "some-other-theme",
      }),
    ).toThrow(/theme_mismatch/);
  });
});

describe("bindDevThemeRuntime — sandbox-only execution binding", () => {
  it("binds a version-pinned URL plus restrictive CSP and scoped grants", () => {
    const { release, fingerprint } = approvedBundle();
    const activation = resolveDevThemeActivation({
      release,
      expectedFingerprint: fingerprint,
    });
    const binding = bindDevThemeRuntime(activation, {
      assetOrigin: ORIGIN,
    });
    expect(binding.url).toBe(`${ORIGIN}/t/${THEME_SLUG}/1.0.0/index.html`);
    expect(binding.csp.startsWith("default-src 'none'")).toBe(true);
    expect(binding.csp).toContain("connect-src 'none'");
    expect(binding.theme).toEqual({ name: THEME_SLUG, version: "1.0.0" });
    // presentation → storefront read; animation is render-only (no bridge scope).
    expect(binding.granted).toContain("theme:storefront:read");
    expect(binding.granted).not.toContain("theme:cart:add");
    expect(binding.navigateAllowlist).toEqual([]);
  });

  it("commerce capabilities widen grants; navigate stays default-deny", () => {
    const { release, fingerprint } = approvedBundle();
    const commerce = {
      ...release,
      manifest: {
        ...release.manifest,
        capabilities: ["presentation", "commerce-read", "cart-write"],
      },
    } as DevThemeRelease;
    const activation = resolveDevThemeActivation({
      release: commerce,
      expectedFingerprint: fingerprint,
    });
    const binding = bindDevThemeRuntime(activation, { assetOrigin: ORIGIN });
    expect(binding.granted).toEqual(
      expect.arrayContaining([
        "theme:storefront:read",
        "theme:variant:select",
        "theme:cart:add",
      ]),
    );
    expect(binding.granted).not.toContain("theme:navigate");
  });

  it("refuses unapproved origins and mutable versions (fail closed, no URL)", () => {
    const { release, fingerprint } = approvedBundle();
    const activation = resolveDevThemeActivation({
      release,
      expectedFingerprint: fingerprint,
    });
    expect(() =>
      bindDevThemeRuntime(activation, { assetOrigin: "http://evil.example/x" }),
    ).toThrow(/origin/);
    expect(() =>
      bindDevThemeRuntime(
        { ...activation, version: "latest" },
        { assetOrigin: ORIGIN },
      ),
    ).toThrow(/version/);
  });
});

describe("activateDevThemeInstall — fingerprint-bound flag flip", () => {
  it("activates exact approved bytes and audits the fingerprint", async () => {
    const db = installedDb();
    const { release, fingerprint } = approvedBundle();
    const { installId, themeId } = await installed(db, release, "dev-act-ok-1");

    const out = await activateDevThemeInstall(db.asClient(), MERCHANT, {
      installId,
      themeId,
      release,
      expectedFingerprint: fingerprint,
      expectedThemeId: THEME_SLUG,
      actorId: ACTOR,
    });
    expect(out).toMatchObject({ themeId, fingerprint });

    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === themeId)!.is_active).toBe(true);
    const audit = db.rows("theme_audit") as {
      action: string;
      after: { fingerprint: string; release_id: string };
    }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "dev_theme.activated" });
    expect(audit[0]!.after.fingerprint).toBe(fingerprint);
  });

  it("deactivates the previously live theme (exactly one active)", async () => {
    const db = installedDb();
    const { release, fingerprint } = approvedBundle();
    const first = await installed(db, release, "dev-act-first-1");
    await activateDevThemeInstall(db.asClient(), MERCHANT, {
      installId: first.installId,
      themeId: first.themeId,
      release,
      expectedFingerprint: fingerprint,
      actorId: ACTOR,
    });
    const second = await installed(db, release, "dev-act-second-1");
    await activateDevThemeInstall(db.asClient(), MERCHANT, {
      installId: second.installId,
      themeId: second.themeId,
      release,
      expectedFingerprint: fingerprint,
      actorId: ACTOR,
    });
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.filter((t) => t.is_active).map((t) => t.id)).toEqual([
      second.themeId,
    ]);
  });

  it("an unapproved release never flips the flag and writes no audit", async () => {
    const db = installedDb();
    const { release: approved, fingerprint } = approvedBundle();
    const { themeId } = await installed(db, approved, "dev-act-unap-1");
    const { release: draft } = submittedOnly();
    await expect(
      activateDevThemeInstall(db.asClient(), MERCHANT, {
        themeId,
        release: draft,
        expectedFingerprint: draft.fingerprint,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/unapproved/);
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === themeId)!.is_active).toBe(false);
    expect(db.rows("theme_audit")).toHaveLength(0);
    void fingerprint;
  });

  it("a tampered fingerprint never activates (no flag, no audit)", async () => {
    const db = installedDb();
    const { release, fingerprint } = approvedBundle();
    const { themeId } = await installed(db, release, "dev-act-tamp-1");
    await expect(
      activateDevThemeInstall(db.asClient(), MERCHANT, {
        themeId,
        release,
        expectedFingerprint: "c".repeat(64),
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/fingerprint_mismatch/);
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === themeId)!.is_active).toBe(false);
    expect(db.rows("theme_audit")).toHaveLength(0);
    void fingerprint;
  });

  it("a revoked release never activates even with exact bytes", async () => {
    const db = installedDb();
    const { store, release, fingerprint } = approvedBundle();
    const { themeId } = await installed(db, release, "dev-act-rev-1");
    store.revoke({
      releaseId: release.id,
      merchantId: SELLER,
      actor: { ...MOD },
      reason: "post-install violation",
      revokedAt: T1,
    });
    const revoked = store.get(release.id) as DevThemeRelease;
    await expect(
      activateDevThemeInstall(db.asClient(), MERCHANT, {
        themeId,
        release: revoked,
        expectedFingerprint: fingerprint,
        store,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/revoked/);
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === themeId)!.is_active).toBe(false);
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  it("a data-only theme row never activates through this lane", async () => {
    const db = installedDb();
    const { release, fingerprint } = approvedBundle();
    // Install the approved bundle, then point the lane at a foreign theme id
    // with no fingerprint-bound rows: the linkage check refuses.
    await installed(db, release, "dev-act-lane-1");
    await expect(
      activateDevThemeInstall(db.asClient(), MERCHANT, {
        themeId: "00000000-0000-4000-8000-000000000000",
        release,
        expectedFingerprint: fingerprint,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/link_mismatch|install_state|theme_mismatch/);
    expect(db.rows("theme_audit")).toHaveLength(0);
  });
});

describe("activateDevThemeInstall — per-version fingerprint binding (frame30 item 9)", () => {
  it("a named version must equal the approved manifest version", () => {
    const { release, fingerprint } = approvedBundle();
    expect(
      resolveDevThemeActivation({
        release,
        expectedFingerprint: fingerprint,
        expectedVersion: "1.0.0",
      }).version,
    ).toBe("1.0.0");
    expect(() =>
      resolveDevThemeActivation({
        release,
        expectedFingerprint: fingerprint,
        expectedVersion: "1.0.1",
      }),
    ).toThrow(/version_mismatch/);
  });

  it("a ledger version skew refuses (fingerprint for 1.0.1 never activates a 1.0.0 row)", async () => {
    const db = installedDb();
    const { release, fingerprint } = approvedBundle();
    const { installId, themeId } = await installed(
      db,
      release,
      "dev-act-skew-1",
    );
    const install = db
      .rows("marketplace_installs")
      .find((r) => (r as { id: unknown }).id === installId) as Record<
      string,
      unknown
    >;
    install.artifact_version = "9.9.9";
    await expect(
      activateDevThemeInstall(db.asClient(), MERCHANT, {
        installId,
        themeId,
        release,
        expectedFingerprint: fingerprint,
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/version_mismatch/);
    const themes = db.rows("store_themes") as {
      id: string;
      is_active: boolean;
    }[];
    expect(themes.find((t) => t.id === themeId)!.is_active).toBe(false);
    expect(db.rows("theme_audit")).toHaveLength(0);
  });

  it("downgrade by fingerprint still needs the exact old fingerprint (no silent version fall)", () => {
    const { release, fingerprint } = approvedBundle();
    // Naming the new version's fingerprint with the old version refuses:
    // a downgrade rides only an explicit rollback audit, never a version lie.
    expect(() =>
      resolveDevThemeActivation({
        release,
        expectedFingerprint: fingerprint,
        expectedVersion: "0.9.0",
      }),
    ).toThrow(/version_mismatch/);
  });
});
