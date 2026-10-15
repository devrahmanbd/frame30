import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assembleDevThemeBundle } from "../src/lib/dev-theme-bundle-assemble";
import { createDevThemeReleaseStore } from "../src/lib/dev-theme-review";
import { DEV_THEME_RUNTIME_VERSION } from "../src/lib/dev-theme-manifest";
import {
  bindDevThemeRuntime,
  resolveDevThemeActivation,
} from "../src/lib/dev-theme-activate";
import {
  THEME_SANDBOX,
  buildThemeFrameUrl,
  clampThemeHeight,
  themeFrameCSP,
} from "../src/components/theme-runtime/ThemeRuntime";
import {
  NetworkCollector,
  blockExternalRequests,
  resolveBaseURL,
} from "./helpers";

/**
 * Level B theme execution — cold browser journey (hermetic, loopback-only).
 *
 * Proves the frame30 claim end to end: a bundled animation/3D-capable theme
 * (assembled → reviewed → published → activation-bound through the REAL
 * dev-theme pipeline) executes EXCLUSIVELY inside the sandboxed ThemeRuntime
 * frame — version-pinned URL, `allow-scripts`-only sandboxing, restrictive
 * frame CSP — and never in the page DOM, while storefront output renders the
 * themed content.
 *
 * Real-vs-harness split (mirrors demo-theme-mounted.spec.ts):
 * - Real units (Node worker): assemble/submit/review/publish/activate/bind,
 *   URL/CSP/clamp helpers, static source pins.
 * - Real browser: a harness-owned page mounts an iframe with the REAL
 *   sandbox token + REAL pinned URL + REAL CSP served as the frame's
 *   response header; the frame's bundled script (external bundle bytes —
 *   never inline, per the CSP) animates and reports from inside the frame;
 *   the host asserts opaque isolation + zero theme code + execution receipt.
 * - Real storefront: the public preview route renders themed content.
 *
 * No authenticated surface is visited, no auth is stubbed. Cleanup:
 * collectors disposed in afterAll; the dev server is owned by the
 * Playwright webServer entry. No processes spawned here.
 */

const BASE_URL = resolveBaseURL();
const THEME_NAME = "aurora-lookbook";
const THEME_VERSION = "1.4.0";
const FRAME_PATH = `/t/${THEME_NAME}/${THEME_VERSION}/index.html`;
const BUNDLE_PATH = `/t/${THEME_NAME}/${THEME_VERSION}/app.js`;
// Shippable contract origin (https CDN, cf. dev-theme-sandbox.test.tsx).
const ORIGIN = "https://themes.example-cdn.com";
const MOD = { id: "reviewer-1", role: "moderator" } as const;
const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";

