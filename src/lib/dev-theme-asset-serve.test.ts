/**
 * Level B close-out Pass 2 — asset serving from the REAL bound origin path
 * (TDD).
 *
 * The binding mints the URL contract `/t/{themeId}/{version}/…` but no rows
 * backed it. This suite pins both halves of the close-out:
 *
 * - INSTALL persists the assembled hashed bundle bytes into `theme_assets`
 *   (`dev-themes/<themeId>/<version>/…` outputs + the `release.json`
 *   descriptor + the `.approval.json` snapshot) — refused installs persist
 *   nothing.
 * - SERVE (`parseDevThemeAssetPath` + `resolveDevThemeAsset`, read by the
 *   thin `src/routes/t.$.ts` route): immutable caching, exact-version
 *   pinning (no `latest`), traversal-safe decoding, content-type
 *   correctness (js/css/map/json/font/image, `nosniff` everywhere,
 *   `sandbox` on SVG), per-file sha256 assertion against the fingerprinted
 *   approval (never serve bytes that fail the release fingerprint), and 404
 *   on unknown versions, ambiguous releases, missing entries, tampered
 *   bytes/maps/approvals, and oversized rows. `index.html` is not an
 *   assembled output, so it 404s fail-closed.
 *
 * No network, no real database: real review store + real assembler +
 * fakeDb.
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
import { assembleDevThemeBundle } from "./dev-theme-bundle-assemble";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";

type Recorder = ReturnType<typeof metricRecorder>;
const rec = vi.hoisted(() => ({ holder: null as Recorder | null }));
const recorder = metricRecorder();
rec.holder = recorder;

vi.mock("./observability.server", () => rec.holder!.observability);
vi.mock("./rate-limit.server", () => allowAllRateLimits());

const {
  parseDevThemeAssetPath,
  devThemeAssetContentType,
  devThemeAssetEncoding,
  devThemeAssetKind,
  resolveDevThemeAsset,
  loadDevThemeProjection,
} = await import("./themes.server");
const { installReviewedThemeBundle } =
  await import("./dev-theme-bundle-install");

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

const HERO_JS = `export function HeroCanvas(el, props) { el.textContent = props.headline; }`;
const MAIN_CSS = `.hero{color:red}`;
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/></svg>`;
const MARK_PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: THEME_SLUG,
    version: "1.0.0",
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation"],
    dependencies: [{ ...GSAP_DEP }],
    sections: [{ key: "hero", slot: "main", component: "HeroCanvas" }],
    settings: [{ key: "headline", label: "Headline", type: "text" }],
    ...over,
  };
}

function bundleInput(hero = HERO_JS): DevThemeBundleInput {
  const m = manifest();
  return {
    manifest: m,
    files: [
      {
        path: "dev.theme.json",
        bytes: new TextEncoder().encode(JSON.stringify(m)),
      },
      { path: "components/Hero.js", bytes: new TextEncoder().encode(hero) },
      { path: "styles/main.css", bytes: new TextEncoder().encode(MAIN_CSS) },
      { path: "assets/logo.svg", bytes: new TextEncoder().encode(LOGO_SVG) },
      { path: "assets/mark.png", bytes: MARK_PNG },
      {
        path: "locales/en.json",
        bytes: new TextEncoder().encode(JSON.stringify({ headline: "Hi" })),
      },
    ],
    dependencies: [{ ...GSAP_DEP }],
    allowedNetworkHosts: [],
  };
}

function approvedBundle() {
  const store = createDevThemeReleaseStore();
  const v = validateDevThemeBundle(bundleInput());
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
  const assembled = assembleDevThemeBundle({
    manifestJson: manifest(),
    files: bundleInput().files,
    dependencies: [{ ...GSAP_DEP }],
    allowedNetworkHosts: [],
  });
  expect(assembled.ok).toBe(true);
  if (!assembled.ok) throw new Error("fixture assemble refused");
  return {
    store,
    release: release as DevThemeRelease,
    fingerprint: v.fingerprint,
    assembled,
  };
}

function listingInput() {
  return {
    id: LISTING_ID,
    slug: THEME_SLUG,
    name: "Aurora Lookbook",
    version: "1.0.0",
    price_minor_int: 0,
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
      theme_assets: [],
    },
  });
}

/** Stored rows for one release, as the install lane persists them. */
function releaseRows(fixture: ReturnType<typeof approvedBundle>) {
  const { release, assembled } = fixture;
  const ns = `dev-themes/${THEME_SLUG}/1.0.0`;
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
  const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
  const isText = (p: string) => /\.(js|mjs|cjs|css|map|json|svg)$/.test(p);
  const assets = assembled.outputs.map((o) => ({
    merchant_id: MERCHANT,
    name: `${ns}/${o.path}`,
    kind: "asset",
    content: isText(o.path) ? text(o.bytes) : b64(o.bytes),
    url: `/t/${THEME_SLUG}/1.0.0/${o.path}`,
    bytes: o.bytes.length,
    enabled: true,
  }));
  return {
    approval: [
      {
        merchant_id: MERCHANT,
        name: `${ns}/.approval.json`,
        kind: "json",
        content: JSON.stringify(release),
      },
    ],
    maps: [
      {
        merchant_id: MERCHANT,
        name: `${ns}/release.json`,
        kind: "json",
        content: assembled.releaseJson,
      },
    ],
    assets,
    assetByOutput: (suffix: string) =>
      assets.filter((a) => a.name.endsWith(suffix)),
  };
}

