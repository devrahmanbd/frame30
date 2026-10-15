import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import {
  answerThemeCall,
  authorizeThemeCall,
} from "../src/components/theme-runtime/bridge-v2";
import { demoThemeGrants } from "../examples/demo-theme/fixture-bundles";
import {
  buildCartAddEnvelope,
  buildVariantSelectEnvelope,
} from "../examples/demo-theme/product-cards";
import {
  liveWebglSceneCount,
  mountWebglScene,
  renderWebglScene,
} from "../examples/demo-theme/webgl-scene";
import {
  NetworkCollector,
  blockExternalRequests,
  resolveBaseURL,
} from "./helpers";

/**
 * Demo theme WebGL proof (harness-owned pages only).
 *
 * Proves the vendored Three.js wiring (`three@0.186.1`, exact pin) behind
 * the `webgl` capability gate: a real scene renders in headless Chromium
 * (SwiftShader software GL) with pixels measurably different from the
 * poster still, reduced motion keeps the static path without loading the
 * engine, and destroy forces real GL context loss with zero live scenes.
 * The bridge denial contract still holds with the new section registered.
 *
 * Harness strategy (mirrors demo-theme-mounted.spec.ts): pages are built
 * with setContent over a public-root origin seed; the REAL three.js bytes
 * (repo `node_modules`, served back to the page through loopback route
 * interception — never a CDN) and the REAL `webgl-scene.ts` module source
 * (transpiled, with its `three` + `./shared` specifiers rewritten to the
 * same harness routes) drive the browser side. Hermetic: every request
 * stays on loopback; externals are blocked before the network.
 *
 * Real-vs-unit split:
 * - Real browser: SwiftShader GL render, poster-vs-scene pixel variance
 *   (readback stats + section screenshots that must differ), reduced-motion
 *   static path with a counting loader, real `isContextLost()` after
 *   destroy, zero live scenes via the real module registry.
 * - Node/unit in-spec: gate behaviour with fake canvases (capability,
 *   reduced motion, dead GL), fake-engine mount/dispose accounting, bridge
 *   admit/deny against the real validator.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const BASE_URL = resolveBaseURL();

const THREE_MODULE_URL = "/__harness__/three.module.js";
const THREE_CORE_URL = "/__harness__/three.core.js";
const SCENE_URL = "/__harness__/webgl-scene.js";
const SHARED_URL = "/__harness__/shared.js";

const THREE_MODULE_BYTES = readFileSync(
  join(REPO_ROOT, "node_modules", "three", "build", "three.module.js"),
);
const THREE_CORE_BYTES = readFileSync(
  join(REPO_ROOT, "node_modules", "three", "build", "three.core.js"),
);

function toBrowserJs(source: string): string {
  return transpileModule(source, {
    compilerOptions: {
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
    },
  }).outputText;
}

// The shipped module reaches three through exactly one dynamic import and
// one relative helper import; both are rewritten to harness-local routes.
// The replacement counts are asserted so a silent miss can never pass.
const SCENE_SOURCE = readFileSync(
  join(REPO_ROOT, "examples", "demo-theme", "webgl-scene.ts"),
  "utf8",
);
if (SCENE_SOURCE.split('"three"').length - 1 !== 1) {
  throw new Error('webgl harness: expected exactly one "three" specifier');
}
const SCENE_JS = toBrowserJs(SCENE_SOURCE)
  .replace('"three"', `"${THREE_MODULE_URL}"`)
  .replace('"./shared"', `"${SHARED_URL}"`);
if (SCENE_JS.includes('"three"') || SCENE_JS.includes('"./shared"')) {
  throw new Error("webgl harness: module specifier rewrite missed");
}
const SHARED_JS = toBrowserJs(
  readFileSync(join(REPO_ROOT, "examples", "demo-theme", "shared.ts"), "utf8"),
);

const POSTER_SVG =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"><rect width="64" height="36" fill="#0000ff"/></svg>',
  );

type Harness = {
  collector: NetworkCollector;
  blocked: string[];
  pageErrors: Error[];
  consoleErrors: string[];
};

type BrowserSceneModule = {
  mountWebglScene(
    canvas: unknown,
    opts: unknown,
  ): Promise<{ mounted: boolean; renderer: unknown }>;
  liveWebglSceneCount(): number;
};

function hostHead(title: string): string {
  return (
    `<head><title>${title}</title>` +
    `<meta name="description" content="Demo Atelier WebGL harness page" />` +
    `<link rel="canonical" href="${BASE_URL}/harness/demo-webgl" /></head>`
  );
}

/** Harness-owned page: public-root origin seed, then our own content. */
async function harnessPage(
  page: Page,
  body: string,
  title = "Demo Atelier — WebGL harness",
): Promise<Harness> {
  const collector = new NetworkCollector(page).attach();
  const blocked: string[] = [];
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await blockExternalRequests(page, blocked);
  await page.route(`**${THREE_MODULE_URL}`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: THREE_MODULE_BYTES,
    });
  });
  await page.route(`**${THREE_CORE_URL}`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: THREE_CORE_BYTES,
    });
  });
  await page.route(`**${SCENE_URL}`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: SCENE_JS,
    });
  });
  await page.route(`**${SHARED_URL}`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: SHARED_JS,
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.setContent(
    `<!doctype html><html>${hostHead(title)}<body>${body}</body></html>`,
    { waitUntil: "domcontentloaded" },
  );
  pageErrors.length = 0;
  consoleErrors.length = 0;
  return { collector, blocked, pageErrors, consoleErrors };
}

