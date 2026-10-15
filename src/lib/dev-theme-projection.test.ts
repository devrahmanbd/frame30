/**
 * Level B close-out Pass 1 — server projection of the approved ACTIVE
 * release onto the workspace theme (TDD).
 *
 * The builder route already reads `workspace.theme.approvedDevManifest`
 * (fail-closed to no defs until projected) and the renderer accepts a
 * `DevThemeBinding` that stays a placeholder until pinned identity AND
 * version match. This suite pins the server lane that fills both:
 *
 * - `projectDevThemeBinding` (pure): given an active workspace theme whose
 *   source is an approved Level B release, return the approved manifest
 *   (for the `activeDevThemeWidgetDefs` adapt) plus the binding inputs
 *   (allow-listed asset origin, pinned name+version, least-privilege
 *   grants). Unapproved / inactive / missing / foreign / tampered inputs
 *   yield null — never a default-allow.
 * - `loadDevThemeProjection` (loader): resolves the same from merchant
 *   rows (install linkage + dual checksum corroboration + fingerprinted
 *   bytes + stored approval snapshot through the REAL
 *   `resolveDevThemeActivation` gate). Any gap yields null.
 * - `loadWorkspace` attaches `approvedDevManifest` + `devThemeBinding`
 *   only for the projected release; everything else stays absent.
 *
 * No network, no real database: approvals come from the real in-memory
 * review store, persistence goes through fakeDb.
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
  fingerprintDevThemeRelease,
  type DevThemeBundleFile,
  type DevThemeBundleInput,
} from "./dev-theme-bundle";
import { assembleDevThemeBundle } from "./dev-theme-bundle-assemble";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const {
  projectDevThemeBinding,
  loadDevThemeProjection,
  loadWorkspace,
  devThemeAssetOrigin,
} = await import("./themes.server");

const MERCHANT = "22222222-2222-2222-2222-222222222222";
const SELLER = "11111111-1111-1111-1111-111111111111";
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

beforeEach(() => recorder.reset());

describe("devThemeAssetOrigin — allow-listed origin, never a default", () => {
  it("accepts an https origin and http loopback, refuses everything else", () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    try {
      process.env.DEV_THEME_ASSET_ORIGIN = ORIGIN;
      expect(devThemeAssetOrigin()).toBe(ORIGIN);
      process.env.DEV_THEME_ASSET_ORIGIN = "http://localhost:3000";
      expect(devThemeAssetOrigin()).toBe("http://localhost:3000");
      process.env.DEV_THEME_ASSET_ORIGIN = "http://evil.example/x";
      expect(devThemeAssetOrigin()).toBeNull();
      process.env.DEV_THEME_ASSET_ORIGIN = "https://themes.example-cdn.com/x";
      expect(devThemeAssetOrigin()).toBeNull();
      process.env.DEV_THEME_ASSET_ORIGIN = "https://evil.example.com";
      expect(devThemeAssetOrigin()).toBe("https://evil.example.com");
      delete process.env.DEV_THEME_ASSET_ORIGIN;
      expect(devThemeAssetOrigin()).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });
});

describe("projectDevThemeBinding — pure server projection", () => {
  it("projects the approved ACTIVE release: manifest + pinned binding inputs", () => {
    const { release, fingerprint } = approvedBundle();
    const out = projectDevThemeBinding({
      isActive: true,
      sourceKey: THEME_SLUG,
      installedFingerprint: fingerprint,
      release,
      assetOrigin: ORIGIN,
    });
    expect(out).not.toBeNull();
    expect(out!.manifest.id).toBe(THEME_SLUG);
    expect(out!.manifest.version).toBe("1.0.0");
    expect(out!.binding).toMatchObject({
      assetOrigin: ORIGIN,
      theme: { name: THEME_SLUG, version: "1.0.0" },
      fingerprint,
      navigateAllowlist: [],
    });
    // presentation → storefront read; animation is render-only (no scope).
    expect(out!.binding.granted).toContain("theme:storefront:read");
    expect(out!.binding.granted).not.toContain("theme:cart:add");
    expect(out!.binding.granted).not.toContain("theme:navigate");
  });

  it("inactive, unkeyed, or missing releases project to null", () => {
    const { release, fingerprint } = approvedBundle();
    const base = {
      isActive: true as unknown,
      sourceKey: THEME_SLUG as unknown,
      installedFingerprint: fingerprint as unknown,
      release: release as unknown,
      assetOrigin: ORIGIN as unknown,
    };
    expect(projectDevThemeBinding({ ...base, isActive: false })).toBeNull();
    expect(projectDevThemeBinding({ ...base, isActive: 0 })).toBeNull();
    expect(projectDevThemeBinding({ ...base, sourceKey: "" })).toBeNull();
    expect(projectDevThemeBinding({ ...base, sourceKey: null })).toBeNull();
    expect(
      projectDevThemeBinding({ ...base, installedFingerprint: null }),
    ).toBeNull();
    expect(projectDevThemeBinding({ ...base, release: null })).toBeNull();
    expect(projectDevThemeBinding({ ...base, release: undefined })).toBeNull();
    expect(projectDevThemeBinding({ ...base, assetOrigin: null })).toBeNull();
    expect(
      projectDevThemeBinding({ ...base, assetOrigin: "not-a-url" }),
    ).toBeNull();
    expect(
      projectDevThemeBinding({
        ...base,
        assetOrigin: "http://evil.example/asset",
      }),
    ).toBeNull();
  });

  it("an unapproved (in_review) release never projects", () => {
    const { release, fingerprint } = submittedOnly();
    expect(
      projectDevThemeBinding({
        isActive: true,
        sourceKey: THEME_SLUG,
        installedFingerprint: fingerprint,
        release,
        assetOrigin: ORIGIN,
      }),
    ).toBeNull();
  });

  it("a revoked release never projects even with exact bytes", () => {
    const { store, release, fingerprint } = approvedBundle();
    store.revoke({
      releaseId: release.id,
      merchantId: SELLER,
      actor: { ...MOD },
      reason: "license violation",
      revokedAt: T1,
    });
    const revoked = store.get(release.id) as DevThemeRelease;
    expect(
      projectDevThemeBinding({
        isActive: true,
        sourceKey: THEME_SLUG,
        installedFingerprint: fingerprint,
        release: revoked,
        assetOrigin: ORIGIN,
      }),
    ).toBeNull();
  });

  it("a tampered installed fingerprint never projects under an old approval", () => {
    const { release } = approvedBundle();
    expect(
      projectDevThemeBinding({
        isActive: true,
        sourceKey: THEME_SLUG,
        installedFingerprint: "b".repeat(64),
        release,
        assetOrigin: ORIGIN,
      }),
    ).toBeNull();
  });

  it("a foreign-theme approval never projects onto this workspace", () => {
    const { release, fingerprint } = approvedBundle();
    expect(
      projectDevThemeBinding({
        isActive: true,
        sourceKey: "some-other-theme",
        installedFingerprint: fingerprint,
        release,
        assetOrigin: ORIGIN,
      }),
    ).toBeNull();
  });

  it("a hand-built approval snapshot without a bound review never projects", () => {
    const { release, fingerprint } = approvedBundle();
    const forged = { ...release, reviews: [] };
    expect(
      projectDevThemeBinding({
        isActive: true,
        sourceKey: THEME_SLUG,
        installedFingerprint: fingerprint,
        release: forged,
        assetOrigin: ORIGIN,
      }),
    ).toBeNull();
  });

  it("never throws on hostile shapes", () => {
    expect(
      projectDevThemeBinding({
        isActive: true,
        sourceKey: THEME_SLUG,
        installedFingerprint: "x",
        release: { nope: true },
        assetOrigin: ORIGIN,
      }),
    ).toBeNull();
    expect(projectDevThemeBinding(null)).toBeNull();
    expect(projectDevThemeBinding(undefined)).toBeNull();
  });
});

describe("loadDevThemeProjection + loadWorkspace — loader wiring", () => {
  const INSTALL_ID = "33333333-3333-4333-8333-333333333333";
  const THEME_ID = "44444444-4444-4444-8444-444444444444";

  /** Merchant rows for an installed + activated Level B theme, with the
   * fingerprinted asset + approval rows the install lane persists. */
  function projectedDb(release: DevThemeRelease, fingerprint: string) {
    const assembled = assembleDevThemeBundle({
      manifestJson: manifest(),
      files: bundleInput().files,
      dependencies: [{ ...GSAP_DEP }],
      allowedNetworkHosts: [],
    });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) throw new Error("fixture assemble refused");
    const assetName = (outPath: string) =>
      `dev-themes/${THEME_SLUG}/1.0.0/${outPath}`;
    const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
    const toB64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
    const isText = (p: string) => /\.(js|mjs|cjs|css|map|json|svg)$/.test(p);
    return fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME_ID,
            merchant_id: MERCHANT,
            name: "Aurora Lookbook",
            is_active: true,
            published_version_id: null,
            source_listing_slug: THEME_SLUG,
            source_version: "1.0.0",
            source_install_id: INSTALL_ID,
          },
        ],
        theme_versions: [
          {
            id: "v1",
            merchant_id: MERCHANT,
            theme_id: THEME_ID,
            version: 1,
            status: "draft",
            checksum: fingerprint,
            templates: {},
            tokens: {},
          },
        ],
        theme_drafts: [
          {
            theme_id: THEME_ID,
            templates: {},
            tokens: {},
            revision: 1,
            updated_at: T1,
          },
        ],
        theme_schedules: [],
        marketplace_installs: [
          {
            id: INSTALL_ID,
            merchant_id: MERCHANT,
            kind: "theme",
            artifact_checksum: fingerprint,
            artifact_version: "1.0.0",
            artifact_pinned: `dev-theme:${release.id}`,
            status: "installed",
          },
        ],
        theme_assets: [
          ...assembled.outputs.map((o) => ({
            merchant_id: MERCHANT,
            theme_id: THEME_ID,
            name: assetName(o.path),
            kind: "json",
            content: isText(o.path) ? text(o.bytes) : toB64(o.bytes),
            url: `/t/${THEME_SLUG}/1.0.0/${o.path}`,
            bytes: o.bytes.length,
            enabled: true,
          })),
          {
            merchant_id: MERCHANT,
            theme_id: THEME_ID,
            name: `dev-themes/${THEME_SLUG}/1.0.0/release.json`,
            kind: "json",
            content: assembled.releaseJson,
            url: null,
            bytes: assembled.releaseJson.length,
            enabled: true,
          },
          {
            merchant_id: MERCHANT,
            theme_id: THEME_ID,
            name: `dev-themes/${THEME_SLUG}/1.0.0/.approval.json`,
            kind: "json",
            content: JSON.stringify(release),
            url: null,
            bytes: JSON.stringify(release).length,
            enabled: true,
          },
        ],
      },
    });
  }

  it("loads the approved manifest + binding for the active approved theme", async () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    process.env.DEV_THEME_ASSET_ORIGIN = ORIGIN;
    try {
      const { release, fingerprint } = approvedBundle();
      const db = projectedDb(release, fingerprint);
      const out = await loadDevThemeProjection(db.asClient(), MERCHANT, {
        themeId: THEME_ID,
        isActive: true,
        sourceKey: THEME_SLUG,
        sourceInstallId: INSTALL_ID,
        versionChecksums: [fingerprint],
      });
      expect(out).not.toBeNull();
      expect(out!.manifest.id).toBe(THEME_SLUG);
      expect(out!.binding.theme).toEqual({
        name: THEME_SLUG,
        version: "1.0.0",
      });
      expect(out!.binding.fingerprint).toBe(fingerprint);
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });

  it("fail-closed: checksum mismatch, tampered bytes, or tampered approval → null", async () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    process.env.DEV_THEME_ASSET_ORIGIN = ORIGIN;
    try {
      const { release, fingerprint } = approvedBundle();
      // Version rows disagree with the install ledger.
      const skewed = projectedDb(release, fingerprint);
      skewed.rows("theme_versions")[0]!.checksum = "c".repeat(64);
      expect(
        await loadDevThemeProjection(skewed.asClient(), MERCHANT, {
          themeId: THEME_ID,
          isActive: true,
          sourceKey: THEME_SLUG,
          sourceInstallId: INSTALL_ID,
          versionChecksums: ["c".repeat(64)],
        }),
      ).toBeNull();
      // Tampered dev.theme.json bytes (hash no longer in the release).
      const tampered = projectedDb(release, fingerprint);
      const manifestRow = tampered
        .rows("theme_assets")
        .find((r) => String(r.name).endsWith("dev.theme.json"))!;
      manifestRow.content = String(manifestRow.content).replace(
        "Aurora Lookbook",
        "Evil Lookbook",
      );
      expect(
        await loadDevThemeProjection(tampered.asClient(), MERCHANT, {
          themeId: THEME_ID,
          isActive: true,
          sourceKey: THEME_SLUG,
          sourceInstallId: INSTALL_ID,
          versionChecksums: [fingerprint],
        }),
      ).toBeNull();
      // Tampered approval snapshot (reviews stripped) → the real gate refuses.
      const stripped = projectedDb(release, fingerprint);
      const approvalRow = stripped
        .rows("theme_assets")
        .find((r) => String(r.name).endsWith(".approval.json"))!;
      approvalRow.content = JSON.stringify({ ...release, reviews: [] });
      expect(
        await loadDevThemeProjection(stripped.asClient(), MERCHANT, {
          themeId: THEME_ID,
          isActive: true,
          sourceKey: THEME_SLUG,
          sourceInstallId: INSTALL_ID,
          versionChecksums: [fingerprint],
        }),
      ).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });

  it("loadWorkspace attaches the projection only for the approved active theme", async () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    process.env.DEV_THEME_ASSET_ORIGIN = ORIGIN;
    try {
      const { release, fingerprint } = approvedBundle();
      const db = projectedDb(release, fingerprint);
      const workspace = await loadWorkspace(db.asClient(), MERCHANT);
      expect(workspace.theme.isActive).toBe(true);
      const theme = workspace.theme as unknown as Record<string, unknown>;
      expect(
        (theme.approvedDevManifest as { id?: unknown } | undefined)?.id,
      ).toBe(THEME_SLUG);
      expect(
        (theme.devThemeBinding as { theme?: { name?: unknown } } | undefined)
          ?.theme?.name,
      ).toBe(THEME_SLUG);
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });

  it("loadWorkspace leaves the seam absent for data-only / inactive themes", async () => {
    const db = fakeDb({
      tables: {
        store_themes: [
          {
            id: THEME_ID,
            merchant_id: MERCHANT,
            name: "Classic",
            is_active: true,
            published_version_id: null,
            source_listing_slug: "classic",
            source_version: "1.0.0",
            source_install_id: null,
          },
        ],
        theme_versions: [],
        theme_drafts: [],
        theme_schedules: [],
        marketplace_installs: [],
        theme_assets: [],
      },
    });
    const workspace = await loadWorkspace(db.asClient(), MERCHANT);
    const theme = workspace.theme as unknown as Record<string, unknown>;
    expect(theme.approvedDevManifest).toBeUndefined();
    expect(theme.devThemeBinding).toBeUndefined();
  });
});