beforeEach(() => recorder.reset());

describe("parseDevThemeAssetPath — traversal-safe addressing", () => {
  it("parses theme/version/path with exact pins", () => {
    expect(
      parseDevThemeAssetPath(
        "aurora-lookbook/1.0.0/components/Hero.34e005bb.js",
      ),
    ).toEqual({
      themeId: "aurora-lookbook",
      version: "1.0.0",
      assetPath: "components/Hero.34e005bb.js",
    });
    expect(
      parseDevThemeAssetPath(
        "aurora-lookbook/1.0.0-beta.1/styles/main.abc12345.css",
      ),
    ).toEqual({
      themeId: "aurora-lookbook",
      version: "1.0.0-beta.1",
      assetPath: "styles/main.abc12345.css",
    });
  });

  it("refuses mutable versions, traversal, encoded tricks, and dotfiles", () => {
    expect(
      parseDevThemeAssetPath("aurora-lookbook/latest/index.html"),
    ).toBeNull();
    expect(parseDevThemeAssetPath("aurora-lookbook/1.0/index.html")).toBeNull();
    expect(
      parseDevThemeAssetPath("aurora-lookbook/1.0.0/../secret"),
    ).toBeNull();
    expect(
      parseDevThemeAssetPath("aurora-lookbook/1.0.0/%2e%2e/secret"),
    ).toBeNull();
    expect(
      parseDevThemeAssetPath("aurora-lookbook/1.0.0/components%2FHero.js"),
    ).toBeNull();
    expect(
      parseDevThemeAssetPath("aurora-lookbook/1.0.0/components%5CHero.js"),
    ).toBeNull();
    expect(
      parseDevThemeAssetPath("aurora-lookbook/1.0.0/.approval.json"),
    ).toBeNull();
    expect(
      parseDevThemeAssetPath("aurora-lookbook/1.0.0/release.json"),
    ).not.toBeNull();
    expect(parseDevThemeAssetPath("../aurora-lookbook/1.0.0/x.js")).toBeNull();
    expect(parseDevThemeAssetPath("/aurora-lookbook/1.0.0/x.js")).toBeNull();
    expect(parseDevThemeAssetPath("aurora-lookbook/1.0.0/")).toBeNull();
    expect(parseDevThemeAssetPath("aurora-lookbook/1.0.0")).toBeNull();
    expect(parseDevThemeAssetPath("")).toBeNull();
    expect(parseDevThemeAssetPath("AURORA/1.0.0/x.js")).toBeNull();
    expect(
      parseDevThemeAssetPath(`aurora-lookbook/1.0.0/${"a".repeat(600)}.js`),
    ).toBeNull();
  });
});