/** Load the real (rewritten) scene module into the page. */
async function loadSceneModule(page: Page): Promise<void> {
  await page.addScriptTag({
    type: "module",
    content: `import * as m from "${SCENE_URL}"; window.__webglScene = m;`,
  });
  await page.waitForFunction(
    () =>
      (window as unknown as { __webglScene?: unknown }).__webglScene !==
      undefined,
    null,
    { timeout: 15_000 },
  );
}

/** Mean + std per channel over RGBA bytes (proves flat vs rendered). */
function channelStats(pixels: number[]): {
  mean: number[];
  std: number[];
} {
  const n = pixels.length / 4;
  const mean = [0, 0, 0, 0];
  for (let i = 0; i < pixels.length; i += 1) {
    const slot = i % 4;
    mean[slot] = (mean[slot] ?? 0) + (pixels[i] ?? 0) / n;
  }
  const variance = [0, 0, 0, 0];
  for (let i = 0; i < pixels.length; i += 1) {
    const slot = i % 4;
    const d = (pixels[i] ?? 0) - (mean[slot] ?? 0);
    variance[slot] = (variance[slot] ?? 0) + (d * d) / n;
  }
  return { mean, std: variance.map((v) => Math.sqrt(v)) };
}

function meanAbsDiff(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return sum / a.length;
}

function maxOf(values: number[]): number {
  let top = 0;
  for (const v of values) {
    if (v > top) top = v;
  }
  return top;
}

test("webgl scene renders a real frame: pixels differ from the poster still", async ({
  page,
}) => {
  const { html } = renderWebglScene({
    settings: { caption: "Night glow", poster: POSTER_SVG },
  });
  const harness = await harnessPage(page, html);
  try {
    // Static path stands first: canvas placeholder + poster still, no GL.
    await expect(page.locator("canvas[data-webgl-canvas]")).toBeAttached();
    const poster = page.locator("img[data-webgl-poster]");
    await expect(poster).toBeVisible();
    expect(await poster.getAttribute("src")).toBe(POSTER_SVG);
    await page.waitForFunction(
      () => {
        const img = document.querySelector(
          "img[data-webgl-poster]",
        ) as HTMLImageElement | null;
        return img !== null && img.complete && img.naturalWidth > 0;
      },
      null,
      { timeout: 15_000 },
    );
    const fallbackShot = await page
      .locator('section[data-demo="webgl-scene"]')
      .screenshot();

    await loadSceneModule(page);
    const live = await page.evaluate(async () => {
      const mod = (window as unknown as { __webglScene?: BrowserSceneModule })
        .__webglScene;
      if (!mod) throw new Error("scene module missing");
      const canvas = document.querySelector("canvas[data-webgl-canvas]");
      if (!canvas) throw new Error("canvas missing");
      const out = await mod.mountWebglScene(canvas, {
        capabilities: ["presentation", "webgl"],
        prefersReducedMotion: false,
        preserveDrawingBuffer: true,
      });
      const grab = (source: HTMLImageElement | HTMLCanvasElement) => {
        const flat = document.createElement("canvas");
        flat.width = 64;
        flat.height = 36;
        const ctx = flat.getContext("2d");
        if (!ctx) throw new Error("2d unavailable");
        ctx.drawImage(source, 0, 0, 64, 36);
        return Array.from(ctx.getImageData(0, 0, 64, 36).data);
      };
      const posterEl = document.querySelector(
        "img[data-webgl-poster]",
      ) as HTMLImageElement;
      return {
        mounted: out.mounted,
        live: mod.liveWebglSceneCount(),
        scene: grab(canvas as HTMLCanvasElement),
        poster: grab(posterEl),
      };
    });
    expect(live.mounted).toBe(true);
    expect(live.live).toBe(1);

    // Poster is a flat still (validates the measurement chain); the scene
    // frame carries real two-tone variance and sits far from the poster.
    const posterStats = channelStats(live.poster);
    const sceneStats = channelStats(live.scene);
    expect(maxOf(posterStats.std.slice(0, 3))).toBeLessThan(8);
    expect(maxOf(sceneStats.std.slice(0, 3))).toBeGreaterThan(15);
    const diff = meanAbsDiff(live.scene, live.poster);
    expect(diff).toBeGreaterThan(40);

    // Screenshots agree: the live section no longer matches the fallback.
    const liveShot = await page
      .locator('section[data-demo="webgl-scene"]')
      .screenshot();
    expect(liveShot.equals(fallbackShot)).toBe(false);
    console.log(
      `[webgl-proof] poster_std_rgb=${posterStats.std
        .slice(0, 3)
        .map((v) => v.toFixed(2))
        .join(",")} scene_std_rgb=${sceneStats.std
        .slice(0, 3)
        .map((v) => v.toFixed(2))
        .join(",")} scene_mean_rgb=${sceneStats.mean
        .slice(0, 3)
        .map((v) => v.toFixed(1))
        .join(",")} poster_mean_rgb=${posterStats.mean
        .slice(0, 3)
        .map((v) => v.toFixed(1))
        .join(",")} mean_abs_diff=${diff.toFixed(2)} ` +
        `fallback_shot_bytes=${fallbackShot.length} live_shot_bytes=${liveShot.length}`,
    );

    expect(harness.pageErrors).toEqual([]);
    expect(harness.consoleErrors).toEqual([]);
    expect(harness.collector.externalResponses()).toEqual([]);
  } finally {
    harness.collector.dispose();
  }
});

