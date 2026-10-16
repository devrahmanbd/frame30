/**
 * Level B theme document synthesis (`index.html`) — TDD vectors.
 *
 * Pins `src/lib/dev-theme-document.ts`: exact-tag output for an approved
 * release, refusal for every unapproved shape (never a builder fallback),
 * CSP parity with the ThemeRuntime contract helper, traversal-proof asset
 * refs, no-inline-code output, and deterministic ordering.
 *
 * No network, no real database: real assembler + real review store; rows are
 * the same in-memory shapes the `/t/…` route reads.
 */
import { describe, expect, it } from "vitest";
import { assembleDevThemeBundle } from "./dev-theme-bundle-assemble";
import {
  createDevThemeReleaseStore,
  type DevThemeRelease,
} from "./dev-theme-review";
import { DEV_THEME_RUNTIME_VERSION } from "./dev-theme-manifest";
import { themeFrameCSP } from "../components/theme-runtime/ThemeRuntime";
import {
  buildDevThemeDocument,
  classifyDevThemeDocumentRef,
  devThemeDocumentCSP,
  selectDevThemeDocumentAssets,
  verifyDevThemeReleaseForDocument,
} from "./dev-theme-document";

const THEME_SLUG = "aurora-lookbook";
const VERSION = "1.4.0";
const ORIGIN = "https://themes.example-cdn.com";
const LOOPBACK = "http://127.0.0.1:4311";
const MOD = { id: "reviewer-1", role: "moderator" } as const;
const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";
const GSAP_DEP = {
  name: "gsap",
  version: "3.15.0",
  license: "MIT",
  integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

const APP_JS = `import "./vendor/three.00000000.js";
export function boot(el) { el.textContent = "on"; }`;
const VENDOR_JS = `export const THREE = { REVISION: "186" };`;
const MAIN_CSS = `.hero{color:red}`;

function manifest() {
  return {
    id: THEME_SLUG,
    version: VERSION,
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation", "animation", "webgl"],
    dependencies: [{ ...GSAP_DEP }],
    sections: [
      { key: "hero", slot: "main", component: "HeroCanvas" },
      { key: "webgl-scene", slot: "main", component: "WebglScene" },
    ],
    settings: [{ key: "headline", label: "Headline", type: "text" }],
  };
}

function files(appJs = APP_JS) {
  const m = manifest();
  return [
    {
      path: "dev.theme.json",
      bytes: new TextEncoder().encode(JSON.stringify(m)),
    },
    { path: "components/app.js", bytes: new TextEncoder().encode(appJs) },
    {
      path: "components/vendor/three.js",
      bytes: new TextEncoder().encode(VENDOR_JS),
    },
    { path: "styles/main.css", bytes: new TextEncoder().encode(MAIN_CSS) },
    {
      path: "locales/en.json",
      bytes: new TextEncoder().encode(JSON.stringify({ headline: "Hi" })),
    },
  ];
}

function approved() {
  const m = manifest();
  const store = createDevThemeReleaseStore();
  const assembled = assembleDevThemeBundle({
    manifestJson: m,
    files: files(),
    dependencies: [{ ...GSAP_DEP }],
    allowedNetworkHosts: [],
  });
  expect(assembled.ok).toBe(true);
  if (!assembled.ok) throw new Error("fixture assemble refused");
  const { release: submitted } = store.submit({
    merchantId: "seller-1",
    themeId: THEME_SLUG,
    manifest: assembled.manifest,
    files: assembled.files,
    fingerprint: assembled.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  store.review({
    releaseId: submitted.id,
    merchantId: "seller-1",
    reviewer: { ...MOD },
    decision: "approve",
    reason: "clean scan, fallback proof attached",
    reviewedAt: T1,
  });
  const { release } = store.publish({
    releaseId: submitted.id,
    merchantId: "seller-1",
    actor: { ...MOD },
    expectedFingerprint: assembled.fingerprint,
    publishedAt: T1,
  });
  const ns = `dev-themes/${THEME_SLUG}/${VERSION}`;
  return {
    release: release as DevThemeRelease,
    assembled,
    approvalRows: [
      {
        merchant_id: "merchant-1",
        name: `${ns}/.approval.json`,
        content: JSON.stringify(release),
      },
    ],
    mapRows: [
      {
        merchant_id: "merchant-1",
        name: `${ns}/release.json`,
        content: assembled.releaseJson,
      },
    ],
  };
}

describe("buildDevThemeDocument — exact-tag output for approved releases", () => {
  it("emits a minimal document with hash-pinned tags, CSP meta, and no inline code", () => {
    const { approvalRows, mapRows, assembled } = approved();
    const out = buildDevThemeDocument({
      themeId: THEME_SLUG,
      version: VERSION,
      assetOrigin: ORIGIN,
      approvalRows,
      mapRows,
    });
    expect(out.status).toBe(200);
    if (out.status !== 200) return;
    const doc = new TextDecoder().decode(out.body);
    const base = `/t/${THEME_SLUG}/${VERSION}`;
    const byPrefix = (prefix: string): string => {
      const hit = assembled.outputs.find((o) => o.path.startsWith(prefix));
      if (!hit) throw new Error(`missing output ${prefix}`);
      return `${base}/${hit.path}`;
    };
    // Exact golden: every tag pinned, vendor runtime before theme code.
    expect(doc).toBe(
      [
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<meta http-equiv="Content-Security-Policy" content="${themeFrameCSP(ORIGIN)}">`,
        "<title>Aurora Lookbook</title>",
        `<link rel="stylesheet" href="${byPrefix("styles/main.")}">`,
        "</head>",
        "<body>",
        '<div id="theme-root">',
        "<div data-theme-hero data-hero-canvas>Hello</div>",
        "<div data-webgl-scene><canvas data-webgl-canvas></canvas></div>",
        "<div data-fallback hidden>Static storefront</div>",
        "</div>",
        `<script type="module" src="${byPrefix("components/vendor/three.")}"></script>`,
        `<script type="module" src="${byPrefix("components/app.")}"></script>`,
        "</body>",
        "</html>",
        "",
      ].join("\n"),
    );
    // Headers: immutable version-pinned bytes, nosniff, CSP header == meta.
    expect(out.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(out.headers["x-content-type-options"]).toBe("nosniff");
    // Opaque-frame CORS: module subresources fetch in CORS mode.
    expect(out.headers["access-control-allow-origin"]).toBe("*");
    expect(out.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(out.headers["content-security-policy"]).toBe(themeFrameCSP(ORIGIN));
    // No inline code anywhere: every script tag carries src, no handlers,
    // no javascript: URLs, no style blocks, no srcdoc-shaped output.
    const scriptTags = doc.match(/<script[^>]*>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) expect(tag).toContain("src=");
    for (const needle of [
      "onload=",
      "onerror=",
      "javascript:",
      "<style",
      "srcdoc",
    ]) {
      expect(doc.includes(needle), `document must not contain ${needle}`).toBe(
        false,
      );
    }
    // style-src carries 'unsafe-inline' by contract (theme CSS sanitized at
    // package+render lanes); script-src MUST NOT — assert on the directive.
    expect(out.headers["content-security-policy"]).not.toMatch(
      /script-src[^;]*unsafe-inline/,
    );
    // Refs re-prove every referenced asset at serve time.
    const refOf = (prefix: string): string => {
      const hit = assembled.outputs.find((o) => o.path.startsWith(prefix));
      if (!hit) throw new Error(`missing output ${prefix}`);
      return hit.path;
    };
    expect(out.refs).toEqual([
      refOf("components/vendor/three."),
      refOf("components/app."),
      refOf("styles/main."),
    ]);
  });

  it("is deterministic: same approved inputs yield identical bytes", () => {
    const { approvalRows, mapRows } = approved();
    const input = {
      themeId: THEME_SLUG,
      version: VERSION,
      assetOrigin: ORIGIN,
      approvalRows,
      mapRows,
    };
    const a = buildDevThemeDocument(input);
    const b = buildDevThemeDocument(input);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    if (a.status !== 200 || b.status !== 200) return;
    expect(Array.from(a.body)).toEqual(Array.from(b.body));
  });
});

describe("buildDevThemeDocument — CSP parity with the contract helper", () => {
  it("mirrors themeFrameCSP exactly on approved origins", () => {
    expect(devThemeDocumentCSP(ORIGIN)).toBe(themeFrameCSP(ORIGIN));
    expect(devThemeDocumentCSP(LOOPBACK)).toBe(themeFrameCSP(LOOPBACK));
    expect(devThemeDocumentCSP(ORIGIN).startsWith("default-src 'none'")).toBe(
      true,
    );
    expect(devThemeDocumentCSP(ORIGIN)).toContain("connect-src 'none'");
    expect(devThemeDocumentCSP(ORIGIN)).not.toMatch(
      /script-src[^;]*unsafe-inline/,
    );
  });

  it("collapses to bare default-src on unapproved origins and refuses documents there", () => {
    // Origin approval is shape-based (https, plus http loopback for local
    // dev) — identical to isApprovedAssetOrigin. Any https host mints the
    // same contract string as themeFrameCSP (asserted below); only
    // non-approved SHAPES collapse and refuse.
    expect(devThemeDocumentCSP("https://evil.example")).toBe(
      themeFrameCSP("https://evil.example"),
    );
    for (const bad of [
      "http://themes.example-cdn.com",
      "null",
      "",
      "ftp://evil.example/x",
      "https://evil example.com",
    ]) {
      expect(devThemeDocumentCSP(bad)).toBe("default-src 'none'");
      const { approvalRows, mapRows } = approved();
      const out = buildDevThemeDocument({
        themeId: THEME_SLUG,
        version: VERSION,
        assetOrigin: bad,
        approvalRows,
        mapRows,
      });
      expect(`${bad}: ${out.status}`).toBe(`${bad}: 404`);
    }
  });
});

describe("buildDevThemeDocument — unapproved releases refuse (never a fallback)", () => {
  it("404s with no approvals or an unreviewed release", () => {
    const { mapRows } = approved();
    expect(
      buildDevThemeDocument({
        themeId: THEME_SLUG,
        version: VERSION,
        assetOrigin: ORIGIN,
        approvalRows: [],
        mapRows,
      }).status,
    ).toBe(404);
    // Submitted but never reviewed: no published approval exists.
    const store = createDevThemeReleaseStore();
    const m = manifest();
    const assembled = assembleDevThemeBundle({
      manifestJson: m,
      files: files(),
      dependencies: [{ ...GSAP_DEP }],
      allowedNetworkHosts: [],
    });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const { release } = store.submit({
      merchantId: "seller-1",
      themeId: THEME_SLUG,
      manifest: assembled.manifest,
      files: assembled.files,
      fingerprint: assembled.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T0,
    });
    expect(
      buildDevThemeDocument({
        themeId: THEME_SLUG,
        version: VERSION,
        assetOrigin: ORIGIN,
        approvalRows: [{ content: JSON.stringify(release) }],
        mapRows: [{ content: assembled.releaseJson }],
      }).status,
    ).toBe(404);
  });

  it("404s revoked releases, stripped approvals, and tampered maps", () => {
    const { release, assembled, mapRows } = approved();
    const approvalOf = (r: unknown) => [{ content: JSON.stringify(r) }];
    // Revoked after publish: the activation gate refuses.
    const store = createDevThemeReleaseStore();
    void store;
    const revoked = {
      ...release,
      status: "revoked",
      reviews: [...release.reviews],
    };
    expect(
      buildDevThemeDocument({
        themeId: THEME_SLUG,
        version: VERSION,
        assetOrigin: ORIGIN,
        approvalRows: approvalOf(revoked),
        mapRows,
      }).status,
    ).toBe(404);
    // Stripped approval (reviews removed) fails the activation gate.
    const stripped = { ...release, reviews: [] };
    expect(
      buildDevThemeDocument({
        themeId: THEME_SLUG,
        version: VERSION,
        assetOrigin: ORIGIN,
        approvalRows: approvalOf(stripped),
        mapRows,
      }).status,
    ).toBe(404);
    // Tampered map (entry hash swapped) breaks multiset equality.
    const map = JSON.parse(assembled.releaseJson) as {
      files: { sha256: string }[];
    };
    map.files[0]!.sha256 = "0".repeat(64);
    expect(
      buildDevThemeDocument({
        themeId: THEME_SLUG,
        version: VERSION,
        assetOrigin: ORIGIN,
        approvalRows: approvalOf(release),
        mapRows: [{ content: JSON.stringify(map) }],
      }).status,
    ).toBe(404);
    // Renamed-path map (hashes kept, path swapped) breaks self-consistency.
    const renamed = JSON.parse(assembled.releaseJson) as {
      files: { path: string }[];
    };
    renamed.files[0]!.path = "components/evil.js";
    expect(
      buildDevThemeDocument({
        themeId: THEME_SLUG,
        version: VERSION,
        assetOrigin: ORIGIN,
        approvalRows: approvalOf(release),
        mapRows: [{ content: JSON.stringify(renamed) }],
      }).status,
    ).toBe(404);
  });

  it("404s ambiguous releases, foreign approvals, and unknown versions", () => {
    const { release, mapRows } = approved();
    // Same slug + version resubmitted with different bytes: ambiguous.
    const other = (() => {
      const store = createDevThemeReleaseStore();
      const m2 = manifest();
      const a2 = assembleDevThemeBundle({
        manifestJson: m2,
        files: files(`export const h = 2;`),
        dependencies: [{ ...GSAP_DEP }],
        allowedNetworkHosts: [],
      });
      expect(a2.ok).toBe(true);
      if (!a2.ok) throw new Error("second assemble refused");
      const { release: s2 } = store.submit({
        merchantId: "seller-1",
        themeId: THEME_SLUG,
        manifest: a2.manifest,
        files: a2.files,
        fingerprint: a2.fingerprint,
        submittedBy: "dev-1",
        submittedAt: T0,
      });
      store.review({
        releaseId: s2.id,
        merchantId: "seller-1",
        reviewer: { ...MOD },
        decision: "approve",
        reason: "second submission",
        reviewedAt: T1,
      });
      const { release: r2 } = store.publish({
        releaseId: s2.id,
        merchantId: "seller-1",
        actor: { ...MOD },
        expectedFingerprint: a2.fingerprint,
        publishedAt: T1,
      });
      return r2 as DevThemeRelease;
    })();
    expect(other.fingerprint).not.toBe(release.fingerprint);
    expect(
      buildDevThemeDocument({
        themeId: THEME_SLUG,
        version: VERSION,
        assetOrigin: ORIGIN,
        approvalRows: [
          { content: JSON.stringify(release) },
          { content: JSON.stringify(other) },
        ],
        mapRows,
      }).status,
    ).toBe(404);
    // Foreign approval stored under the namespace serves nothing.
    const foreign = { ...release, themeId: "other-theme" };
    expect(
      buildDevThemeDocument({
        themeId: THEME_SLUG,
        version: VERSION,
        assetOrigin: ORIGIN,
        approvalRows: [{ content: JSON.stringify(foreign) }],
        mapRows,
      }).status,
    ).toBe(404);
    // Unknown version / mutable tag / hostile identity: unaddressable.
    for (const [id, ver] of [
      [THEME_SLUG, "9.9.9"],
      [THEME_SLUG, "latest"],
      ["../x", VERSION],
      ["AURORA", VERSION],
    ]) {
      const out = buildDevThemeDocument({
        themeId: id,
        version: ver,
        assetOrigin: ORIGIN,
        approvalRows: [{ content: JSON.stringify(release) }],
        mapRows,
      });
      expect(`${id}@${ver}: ${out.status}`).toBe(`${id}@${ver}: 404`);
    }
    expect(
      verifyDevThemeReleaseForDocument([], mapRows, THEME_SLUG, VERSION),
    ).toBeNull();
  });

  it("404s entry-less releases (nothing executable to frame)", () => {
    const m = manifest();
    const cssOnly = [
      {
        path: "dev.theme.json",
        bytes: new TextEncoder().encode(JSON.stringify(m)),
      },
      { path: "styles/main.css", bytes: new TextEncoder().encode(MAIN_CSS) },
      {
        path: "locales/en.json",
        bytes: new TextEncoder().encode(JSON.stringify({ headline: "Hi" })),
      },
    ];
    const assembled = assembleDevThemeBundle({
      manifestJson: m,
      files: cssOnly,
      dependencies: [{ ...GSAP_DEP }],
      allowedNetworkHosts: [],
    });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const store = createDevThemeReleaseStore();
    const { release: submitted } = store.submit({
      merchantId: "seller-1",
      themeId: THEME_SLUG,
      manifest: assembled.manifest,
      files: assembled.files,
      fingerprint: assembled.fingerprint,
      submittedBy: "dev-1",
      submittedAt: T0,
    });
    store.review({
      releaseId: submitted.id,
      merchantId: "seller-1",
      reviewer: { ...MOD },
      decision: "approve",
      reason: "css only",
      reviewedAt: T1,
    });
    const { release } = store.publish({
      releaseId: submitted.id,
      merchantId: "seller-1",
      actor: { ...MOD },
      expectedFingerprint: assembled.fingerprint,
      publishedAt: T1,
    });
    const out = buildDevThemeDocument({
      themeId: THEME_SLUG,
      version: VERSION,
      assetOrigin: ORIGIN,
      approvalRows: [{ content: JSON.stringify(release) }],
      mapRows: [{ content: assembled.releaseJson }],
    });
    expect(out.status).toBe(404);
    if (out.status !== 404) return;
    expect(out.reason).toBe("no_entry");
  });
});

describe("classifyDevThemeDocumentRef — traversal-proof asset refs", () => {
  it("admits only strict script/style paths", () => {
    expect(classifyDevThemeDocumentRef("components/app.ab12cd34.js")).toBe(
      "script",
    );
    expect(
      classifyDevThemeDocumentRef("components/vendor/three.12345678.js"),
    ).toBe("script");
    expect(classifyDevThemeDocumentRef("sections/a.mjs")).toBe("script");
    expect(classifyDevThemeDocumentRef("styles/main.12345678.css")).toBe(
      "style",
    );
    for (const evil of [
      "",
      "../secret.js",
      "components/../../x.js",
      "components/a..b.js",
      "/t/aurora/1.0.0/components/app.js",
      "https://evil.example/x.js",
      "components/app.js?x=1",
      "components/app.js#x",
      "components/app<script>.js",
      'components/a"b.js',
      "components/a b.js",
      "components\\app.js",
      ".approval.json",
      "components/.hidden.js",
      "release.json",
      "index.html",
      "assets/mark.png",
      "assets/logo.svg",
      "locales/en.json",
      "components/app.map",
      "components/app.exe",
      "components/app.ts",
      "noext",
      `components/${"a".repeat(600)}.js`,
    ]) {
      expect(classifyDevThemeDocumentRef(evil), `refuses ${evil}`).toBeNull();
    }
  });

  it("orders vendor runtimes before theme code, deterministically", () => {
    const { scripts, styles } = selectDevThemeDocumentAssets([
      { path: "styles/b.css" },
      { path: "components/app.11111111.js" },
      { path: "components/vendor/three.33333333.js" },
      { path: "components/vendor/gsap.22222222.js" },
      { path: "styles/a.css" },
      { path: "assets/mark.44444444.png" },
      { path: "sections/hero.55555555.js" },
    ]);
    expect(scripts).toEqual([
      "components/vendor/gsap.22222222.js",
      "components/vendor/three.33333333.js",
      "components/app.11111111.js",
      "sections/hero.55555555.js",
    ]);
    expect(styles).toEqual(["styles/a.css", "styles/b.css"]);
  });
});