describe("devThemeAssetContentType — servable kinds", () => {
  it("maps js/css/map/json/font/image, refuses executables and documents", () => {
    expect(devThemeAssetContentType("a/Hero.12345678.js")).toBe(
      "text/javascript; charset=utf-8",
    );
    expect(devThemeAssetContentType("a/x.mjs")).toContain("javascript");
    expect(devThemeAssetContentType("a/x.cjs")).toContain("javascript");
    expect(devThemeAssetContentType("a/x.css")).toContain("text/css");
    expect(devThemeAssetContentType("a/x.map")).toContain("application/json");
    expect(devThemeAssetContentType("a/x.json")).toContain("application/json");
    expect(devThemeAssetContentType("a/x.png")).toBe("image/png");
    expect(devThemeAssetContentType("a/x.jpg")).toBe("image/jpeg");
    expect(devThemeAssetContentType("a/x.svg")).toBe("image/svg+xml");
    expect(devThemeAssetContentType("a/x.woff2")).toBe("font/woff2");
    expect(devThemeAssetContentType("a/x.ttf")).toBe("font/ttf");
    expect(devThemeAssetContentType("a/x.exe")).toBeNull();
    expect(devThemeAssetContentType("a/x.html")).toBeNull();
    expect(devThemeAssetContentType("a/x.ts")).toBeNull();
    expect(devThemeAssetContentType("a/x.sh")).toBeNull();
    expect(devThemeAssetContentType("a/noext")).toBeNull();
  });
});

