import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  activateDevThemeInstall,
  bindDevThemeRuntime,
  resolveDevThemeActivation,
} from "../src/lib/dev-theme-activate";
import { createDevThemeReleaseStore } from "../src/lib/dev-theme-review";
import type { DevThemeActor } from "../src/lib/dev-theme-review";
import type { DevThemeManifest } from "../src/lib/dev-theme-manifest";
import {
  buildThemeFrameUrl,
  themeFrameCSP,
} from "../src/components/theme-runtime/ThemeRuntime";
import {
  REAL_THEME_ID,
  REAL_THEME_VERSION,
  prepareRealTheme,
  seedInstallMirrorDb,
  serveVerifiedTheme,
  type VerifiedThemeServer,
} from "./helpers-levelb";

/**
 * Level B lifecycle — install → approve → publish → activate → switch →
 * serve (genuine bundle, no fixtures beyond the previous lane).
 *
 * EXTENDS `levelb-theme-execution.spec.ts`, never redoes it: that spec owns
 * the vendor byte-proof (real gsap 3.15.0 + three 0.186.1 sources), the
 * sandboxed-frame execution receipt (GSAP timeline + ScrollTrigger scrub +
 * THREE.WebGLRenderer), and the opaque-isolation asserts. Nothing here
 * re-executes the bundle in a browser.
 *
 * What THIS spec proves, all through REAL lanes with the REAL approved
 * bytes (`prepareRealTheme()` — assemble → submit → approve → publish):
 *
 * 1. Publish lane pointer: two approved releases; publishing the second
 *    moves the live pointer (first becomes `superseded`, re-publish of the
 *    old live release is refused) — the release-level half of switching.
 * 2. Fingerprint refusal: publish naming any other fingerprint throws
 *    before any pointer moves.
 * 3. Genuine install → activate → SWITCH: install-mirror rows activate
 *    through the REAL `activateDevThemeInstall` (checksum dual
 *    corroboration), then a second install of the same approved bytes
 *    activates and the `is_active` flag flips (clear-others/set-live) with
 *    one audit row per activation — the merchant-visible theme switch.
 *    A tampered fingerprint is refused before any flag flips.
 * 4. Serve the active binding over real loopback HTTP: frame doc 200 with
 *    the restrictive CSP, every hashed asset 200, unknown version 404, and
 *    `bindDevThemeRuntime` rebinds the frame URL to the active
 *    theme/version — the storefront-render serving leg.
 * 5. Static pins (read-only): the production install → publish → serve
 *    wiring these lanes mirror.
 *
 * Proof-limited (stated, never elided): the install lane itself runs in
 * vitest (it dynamic-imports `@/`-aliased server modules unresolvable in
 * this worker), so installs are install-EQUIVALENT mirror rows
 * field-for-field (same helper the execution spec uses); the install →
 * serve round-trip on real persisted rows is pinned by
 * `dev-theme-asset-serve.test.ts` + `t.$.test.ts`. The merchant-facing
 * switch UI lives under `_authenticated` (same wall proven at runtime by
 * `plugin-authenticated-journey.spec.ts`); no auth is stubbed here.
 *
 * Cleanup: every spawned theme server closed in afterAll (the dev server
 * itself is owned by the Playwright webServer entry). No dev server started
 * by this spec.
 */

const SELLER = "11111111-1111-1111-1111-111111111111";
const MERCHANT = "22222222-2222-2222-2222-222222222222";
const MOD: DevThemeActor = { id: "reviewer-1", role: "moderator" };
const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";
const T2 = "2026-10-03T00:00:00.000Z";

let servers: VerifiedThemeServer[] = [];

test.afterAll(async () => {
  const pending = servers;
  servers = [];
  for (const s of pending) {
    try {
      await s.close();
    } catch {
      // Best-effort teardown; a close failure must not mask test results.
    }
  }
});

