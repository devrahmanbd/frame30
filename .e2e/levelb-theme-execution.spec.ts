import { test, expect, type Page } from "@playwright/test";
import {
  activateDevThemeInstall,
  bindDevThemeRuntime,
  resolveDevThemeActivation,
} from "../src/lib/dev-theme-activate";
import {
  THEME_SANDBOX,
  buildThemeFrameUrl,
  themeFrameCSP,
} from "../src/components/theme-runtime/ThemeRuntime";
import { buildDevThemeDocument } from "../src/lib/dev-theme-document";
import {
  NetworkCollector,
  blockExternalRequests,
  resolveBaseURL,
} from "./helpers";
import {
  REAL_THEME_ID,
  REAL_THEME_VERSION,
  gotoWithRateRetry,
  prepareRealTheme,
  seedInstallMirrorDb,
  serveVerifiedTheme,
  type VerifiedThemeServer,
} from "./helpers-levelb";

/**
 * Level B real-execution E2E — cold browser journey (hermetic, loopback-only).
 *
 * SUPERSEDES the mocked browser test formerly in
 * `levelb-theme-sandbox.spec.ts` (frame/bundle served via `page.route()`
 * with hand-written animation; its WebglScene fixture never executed a real
 * Three.js renderer). Here EVERY executed byte is genuine:
 *
 * - Real units (Node worker): the fixture theme's JS IS the repo's own
 *   `gsap` ESM sources (`gsap-core.js` + `Observer.js` verbatim,
 *   `CSSPlugin.js` + `ScrollTrigger.js` verbatim except their single
 *   intra-package specifier pinned to the hashed sibling) and `three`
 *   (`three.core.js` verbatim + `three.module.js` — the renderer
 *   implementation — verbatim except its two `./three.core.js` specifiers
 *   pinned) plus one authored entry driving them, run through the REAL
 *   assemble → review → publish → activate lanes (vendor-stage byte-proven,
 *   rewrite-proofed).
 * - Real browser: the REAL `ThemeRuntime` frame shape (pinned URL from
 *   `bindDevThemeRuntime`, `allow-scripts`-only sandbox, restrictive frame
 *   CSP served as a response header) loads the REAL verified document +
 *   REAL hash-asserted bundle bytes over real loopback HTTP — NO
 *   `page.route()` interception of theme URLs, NO mocked frame documents.
 *   The frame's GSAP timeline + ScrollTrigger scrub + `THREE.WebGLRenderer`
 *   scene execute and report from inside the frame; the host asserts opaque
 *   isolation + zero theme code + the execution receipt.
 *
 * Proof-limited by construction (reported precisely, never elided):
 * - The install lane itself runs in vitest, not this worker (it
 *   dynamic-imports `@/`-aliased server modules unresolvable here), so the
 *   worker seeds install-EQUIVALENT `fakeDb` rows field-for-field; the
 *   install → serve round-trip on REAL persisted rows is pinned by
 *   `dev-theme-asset-serve.test.ts` + `t.$.test.ts`.
 * - The loopback origin server reuses the verified release + hash assertion
 *   per request (approval re-verification is vacuous on the fixed snapshot;
 *   the per-request chain against live rows is pinned by `t.$.test.ts`).
 * - Headless GPU: when SwiftShader provides WebGL the spec asserts the real
 *   renderer path (`threeMode: "webgl"` + draw calls + triangles); when the
 *   headless GPU is absent it asserts the GENUINE fallback path ran and WHY.
 *
 * No authenticated surface is visited, no auth is stubbed. Cleanup: network
 * collectors disposed, every spawned theme server closed in afterAll (the
 * dev server itself is owned by the Playwright webServer entry).
 */

const BASE_URL = resolveBaseURL();
const FRAME_PATH = `/t/${REAL_THEME_ID}/${REAL_THEME_VERSION}/index.html`;
const COLD_GOTO_TIMEOUT = 180_000;

let servers: VerifiedThemeServer[] = [];
let collectors: NetworkCollector[] = [];