describe("resolveDevThemeAsset — verified serving", () => {
  it("serves approved bytes with immutable caching and nosniff", () => {
    const fixture = approvedBundle();
    const rows = releaseRows(fixture);
    const js = rows.assetByOutput(".js")[0]!;
    const requested = parseDevThemeAssetPath(
      `aurora-lookbook/1.0.0/${js.name.split("/").slice(3).join("/")}`,
    )!;
    const out = resolveDevThemeAsset(requested, rows.approval, rows.maps, [js]);
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    expect(new TextDecoder().decode(out.body)).toBe(HERO_JS);
    expect(out.headers["content-type"]).toContain("javascript");
    expect(out.headers["x-content-type-options"]).toBe("nosniff");
    expect(out.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(out.headers["content-security-policy"]).toBeUndefined();
  });

  it("serves binary assets and sandboxes SVG as a document backstop", () => {
    const fixture = approvedBundle();
    const rows = releaseRows(fixture);
    const png = rows.assetByOutput(".png")[0]!;
    const pngReq = parseDevThemeAssetPath(
      `aurora-lookbook/1.0.0/${png.name.split("/").slice(3).join("/")}`,
    )!;
    const pngOut = resolveDevThemeAsset(pngReq, rows.approval, rows.maps, [
      png,
    ]);
    expect(pngOut.status).toBe(200);
    if (pngOut.status !== 200) return;
    expect(Array.from(pngOut.body)).toEqual(Array.from(MARK_PNG));
    expect(pngOut.headers["content-type"]).toBe("image/png");
    const svg = rows.assetByOutput(".svg")[0]!;
    const svgReq = parseDevThemeAssetPath(
      `aurora-lookbook/1.0.0/${svg.name.split("/").slice(3).join("/")}`,
    )!;
    const svgOut = resolveDevThemeAsset(svgReq, rows.approval, rows.maps, [
      svg,
    ]);
    expect(svgOut.status).toBe(200);
    if (svgOut.status !== 200) return;
    expect(svgOut.headers["content-security-policy"]).toBe("sandbox");
  });

  it("404s unknown versions, missing entries (incl. index.html), and refused kinds", () => {
    const fixture = approvedBundle();
    const rows = releaseRows(fixture);
    const js = rows.assetByOutput(".js")[0]!;
    // Unknown version: no approval rows at all.
    expect(
      resolveDevThemeAsset(
        parseDevThemeAssetPath("aurora-lookbook/9.9.9/components/Hero.js")!,
        [],
        [],
        [js],
      ).status,
    ).toBe(404);
    // index.html is not an assembled output — fail-closed blank frame.
    const index = resolveDevThemeAsset(
      { themeId: THEME_SLUG, version: "1.0.0", assetPath: "index.html" },
      rows.approval,
      rows.maps,
      [],
    );
    expect(index.status).toBe(404);
    // Refused kind never serves even when bytes are stored.
    const exe = resolveDevThemeAsset(
      { themeId: THEME_SLUG, version: "1.0.0", assetPath: "server/evil.exe" },
      rows.approval,
      rows.maps,
      [{ content: "x" }],
    );
    expect(exe.status).toBe(404);
  });

  it("404s tampered bytes, tampered maps, and tampered approvals", () => {
    const fixture = approvedBundle();
    const rows = releaseRows(fixture);
    const js = rows.assetByOutput(".js")[0]!;
    const requested = parseDevThemeAssetPath(
      `aurora-lookbook/1.0.0/${js.name.split("/").slice(3).join("/")}`,
    )!;
    // Tampered asset bytes (hash no longer in the release).
    const tamperedBytes = resolveDevThemeAsset(
      requested,
      rows.approval,
      rows.maps,
      [{ ...js, content: `${js.content}tampered` }],
    );
    expect(tamperedBytes.status).toBe(404);
    // Tampered map (entry hash swapped) breaks multiset equality.
    const map = JSON.parse(rows.maps[0]!.content as string);
    map.files[0].sha256 = "0".repeat(64);
    const tamperedMap = resolveDevThemeAsset(
      requested,
      rows.approval,
      [{ ...rows.maps[0], content: JSON.stringify(map) }],
      [js],
    );
    expect(tamperedMap.status).toBe(404);
    // Stripped approval (reviews removed) fails the real activation gate.
    const stripped = {
      ...rows.approval[0],
      content: JSON.stringify({ ...fixture.release, reviews: [] }),
    };
    const tamperedApproval = resolveDevThemeAsset(
      requested,
      [stripped],
      rows.maps,
      [js],
    );
    expect(tamperedApproval.status).toBe(404);
  });

  it("404s ambiguous releases instead of serving possibly-unapproved bytes", () => {
    const first = approvedBundle();
    const rows = releaseRows(first);
    const js = rows.assetByOutput(".js")[0]!;
    const requested = parseDevThemeAssetPath(
      `aurora-lookbook/1.0.0/${js.name.split("/").slice(3).join("/")}`,
    )!;
    // Same slug + version resubmitted with different bytes (second release).
    const other = (() => {
      const store = createDevThemeReleaseStore();
      const m2 = manifest();
      const files2: DevThemeBundleFile[] = [
        {
          path: "dev.theme.json",
          bytes: new TextEncoder().encode(JSON.stringify(m2)),
        },
        {
          path: "components/Hero.js",
          bytes: new TextEncoder().encode(`export const h = 2;`),
        },
      ];
      const v2 = validateDevThemeBundle({
        manifest: m2,
        files: files2,
        dependencies: [{ ...GSAP_DEP }],
        allowedNetworkHosts: [],
      });
      expect(v2.ok).toBe(true);
      if (!v2.ok) throw new Error("second bundle rejected");
      const { release: s2 } = store.submit({
        merchantId: SELLER,
        themeId: THEME_SLUG,
        manifest: v2.manifest,
        files: v2.files,
        fingerprint: v2.fingerprint,
        submittedBy: "dev-1",
        submittedAt: T0,
      });
      store.review({
        releaseId: s2.id,
        merchantId: SELLER,
        reviewer: { ...MOD },
        decision: "approve",
        reason: "second submission",
        reviewedAt: T1,
      });
      const { release: r2 } = store.publish({
        releaseId: s2.id,
        merchantId: SELLER,
        actor: { ...MOD },
        expectedFingerprint: v2.fingerprint,
        publishedAt: T1,
      });
      return r2 as DevThemeRelease;
    })();
    expect(other.fingerprint).not.toBe(first.fingerprint);
    const both = [
      ...rows.approval,
      {
        merchant_id: "99999999-9999-4999-8999-999999999999",
        name: `dev-themes/${THEME_SLUG}/1.0.0/.approval.json`,
        kind: "json",
        content: JSON.stringify(other),
      },
    ];
    const out = resolveDevThemeAsset(requested, both, rows.maps, [js]);
    expect(out.status).toBe(404);
  });

  it("refuses length-lying rows (declared size ≠ decoded bytes)", () => {
    // The 5 MiB entry cap itself is unreachable-by-construction (the bundle
    // gate refuses oversize entries before any row exists, pinned by
    // `dev-theme-bundle.test.ts`); the serve lane still re-checks declared
    // size, decoded length, and hash on every row — a lying row 404s.
    const fixture = approvedBundle();
    const rows = releaseRows(fixture);
    const js = rows.assetByOutput(".js")[0]!;
    const requested = parseDevThemeAssetPath(
      `aurora-lookbook/1.0.0/${js.name.split("/").slice(3).join("/")}`,
    )!;
    const map = JSON.parse(rows.maps[0]!.content as string);
    const target = map.files.find((f: { path: string }) =>
      f.path.endsWith(".js"),
    );
    target.bytes = target.bytes + 1;
    const lyingMap = resolveDevThemeAsset(
      requested,
      rows.approval,
      [{ ...rows.maps[0], content: JSON.stringify(map) }],
      [js],
    );
    // The edited map breaks multiset/self-consistency → unknown version.
    expect(lyingMap.status).toBe(404);
  });
});

describe("adversarial — oversize, version-skew, foreign approvals, unservable extras", () => {
  it("an oversize bundle refuses at install with zero rows anywhere", async () => {
    const db = installDb();
    const { release } = approvedBundle();
    const big = new Uint8Array(6 * 1024 * 1024);
    const m = manifest();
    await expect(
      installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release,
        bytes: {
          ...bundleInput(),
          files: [
            {
              path: "dev.theme.json",
              bytes: new TextEncoder().encode(JSON.stringify(m)),
            },
            { path: "components/Hero.js", bytes: big },
          ],
        },
        idempotencyKey: "dev-assets-big-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: THEME_SLUG,
      }),
    ).rejects.toThrow(/invalid_bundle/);
    expect(db.rows("theme_assets")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
    expect(db.rows("store_themes")).toHaveLength(0);
  });

  it("version-skewed install linkage projects to null", async () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    process.env.DEV_THEME_ASSET_ORIGIN = "https://themes.example-cdn.com";
    try {
      const db = installDb();
      const { release } = approvedBundle();
      await installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release,
        bytes: bundleInput(),
        idempotencyKey: "dev-assets-skew-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: THEME_SLUG,
      });
      const theme = db.rows("store_themes")[0] as {
        id: string;
        source_install_id: string;
      };
      const versions = db.rows("theme_versions") as { checksum: string }[];
      // Tampered ledger version (points at rows that do not exist).
      const install = db.rows("marketplace_installs")[0] as Record<
        string,
        unknown
      >;
      install.artifact_version = "2.0.0";
      const skewed = await loadDevThemeProjection(db.asClient(), MERCHANT, {
        themeId: theme.id,
        isActive: true,
        sourceKey: THEME_SLUG,
        sourceInstallId: theme.source_install_id,
        versionChecksums: versions.map((v) => v.checksum),
      });
      expect(skewed).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });

  it("a foreign approval stored under the namespace serves nothing", () => {
    const fixture = approvedBundle();
    const rows = releaseRows(fixture);
    const js = rows.assetByOutput(".js")[0]!;
    const requested = parseDevThemeAssetPath(
      `aurora-lookbook/1.0.0/${js.name.split("/").slice(3).join("/")}`,
    )!;
    const foreign = (() => {
      const store = createDevThemeReleaseStore();
      const m2 = manifest({ id: "other-theme", name: "Other" });
      const files2: DevThemeBundleFile[] = [
        {
          path: "dev.theme.json",
          bytes: new TextEncoder().encode(JSON.stringify(m2)),
        },
        {
          path: "components/Hero.js",
          bytes: new TextEncoder().encode(HERO_JS),
        },
      ];
      const v2 = validateDevThemeBundle({
        manifest: m2,
        files: files2,
        dependencies: [{ ...GSAP_DEP }],
        allowedNetworkHosts: [],
      });
      expect(v2.ok).toBe(true);
      if (!v2.ok) throw new Error("foreign bundle rejected");
      const { release: s2 } = store.submit({
        merchantId: SELLER,
        themeId: "other-theme",
        manifest: v2.manifest,
        files: v2.files,
        fingerprint: v2.fingerprint,
        submittedBy: "dev-1",
        submittedAt: T0,
      });
      store.review({
        releaseId: s2.id,
        merchantId: SELLER,
        reviewer: { ...MOD },
        decision: "approve",
        reason: "foreign",
        reviewedAt: T1,
      });
      const { release: r2 } = store.publish({
        releaseId: s2.id,
        merchantId: SELLER,
        actor: { ...MOD },
        expectedFingerprint: v2.fingerprint,
        publishedAt: T1,
      });
      return r2 as DevThemeRelease;
    })();
    const out = resolveDevThemeAsset(
      requested,
      [
        {
          merchant_id: MERCHANT,
          name: `dev-themes/${THEME_SLUG}/1.0.0/.approval.json`,
          kind: "json",
          content: JSON.stringify(foreign),
        },
      ],
      rows.maps,
      [js],
    );
    expect(out.status).toBe(404);
  });

  it("unservable extras never reach persist (gate refuses, zero rows)", async () => {
    // Bundle-gate reality: `readme.md` is refused at the extension gate
    // before install writes anything. The persist skip-branch
    // (`devThemeAssetKind` null) is defense-in-depth for shapes the gate
    // can never emit — pinned here so it stays skipped, never served.
    expect(devThemeAssetKind("readme.md")).toBeNull();
    expect(devThemeAssetEncoding("readme.md")).toBeNull();
    const db = installDb();
    const { release } = approvedBundle();
    const m = manifest();
    const withReadme: DevThemeBundleInput = {
      ...bundleInput(),
      files: [
        ...bundleInput().files,
        { path: "readme.md", bytes: new TextEncoder().encode("# readme") },
      ],
    };
    void m;
    await expect(
      installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release,
        bytes: withReadme,
        idempotencyKey: "dev-assets-readme-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: THEME_SLUG,
      }),
    ).rejects.toThrow(/invalid_bundle/);
    expect(db.rows("theme_assets")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });
});

