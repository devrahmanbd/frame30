/**
 * Level B WebGL capability proof — showcase section proof.
 *
 * Fixture: `examples/dev-theme-webgl/webgl-product-showcase.ts` fed only by
 * `commerce.ts` (the §5 read-scoped context shape: ids/titles/handles/images,
 * availability flags — theme code never sees catalogue amounts).
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §2-5.
 *
 * Capability under test (§2 `webgl`): a Three.js scene in an isolated canvas
 * with a static-image fallback when WebGL is unavailable. The vitest `node`
 * environment has no WebGL, so the FALLBACK path is what runs here, plus
 * mocked-context tests proving the loader gate logic both ways.
 *
 * Run: `npx vitest run --config examples/dev-theme-webgl/vitest.config.ts`
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildShowcaseSection,
  hostPrefersReducedMotion,
  isWebGLAvailable,
  liveShowcaseSceneCount,
  mountShowcaseScene,
  renderWebGLProductShowcase,
  resolveShowcaseMode,
  type ShowcaseCanvasLike,
  type ShowcaseCommerceContext,
  type ShowcaseGL,
  type ShowcaseScene,
} from "./webgl-product-showcase";

const here = dirname(fileURLToPath(import.meta.url));
/** Theme source under test — docs and tests are deliberately excluded. */
const THEME_SOURCE_FILES = [
  "dev.theme.json",
  "manifest.ts",
  "commerce.ts",
  "three.stub.d.ts",
  "webgl-product-showcase.ts",
];
const themeSource = () =>
  THEME_SOURCE_FILES.map((file) => ({
    file,
    text: readFileSync(join(here, file), "utf8"),
  }));

function demoCommerce(): ShowcaseCommerceContext {
  return {
    products: [
      {
        id: "prod-1",
        title: "River Clay Vase",
        handle: "river-clay-vase",
        images: ["/ph/webgl/vase.jpg"],
        options: ["Natural", "Charcoal"],
        variants: [
          { id: "var-1a", title: "Natural", available: true },
          { id: "var-1b", title: "Charcoal", available: false },
        ],
      },
      {
        id: "prod-2",
        title: "Palm Woven Basket",
        handle: "palm-woven-basket",
        images: ["/ph/webgl/basket.jpg"],
        options: ["Large"],
        variants: [{ id: "var-2a", title: "Large", available: false }],
      },
    ],
    collections: [
      {
        id: "col-1",
        title: "New arrivals",
        handle: "new-arrivals",
        productIds: ["prod-1", "prod-2"],
      },
    ],
  };
}

const mockGL: ShowcaseGL = {};
const glCanvas: ShowcaseCanvasLike = {
  getContext: (_kind: string) => mockGL,
};
const nullCanvas: ShowcaseCanvasLike = {
  getContext: (_kind: string) => null,
};

function fakeScene() {
  const state = { renders: 0, disposed: false };
  const scene: ShowcaseScene = {
    render: () => {
      state.renders += 1;
    },
    dispose: () => {
      state.disposed = true;
    },
    isDisposed: () => state.disposed,
  };
  return { scene, state };
}

