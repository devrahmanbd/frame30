/**
 * Demo theme fixture — isolated WebGL scene proof (section 4 of 4).
 *
 * Fixture: `examples/demo-theme/webgl-scene.ts` — an isolated-canvas scene
 * with a static-image fallback when WebGL is unavailable. The Three.js
 * engine is reached ONLY through a dynamic `import("three")` (never a
 * static import), behind two gates that never touch the engine: the
 * manifest `webgl` capability declaration and the host reduced-motion
 * probe. Mount renders exactly one frame; destroy disposes geometry,
 * material, and renderer and forces context loss.
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §2
 * (`webgl` — isolated canvas + static fallback).
 *
 * Run: `npx vitest run --config examples/demo-theme/vitest.config.ts`
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildWebglSection,
  coerceWebglSettings,
  liveWebglSceneCount,
  mountWebglScene,
  renderWebglScene,
  WEBGL_COMPONENT_NAME,
  WEBGL_REQUIRED_CAPABILITIES,
  WEBGL_SECTION_KEY,
  WEBGL_SECTION_SLOT,
  type WebglCanvasHost,
  type WebglEngineLoader,
} from "./webgl-scene";

const here = dirname(fileURLToPath(import.meta.url));

function supportingCanvas(): WebglCanvasHost & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    width: 64,
    height: 36,
    getContext: (kind: string) => {
      calls.push(kind);
      return { kind };
    },
  };
}

function deadCanvas(): WebglCanvasHost {
  return {
    width: 64,
    height: 36,
    getContext: () => null,
  };
}

/** Fake engine: records construction + render + dispose without any GL. */
function fakeEngine(record: {
  constructed: string[];
  renders: number;
  disposed: string[];
  contextLost: boolean;
}) {
  const renderer = {
    render: (_scene: unknown, _camera: unknown) => {
      record.renders += 1;
    },
    setSize: (_w: unknown, _h: unknown) => {},
    dispose: () => {
      record.disposed.push("renderer");
    },
    forceContextLoss: () => {
      record.contextLost = true;
    },
  };
  const geometry = {
    dispose: () => {
      record.disposed.push("geometry");
    },
  };
  const material = {
    dispose: () => {
      record.disposed.push("material");
    },
  };
  return {
    Scene: class {
      background: unknown = null;
      children: unknown[] = [];
      add(child: unknown) {
        this.children.push(child);
      }
    },
    PerspectiveCamera: class {
      aspect: number;
      position = { x: 0, y: 0, z: 0 };
      constructor(fov: number, aspect: number, _near: number, _far: number) {
        void fov;
        this.aspect = aspect;
      }
      updateProjectionMatrix() {}
    },
    WebGLRenderer: class {
      constructor(_opts: unknown) {
        record.constructed.push("renderer");
      }
      render = renderer.render;
      setSize = renderer.setSize;
      dispose = renderer.dispose;
      forceContextLoss = renderer.forceContextLoss;
    },
    BoxGeometry: class {
      constructor(_w: number, _h: number, _d: number) {
        record.constructed.push("geometry");
      }
      dispose = geometry.dispose;
    },
    MeshBasicMaterial: class {
      constructor(_opts: unknown) {
        record.constructed.push("material");
      }
      dispose = material.dispose;
    },
    Mesh: class {
      rotation = { x: 0, y: 0 };
      constructor(_geo: unknown, _mat: unknown) {
        record.constructed.push("mesh");
      }
    },
    Color: class {
      constructor(_hex: number) {
        record.constructed.push("color");
      }
    },
  };
}

function countingLoader(
  record: {
    constructed: string[];
    renders: number;
    disposed: string[];
    contextLost: boolean;
  },
  counter: { calls: number },
): WebglEngineLoader {
  return async () => {
    counter.calls += 1;
    return fakeEngine(record);
  };
}