describe("installReviewedThemeBundle — fingerprinted asset persistence", () => {
  it("persists hashed outputs + release descriptor + approval snapshot", async () => {
    const db = installDb();
    const { release, fingerprint, assembled } = approvedBundle();
    const out = (await installReviewedThemeBundle(db.asClient(), MERCHANT, {
      release,
      bytes: bundleInput(),
      idempotencyKey: "dev-assets-ok-1",
      listing: listingInput(),
      trial: false,
      consentedBy: ACTOR,
      expectedThemeId: THEME_SLUG,
    })) as unknown as { installId: string };
    const assets = db.rows("theme_assets") as {
      merchant_id: string;
      theme_id: string | null;
      name: string;
      kind: string;
      content: string | null;
      url: string | null;
      bytes: number;
    }[];
    const ns = `dev-themes/${THEME_SLUG}/1.0.0`;
    // Every assembled output plus the two lane descriptors.
    expect(assets.length).toBe(assembled.outputs.length + 2);
    for (const o of assembled.outputs) {
      const row = assets.find((a) => a.name === `${ns}/${o.path}`);
      expect(row).toBeDefined();
      expect(row!.merchant_id).toBe(MERCHANT);
      expect(row!.bytes).toBe(o.bytes.length);
      expect(row!.url).toBe(`/t/${THEME_SLUG}/1.0.0/${o.path}`);
    }
    const releaseRow = assets.find((a) => a.name === `${ns}/release.json`);
    expect(releaseRow).toBeDefined();
    expect(releaseRow!.url).toBeNull();
    const approvalRow = assets.find((a) => a.name === `${ns}/.approval.json`);
    expect(approvalRow).toBeDefined();
    const approval = JSON.parse(approvalRow!.content as string);
    expect(approval.fingerprint).toBe(fingerprint);
    expect(approval.status).toBe("published");
    void out;
  });

  it("a refused install persists zero asset rows", async () => {
    const db = installDb();
    const { release } = approvedBundle();
    await expect(
      installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release,
        bytes: bundleInput(`export const evil = 1;`),
        idempotencyKey: "dev-assets-no-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: THEME_SLUG,
      }),
    ).rejects.toThrow(/fingerprint_mismatch/);
    expect(db.rows("theme_assets")).toHaveLength(0);
    expect(db.rows("marketplace_installs")).toHaveLength(0);
  });

  it("install → projection → serve round-trips on real persisted rows", async () => {
    const prev = process.env.DEV_THEME_ASSET_ORIGIN;
    process.env.DEV_THEME_ASSET_ORIGIN = "https://themes.example-cdn.com";
    try {
      const db = installDb();
      const { release, fingerprint } = approvedBundle();
      await installReviewedThemeBundle(db.asClient(), MERCHANT, {
        release,
        bytes: bundleInput(),
        idempotencyKey: "dev-assets-rt-1",
        listing: listingInput(),
        trial: false,
        consentedBy: ACTOR,
        expectedThemeId: THEME_SLUG,
      });
      const theme = db.rows("store_themes")[0] as {
        id: string;
        source_install_id: string;
      };
      const versions = db.rows("theme_versions") as { checksum: string }[];
      const projection = await loadDevThemeProjection(db.asClient(), MERCHANT, {
        themeId: theme.id,
        isActive: false,
        sourceKey: THEME_SLUG,
        sourceInstallId: theme.source_install_id,
        versionChecksums: versions.map((v) => v.checksum),
      });
      // Installed but not yet activated → no projection (fail closed).
      expect(projection).toBeNull();
      const projected = await loadDevThemeProjection(db.asClient(), MERCHANT, {
        themeId: theme.id,
        isActive: true,
        sourceKey: THEME_SLUG,
        sourceInstallId: theme.source_install_id,
        versionChecksums: versions.map((v) => v.checksum),
      });
      expect(projected).not.toBeNull();
      expect(projected!.binding.fingerprint).toBe(fingerprint);
      // Serve every persisted output straight from the install rows.
      const assets = db.rows("theme_assets");
      const ns = `dev-themes/${THEME_SLUG}/1.0.0`;
      const approvals = assets.filter((a) =>
        String(a.name).endsWith(".approval.json"),
      );
      const maps = assets.filter((a) =>
        String(a.name).endsWith("/release.json"),
      );
      for (const row of assets.filter(
        (a) =>
          !String(a.name).endsWith(".approval.json") &&
          !String(a.name).endsWith("/release.json"),
      )) {
        const name = String(row.name);
        const assetPath = name.slice(ns.length + 1);
        const parsed = parseDevThemeAssetPath(
          `${THEME_SLUG}/1.0.0/${assetPath}`,
        );
        expect(parsed).not.toBeNull();
        const out = resolveDevThemeAsset(parsed!, approvals, maps, [row]);
        expect(`${name}: ${out.status === 404 ? out.reason : "ok"}`).toBe(
          `${name}: ok`,
        );
      }
    } finally {
      if (prev === undefined) delete process.env.DEV_THEME_ASSET_ORIGIN;
      else process.env.DEV_THEME_ASSET_ORIGIN = prev;
    }
  });
});