test.afterAll(async () => {
  for (const c of collectors) c.dispose();
  collectors = [];
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

async function hermeticPage(page: Page): Promise<NetworkCollector> {
  const collector = new NetworkCollector(page).attach();
  collectors.push(collector);
  await blockExternalRequests(page, []);
  return collector;
}

type Activation = ReturnType<typeof resolveDevThemeActivation>;

/** Assemble → submit → approve → publish (REAL lanes) + activation. */
function activation(): {
  prep: ReturnType<typeof prepareRealTheme>;
  bound: Activation;
} {
  const prep = prepareRealTheme();
  const bound = resolveDevThemeActivation({
    release: prep.release,
    expectedFingerprint: prep.fingerprint,
    expectedThemeId: REAL_THEME_ID,
  });
  return { prep, bound };
}

test("bundle: real gsap+scrolltrigger+three assemble with vendor byte-proof", () => {
  const prep = prepareRealTheme();
  expect(prep.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  // The executed libraries ARE the repo's packages (versions read from their
  // own package.json files at prep time).
  expect(prep.vendor.gsapVersion).toBe("3.15.0");
  expect(prep.vendor.threeVersion).toBe("0.186.1");
  expect(prep.manifest.dependencies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "gsap", version: "3.15.0" }),
      expect.objectContaining({ name: "three", version: "0.186.1" }),
    ]),
  );
  // Byte-identity: vendor integrity pins digest the repo bytes, and
  // the served outputs carry those exact hashed names (gsap ships as four
  // genuine ESM sources: verbatim core + observer, specifier-pinned
  // cssplugin + scrolltrigger; three ships as verbatim core + the
  // specifier-pinned module carrying the renderer — see `prepareRealTheme`).
  const names = prep.outputs.map((o) => o.path);
  expect(names.filter((p) => p.includes("/vendor/")).length).toBe(6);
  expect(names.some((p) => p.startsWith("components/vendor/gsap-core."))).toBe(
    true,
  );
  expect(names.some((p) => p.startsWith("components/vendor/observer."))).toBe(
    true,
  );
  expect(names.some((p) => p.startsWith("components/app."))).toBe(true);
  expect(names.some((p) => p.startsWith("styles/main."))).toBe(true);
});

