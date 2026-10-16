import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  activateDevThemeInstall,
  bindDevThemeRuntime,
  resolveDevThemeActivation,
} from "../src/lib/dev-theme-activate";
import { themeFrameCSP } from "../src/components/theme-runtime/ThemeRuntime";
import {
  REAL_THEME_ID,
  REAL_THEME_VERSION,
  prepareRealTheme,
  seedInstallMirrorDb,
  serveVerifiedTheme,
  type VerifiedThemeServer,
} from "./helpers-levelb";

/**
 * Level B switch → serve journey (genuine install, no fixtures beyond prep).
 *
 * EXTENDS `levelb-theme-lifecycle.spec.ts` and `levelb-theme-execution.spec.ts`,
 * never redoes them:
 * - Lifecycle owns: publish-pointer moves, fingerprint refusal, the
 *   install → activate → switch flag flip with per-switch audit, and serving
 *   the bundle — but it NEVER serves AFTER a switch, so nothing proves the
 *   post-switch storefront binding addresses live bytes.
 * - Execution owns: vendor byte-proof + sandboxed-frame execution receipt +
 *   opaque isolation — untouched here; this spec never executes bundle code
 *   in a browser.
 *
 * What THIS spec proves, all through REAL lanes with the REAL approved bytes
 * (`prepareRealTheme()` — assemble → submit → approve → publish):
 *
 * 1. Full merchant journey: install → activate → second install → SWITCH →
 *    bind the ACTIVE release → serve → the storefront frame URL for the
 *    post-switch theme answers 200 with the restrictive CSP, a hashed asset
 *    answers 200, and an unknown version 404s. The switch→serve round-trip
 *    neither sibling spec covers.
 * 2. Static pins (read-only): the production storefront leg that binding
 *    addresses — the custom-isolated `ThemeChrome` → `ThemeRuntime` mount
 *    and the `/t/…` serve lane. (Lifecycle already pins the install/publish
 *    lanes; those tokens are NOT repeated here.)
 *
 * Proof-limited (stated, never elided): installs are install-EQUIVALENT
 * mirror rows (same helper + rationale as the lifecycle spec — the install
 * lane dynamic-imports `@/`-aliased server modules unresolvable in this
 * worker); the merchant-facing switch click lives under `_authenticated`
 * (same wall proven at runtime by `plugin-authenticated-journey.spec.ts`),
 * so the switch here runs through the REAL `activateDevThemeInstall` lane
 * rather than a UI click; no auth is stubbed anywhere.
 *
 * Cleanup: the spawned theme server is closed in afterAll (the dev server
 * itself is owned by the Playwright webServer entry). No dev server started
 * by this spec.
 */

const MERCHANT = "22222222-2222-2222-2222-222222222222";

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

test("switch → serve: post-switch active binding addresses live approved bytes", async () => {
  // Assemble → submit → approve → publish through the REAL lanes.
  const prep = prepareRealTheme();
  expect(prep.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(prep.release.status).toBe("published");

  // Merchant installs the approved bytes; first activation goes live.
  const db = seedInstallMirrorDb(prep);
  await activateDevThemeInstall(db.asClient() as never, MERCHANT, {
    themeId: "theme-1",
    release: prep.release,
    expectedFingerprint: prep.fingerprint,
    expectedThemeId: REAL_THEME_ID,
    actorId: "reviewer-1",
  });

  // Merchant installs the same approved bytes a second time, then SWITCHES:
  // the live flag flips theme-1 → theme-2 through the REAL lane.
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
  const switched = await activateDevThemeInstall(
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
  expect(switched.fingerprint).toBe(prep.fingerprint);
  const themes = db.rows("store_themes") as {
    id: string;
    is_active: boolean;
  }[];
  expect(themes.find((t) => t.id === "theme-1")?.is_active).toBe(false);
  expect(themes.find((t) => t.id === "theme-2")?.is_active).toBe(true);

  // THE STOREFFRONT-RENDER LEG AFTER THE SWITCH: the active release binds
  // to exactly the frame URL the storefront would mount, and those bytes
  // serve live over real loopback HTTP.
  const bound = resolveDevThemeActivation({
    release: prep.release,
    expectedFingerprint: prep.fingerprint,
    expectedThemeId: REAL_THEME_ID,
  });
  const server = await serveVerifiedTheme(prep);
  servers.push(server);
  const runtime = bindDevThemeRuntime(bound, { assetOrigin: server.origin });
  expect(runtime.url).toBe(
    `${server.origin}/t/${REAL_THEME_ID}/${REAL_THEME_VERSION}/index.html`,
  );

  // Frame document: 200 with the restrictive CSP (scripts hash-pinned,
  // no script unsafe-inline; style unsafe-inline is the ThemeRuntime
  // contract — cf. the execution spec's `script-src[^;]*` assertion).
  const doc = await fetch(runtime.url);
  expect(doc.status).toBe(200);
  const csp = doc.headers.get("content-security-policy") ?? "";
  expect(csp).toBe(themeFrameCSP(server.origin));
  expect(csp).toContain("default-src 'none'");
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  await doc.arrayBuffer();

  // A hashed bundle asset behind the active binding serves 200.
  const jsOut = prep.outputs.find((o) => o.path.endsWith(".js"))!;
  const asset = await fetch(
    `${server.origin}/t/${REAL_THEME_ID}/${REAL_THEME_VERSION}/${jsOut.path}`,
  );
  expect(asset.status).toBe(200);
  await asset.arrayBuffer();

  // An unknown version is not served — the switch leaves no stale
  // addressable bundle behind on this origin.
  const miss = await fetch(
    `${server.origin}/t/${REAL_THEME_ID}/0.0.0/index.html`,
  );
  expect(miss.status).toBe(404);
  await miss.arrayBuffer();
});

test("static wiring: custom-isolated storefront mount + /t/ serve lane", () => {
  // Storefront mount: ONLY a record flagged `runtime: "custom-isolated"`
  // with a complete descriptor mounts the sandboxed ThemeRuntime document
  // at the version-pinned frame URL; everything else keeps the classic
  // renderer (fail-closed, never a half-mounted frame).
  const chrome = src("src/components/store/ThemeChrome.tsx");
  for (const token of [
    "custom-isolated",
    "ThemeRuntime",
    "buildThemeFrameUrl",
  ]) {
    expect(chrome.includes(token), `ThemeChrome pins ${token}`).toBe(true);
  }

  // Serve lane: the production `/t/…` route serves the verified document
  // (approved releases ONLY, hash-pinned tags) with the opaque-frame CORS
  // header the frame's module scripts require.
  const route = src("src/routes/t.$.ts");
  for (const token of [
    "buildDevThemeDocument",
    "access-control-allow-origin",
  ]) {
    expect(route.includes(token), `t.$ route pins ${token}`).toBe(true);
  }
});