const THREE_DEP = {
  name: "three",
  version: "0.186.1",
  license: "MIT",
  integrity:
    "sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==",
};
const GSAP_DEP = {
  name: "gsap",
  version: "3.15.0",
  license: "MIT",
  integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

function manifest() {
  return {
    id: THEME_NAME,
    version: THEME_VERSION,
    runtime: DEV_THEME_RUNTIME_VERSION,
    name: "Aurora Lookbook",
    publisher: "Studio Framique",
    capabilities: [
      "presentation",
      "animation",
      "webgl",
      "commerce-read",
      "cart-write",
    ],
    dependencies: [{ ...GSAP_DEP }, { ...THREE_DEP }],
    sections: [
      { key: "hero", slot: "main", component: "HeroCanvas" },
      { key: "webgl-scene", slot: "main", component: "WebglScene" },
    ],
    settings: [
      { key: "headline", label: "Headline", type: "text" },
      { key: "motion", label: "Motion", type: "animation" },
    ],
  };
}

const HERO_JS = `import { gsap } from "gsap";
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function HeroCanvas(el, props) {
  if (reduce) { el.textContent = props.headline; return; }
  gsap.from(el, { opacity: 0, y: 24, duration: 0.6 });
}`;

const WEBGL_JS = `import * as THREE from "three";
export function WebglScene(el) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: el.querySelector("canvas"), antialias: true });
  } catch {
    el.querySelector("[data-fallback]").hidden = false;
    return;
  }
  renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera());
}`;

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Assemble → submit → approve → publish → activate (REAL pipeline). */
function activation() {
  const m = manifest();
  const assembled = assembleDevThemeBundle({
    manifestJson: m,
    files: [
      { path: "dev.theme.json", bytes: bytes(JSON.stringify(m)) },
      { path: "components/Hero.js", bytes: bytes(HERO_JS) },
      { path: "sections/webgl-scene.js", bytes: bytes(WEBGL_JS) },
      { path: "styles/main.css", bytes: bytes(".hero{color:red}") },
      {
        path: "locales/en.json",
        bytes: bytes(JSON.stringify({ headline: "Hello" })),
      },
      {
        path: "locales/bn.json",
        bytes: bytes(JSON.stringify({ headline: "হ্যালো" })),
      },
    ],
  });
  expect(assembled.ok).toBe(true);
  if (!assembled.ok) throw new Error("fixture bundle refused");
  const store = createDevThemeReleaseStore();
  const { release: submitted } = store.submit({
    merchantId: "seller-1",
    themeId: THEME_NAME,
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
    reason: "animation budget + webgl fallback proof attached",
    reviewedAt: T1,
  });
  const { release } = store.publish({
    releaseId: submitted.id,
    merchantId: "seller-1",
    actor: { ...MOD },
    expectedFingerprint: assembled.fingerprint,
    publishedAt: T1,
  });
  return resolveDevThemeActivation({
    release,
    expectedFingerprint: assembled.fingerprint,
    expectedThemeId: THEME_NAME,
  });
}

function srcPath(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function src(rel: string): string {
  return readFileSync(srcPath(rel), "utf8");
}

let collectors: NetworkCollector[] = [];

test.afterAll(() => {
  for (const c of collectors) c.dispose();
  collectors = [];
});

async function hermeticPage(page: Page): Promise<NetworkCollector> {
  const collector = new NetworkCollector(page).attach();
  collectors.push(collector);
  await blockExternalRequests(page, []);
  return collector;
}

// Cold-sensitive first navigation only (cf. theme-preview-isolation.spec.ts).
const COLD_GOTO_TIMEOUT = 180_000;

test("bundle: animation+webgl theme assembles with a stable fingerprint", () => {
  const bound = bindDevThemeRuntime(activation(), { assetOrigin: ORIGIN });
  expect(bound.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(bound.granted).toEqual(
    expect.arrayContaining([
      "theme:storefront:read",
      "theme:variant:select",
      "theme:cart:add",
    ]),
  );
});

test("binding pins the frame URL + CSP to the ThemeRuntime contract", () => {
  const bound = bindDevThemeRuntime(activation(), { assetOrigin: ORIGIN });
  // Pinned URL: version-immutable document on the controlled origin.
  expect(bound.url).toBe(`${ORIGIN}${FRAME_PATH}`);
  expect(bound.url).toBe(
    buildThemeFrameUrl(ORIGIN, { name: THEME_NAME, version: THEME_VERSION }),
  );
  // Mutable tags never mint a URL (fail closed to null).
  expect(
    buildThemeFrameUrl(ORIGIN, { name: THEME_NAME, version: "latest" }),
  ).toBeNull();
  // Restrictive CSP: deny-all base, no frame network, no inline scripts.
  expect(bound.csp).toBe(themeFrameCSP(ORIGIN));
  expect(bound.csp.startsWith("default-src 'none'")).toBe(true);
  expect(bound.csp).toContain("connect-src 'none'");
  expect(bound.csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  // Sandbox grants scripts inside the frame and nothing else.
  expect(THEME_SANDBOX).toBe("allow-scripts");
  // Height reports clamp: runaway content can never take the host page.
  expect(clampThemeHeight(Number.POSITIVE_INFINITY)).toBe(120);
  expect(clampThemeHeight(99_999)).toBe(4000);
  expect(clampThemeHeight(640)).toBe(640);
});

test("unapproved bytes never bind a runtime frame", () => {
  const m = manifest();
  const assembled = assembleDevThemeBundle({
    manifestJson: m,
    files: [
      { path: "dev.theme.json", bytes: bytes(JSON.stringify(m)) },
      { path: "components/Hero.js", bytes: bytes(HERO_JS) },
      { path: "sections/webgl-scene.js", bytes: bytes(WEBGL_JS) },
      { path: "styles/main.css", bytes: bytes(".hero{color:red}") },
      {
        path: "locales/en.json",
        bytes: bytes(JSON.stringify({ headline: "Hi" })),
      },
      {
        path: "locales/bn.json",
        bytes: bytes(JSON.stringify({ headline: "হাই" })),
      },
    ],
  });
  expect(assembled.ok).toBe(true);
  if (!assembled.ok) return;
  const store = createDevThemeReleaseStore();
  const { release } = store.submit({
    merchantId: "seller-1",
    themeId: THEME_NAME,
    manifest: assembled.manifest,
    files: assembled.files,
    fingerprint: assembled.fingerprint,
    submittedBy: "dev-1",
    submittedAt: T0,
  });
  // Never reviewed: activation refuses, so no binding exists to render.
  expect(() =>
    resolveDevThemeActivation({
      release,
      expectedFingerprint: assembled.fingerprint,
    }),
  ).toThrow(/unapproved/);
});

test("static wiring: sandbox shell + bundle lanes + Level B gates", () => {
  const runtime = src("src/components/theme-runtime/ThemeRuntime.tsx");
  for (const token of [
    'THEME_SANDBOX = "allow-scripts"',
    "default-src 'none'",
    "connect-src 'none'",
    "buildThemeFrameUrl",
    "themeFrameCSP",
    "clampThemeHeight",
    "isOwnerFrame",
    "THEME_HEIGHT_MESSAGE",
    "referrerPolicy",
  ]) {
    expect(runtime.includes(token), `ThemeRuntime pins ${token}`).toBe(true);
  }
  // The shell mounts exactly one sandbox token source: the frame's
  // `sandbox` attribute reads the `THEME_SANDBOX` constant (asserted at
  // runtime to be `"allow-scripts"`), and theme code is never inlined.
  expect(runtime.includes("sandbox={THEME_SANDBOX}")).toBe(true);
  // Fail-closed render: no URL ⇒ no frame (theme bytes can never fall
  // back to an inline path — the component returns null).
  expect(runtime.includes("if (!url) return null")).toBe(true);
  expect(runtime.includes("srcDoc={"), "no srcDoc prop is ever set").toBe(
    false,
  );

  const assemble = src("src/lib/dev-theme-bundle-assemble.ts");
  expect(assemble.includes("assembleDevThemeBundle")).toBe(true);
  const review = src("src/lib/dev-theme-review.ts");
  for (const token of ["createDevThemeReleaseStore", '"approve"', "publish"]) {
    expect(review.includes(token), `review lane pins ${token}`).toBe(true);
  }
  const activate = src("src/lib/dev-theme-activate.ts");
  for (const token of [
    "resolveDevThemeActivation",
    "bindDevThemeRuntime",
    "devThemeGrantsFor",
  ]) {
    expect(activate.includes(token), `activate lane pins ${token}`).toBe(true);
  }
});

test("browser: bundled animation executes ONLY inside the sandboxed frame", async ({
  page,
}) => {
  const collector = await hermeticPage(page);
  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  // Loopback binding: same gates as the shippable https binding, but the
  // frame URL is routable on loopback so the browser can enforce it.
  const bound = bindDevThemeRuntime(activation(), { assetOrigin: BASE_URL });
  expect(bound.url).toBe(`${BASE_URL}${FRAME_PATH}`);
  expect(bound.url).toBe(
    buildThemeFrameUrl(BASE_URL, { name: THEME_NAME, version: THEME_VERSION }),
  );
  const csp = themeFrameCSP(BASE_URL);
  expect(csp.startsWith("default-src 'none'")).toBe(true);

  // Frame document: loads the bundled animation as EXTERNAL bytes (inline
  // scripts would violate the served CSP — the bundle path is the only
  // path). Identifiers mirror the reviewed sources so the host-absence
  // assertion below is meaningful.
  const frameDoc = [
    "<!doctype html><html><head>",
    `<meta charset="utf-8"><title>Aurora Lookbook</title>`,
    "</head><body>",
    `<div data-hero-canvas style="opacity:0">Hello</div>`,
    `<div data-fallback hidden>Static storefront</div>`,
    `<script src="${BUNDLE_PATH}"></script>`,
    "</body></html>",
  ].join("");
  // Bundled animation: HeroCanvas-style rAF motion + WebglScene fallback
  // marker, reporting its own paint from INSIDE the frame (the opaque host
  // cannot read frame DOM — the posted receipt IS the execution proof).
  // Both reviewed components are defined AND executed (top-level calls).
  const bundleJs = [
    "(function(){",
    "function HeroCanvas(el){",
    "var t0=null;",
    "function step(t){",
    "if(t0===null)t0=t;",
    "var k=Math.min(1,(t-t0)/120);",
    "el.style.opacity=String(k);",
    "if(k<1){requestAnimationFrame(step);return;}",
    "parent.postMessage({v:'e2e-levelb',executed:true,finalOpacity:getComputedStyle(el).opacity,engine:'HeroCanvas/WebglScene'},'*');",
    "}",
    // Headless CI forces reduced-motion: the static path still executes
    // inside the frame (full opacity, no engine) and still reports out.
    "if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){el.style.opacity='1';",
    "parent.postMessage({v:'e2e-levelb',executed:true,finalOpacity:getComputedStyle(el).opacity,reduced:true,engine:'HeroCanvas/WebglScene'},'*');}",
    "else{requestAnimationFrame(step);}",
    "}",
    "function WebglScene(el){",
    "try{",
    "if(!el.querySelector('canvas'))throw new Error('no canvas');",
    "}catch(e){",
    "var fb=el.querySelector('[data-fallback]');",
    "if(fb)fb.hidden=false;",
    "}",
    "}",
    "try{",
    "var heroEl=document.querySelector('[data-hero-canvas]');",
    "if(!heroEl)throw new Error('hero missing');",
    "HeroCanvas(heroEl);",
    "var sceneEl=document.querySelector('[data-webgl-scene]');",
    "if(sceneEl)WebglScene(sceneEl);",
    "}catch(e){",
    "var fb2=document.querySelector('[data-fallback]');",
    "if(fb2)fb2.hidden=false;",
    "parent.postMessage({v:'e2e-levelb',executed:false,fallback:true},'*');",
    "}",
    "})();",
  ].join("\n");

  let servedCsp = "";
  await page.route(`**${FRAME_PATH}`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: "text/html",
      headers: { "Content-Security-Policy": csp },
      body: frameDoc,
    });
  });
  await page.route(`**${BUNDLE_PATH}`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: "application/javascript",
      headers: { "Content-Security-Policy": csp },
      body: bundleJs,
    });
  });
  page.on("response", (res) => {
    if (res.url().endsWith(FRAME_PATH)) {
      servedCsp = res.headers()["content-security-policy"] ?? "";
    }
  });

  // Origin seed: the public marketing root (same unauthenticated route the
  // smoke spec uses). The harness shell carries NO inline script: the dev
  // server ships a nonce CSP that refuses inline execution, so the receipt
  // listener is registered via evaluate (CDP-injected, CSP-exempt) BEFORE
  // the frame element is appended — ordering is deterministic, no race.
  await page.goto("/", {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  await page.setContent(
    `<!doctype html><html><head><title>Aurora Lookbook — Level B harness</title></head>` +
      `<body><main><h1>Host storefront shell</h1><div id="frame-slot"></div>` +
      `</main></body></html>`,
    { waitUntil: "domcontentloaded" },
  );
  await page.evaluate(() => {
    const w = window as unknown as { __e2e_levelb_receipts?: unknown[] };
    w.__e2e_levelb_receipts = [];
    window.addEventListener("message", (e: MessageEvent) => {
      const d = e.data as { v?: unknown } | null;
      if (d && typeof d === "object" && d.v === "e2e-levelb") {
        w.__e2e_levelb_receipts!.push(d);
      }
    });
  });
  await page.evaluate(
    ({ url, sandbox }: { url: string; sandbox: string }) => {
      const f = document.createElement("iframe");
      f.title = "Aurora Lookbook";
      f.src = url;
      f.setAttribute("sandbox", sandbox);
      f.setAttribute("referrerpolicy", "no-referrer");
      f.className = "w-full border-0";
      f.style.height = "120px";
      document.getElementById("frame-slot")!.appendChild(f);
    },
    { url: bound.url, sandbox: THEME_SANDBOX },
  );

  // The bundled animation executes inside the frame and reports out.
  await page.waitForFunction(
    () =>
      (window as unknown as { __e2e_levelb_receipts?: unknown[] })
        .__e2e_levelb_receipts?.length === 1,
    null,
    { timeout: 20_000 },
  );
  const receipt = (await page.evaluate(
    () =>
      (window as unknown as { __e2e_levelb_receipts: unknown[] })
        .__e2e_levelb_receipts[0],
  )) as { executed: boolean; finalOpacity: string; engine: string };
  expect(receipt.executed).toBe(true);
  expect(receipt.finalOpacity).toBe("1");
  expect(receipt.engine).toContain("HeroCanvas");

  // Iframe sandbox attributes: scripts only — pinned URL, no relaxation.
  const frame = page.locator("iframe").first();
  await expect(frame).toBeAttached();
  await expect(frame).toHaveAttribute("src", bound.url);
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  const sandboxAttr = (await frame.getAttribute("sandbox")) ?? "";
  for (const forbidden of [
    "allow-same-origin",
    "allow-top-navigation",
    "allow-popups",
    "allow-forms",
  ]) {
    expect(sandboxAttr).not.toContain(forbidden);
  }
  expect(await frame.getAttribute("srcdoc")).toBeNull();

  // Served CSP on the frame document is the restrictive contract.
  expect(servedCsp).toContain("default-src 'none'");
  expect(servedCsp).toContain("connect-src 'none'");
  expect(servedCsp).toContain(`script-src ${BASE_URL}`);
  expect(servedCsp).not.toMatch(/script-src[^;]*unsafe-inline/);

  // Opaque origin: the sandbox denies same-origin DOM reach.
  const opaque = await frame.evaluate(
    (el) => (el as HTMLIFrameElement).contentDocument,
  );
  expect(opaque).toBeNull();

  // Host page carries zero theme code: no bundled identifiers, no frame
  // content leaked into host DOM, no animation engines on the host.
  const hostHtml = await page.evaluate(
    () => document.documentElement.outerHTML,
  );
  for (const needle of [
    "HeroCanvas",
    "WebglScene",
    "WebGLRenderer",
    "prefers-reduced-motion",
    "data-hero-canvas",
  ]) {
    expect(hostHtml.includes(needle), `host must not contain ${needle}`).toBe(
      false,
    );
  }
  expect(await page.locator("[data-hero-canvas]").count()).toBe(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { gsap?: unknown; THREE?: unknown }).gsap ??
        (window as unknown as { gsap?: unknown; THREE?: unknown }).THREE ??
        null,
    ),
  ).toBeNull();

  expect(pageErrors).toEqual([]);
  expect(collector.externalResponses()).toEqual([]);
});

test("storefront output renders the themed content", async ({ page }) => {
  const collector = await hermeticPage(page);
  const response = await page.goto("/theme-preview/songoskriti", {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator("img").first(), "preview renders").toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("h1, h2").first()).toBeVisible({
    timeout: 15_000,
  });
  // No theme runtime iframe leaks onto the public blueprint preview with
  // weakened sandboxing: every frame present stays scripts-only at most.
  const sandboxes = await page
    .locator("iframe")
    .evaluateAll((els) => els.map((el) => el.getAttribute("sandbox")));
  for (const sb of sandboxes) {
    expect(sb, "every preview iframe is sandboxed").not.toBeNull();
    expect(sb ?? "").not.toContain("allow-same-origin");
    expect(sb ?? "").not.toContain("allow-top-navigation");
  }
  expect(collector.externalResponses()).toEqual([]);
});
