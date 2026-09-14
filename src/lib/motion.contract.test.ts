/**
 * Phase 10.1 — motion foundation contract.
 *
 * Two halves:
 *   1. behavioural — the lazy engine loader retries, times out, trips its
 *      breaker and degrades to a static page instead of throwing;
 *   2. source invariants — the properties that keep the marketing surface fast
 *      and accessible and that a well-meaning refactor would otherwise erase:
 *      no static engine import, one engine only, every primitive consults the
 *      resolved intent, and the runtime never touches the DOM at module scope.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMotionEngine,
  loadMotionEngine,
  motionEngineState,
  withEngine,
  type MotionEngine,
} from "./motion-engine";
import { setMotionLogSink, type recentMotionLogs } from "./motion-runtime";
import { ENGINE_LOAD_POLICY } from "./motion-policy";

const PRIMITIVE_DIR = join(process.cwd(), "src/components/public/motion");
const primitiveFiles = readdirSync(PRIMITIVE_DIR).filter((f) => f.endsWith(".tsx"));
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const fakeEngine = () =>
  ({
    gsap: { registerPlugin: vi.fn(), set: vi.fn() },
    ScrollTrigger: { create: vi.fn(() => ({ kill: vi.fn() })) },
  }) as unknown as MotionEngine;

describe("motion engine loader", () => {
  const logs: Array<{ event: string; level: string }> = [];

  beforeEach(() => {
    __resetMotionEngine();
    logs.length = 0;
    setMotionLogSink((record) => logs.push({ event: record.event, level: record.level }));
    vi.stubGlobal("window", globalThis.window ?? ({} as Window & typeof globalThis));
  });

  afterEach(() => {
    setMotionLogSink(null);
    vi.unstubAllGlobals();
    __resetMotionEngine();
  });

  it("loads once and shares the promise between concurrent callers", async () => {
    const loader = vi.fn(async () => fakeEngine());
    const [a, b, c] = await Promise.all([
      loadMotionEngine({ loader }),
      loadMotionEngine({ loader }),
      loadMotionEngine({ loader }),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(motionEngineState()).toBe("ready");
    expect(await loadMotionEngine({ loader })).toBe(a);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.event === "engine.ready")).toBe(true);
  });

  it("retries a transient failure with backoff and then succeeds", async () => {
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error("chunk 503");
      return fakeEngine();
    });
    const engine = await loadMotionEngine({
      loader,
      policy: { ...ENGINE_LOAD_POLICY, baseBackoffMs: 1, maxBackoffMs: 2 },
    });
    expect(engine).not.toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(logs.filter((l) => l.event === "engine.retry")).toHaveLength(1);
  });

  it("degrades to null — never throws — once retries are exhausted", async () => {
    const loader = vi.fn(async () => {
      throw new Error("network down");
    });
    const engine = await loadMotionEngine({
      loader,
      policy: { ...ENGINE_LOAD_POLICY, baseBackoffMs: 1, maxBackoffMs: 2 },
    });
    expect(engine).toBeNull();
    expect(motionEngineState()).toBe("degraded");
    expect(logs.some((l) => l.event === "engine.degraded" && l.level === "error")).toBe(true);
  });

  it("keeps the breaker open — a broken deploy costs one round of retries per session", async () => {
    const loader = vi.fn(async () => {
      throw new Error("network down");
    });
    const policy = { ...ENGINE_LOAD_POLICY, baseBackoffMs: 1, maxBackoffMs: 2 };
    await loadMotionEngine({ loader, policy });
    const attempts = loader.mock.calls.length;
    expect(await loadMotionEngine({ loader, policy })).toBeNull();
    expect(loader).toHaveBeenCalledTimes(attempts);
  });

  it("times out a hung import instead of leaving a section pinned forever", async () => {
    const loader = vi.fn(() => new Promise<MotionEngine>(() => {}));
    const engine = await loadMotionEngine({
      loader,
      policy: { ...ENGINE_LOAD_POLICY, timeoutMs: 20, retries: 0, baseBackoffMs: 1 },
    });
    expect(engine).toBeNull();
    expect(motionEngineState()).toBe("degraded");
  });

  it("withEngine runs setup once loaded and disposes cleanly before the load lands", async () => {
    const cleanup = vi.fn();
    const setup = vi.fn(() => cleanup);
    const scope = withEngine(setup, { loader: async () => fakeEngine() });
    await new Promise((r) => setTimeout(r, 5));
    expect(setup).toHaveBeenCalledTimes(1);
    scope.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);

    __resetMotionEngine();
    const late = vi.fn();
    const early = withEngine(late, {
      loader: () => new Promise((resolve) => setTimeout(() => resolve(fakeEngine()), 10)),
    });
    early.dispose();
    await new Promise((r) => setTimeout(r, 25));
    expect(late).not.toHaveBeenCalled();
  });

  it("survives a throwing setup without breaking the page", async () => {
    const scope = withEngine(
      () => {
        throw new Error("bad tween");
      },
      { loader: async () => fakeEngine() },
    );
    await new Promise((r) => setTimeout(r, 5));
    expect(logs.some((l) => l.event === "engine.setup_failed")).toBe(true);
    expect(() => scope.dispose()).not.toThrow();
  });
});

describe("weight discipline", () => {
  it("no module outside the engine loader imports gsap", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && rel !== "src/lib/motion-engine.ts") {
          if (/from\s+["']gsap/.test(read(rel))) offenders.push(rel);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });

  it("the engine is only ever reached through a dynamic import", () => {
    const source = read("src/lib/motion-engine.ts");
    expect(source).toMatch(/await Promise\.all\(\[\s*import\("gsap"\)/);
    expect(source).not.toMatch(/^import .*from "gsap"/m);
  });

  it("keeps exactly one animation engine in the dependency list", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    const engines = deps.filter((d) =>
      /^(gsap|framer-motion|motion|animejs|popmotion|react-spring|@react-spring\/|lottie-web|@lottiefiles\/|rive-react|@rive-app\/)/.test(d),
    );
    expect(engines).toEqual(["gsap"]);
  });

  it("the runtime does no DOM work at module scope beyond a guarded listener", () => {
    const source = read("src/lib/motion-runtime.ts");
    const moduleScope = source.split("export function")[0] ?? "";
    expect(moduleScope).not.toMatch(/^\s*(document|window)\./m);
    expect(source).toMatch(/typeof document !== "undefined"/);
    expect(source).toMatch(/typeof IntersectionObserver === "undefined"/);
  });
});

describe("primitive invariants", () => {
  it("ships the full documented set", () => {
    expect(primitiveFiles.sort()).toEqual(
      ["Counter.tsx", "GradientMesh.tsx", "MagneticButton.tsx", "Marquee.tsx", "Parallax.tsx", "Reveal.tsx", "Stagger.tsx"].sort(),
    );
    const barrel = read("src/components/public/motion/index.ts");
    for (const file of primitiveFiles) expect(barrel).toContain(file.replace(".tsx", ""));
  });

  it("every primitive resolves the motion intent rather than animating unconditionally", () => {
    for (const file of primitiveFiles) {
      const source = read(`src/components/public/motion/${file}`);
      const consults =
        source.includes("useMotionIntent") || source.includes("from \"./Reveal\"");
      expect(consults, `${file} must consult useMotionIntent`).toBe(true);
    }
  });

  it("no primitive hides content behind a CSS-only animation with no settled fallback", () => {
    for (const file of primitiveFiles) {
      const source = read(`src/components/public/motion/${file}`);
      if (!source.includes("opacity: 0")) continue;
      expect(source, `${file} must be able to settle`).toMatch(/opacity: hidden \? 0 : 1/);
    }
  });

  it("off-screen and background work is stopped, not merely hidden", () => {
    expect(read("src/components/public/motion/Marquee.tsx")).toContain("onTabVisibility");
    expect(read("src/lib/motion-runtime.ts")).toMatch(/tickerPausedByVisibility/);
    expect(read("src/lib/motion-runtime.ts")).toMatch(/cancelAnimationFrame/);
  });

  it("the shared budget caps concurrent animations page-wide", () => {
    const runtime = read("src/lib/motion-runtime.ts");
    expect(runtime).toMatch(/pageMotionBudget = new MotionBudget\(\d+\)/);
    for (const file of ["Reveal.tsx", "Counter.tsx"]) {
      expect(read(`src/components/public/motion/${file}`)).toContain("withMotionBudget");
    }
  });

  it("the counter exposes the settled figure to assistive tech and crawlers", () => {
    const source = read("src/components/public/motion/Counter.tsx");
    expect(source).toContain("sr-only");
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("formatCounterValue");
  });

  it("the marquee is labelled, pausable and duplicates its track accessibly", () => {
    const source = read("src/components/public/motion/Marquee.tsx");
    expect(source).toContain("aria-label={label}");
    expect(source).toContain("onFocusCapture");
    expect(source).toContain('aria-hidden="true"');
  });

  it("the gradient mesh stays decorative", () => {
    expect(read("src/components/public/motion/GradientMesh.tsx")).toContain('aria-hidden="true"');
  });
});

describe("stylesheet contract", () => {
  const css = read("src/styles.css");

  it("defines the marketing tokens the primitives rely on", () => {
    for (const token of ["--fq-gradient-hero", "--shadow-lift", "--ring-focus", "--fq-rhythm-lg", "--fq-measure"]) {
      expect(css, `missing ${token}`).toContain(token);
    }
  });

  it("never removes focus outlines without replacing them", () => {
    const blocks = css.match(/outline:\s*none/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    expect(css).toMatch(/focus-visible[\s\S]{0,200}box-shadow: var\(--ring-focus\)/);
  });

  it("kills decorative motion under prefers-reduced-motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.fq-mesh-blob \{ animation: none/);
  });
});

// Type-only usage so the import above is not elided by the transform.
export type MotionLogs = ReturnType<typeof recentMotionLogs>;