test("reduced motion forces the static path: engine never loads", async ({
  page,
}) => {
  const { html } = renderWebglScene({
    settings: { caption: "Calm edit", poster: POSTER_SVG },
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const harness = await harnessPage(page, html);
  try {
    expect(
      await page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);

    await loadSceneModule(page);
    const outcome = await page.evaluate(async (threeUrl: string) => {
      const mod = (window as unknown as { __webglScene?: BrowserSceneModule })
        .__webglScene;
      if (!mod) throw new Error("scene module missing");
      const w = window as unknown as { __loaderCalls?: number };
      w.__loaderCalls = 0;
      const canvas = document.querySelector("canvas[data-webgl-canvas]");
      if (!canvas) throw new Error("canvas missing");
      const out = await mod.mountWebglScene(canvas, {
        capabilities: ["presentation", "webgl"],
        prefersReducedMotion: true,
        loader: () => {
          w.__loaderCalls = (w.__loaderCalls ?? 0) + 1;
          return import(threeUrl); // sast-allow: dynamic-import -- test-harness loader over a route-fulfilled local URL, no network or user input
        },
      });
      return {
        mounted: out.mounted,
        renderer: out.renderer,
        calls: w.__loaderCalls ?? -1,
        live: mod.liveWebglSceneCount(),
      };
    }, THREE_MODULE_URL);
    expect(outcome.mounted).toBe(false);
    expect(outcome.renderer).toBeNull();
    expect(outcome.calls).toBe(0);
    expect(outcome.live).toBe(0);

    // Static fallback stands with zero engine JS: poster legible.
    const poster = page.locator("img[data-webgl-poster]");
    await expect(poster).toBeVisible();
    await expect(
      page.locator('section[data-demo="webgl-scene"]'),
    ).toContainText("Calm edit");

    // Node side of the same contract: the real mount helper never touches
    // the engine under reduced motion.
    let loaderCalls = 0;
    const mounted = await mountWebglScene(
      { width: 64, height: 36, getContext: () => null },
      {
        capabilities: ["presentation", "webgl"],
        prefersReducedMotion: true,
        loader: () => {
          loaderCalls += 1;
          return Promise.reject(new Error("engine must not load"));
        },
      },
    );
    expect(mounted.mounted).toBe(false);
    expect(loaderCalls).toBe(0);
    mounted.destroy();

    expect(harness.pageErrors).toEqual([]);
    expect(harness.collector.externalResponses()).toEqual([]);
  } finally {
    harness.collector.dispose();
  }
});

test("dispose tears down the GL context: lost context, zero live scenes", async ({
  page,
}) => {
  const { html } = renderWebglScene({
    settings: { caption: "Night glow", poster: POSTER_SVG },
  });
  const harness = await harnessPage(page, html);
  try {
    await loadSceneModule(page);
    const mounted = await page.evaluate(() => {
      const mod = (window as unknown as { __webglScene?: BrowserSceneModule })
        .__webglScene;
      if (!mod) throw new Error("scene module missing");
      const w = window as unknown as { __scene?: unknown };
      const canvas = document.querySelector("canvas[data-webgl-canvas]");
      if (!canvas) throw new Error("canvas missing");
      return mod
        .mountWebglScene(canvas, {
          capabilities: ["presentation", "webgl"],
          prefersReducedMotion: false,
        })
        .then((out) => {
          w.__scene = out;
          return { mounted: out.mounted, live: mod.liveWebglSceneCount() };
        });
    });
    expect(mounted.mounted).toBe(true);
    expect(mounted.live).toBe(1);

    const torn = await page.evaluate(() => {
      const mod = (window as unknown as { __webglScene?: BrowserSceneModule })
        .__webglScene;
      if (!mod) throw new Error("scene module missing");
      const w = window as unknown as {
        __scene?: {
          renderer: { getContext(): { isContextLost(): boolean } | null };
          destroy(): void;
        };
      };
      const scene = w.__scene;
      if (!scene) throw new Error("scene handle missing");
      scene.destroy();
      scene.destroy();
      const gl = scene.renderer.getContext();
      return {
        lost: gl !== null && gl.isContextLost(),
        live: mod.liveWebglSceneCount(),
      };
    });
    expect(torn.lost).toBe(true);
    expect(torn.live).toBe(0);

    // Node side of the same contract: the registry returns to zero and a
    // second destroy is safe.
    const liveBefore = liveWebglSceneCount();
    const disposed: string[] = [];
    const nodeMounted = await mountWebglScene(
      { width: 64, height: 36, getContext: () => ({}) },
      {
        capabilities: ["presentation", "webgl"],
        prefersReducedMotion: false,
        loader: async () => ({
          Scene: class {
            background: unknown = null;
            add() {}
          },
          PerspectiveCamera: class {
            aspect = 1;
            position = { x: 0, y: 0, z: 0 };
            updateProjectionMatrix() {}
          },
          WebGLRenderer: class {
            render() {}
            setSize() {}
            dispose() {
              disposed.push("renderer");
            }
            forceContextLoss() {
              disposed.push("context");
            }
          },
          BoxGeometry: class {
            dispose() {
              disposed.push("geometry");
            }
          },
          MeshBasicMaterial: class {
            dispose() {
              disposed.push("material");
            }
          },
          Mesh: class {
            rotation = { x: 0, y: 0 };
          },
          Color: class {},
        }),
      },
    );
    expect(nodeMounted.mounted).toBe(true);
    expect(liveWebglSceneCount()).toBe(liveBefore + 1);
    nodeMounted.destroy();
    expect(disposed).toEqual(
      expect.arrayContaining(["renderer", "context", "geometry", "material"]),
    );
    expect(liveWebglSceneCount()).toBe(liveBefore);

    expect(harness.pageErrors).toEqual([]);
    expect(harness.consoleErrors).toEqual([]);
    expect(harness.collector.externalResponses()).toEqual([]);
  } finally {
    harness.collector.dispose();
  }
});

test("bridge denial still holds with the webgl section registered", async () => {
  const grants = demoThemeGrants();
  const ctx = {
    granted: grants.granted,
    navigateAllowlist: grants.navigateAllowlist,
  };
  expect(
    authorizeThemeCall(
      buildVariantSelectEnvelope("w-1", { variantId: "var-1a" }),
      ctx,
    ),
  ).toEqual({ allowed: true, method: "variant.select" });
  expect(
    authorizeThemeCall(
      buildCartAddEnvelope("w-2", { variantId: "var-3a", quantity: 1 }),
      ctx,
    ),
  ).toEqual({ allowed: true, method: "cart.add" });

  const forgeries: unknown[] = [
    {
      v: 2,
      id: "w-f-price",
      method: "cart.add",
      params: { variantId: "var-3a", quantity: 1, price: 1 },
    },
    {
      v: 2,
      id: "w-f-stock",
      method: "cart.add",
      params: { variantId: "var-3a", quantity: 1, stock: 9 },
    },
    {
      v: 2,
      id: "w-f-tenant",
      method: "storefront.read",
      params: { tenantId: "other-shop" },
    },
    {
      v: 2,
      id: "w-f-pay",
      method: "variant.select",
      params: { variantId: "var-3b", paymentStatus: "paid" },
    },
  ];
  let delegated = 0;
  for (const forged of forgeries) {
    expect(authorizeThemeCall(forged, ctx)).toEqual(
      expect.objectContaining({ allowed: false, reason: "forbidden_field" }),
    );
    const denied = await answerThemeCall(forged, {
      ...ctx,
      onCall: async () => {
        delegated += 1;
        return { ok: true };
      },
    });
    expect(denied).toEqual({ error: "theme.forbidden_field" });
  }
  expect(delegated).toBe(0);
});