describe("dev-theme webgl — merchant settings render", () => {
  it("applies heading text and the merchant product selection", () => {
    const out = renderWebGLProductShowcase({
      settings: {
        heading: "This week's edit",
        products: ["prod-2", "prod-1"],
        poster: "/ph/webgl/edit.jpg",
      },
      commerce: demoCommerce(),
      prefersReducedMotion: false,
    });
    expect(out.heading).toBe("This week's edit");
    expect(out.html).toContain("This week&#x27;s edit");
    expect(out.products.map((product) => product.id)).toEqual([
      "prod-2",
      "prod-1",
    ]);
    expect(out.html).toContain("Palm Woven Basket");
    expect(out.html).toContain("River Clay Vase");
  });

  it("renders copy escaped (merchant text is copy only, never markup)", () => {
    const out = renderWebGLProductShowcase({
      settings: { heading: "<script>alert(1)</script>" },
      commerce: demoCommerce(),
      prefersReducedMotion: false,
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("skips unknown product ids instead of failing", () => {
    const out = renderWebGLProductShowcase({
      settings: { products: ["missing-id", "prod-1"] },
      commerce: demoCommerce(),
      prefersReducedMotion: false,
    });
    expect(out.products.map((product) => product.id)).toEqual(["prod-1"]);
    expect(out.html).not.toContain("missing-id");
  });

  it("surfaces availability from the context without catalogue amounts", () => {
    const out = renderWebGLProductShowcase({
      settings: { products: ["prod-1", "prod-2"] },
      commerce: demoCommerce(),
      prefersReducedMotion: false,
    });
    expect(out.html).toContain("Available");
    expect(out.html).toContain("Back soon");
  });

  it("maps merchant settings onto the host Section shape", () => {
    const section = buildShowcaseSection("showcase-1", {
      heading: "Hello",
      products: ["prod-1"],
      poster: "/ph/webgl/hello.jpg",
    });
    expect(section).toMatchObject({
      id: "showcase-1",
      type: "webgl-showcase",
      props: {
        heading: "Hello",
        products: ["prod-1"],
        poster: "/ph/webgl/hello.jpg",
      },
    });
  });
});

describe("dev-theme webgl — commerce-context purity (source scan)", () => {
  it("theme source contains no catalogue-amount literals", () => {
    const banned: RegExp[] = [
      /\bprices?\b/i,
      /amount_minor/,
      /৳/,
      /\bBDT\s*\d/i,
      /\$\s*\d/,
    ];
    for (const { file, text } of themeSource()) {
      for (const pattern of banned) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("the single-engine policy holds: no static three import, dynamic only", () => {
    for (const { file, text } of themeSource()) {
      expect(text, `${file} must not statically import three`).not.toMatch(
        /^\s*import\s+(?!type\b).*from\s*["']three["']/m,
      );
      expect(text, `${file} must not require three`).not.toMatch(
        /require\(\s*["']three["']\s*\)/,
      );
    }
    const section = themeSource().find(
      (entry) => entry.file === "webgl-product-showcase.ts",
    )!;
    expect(section.text).toMatch(/await\s+import\(\s*["']three["']\s*\)/);
  });

  it("theme source performs no network access", () => {
    const banned: RegExp[] = [
      /\bfetch\s*\(/,
      /from\s+["']https?:/,
      /import\(\s*["']https?:/,
      /XMLHttpRequest/,
      /WebSocket/,
    ];
    for (const { file, text } of themeSource()) {
      for (const pattern of banned) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("only the expected fixture files exist (no stray sources to audit)", () => {
    const files = readdirSync(here).sort();
    expect(files).toEqual(
      [
        "README.md",
        "commerce.ts",
        "dev.theme.json",
        "manifest.ts",
        "three.stub.d.ts",
        "vitest.config.ts",
        "webgl-manifest.test.ts",
        "webgl-product-showcase.test.ts",
        "webgl-product-showcase.ts",
      ].sort(),
    );
  });
});

describe("dev-theme webgl — fallback behaviour", () => {
  it("no-WebGL renders a functional static fallback (image + data, no canvas)", () => {
    const out = renderWebGLProductShowcase({
      settings: { heading: "Clay edit", products: ["prod-1"] },
      commerce: demoCommerce(),
      prefersReducedMotion: false,
    });
    expect(out.mode).toBe("static");
    expect(out.fallback).toBe(true);
    expect(out.html).toContain("Clay edit");
    expect(out.html).toContain("River Clay Vase");
    expect(out.html).toContain("/ph/webgl/vase.jpg");
    expect(out.html).toContain("data-showcase-poster");
    expect(out.html).not.toContain("<canvas");
  });

  it("reduced motion forces the fallback even when WebGL exists (mocked)", () => {
    const out = renderWebGLProductShowcase({
      settings: { heading: "Calm edit", products: ["prod-1"] },
      commerce: demoCommerce(),
      prefersReducedMotion: true,
      webglAvailable: true,
    });
    expect(out.mode).toBe("static");
    expect(out.fallback).toBe(true);
    expect(out.html).toContain("Calm edit");
    expect(out.html).toContain("River Clay Vase");
    expect(out.html).not.toContain("<canvas");
  });

  it("WebGL mode adds a canvas mount ahead of the poster fallback", () => {
    const out = renderWebGLProductShowcase({
      settings: { heading: "3D edit", products: ["prod-1"] },
      commerce: demoCommerce(),
      prefersReducedMotion: false,
      webglAvailable: true,
    });
    expect(out.mode).toBe("webgl");
    expect(out.fallback).toBe(false);
    expect(out.html).toContain("<canvas");
    expect(out.html).toContain("data-showcase-mount");
    // The poster stays beneath the mount as the no-JS fallback.
    expect(out.html).toContain("data-showcase-poster");
    expect(out.html).toContain("River Clay Vase");
  });

  it("the gate resolves webgl only when GL exists without reduced motion", () => {
    expect(
      resolveShowcaseMode({
        prefersReducedMotion: false,
        webglAvailable: true,
      }),
    ).toBe("webgl");
    expect(
      resolveShowcaseMode({
        prefersReducedMotion: false,
        webglAvailable: false,
      }),
    ).toBe("static");
    expect(
      resolveShowcaseMode({
        prefersReducedMotion: true,
        webglAvailable: true,
      }),
    ).toBe("static");
    expect(
      resolveShowcaseMode({
        prefersReducedMotion: true,
        webglAvailable: false,
      }),
    ).toBe("static");
  });

  it("host capability probes are SSR-safe (node: no WebGL, no throw)", () => {
    expect(() => isWebGLAvailable()).not.toThrow();
    expect(isWebGLAvailable()).toBe(false);
    expect(() => hostPrefersReducedMotion()).not.toThrow();
    expect(typeof hostPrefersReducedMotion()).toBe("boolean");
  });
});

describe("dev-theme webgl — loader gate (mocked contexts)", () => {
  it("a null GL context never loads the engine (fallback stands)", async () => {
    let loaderCalls = 0;
    const mounted = await mountShowcaseScene(nullCanvas, {
      loader: () => {
        loaderCalls += 1;
        return Promise.reject(new Error("engine must not load"));
      },
    });
    expect(mounted.scene).toBeNull();
    expect(mounted.fallback).toBe(true);
    expect(loaderCalls).toBe(0);
    mounted.destroy();
  });

  it("reduced motion short-circuits even with a live GL context", async () => {
    let loaderCalls = 0;
    const mounted = await mountShowcaseScene(glCanvas, {
      prefersReducedMotion: true,
      loader: () => {
        loaderCalls += 1;
        return Promise.reject(new Error("engine must not load"));
      },
    });
    expect(mounted.scene).toBeNull();
    expect(mounted.fallback).toBe(true);
    expect(loaderCalls).toBe(0);
    mounted.destroy();
  });

  it("a mocked GL context loads the engine once; destroy disposes (no leaks)", async () => {
    const { scene, state } = fakeScene();
    let loaderCalls = 0;
    const liveBefore = liveShowcaseSceneCount();
    const seen: { canvas?: ShowcaseCanvasLike; gl?: ShowcaseGL } = {};

    const mounted = await mountShowcaseScene(glCanvas, {
      loader: () => {
        loaderCalls += 1;
        return Promise.resolve({
          createScene: (canvas: ShowcaseCanvasLike, gl: ShowcaseGL) => {
            seen.canvas = canvas;
            seen.gl = gl;
            return scene;
          },
        });
      },
    });

    expect(loaderCalls).toBe(1);
    expect(mounted.scene).not.toBeNull();
    expect(mounted.fallback).toBe(false);
    expect(seen.canvas).toBe(glCanvas);
    expect(seen.gl).toBe(mockGL);
    expect(state.renders).toBe(1);
    expect(liveShowcaseSceneCount()).toBe(liveBefore + 1);

    mounted.destroy();
    expect(state.disposed).toBe(true);
    expect(scene.isDisposed()).toBe(true);
    expect(liveShowcaseSceneCount()).toBe(liveBefore);

    // Destroy is idempotent — a second call disposes nothing again.
    mounted.destroy();
    expect(liveShowcaseSceneCount()).toBe(liveBefore);
  });

  it("a malformed engine module falls back without crashing", async () => {
    const mounted = await mountShowcaseScene(glCanvas, {
      loader: () => Promise.resolve({}),
    });
    expect(mounted.scene).toBeNull();
    expect(mounted.fallback).toBe(true);
    mounted.destroy();
  });
});