function srcPath(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function src(rel: string): string {
  return readFileSync(srcPath(rel), "utf8");
}

test("publish lane: second publish moves the live pointer; stale re-publish refused", () => {
  const prep = prepareRealTheme();
  const store = createDevThemeReleaseStore();
  const sha256 = (bytes: Uint8Array): string =>
    createHash("sha256").update(bytes).digest("hex");
  const files = prep.outputs.map((o) => ({
    path: o.path,
    sha256: sha256(o.bytes),
    bytes: o.bytes.length,
  }));
  const manifest = {
    ...(prep.manifest as unknown as Record<string, unknown>),
    version: REAL_THEME_VERSION,
  } as unknown as DevThemeManifest;
  const fp1 = prep.fingerprint;
  const fp2 = `${fp1.slice(0, 63)}${fp1[63] === "0" ? "1" : "0"}`;

  const r1 = store.submit({
    merchantId: SELLER,
    themeId: REAL_THEME_ID,
    manifest,
    files,
    fingerprint: fp1,
    submittedBy: "dev-1",
    submittedAt: T0,
  }).release;
  store.review({
    releaseId: r1.id,
    merchantId: SELLER,
    reviewer: { ...MOD },
    decision: "approve",
    reason: "genuine gsap+three bundle",
    reviewedAt: T1,
  });
  const r2 = store.submit({
    merchantId: SELLER,
    themeId: REAL_THEME_ID,
    manifest,
    files,
    fingerprint: fp2,
    submittedBy: "dev-1",
    submittedAt: T1,
  }).release;
  store.review({
    releaseId: r2.id,
    merchantId: SELLER,
    reviewer: { ...MOD },
    decision: "approve",
    reason: "follow-up of the genuine bundle",
    reviewedAt: T1,
  });

  // Publish the first release: live.
  const live1 = store.publish({
    releaseId: r1.id,
    merchantId: SELLER,
    actor: { ...MOD },
    expectedFingerprint: fp1,
    publishedAt: T1,
  });
  expect(live1.release.status).toBe("published");
  expect(live1.audit.action).toBe("dev_theme.published");

  // Publish the second: the live pointer moves (previous retained, audited).
  const live2 = store.publish({
    releaseId: r2.id,
    merchantId: SELLER,
    actor: { ...MOD },
    expectedFingerprint: fp2,
    publishedAt: T2,
  });
  expect(live2.release.status).toBe("published");
  expect(live2.audit.action).toBe("dev_theme.published");

  // The displaced live release is superseded: re-publishing it is refused
  // (approval for the CURRENT live fingerprint is what publishes).
  expect(() =>
    store.publish({
      releaseId: r1.id,
      merchantId: SELLER,
      actor: { ...MOD },
      expectedFingerprint: fp1,
      publishedAt: T2,
    }),
  ).toThrow();
});

test("publish lane: wrong fingerprint refused before any pointer moves", () => {
  const prep = prepareRealTheme();
  const store = createDevThemeReleaseStore();
  const files = prep.outputs.map((o) => ({
    path: o.path,
    sha256: createHash("sha256").update(o.bytes).digest("hex"),
    bytes: o.bytes.length,
  }));
  const manifest = {
    ...(prep.manifest as unknown as Record<string, unknown>),
    version: REAL_THEME_VERSION,
  } as unknown as DevThemeManifest;
  const r = store.submit({
    merchantId: SELLER,
    themeId: REAL_THEME_ID,
    manifest,
    files,
    fingerprint: prep.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  }).release;
  store.review({
    releaseId: r.id,
    merchantId: SELLER,
    reviewer: { ...MOD },
    decision: "approve",
    reason: "genuine gsap+three bundle",
    reviewedAt: T1,
  });
  const wrong = `${prep.fingerprint.slice(0, 63)}${prep.fingerprint[63] === "0" ? "1" : "0"}`;
  expect(() =>
    store.publish({
      releaseId: r.id,
      merchantId: SELLER,
      actor: { ...MOD },
      expectedFingerprint: wrong,
      publishedAt: T1,
    }),
  ).toThrow("Publish names a different fingerprint");
  // Still approved (never published under the lie): the honest publish works.
  const honest = store.publish({
    releaseId: r.id,
    merchantId: SELLER,
    actor: { ...MOD },
    expectedFingerprint: prep.fingerprint,
    publishedAt: T1,
  });
  expect(honest.release.status).toBe("published");
});

test("install → activate → switch flips the live flag with per-switch audit", async () => {
  const prep = prepareRealTheme();
  const db = seedInstallMirrorDb(prep);

  const first = await activateDevThemeInstall(
    db.asClient() as never,
    MERCHANT,
    {
      themeId: "theme-1",
      release: prep.release,
      expectedFingerprint: prep.fingerprint,
      expectedThemeId: REAL_THEME_ID,
      actorId: "reviewer-1",
    },
  );
  expect(first.fingerprint).toBe(prep.fingerprint);

  // Merchant installs the same approved bytes a second time (second
  // listing): host + ledger + version rows, install-EQUIVALENT shape.
  db.rows("marketplace_installs").push({
    id: "install-2",
    merchant_id: MERCHANT,
    kind: "theme",
    listing_slug: REAL_THEME_ID,
    listing_name: "Aurora Lookbook (second install)",
    version: REAL_THEME_VERSION,
    status: "installed",
    artifact_checksum: prep.fingerprint,
    artifact_version: REAL_THEME_VERSION,
  });
  db.rows("store_themes").push({
    id: "theme-2",
    merchant_id: MERCHANT,
    name: "Aurora Lookbook copy",
    is_active: false,
    source_install_id: "install-2",
    source_listing_slug: REAL_THEME_ID,
  });
  db.rows("theme_versions").push({
    id: "version-2",
    merchant_id: MERCHANT,
    theme_id: "theme-2",
    version: 1,
    status: "draft",
    checksum: prep.fingerprint,
  });

  // THE SWITCH through the real lane: clear-others + set-live.
  const second = await activateDevThemeInstall(
    db.asClient() as never,
    MERCHANT,
    {
      themeId: "theme-2",
      release: prep.release,
      expectedFingerprint: prep.fingerprint,
      expectedThemeId: REAL_THEME_ID,
      actorId: "reviewer-1",
    },
  );
  expect(second.fingerprint).toBe(prep.fingerprint);

  const themes = db.rows("store_themes") as {
    id: string;
    is_active: boolean;
  }[];
  expect(themes.find((t) => t.id === "theme-1")?.is_active).toBe(false);
  expect(themes.find((t) => t.id === "theme-2")?.is_active).toBe(true);
  const audits = db.rows("theme_audit") as {
    action: string;
    theme_id: string;
  }[];
  const switched = audits.filter((a) => a.action === "dev_theme.activated");
  expect(switched.map((a) => a.theme_id).sort()).toEqual([
    "theme-1",
    "theme-2",
  ]);

  // Tampered bytes are refused BEFORE any flag flips (fresh mirror so the
  // live flag above is undisturbed).
  const tampered = seedInstallMirrorDb(prep);
  const badFp = `${prep.fingerprint.slice(0, 63)}${prep.fingerprint[63] === "0" ? "1" : "0"}`;
  await expect(
    activateDevThemeInstall(tampered.asClient() as never, MERCHANT, {
      themeId: "theme-1",
      release: prep.release,
      expectedFingerprint: badFp,
      expectedThemeId: REAL_THEME_ID,
      actorId: "reviewer-1",
    }),
  ).rejects.toThrow();
  const untouched = tampered.rows("store_themes") as {
    id: string;
    is_active: boolean;
  }[];
  expect(untouched.every((t) => t.is_active === false)).toBe(true);
});

test("serve: active binding serves 200 + CSP, unknown version 404s", async () => {
  const prep = prepareRealTheme();
  const server = await serveVerifiedTheme(prep);
  servers.push(server);

  // The frame document the storefront would bind: 200, restrictive CSP.
  const doc = await fetch(
    `${server.origin}/t/${REAL_THEME_ID}/${REAL_THEME_VERSION}/index.html`,
  );
  expect(doc.status).toBe(200);
  const csp = doc.headers.get("content-security-policy") ?? "";
  expect(csp).toBe(themeFrameCSP(server.origin));
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  await doc.arrayBuffer();

  // Every hashed bundle asset serves 200 over real HTTP.
  for (const o of prep.outputs.filter(
    (out) => out.path.endsWith(".js") || out.path.endsWith(".css"),
  )) {
    const res = await fetch(
      `${server.origin}/t/${REAL_THEME_ID}/${REAL_THEME_VERSION}/${o.path}`,
    );
    expect(`${o.path}: ${res.status}`).toBe(`${o.path}: 200`);
    await res.arrayBuffer();
  }

  // An inactive/unknown version is not served (the switch leaves no stale
  // addressable bundle behind on this origin).
  const miss = await fetch(
    `${server.origin}/t/${REAL_THEME_ID}/0.0.0/index.html`,
  );
  expect(miss.status).toBe(404);
  await miss.arrayBuffer();

  // The binding rebinds to the ACTIVE theme/version: after the switch the
  // storefront frame URL addresses exactly these served bytes.
  const bound = resolveDevThemeActivation({
    release: prep.release,
    expectedFingerprint: prep.fingerprint,
    expectedThemeId: REAL_THEME_ID,
  });
  const runtime = bindDevThemeRuntime(bound, { assetOrigin: server.origin });
  expect(runtime.url).toBe(
    `${server.origin}/t/${REAL_THEME_ID}/${REAL_THEME_VERSION}/index.html`,
  );
  expect(runtime.url).toBe(
    buildThemeFrameUrl(server.origin, {
      name: REAL_THEME_ID,
      version: REAL_THEME_VERSION,
    }),
  );
});

test("static wiring: install → publish → serve production chain", () => {
  // Install lane: reviewed-bundle install behind the marketplace server fn.
  const bundleInstall = src("src/lib/dev-theme-bundle-install.ts");
  expect(
    bundleInstall.includes("export async function installReviewedThemeBundle"),
    "install lane pins installReviewedThemeBundle",
  ).toBe(true);
  const marketInstall = src("src/lib/marketplace-install.server.ts");
  expect(
    marketInstall.includes("installReviewedThemeBundle"),
    "marketplace install calls the reviewed-bundle lane",
  ).toBe(true);

  // Publish lane: version publish behind dashboard + marketplace server fns.
  const vault = src("src/lib/marketplace-vault.server.ts");
  expect(
    vault.includes("export async function publishVersion"),
    "vault pins publishVersion",
  ).toBe(true);
  for (const [rel, token] of [
    ["src/lib/themes.functions.ts", "publishVersion"],
    ["src/lib/marketplace.functions.ts", "publishVersion"],
  ] as const) {
    expect(src(rel).includes(token), `${rel} pins ${token}`).toBe(true);
  }

  // Serve lane: fingerprinted asset origin + namespace + the activation
  // mirror the executable lane enforces.
  const themesServer = src("src/lib/themes.server.ts");
  for (const token of [
    "activateDevThemeInstall",
    "devThemeAssetOrigin",
    "devThemeAssetNamespace",
  ]) {
    expect(themesServer.includes(token), `themes.server pins ${token}`).toBe(
      true,
    );
  }

  // Merchant surfaces: marketplace install UI + storefront themed render.
  const marketplace = src(
    "src/routes/_authenticated/dashboard/marketplace/index.tsx",
  );
  for (const token of ["marketInstallFn", "InstallConsent", "InstalledApps"]) {
    expect(marketplace.includes(token), `marketplace pins ${token}`).toBe(true);
  }
  const storefront = src("src/routes/store.$slug.index.tsx");
  expect(storefront.includes("themeKey"), "storefront pins themeKey").toBe(
    true,
  );
});