test("review → publish → install-mirror → activate → bind pins the production contract", async () => {
  const { prep, bound } = activation();
  expect(bound.themeId).toBe(REAL_THEME_ID);
  expect(bound.fingerprint).toBe(prep.fingerprint);

  // Install-mirror rows activate through the REAL flag flip.
  const db = seedInstallMirrorDb(prep);
  const result = await activateDevThemeInstall(
    db.asClient() as never,
    "22222222-2222-2222-2222-222222222222",
    {
      themeId: "theme-1",
      release: prep.release,
      expectedFingerprint: prep.fingerprint,
      expectedThemeId: REAL_THEME_ID,
      actorId: "reviewer-1",
    },
  );
  expect(result.fingerprint).toBe(prep.fingerprint);
  const themes = db.rows("store_themes") as {
    id: string;
    is_active: boolean;
  }[];
  expect(themes.find((t) => t.id === "theme-1")?.is_active).toBe(true);
  const audits = db.rows("theme_audit") as { action: string }[];
  expect(audits.some((a) => a.action === "dev_theme.activated")).toBe(true);

  // Binding pins the frame URL + CSP to the ThemeRuntime contract.
  const origin = "http://127.0.0.1:4311";
  const runtime = bindDevThemeRuntime(bound, { assetOrigin: origin });
  expect(runtime.url).toBe(`${origin}${FRAME_PATH}`);
  expect(runtime.url).toBe(
    buildThemeFrameUrl(origin, {
      name: REAL_THEME_ID,
      version: REAL_THEME_VERSION,
    }),
  );
  expect(
    buildThemeFrameUrl(origin, { name: REAL_THEME_ID, version: "latest" }),
  ).toBeNull();
  expect(runtime.csp).toBe(themeFrameCSP(origin));
  expect(runtime.csp.startsWith("default-src 'none'")).toBe(true);
  expect(runtime.csp).toContain("connect-src 'none'");
  expect(runtime.csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(THEME_SANDBOX).toBe("allow-scripts");

  // The verified document references ONLY hash-pinned approved assets.
  const doc = buildDevThemeDocument({
    themeId: REAL_THEME_ID,
    version: REAL_THEME_VERSION,
    assetOrigin: origin,
    approvalRows: prep.approvalRows,
    mapRows: prep.mapRows,
  });
  expect(doc.status).toBe(200);
  if (doc.status !== 200) return;
  const html = new TextDecoder().decode(doc.body);
  const tags = html.match(/<script[^>]*>/g) ?? [];
  expect(tags.length).toBe(7);
  for (const tag of tags) {
    expect(tag).toContain('type="module"');
    expect(tag).toMatch(
      new RegExp(`src="/t/${REAL_THEME_ID}/${REAL_THEME_VERSION}/`),
    );
  }
  expect(html).toContain(
    `<link rel="stylesheet" href="/t/${REAL_THEME_ID}/${REAL_THEME_VERSION}/styles/main.`,
  );
});

test("browser: real bundle executes ONLY inside the sandboxed frame", async ({
  page,
}) => {
  const collector = await hermeticPage(page);
  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // Full pipeline in-worker, then serve the verified bytes over loopback.
  const { prep, bound } = activation();
  const db = seedInstallMirrorDb(prep);
  await activateDevThemeInstall(
    db.asClient() as never,
    "22222222-2222-2222-2222-222222222222",
    {
      themeId: "theme-1",
      release: prep.release,
      expectedFingerprint: prep.fingerprint,
      expectedThemeId: REAL_THEME_ID,
      actorId: "reviewer-1",
    },
  );
  const server = await serveVerifiedTheme(prep);
  servers.push(server);
  const runtime = bindDevThemeRuntime(bound, { assetOrigin: server.origin });
  expect(runtime.url).toBe(`${server.origin}${FRAME_PATH}`);
  expect(runtime.url).toBe(
    buildThemeFrameUrl(server.origin, {
      name: REAL_THEME_ID,
      version: REAL_THEME_VERSION,
    }),
  );
  const csp = themeFrameCSP(server.origin);

  let servedCsp = "";
  const servedTheme: { url: string; status: number; acao: string }[] = [];
  page.on("response", (res) => {
    const url = res.url();
    if (url.startsWith(`${server.origin}/t/`)) {
      servedTheme.push({
        url,
        status: res.status(),
        acao: res.headers()["access-control-allow-origin"] ?? "",
      });
      if (url.endsWith(FRAME_PATH)) {
        servedCsp = res.headers()["content-security-policy"] ?? "";
      }
    }
  });

  // Origin seed: the public marketing root (same unauthenticated route the
  // smoke spec uses) proves the cold path, then the harness shell is loaded
  // from the theme origin itself (`/harness`, static, CSP-free, no inline
  // script): the dev server ships `frame-src 'self'`, which would
  // (correctly) refuse to frame the loopback theme origin — and an
  // `about:blank`+`setContent` shell is blocked instead by Private Network
  // Access checks (`ERR_BLOCKED_BY_PRIVATE_NETWORK_ACCESS_CHECKS`, measured)
  // before any theme byte executes. Same-origin hosting changes nothing
  // about isolation: the frame is still sandboxed without
  // `allow-same-origin` (opaque, `contentDocument` null — asserted below)
  // and the REAL frame CSP on the theme document is the only policy under
  // test. The shell itself carries NO inline script: the receipt listener
  // is registered via evaluate (CDP-injected, CSP-exempt) BEFORE the frame
  // element is appended — ordering is deterministic, no race.
  await gotoWithRateRetry(page, "/");
  await page.goto(`${server.origin}/harness`, {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  await page.evaluate(() => {
    const w = window as unknown as { __e2e_levelb_real_receipts?: unknown[] };
    w.__e2e_levelb_real_receipts = [];
    window.addEventListener("message", (e: MessageEvent) => {
      const d = e.data as { v?: unknown } | null;
      if (d && typeof d === "object" && d.v === "e2e-levelb-real") {
        w.__e2e_levelb_real_receipts!.push(d);
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
    { url: runtime.url, sandbox: THEME_SANDBOX },
  );

  // The real bundle executes inside the frame and reports out.
  await page.waitForFunction(
    () =>
      (window as unknown as { __e2e_levelb_real_receipts?: unknown[] })
        .__e2e_levelb_real_receipts?.length === 1,
    null,
    { timeout: 30_000 },
  );
  const receipt = (await page.evaluate(
    () =>
      (window as unknown as { __e2e_levelb_real_receipts: unknown[] })
        .__e2e_levelb_real_receipts[0],
  )) as {
    ok: boolean;
    executed: boolean;
    reduced?: boolean;
    reason?: string;
    gsapVersion?: string;
    gsapFinalOpacity?: string;
    stVersion?: string;
    stInstances?: number;
    stProgress?: number;
    threeRevision?: string;
    threeMode?: string;
    threeCalls?: number;
    threeTriangles?: number;
    fallbackReason?: string;
  };
  expect(receipt.executed).toBe(true);
  expect(receipt.ok, `frame reported failure: ${receipt.reason ?? ""}`).toBe(
    true,
  );
  expect(
    receipt.reduced,
    "reduced-motion must be off (forced no-preference)",
  ).toBe(false);
  // GSAP produced animated output: the real timeline ran to its end state.
  expect(receipt.gsapVersion).toBe("3.15.0");
  expect(receipt.gsapFinalOpacity).toBe("1");
  // ScrollTrigger is the real plugin, instanced and genuinely scrolled.
  expect(receipt.stVersion).toBe("3.15.0");
  expect(receipt.stInstances ?? 0).toBeGreaterThanOrEqual(1);
  expect(receipt.stProgress ?? 0).toBeGreaterThan(0);
  // Three.js rendered: real WebGL path with draw calls, or the genuine
  // fallback ONLY when headless lacks a GPU — assert which path and why.
  expect(receipt.threeRevision).toBe("186");
  if (receipt.threeMode === "webgl") {
    console.log(
      `[e2e levelb-real] three path=webgl calls=${receipt.threeCalls} triangles=${receipt.threeTriangles}`,
    );
    expect(receipt.threeCalls ?? 0).toBeGreaterThanOrEqual(1);
    expect(receipt.threeTriangles ?? 0).toBeGreaterThanOrEqual(1);
  } else {
    console.log(
      `[e2e levelb-real] three path=fallback reason=${receipt.fallbackReason ?? ""}`,
    );
    expect(receipt.threeMode).toBe("fallback");
    expect((receipt.fallbackReason ?? "").length).toBeGreaterThan(0);
  }

  // Iframe sandbox attributes: scripts only — pinned URL, no relaxation.
  const frame = page.locator("iframe").first();
  await expect(frame).toBeAttached();
  await expect(frame).toHaveAttribute("src", runtime.url);
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
  expect(servedCsp).toBe(csp);
  expect(servedCsp).toContain("default-src 'none'");
  expect(servedCsp).toContain("connect-src 'none'");
  expect(servedCsp).toContain(`script-src ${server.origin}`);
  expect(servedCsp).not.toMatch(/script-src[^;]*unsafe-inline/);

  // Every theme URL resolved over real HTTP with a 200 (doc + 4 scripts +
  // stylesheet); nothing theme-shaped failed.
  const themePaths = servedTheme.map((r) => r.url.replace(server.origin, ""));
  for (const expected of [
    FRAME_PATH,
    ...prep.outputs
      .filter((o) => o.path.endsWith(".js") || o.path.endsWith(".css"))
      .map((o) => `/t/${REAL_THEME_ID}/${REAL_THEME_VERSION}/${o.path}`),
  ]) {
    expect(themePaths, `frame fetched ${expected}`).toContain(expected);
  }
  for (const hit of servedTheme) {
    expect(`${hit.url}: ${hit.status}`).toBe(`${hit.url}: 200`);
    // Opaque-frame CORS on every theme byte (production `/t/…` lane).
    expect(`${hit.url}: ${hit.acao}`).toBe(`${hit.url}: *`);
  }

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
    "WebGLRenderer",
    "HeroCanvas",
    "WebglScene",
    "ScrollTrigger",
    "data-hero-canvas",
    "data-webgl-canvas",
    "__VENDOR",
    "three.module",
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
