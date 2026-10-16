import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import type { Page, Response } from "@playwright/test";
import {
  assembleDevThemeBundle,
  hashedOutputPath,
} from "../src/lib/dev-theme-bundle-assemble";
import { hashBytes } from "../src/lib/dev-theme-bundle";
import { DEV_THEME_RUNTIME_VERSION } from "../src/lib/dev-theme-manifest";
import {
  createDevThemeReleaseStore,
  type DevThemeRelease,
} from "../src/lib/dev-theme-review";
import { fakeDb } from "../src/lib/__fixtures__/fake-db";
import { buildDevThemeDocument } from "../src/lib/dev-theme-document";

/**
 * Level B real-execution E2E helpers (production path, cold).
 *
 * - `prepareRealTheme`: builds the fixture theme from the repo's OWN
 *   `gsap` ESM sources (`gsap-core.js` + `Observer.js` verbatim,
 *   `CSSPlugin.js` + `ScrollTrigger.js` verbatim except their single
 *   intra-package specifier pinned to the hashed sibling, exact-count +
 *   rewrite-proofed) and `three` (`three.core.js` verbatim plus
 *   `three.module.js` — the renderer implementation — verbatim except its
 *   two `./three.core.js` specifiers pinned) through the REAL
 *   assemble → review → publish lanes. The documented vendor stage
 *   proves every manifest pin against those bytes.
 * - `seedInstallMirrorDb`: install-equivalent `fakeDb` rows (the install
 *   lane itself is not worker-importable — it dynamic-imports `@/`-aliased
 *   server modules — so persistence is mirrored field-for-field; the
 *   install → serve round-trip on REAL persisted rows is pinned by
 *   `dev-theme-asset-serve.test.ts` + `t.$.test.ts` instead).
 * - `serveVerifiedTheme`: loopback origin server serving the REAL verified
 *   document (via `buildDevThemeDocument`) + REAL hash-asserted asset bytes
 *   with production headers, plus a static CSP-free `/harness` shell (same
 *   origin, so Private Network Access checks pass on default Chromium —
 *   never a theme URL, never cached). No `page.route()` interception of theme URLs —
 *   the frame loads them over real HTTP.
 */

export const REAL_THEME_ID = "aurora-lookbook";
export const REAL_THEME_VERSION = "1.4.0";
const MERCHANT = "22222222-2222-2222-2222-222222222222";
const SELLER = "11111111-1111-1111-1111-111111111111";
const MOD = { id: "reviewer-1", role: "moderator" } as const;
const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";

/**
 * Static-literal hosts inside the vendored files (the bundle gate scans
 * every http(s) literal, including comments — provenance verified by running
 * the gate with an empty allowlist and reading its errors):
 * - `three.core.js` (self-contained ESM, zero imports): 37 hosts, all in
 *   source comments (papers, docs, reference links — e.g. khronos
 *   registry, jcgt, editorial blogs).
 * - `three.module.js` (the renderer implementation, vendored with its two
 *   `./three.core.js` specifiers pinned): 2 further comment hosts,
 *   `jacksondunstan.com` + `computergraphics.stackexchange.com`.
 * - The gsap ESM sources contribute 4: `gsap.com` (license-header comments
 *   across all four files), `bugzilla.mozilla.org` (`CSSPlugin.js` comment),
 *   `codepen.io` + `bugs.webkit.org` (`ScrollTrigger.js` comments).
 * Runtime fetch is still denied: the served frame CSP carries
 * `connect-src 'none'` (asserted in the spec) and the run asserts zero
 * non-loopback responses.
 */
const VENDOR_NETWORK_LITERALS = [
  "area.autodesk.com",
  "blogs.unity3d.com",
  "blog.tojicode.com",
  "bugs.webkit.org",
  "bugzilla.mozilla.org",
  "codepen.io",
  "computergraphics.stackexchange.com",
  "developer.mozilla.org",
  "docs.unrealengine.com",
  "en.wikipedia.org",
  "geomalgorithms.com",
  "github.com",
  "graphics.stanford.edu",
  "gsap.com",
  "ideone.com",
  "jacksondunstan.com",
  "jcgt.org",
  "jsperf.com",
  "mathworld.wolfram.com",
  "media.disneyanimation.com",
  "paulbourke.net",
  "regex101.com",
  "registry.khronos.org",
  "serverfault.com",
  "stackoverflow.com",
  "www.bobatkins.com",
  "www.cemyuksel.com",
  "www.chiark.greenend.org.uk",
  "www.cs.indiana.edu",
  "www.desmos.com",
  "www.fox-toolkit.org",
  "www.gamedev.net",
  "www.khronos.org",
  "www.marmoset.co",
  "www.oodesign.com",
  "www.opengl-tutorial.org",
  "www.ppsloan.org",
  "www.rorydriscoll.com",
  "www.russellcottrell.com",
  "www.terathon.com",
  "www.w3.org",
];