describe("webgl scene — static-first render (no engine, no GL)", () => {
  it("renders the caption with an isolated canvas and a poster fallback", () => {
    const out = renderWebglScene({
      settings: { caption: "Night firing", poster: "/ph/demo/kiln-poster.jpg" },
    });
    expect(out.caption).toBe("Night firing");
    expect(out.poster).toBe("/ph/demo/kiln-poster.jpg");
    expect(out.html).toContain(`data-demo="${WEBGL_SECTION_KEY}"`);
    expect(out.html).toContain("Night firing");
    expect(out.html).toContain("<canvas");
    expect(out.html).toContain("data-webgl-canvas");
    expect(out.html).toContain("data-webgl-poster");
    expect(out.html).toContain('src="/ph/demo/kiln-poster.jpg"');
  });

  it("renders copy escaped (merchant text is copy only, never markup)", () => {
    const out = renderWebglScene({
      settings: { caption: "<b>Bold</b>", poster: "/ph/demo/x.jpg" },
    });
    expect(out.html).not.toContain("<b>Bold</b>");
    expect(out.html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
  });

  it("an empty poster renders no src (the fallback stays request-free)", () => {
    const out = renderWebglScene({ settings: {} });
    expect(out.poster).toBe("");
    expect(out.html).toContain("data-webgl-poster");
    expect(out.html).not.toMatch(/(?<![-\w])src="/);
  });

  it("maps merchant settings onto the host Section shape", () => {
    const section = buildWebglSection("webgl-1", {
      caption: "Hello",
      poster: "/ph/demo/x.jpg",
    });
    expect(section).toMatchObject({
      id: "webgl-1",
      type: WEBGL_SECTION_KEY,
      props: { caption: "Hello", poster: "/ph/demo/x.jpg" },
    });
    expect(WEBGL_SECTION_KEY).toBe("webgl-scene");
    expect(WEBGL_COMPONENT_NAME).toBe("WebglScene");
    expect(WEBGL_SECTION_SLOT).toBe("main");
    expect([...WEBGL_REQUIRED_CAPABILITIES]).toEqual(["presentation", "webgl"]);
  });

  it("falls back on weak input and trims overlong values", () => {
    expect(coerceWebglSettings({}).caption).toBe("Night glow");
    expect(coerceWebglSettings({}).poster).toBe("");
    expect(coerceWebglSettings({ caption: "   " }).caption).toBe("Night glow");
    expect(
      coerceWebglSettings({ poster: "x".repeat(5000) }).poster.length,
    ).toBeLessThanOrEqual(2048);
  });
});

describe("webgl scene — gates (engine never loads on the static path)", () => {
  it("without the webgl capability the engine never loads", async () => {
    const canvas = supportingCanvas();
    const record = {
      constructed: [],
      renders: 0,
      disposed: [],
      contextLost: false,
    } as {
      constructed: string[];
      renders: number;
      disposed: string[];
      contextLost: boolean;
    };
    const counter = { calls: 0 };
    const mounted = await mountWebglScene(canvas, {
      capabilities: ["presentation"],
      prefersReducedMotion: false,
      loader: countingLoader(record, counter),
    });
    expect(mounted.mounted).toBe(false);
    expect(mounted.renderer).toBeNull();
    expect(counter.calls).toBe(0);
    expect(canvas.calls).toEqual([]);
    expect(record.renders).toBe(0);
    expect(liveWebglSceneCount()).toBe(0);
    mounted.destroy();
  });

  it("reduced motion forces the static path (no engine load)", async () => {
    const canvas = supportingCanvas();
    const record = {
      constructed: [],
      renders: 0,
      disposed: [],
      contextLost: false,
    } as {
      constructed: string[];
      renders: number;
      disposed: string[];
      contextLost: boolean;
    };
    const counter = { calls: 0 };
    const out = renderWebglScene({
      settings: { caption: "Calm edit" },
    });
    expect(out.html).toContain("Calm edit");

    const mounted = await mountWebglScene(canvas, {
      capabilities: ["presentation", "webgl"],
      prefersReducedMotion: true,
      loader: () => {
        counter.calls += 1;
        return Promise.reject(new Error("engine must not load"));
      },
    });
    expect(mounted.mounted).toBe(false);
    expect(mounted.renderer).toBeNull();
    expect(counter.calls).toBe(0);
    expect(record.renders).toBe(0);
    mounted.destroy();
  });

  it("a canvas without WebGL falls back to the poster without the engine", async () => {
    const counter = { calls: 0 };
    const mounted = await mountWebglScene(deadCanvas(), {
      capabilities: ["presentation", "webgl"],
      prefersReducedMotion: false,
      loader: () => {
        counter.calls += 1;
        return Promise.reject(new Error("engine must not load"));
      },
    });
    expect(mounted.mounted).toBe(false);
    expect(counter.calls).toBe(0);
    expect(liveWebglSceneCount()).toBe(0);
    mounted.destroy();
  });

  it("a throwing context probe still lands on the static fallback", async () => {
    const counter = { calls: 0 };
    const canvas: WebglCanvasHost = {
      width: 64,
      height: 36,
      getContext: () => {
        throw new Error("no canvas here");
      },
    };
    const mounted = await mountWebglScene(canvas, {
      capabilities: ["presentation", "webgl"],
      prefersReducedMotion: false,
      loader: () => {
        counter.calls += 1;
        return Promise.reject(new Error("engine must not load"));
      },
    });
    expect(mounted.mounted).toBe(false);
    expect(counter.calls).toBe(0);
    mounted.destroy();
  });
});

describe("webgl scene — vendored engine (real import resolves)", () => {
  it("await import('three') resolves the real engine from the demo", async () => {
    const three = (await import("three")) as unknown as Record<string, unknown>;
    for (const key of [
      "Scene",
      "PerspectiveCamera",
      "WebGLRenderer",
      "BoxGeometry",
      "MeshBasicMaterial",
      "Mesh",
      "Color",
    ]) {
      expect(typeof three[key], `three.${key}`).toBe("function");
    }
  });

  it("the manifest pin equals the installed version (no drift)", async () => {
    const manifestJson = JSON.parse(
      readFileSync(join(here, "dev.theme.json"), "utf8"),
    ) as {
      dependencies: Array<{ name: string; version: string }>;
    };
    const installed = JSON.parse(
      readFileSync(
        join(here, "..", "..", "node_modules", "three", "package.json"),
        "utf8",
      ),
    ) as { version: string };
    const root = JSON.parse(
      readFileSync(join(here, "..", "..", "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    const pin = manifestJson.dependencies.find((dep) => dep.name === "three");
    expect(pin?.version).toBe(installed.version);
    expect(root.dependencies["three"]).toBe(installed.version);
    expect(root.dependencies["three"]).not.toMatch(/^[~^]/);
  });

  it("reaches three through a dynamic import only", async () => {
    const text = readFileSync(join(here, "webgl-scene.ts"), "utf8");
    expect(text).toMatch(/await\s+import\(\s*["']three["']\s*\)/);
    expect(text).not.toMatch(/^\s*import\s+(?!type\b).*from\s*["']three["']/m);
    expect(text).not.toMatch(/require\(\s*["']three["']\s*\)/);
  });
});

describe("webgl scene — mount renders one frame, destroy releases GL", () => {
  it("mounts through the fake engine and destroy disposes everything", async () => {
    const liveBefore = liveWebglSceneCount();
    const canvas = supportingCanvas();
    const record = {
      constructed: [],
      renders: 0,
      disposed: [],
      contextLost: false,
    } as {
      constructed: string[];
      renders: number;
      disposed: string[];
      contextLost: boolean;
    };
    const counter = { calls: 0 };
    const mounted = await mountWebglScene(canvas, {
      capabilities: ["presentation", "webgl"],
      prefersReducedMotion: false,
      loader: countingLoader(record, counter),
    });
    expect(counter.calls).toBe(1);
    expect(mounted.mounted).toBe(true);
    expect(mounted.renderer).not.toBeNull();
    expect(record.renders).toBe(1);
    expect(record.constructed).toEqual(
      expect.arrayContaining(["renderer", "geometry", "material", "mesh"]),
    );
    expect(canvas.calls[0]).toBe("webgl2");
    expect(liveWebglSceneCount()).toBe(liveBefore + 1);

    mounted.destroy();
    expect(record.disposed).toEqual(
      expect.arrayContaining(["renderer", "geometry", "material"]),
    );
    expect(record.contextLost).toBe(true);
    expect(liveWebglSceneCount()).toBe(liveBefore);

    // Double destroy is safe (unmount races must not throw).
    expect(() => mounted.destroy()).not.toThrow();
    expect(liveWebglSceneCount()).toBe(liveBefore);
  });
});