function fixturePath(rel: string): string {
  return fileURLToPath(
    new URL(`./fixtures/levelb-real-theme/${rel}`, import.meta.url),
  );
}

function repoPath(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function sha384(fileBytes: Uint8Array): string {
  return `sha384-${createHash("sha384").update(fileBytes).digest("base64")}`;
}

/**
 * Pin intra-package relative specifier(s) to the hashed sibling name.
 * Exact-count: anything else means the repo source drifted and prep refuses
 * rather than shipping a half-rewritten import.
 */
function pinVendorSpecifier(
  source: string,
  from: string,
  to: string,
  expected = 1,
): string {
  const hits = source.split(from).length - 1;
  if (hits !== expected) {
    throw new Error(
      `vendor specifier pin refused: ${from} occurs ${hits}x (expected ${expected})`,
    );
  }
  return source.split(from).join(to);
}

export type RealThemePrep = {
  themeId: string;
  version: string;
  manifest: Record<string, unknown>;
  fingerprint: string;
  release: DevThemeRelease;
  approvalRows: Record<string, unknown>[];
  mapRows: Record<string, unknown>[];
  assetRows: Record<string, unknown>[];
  outputs: { path: string; bytes: Uint8Array }[];
  vendor: { gsapVersion: string; threeVersion: string };
};

/** Assemble → submit → approve → publish with the REAL lanes. */
export function prepareRealTheme(): RealThemePrep {
  // Genuine ESM sources (never the UMD `dist/` builds: their wrapper assigns
  // `window.window` and throws when loaded as an ES module — measured in the
  // frame). `gsap-core.js` and `Observer.js` are self-contained (zero
  // relative imports, verified by grep); `three.core.js` likewise, while
  // `three.module.js` carries the renderer implementation with exactly two
  // `from './three.core.js'` imports (`WebGLRenderer` lives there — `core`
  // alone exports no renderer, measured as `not a constructor`).
  const gsapCoreBytes = new Uint8Array(
    readFileSync(repoPath("node_modules/gsap/gsap-core.js")),
  );
  const observerBytes = new Uint8Array(
    readFileSync(repoPath("node_modules/gsap/Observer.js")),
  );
  const threeCoreBytes = new Uint8Array(
    readFileSync(repoPath("node_modules/three/build/three.core.js")),
  );
  const gsapPkg = JSON.parse(
    readFileSync(repoPath("node_modules/gsap/package.json"), "utf8"),
  ) as { version: string; license: string };
  const threePkg = JSON.parse(
    readFileSync(repoPath("node_modules/three/package.json"), "utf8"),
  ) as { version: string; license: string };

  // Pinned output names via the REAL mapping, computed from the repo bytes —
  // the template's relative imports resolve to exactly these hashed files.
  const vendorGsapCoreOut = hashedOutputPath(
    "components/vendor/gsap-core.js",
    gsapCoreBytes,
  );
  const vendorObserverOut = hashedOutputPath(
    "components/vendor/observer.js",
    observerBytes,
  );
  // The ONLY byte deltas from `node_modules`: the pipeline emits bytes
  // verbatim with content-hashed names and never rewrites imports, so the
  // two intra-package relative specifiers are pinned here to the exact
  // hashed sibling names (exact-once replacement — zero or two hits throw).
  // Provenance is re-pinned below: each rewritten file must equal its repo
  // source with ONLY that specifier changed.
  const cssPluginBytes = new TextEncoder().encode(
    pinVendorSpecifier(
      readFileSync(repoPath("node_modules/gsap/CSSPlugin.js"), "utf8"),
      "./gsap-core.js",
      `./${vendorGsapCoreOut.split("/").pop()}`,
    ),
  );
  const scrollTriggerBytes = new TextEncoder().encode(
    pinVendorSpecifier(
      readFileSync(repoPath("node_modules/gsap/ScrollTrigger.js"), "utf8"),
      "./Observer.js",
      `./${vendorObserverOut.split("/").pop()}`,
    ),
  );
  const vendorCssOut = hashedOutputPath(
    "components/vendor/cssplugin.js",
    cssPluginBytes,
  );
  const vendorStOut = hashedOutputPath(
    "components/vendor/scrolltrigger.js",
    scrollTriggerBytes,
  );
  const vendorThreeCoreOut = hashedOutputPath(
    "components/vendor/three-core.js",
    threeCoreBytes,
  );
  const threeModuleBytes = new TextEncoder().encode(
    pinVendorSpecifier(
      readFileSync(
        repoPath("node_modules/three/build/three.module.js"),
        "utf8",
      ),
      "./three.core.js",
      `./${vendorThreeCoreOut.split("/").pop()}`,
      2,
    ),
  );
  const vendorThreeOut = hashedOutputPath(
    "components/vendor/three.js",
    threeModuleBytes,
  );
  const appSource = readFileSync(fixturePath("app.template.js"), "utf8")
    .replace(
      "__VENDOR_GSAP_CORE__",
      `./vendor/${vendorGsapCoreOut.split("/").pop()}`,
    )
    .replace(
      "__VENDOR_CSSPLUGIN__",
      `./vendor/${vendorCssOut.split("/").pop()}`,
    )
    .replace(
      "__VENDOR_SCROLLTRIGGER__",
      `./vendor/${vendorStOut.split("/").pop()}`,
    )
    .replace("__VENDOR_THREE__", `./vendor/${vendorThreeOut.split("/").pop()}`);
  for (const token of [
    "__VENDOR_GSAP_CORE__",
    "__VENDOR_CSSPLUGIN__",
    "__VENDOR_SCROLLTRIGGER__",
    "__VENDOR_THREE__",
  ]) {
    if (appSource.includes(token)) {
      throw new Error(`fixture template token unsubstituted: ${token}`);
    }
  }

  const manifest = {
    id: REAL_THEME_ID,
    version: REAL_THEME_VERSION,
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: ["presentation", "animation", "webgl"],
    dependencies: [
      {
        name: "gsap",
        version: gsapPkg.version,
        license: gsapPkg.license,
        // Entry pin: the verbatim `gsap-core.js` bytes. The rewritten
        // siblings are bound the same way as every other file — by the
        // release fingerprint + per-file hash assertion at serve time.
        integrity: sha384(gsapCoreBytes),
      },
      {
        name: "three",
        version: threePkg.version,
        license: threePkg.license,
        integrity: sha384(threeModuleBytes),
      },
    ],
    sections: [
      { key: "hero", slot: "main", component: "HeroCanvas" },
      { key: "webgl-scene", slot: "main", component: "WebglScene" },
    ],
    settings: [
      { key: "headline", label: "Headline", type: "text" },
      { key: "motion", label: "Motion", type: "animation" },
    ],
  };
  const files = [
    {
      path: "dev.theme.json",
      bytes: new TextEncoder().encode(JSON.stringify(manifest)),
    },
    {
      path: "components/app.js",
      bytes: new TextEncoder().encode(appSource),
    },
    { path: "components/vendor/gsap-core.js", bytes: gsapCoreBytes },
    { path: "components/vendor/cssplugin.js", bytes: cssPluginBytes },
    { path: "components/vendor/observer.js", bytes: observerBytes },
    { path: "components/vendor/scrolltrigger.js", bytes: scrollTriggerBytes },
    { path: "components/vendor/three-core.js", bytes: threeCoreBytes },
    { path: "components/vendor/three.js", bytes: threeModuleBytes },
    {
      path: "styles/main.css",
      bytes: new TextEncoder().encode(
        readFileSync(fixturePath("main.css"), "utf8"),
      ),
    },
    {
      path: "locales/en.json",
      bytes: new TextEncoder().encode(
        readFileSync(fixturePath("en.json"), "utf8"),
      ),
    },
  ];
  const assembled = assembleDevThemeBundle({
    manifestJson: manifest,
    files,
    dependencies: manifest.dependencies.map((d) => ({ ...d })),
    allowedNetworkHosts: VENDOR_NETWORK_LITERALS,
    // Documented vendor stage: every manifest pin must match the digest of
    // the repo's own package bytes (local bytes only, never a fetch). The
    // rewritten siblings travel as the exact assembled bytes, so their pins
    // stay cryptographically bound to what the frame executes.
    vendorFiles: [
      { path: "vendor/gsap-core.js", bytes: gsapCoreBytes },
      { path: "vendor/CSSPlugin.js", bytes: cssPluginBytes },
      { path: "vendor/Observer.js", bytes: observerBytes },
      { path: "vendor/ScrollTrigger.js", bytes: scrollTriggerBytes },
      { path: "vendor/three.core.js", bytes: threeCoreBytes },
      { path: "vendor/three.module.js", bytes: threeModuleBytes },
    ],
  });
  if (!assembled.ok) {
    throw new Error(
      `real theme assemble refused: ${assembled.errors.join(", ")}`,
    );
  }
  // Byte-identity proof: the served outputs hash to the repo bytes.
  // Verbatim files must match `node_modules` byte-for-byte; rewritten files
  // must equal their repo source with ONLY the pinned specifier changed.
  // Byte-identity proof: the served outputs hash to the repo bytes.
  for (const [src, bytes] of [
    ["components/vendor/gsap-core.js", gsapCoreBytes],
    ["components/vendor/cssplugin.js", cssPluginBytes],
    ["components/vendor/observer.js", observerBytes],
    ["components/vendor/scrolltrigger.js", scrollTriggerBytes],
    ["components/vendor/three-core.js", threeCoreBytes],
    ["components/vendor/three.js", threeModuleBytes],
  ] as const) {
    const expected = hashedOutputPath(src, bytes);
    if (!assembled.outputs.some((o) => o.path === expected)) {
      throw new Error(
        `assembled outputs lost the pinned vendor file ${expected}`,
      );
    }
  }
  // Rewrite proof: each rewritten file equals its repo source with ONLY
  // the pinned specifier changed (reverse the pin, compare verbatim).
  const repoText = (rel: string): string => readFileSync(repoPath(rel), "utf8");
  for (const [repoRel, finalBytes, from, to, count] of [
    [
      "node_modules/gsap/CSSPlugin.js",
      cssPluginBytes,
      "./gsap-core.js",
      `./${vendorGsapCoreOut.split("/").pop()}`,
      1,
    ],
    [
      "node_modules/gsap/ScrollTrigger.js",
      scrollTriggerBytes,
      "./Observer.js",
      `./${vendorObserverOut.split("/").pop()}`,
      1,
    ],
    [
      "node_modules/three/build/three.module.js",
      threeModuleBytes,
      "./three.core.js",
      `./${vendorThreeCoreOut.split("/").pop()}`,
      2,
    ],
  ] as const) {
    const finalText = new TextDecoder().decode(finalBytes);
    if (finalText.split(to).length - 1 !== count) {
      throw new Error(`rewrite proof refused: ${repoRel} pin count mismatch`);
    }
    if (finalText.split(to).join(from) !== repoText(repoRel)) {
      throw new Error(
        `rewrite proof refused: ${repoRel} differs beyond the pinned specifier`,
      );
    }
  }

  const store = createDevThemeReleaseStore();
  const { release: submitted } = store.submit({
    merchantId: SELLER,
    themeId: REAL_THEME_ID,
    manifest: assembled.manifest,
    files: assembled.files,
    fingerprint: assembled.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  store.review({
    releaseId: submitted.id,
    merchantId: SELLER,
    reviewer: { ...MOD },
    decision: "approve",
    reason: "real gsap+three bundle, webgl fallback proof attached",
    reviewedAt: T1,
  });
  const { release } = store.publish({
    releaseId: submitted.id,
    merchantId: SELLER,
    actor: { ...MOD },
    expectedFingerprint: assembled.fingerprint,
    publishedAt: T1,
  });

  const ns = `dev-themes/${REAL_THEME_ID}/${REAL_THEME_VERSION}`;
  const isText = (p: string): boolean =>
    /\.(js|mjs|cjs|css|map|json|svg)$/.test(p);
  const assetRows = assembled.outputs.map((o) => ({
    merchant_id: MERCHANT,
    theme_id: null,
    name: `${ns}/${o.path}`,
    kind: o.path.endsWith(".css")
      ? "css"
      : o.path.endsWith(".json")
        ? "json"
        : "js",
    content: isText(o.path)
      ? new TextDecoder().decode(o.bytes)
      : Buffer.from(o.bytes).toString("base64"),
    url: `/t/${REAL_THEME_ID}/${REAL_THEME_VERSION}/${o.path}`,
    bytes: o.bytes.length,
    enabled: true,
  }));
  return {
    themeId: REAL_THEME_ID,
    version: REAL_THEME_VERSION,
    manifest,
    fingerprint: assembled.fingerprint,
    release: release as DevThemeRelease,
    approvalRows: [
      {
        merchant_id: MERCHANT,
        theme_id: null,
        name: `${ns}/.approval.json`,
        kind: "json",
        content: JSON.stringify(release),
        url: null,
        bytes: JSON.stringify(release).length,
        enabled: true,
      },
    ],
    mapRows: [
      {
        merchant_id: MERCHANT,
        theme_id: null,
        name: `${ns}/release.json`,
        kind: "json",
        content: assembled.releaseJson,
        url: null,
        bytes: assembled.releaseJson.length,
        enabled: true,
      },
    ],
    assetRows,
    outputs: assembled.outputs,
    vendor: { gsapVersion: gsapPkg.version, threeVersion: threePkg.version },
  };
}

export type MirrorDb = ReturnType<typeof fakeDb>;

/**
 * Install-equivalent rows, mirroring `installReviewedThemeBundle`'s
 * persistence mapping field-for-field (ledger linkage, host projection with
 * `is_active: false`, fingerprinted asset rows + `release.json` descriptor
 * + `.approval.json` snapshot). See the module header for why the lane
 * itself is mirrored rather than called.
 */
export function seedInstallMirrorDb(prep: RealThemePrep): MirrorDb {
  const db = fakeDb({
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
  db.rows("marketplace_installs").push({
    id: "install-1",
    merchant_id: MERCHANT,
    kind: "theme",
    listing_slug: REAL_THEME_ID,
    listing_name: "Aurora Lookbook",
    version: REAL_THEME_VERSION,
    status: "installed",
    artifact_checksum: prep.fingerprint,
    artifact_version: REAL_THEME_VERSION,
  });
  db.rows("store_themes").push({
    id: "theme-1",
    merchant_id: MERCHANT,
    name: "Aurora Lookbook",
    is_active: false,
    source_install_id: "install-1",
    source_listing_slug: REAL_THEME_ID,
  });
  db.rows("theme_versions").push({
    id: "version-1",
    merchant_id: MERCHANT,
    theme_id: "theme-1",
    version: 1,
    status: "draft",
    checksum: prep.fingerprint,
  });
  db.rows("theme_assets").push(
    ...prep.assetRows,
    ...prep.mapRows,
    ...prep.approvalRows,
  );
  return db;
}

export type ServedRequest = { url: string; status: number };

export type VerifiedThemeServer = {
  origin: string;
  requests: ServedRequest[];
  close: () => Promise<void>;
};

const SERVE_CONTENT_TYPES: [RegExp, string][] = [
  [/\.m?js$/, "text/javascript; charset=utf-8"],
  [/\.css$/, "text/css; charset=utf-8"],
  [/\.json$/, "application/json; charset=utf-8"],
];

function contentTypeFor(path: string): string | null {
  for (const [re, type] of SERVE_CONTENT_TYPES) {
    if (re.test(path.toLowerCase())) return type;
  }
  return null;
}

/**
 * Serve the REAL verified document + REAL hash-asserted asset bytes over
 * loopback HTTP with production headers. The document comes from
 * `buildDevThemeDocument` (approval + descriptor verification); every served
 * asset (including every document ref) is asserted against the verified
 * descriptor's sha256 (the serve lane's byte leg on the fixed snapshot —
 * the per-request chain against live rows is pinned by `t.$.test.ts`).
 */
export async function serveVerifiedTheme(
  prep: RealThemePrep,
): Promise<VerifiedThemeServer> {
  const ns = `dev-themes/${prep.themeId}/${prep.version}`;
  const assetByName = new Map<string, Record<string, unknown>>();
  for (const row of [
    ...prep.assetRows,
    ...prep.mapRows,
    ...prep.approvalRows,
  ]) {
    assetByName.set(row.name as string, row);
  }
  const mapFiles = (
    JSON.parse(prep.mapRows[0]!.content as string) as {
      files: { path: string; sha256: string; bytes: number }[];
    }
  ).files;
  const requests: ServedRequest[] = [];
  const server = createServer((req, res) => {
    const record = (status: number): void => {
      requests.push({ url: req.url ?? "", status });
    };
    const deny = (): void => {
      record(404);
      res.writeHead(404, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end("not_found");
    };
    try {
      const rawPath = (req.url ?? "").split("?")[0];
      // CSP-free harness shell (static, no inline script, `no-store`): the
      // host document the frame is appended to. Served from the SAME
      // loopback origin so Private Network Access checks pass on default
      // Chromium (an `about:blank`+`setContent` shell is cross-address-space
      // and Chrome blocks the frame navigation with
      // `ERR_BLOCKED_BY_PRIVATE_NETWORK_ACCESS_CHECKS` before any theme
      // byte executes). The dev server cannot host it: it ships
      // `frame-src 'self'`, which would (correctly) refuse to frame the
      // loopback theme origin — so the REAL frame CSP on the theme
      // document stays the only policy under test. Never a theme URL
      // (outside `/t/`, never hash-asserted, never cached).
      if (rawPath === "/harness") {
        record(200);
        const shell =
          `<!doctype html><html><head><title>Aurora Lookbook — Level B harness</title></head>` +
          `<body><main><h1>Host storefront shell</h1><div id="frame-slot"></div>` +
          `</main></body></html>`;
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        });
        res.end(shell);
        return;
      }
      const match = /^\/t\/([^/]+)\/([^/]+)\/(.+)$/.exec(rawPath);
      if (!match) return deny();
      const [, themeId, version, assetPath] = match as [
        string,
        string,
        string,
        string,
      ];
      if (themeId !== prep.themeId || version !== prep.version) return deny();
      if (assetPath === "index.html") {
        const doc = buildDevThemeDocument({
          themeId,
          version,
          assetOrigin: selfOrigin(),
          approvalRows: prep.approvalRows,
          mapRows: prep.mapRows,
        });
        if (doc.status === 404) return deny();
        for (const ref of doc.refs) {
          const row = assetByName.get(`${ns}/${ref}`);
          const entry = mapFiles.find((f) => f.path === ref);
          const bytes =
            row && typeof row.content === "string"
              ? new TextEncoder().encode(row.content)
              : null;
          if (
            !entry ||
            !bytes ||
            bytes.length !== entry.bytes ||
            hashBytes(bytes) !== entry.sha256
          ) {
            return deny();
          }
        }
        record(200);
        res.writeHead(200, {
          ...(doc.headers as Record<string, string>),
          // Mirror of the production `/t/…` CORS lane: the opaque frame
          // fetches `type="module"` scripts in CORS mode.
          "access-control-allow-origin": "*",
        });
        res.end(Buffer.from(doc.body));
        return;
      }
      const row = assetByName.get(`${ns}/${assetPath}`);
      const entry = mapFiles.find((f) => f.path === assetPath);
      const type = contentTypeFor(assetPath);
      const bytes =
        row && typeof row.content === "string"
          ? new TextEncoder().encode(row.content)
          : null;
      if (
        !entry ||
        !type ||
        !bytes ||
        bytes.length !== entry.bytes ||
        hashBytes(bytes) !== entry.sha256
      ) {
        return deny();
      }
      record(200);
      res.writeHead(200, {
        "content-type": type,
        "x-content-type-options": "nosniff",
        // Mirror of the production `/t/…` CORS lane (see `src/routes/t.$.ts`).
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=31536000, immutable",
      });
      res.end(Buffer.from(bytes));
    } catch {
      deny();
    }
  });
  const selfOrigin = (): string => {
    const addr = server.address();
    if (addr && typeof addr === "object") {
      return `http://127.0.0.1:${addr.port}`;
    }
    throw new Error("theme server has no address");
  };
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    origin: selfOrigin(),
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** 429-tolerant navigation: wait ~65s and retry once, else rethrow. */
export async function gotoWithRateRetry(
  page: Page,
  url: string,
): Promise<Response | null> {
  const first = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  if (first?.status() === 429) {
    await page.waitForTimeout(65_000);
    return page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
  }
  return first;
}
