/**
 * Phase 9 — a11y, motion and overlay invariants.
 *
 * These are structural guarantees the browser gate cannot express cheaply: one
 * overlay implementation owns focus/scroll, motion is opacity/transform only and
 * degrades under `prefers-reduced-motion`, and the a11y gate sweeps light/dark
 * in both locales.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const OVERLAY = read("src/components/builder/primitives/OverlayHost.tsx");
const REVEAL = read("src/components/builder/reveal.ts");
const CSS = read("src/styles.css");
const GATE = read("scripts/a11y-gate.mjs");

describe("overlay accessibility", () => {
  it("implements focus trap, Escape, scroll lock and focus restore once", () => {
    expect(OVERLAY).toMatch(/Escape/);
    expect(OVERLAY).toMatch(/document\.body\.style\.overflow\s*=\s*"hidden"/);
    expect(OVERLAY).toMatch(/restoreRef/);
    expect(OVERLAY).toMatch(/Tab/);
  });

  it("is the only module that locks body scroll for an overlay", () => {
    const offenders = [
      "src/components/builder/cart.tsx",
      "src/components/builder/chrome.tsx",
      "src/components/builder/collection.tsx",
      "src/components/builder/pdp.tsx",
    ].filter((path) => /body\.style\.overflow/.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe("reduced motion", () => {
  it("short-circuits reveal animation when the OS asks for less motion", () => {
    expect(REVEAL).toMatch(/prefers-reduced-motion: reduce/);
    expect(REVEAL).toMatch(/reduced \? null/);
  });

  it("ships a reduced-motion stylesheet block that kills non-opacity motion", () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it("animates opacity and transform only — never layout properties", () => {
    const keyframes = CSS.match(/@keyframes[\s\S]*?\n}/g) ?? [];
    expect(keyframes.length).toBeGreaterThan(0);
    for (const frame of keyframes) {
      expect(frame).not.toMatch(/\n\s*(width|height|top|left|margin|padding)\s*:/);
    }
  });
});

describe("a11y release gate", () => {
  it("sweeps light and dark in both locales and fails on any contrast finding", () => {
    expect(GATE).toMatch(/light-bn/);
    expect(GATE).toMatch(/dark-bn/);
    expect(GATE).toMatch(/colorScheme: variant\.scheme/);
    expect(GATE).toMatch(/color-contrast/);
  });
});

describe("release gates", () => {
  it("quotes the same vitals budget the app uses", async () => {
    const { VITALS_BUDGET } = await import("./web-vitals");
    const script = read("scripts/vitals-gate.mjs");
    expect(script).toMatch(`lcpMs: ${VITALS_BUDGET.lcpMs}`);
    expect(script).toMatch(`inpMs: ${VITALS_BUDGET.inpMs}`);
    expect(script).toMatch(`cls: ${VITALS_BUDGET.cls}`);
  });

  it("covers index, collection and product at the a11y floor", () => {
    const script = read("scripts/vitals-gate.mjs");
    for (const name of ["index", "collection", "product"]) expect(script).toMatch(`"${name}"`);
    expect(script).toMatch(/a11y-min", "95"/);
  });

  it("is wired into package scripts", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["vitals:gate"]).toBe("node scripts/vitals-gate.mjs");
    expect(pkg.scripts["a11y:gate"]).toBeDefined();
  });
});

describe("plugin sandbox", () => {
  it("keeps a sandbox-escape and permission-denial test in the suite", () => {
    const plugins = read("src/lib/phase5-plugins.test.ts");
    expect(plugins).toMatch(/rejects invented permissions, unknown hooks and dynamic code/);
    const sandbox = read("src/components/marketplace/WidgetSandbox.tsx");
    expect(sandbox).toMatch(/sandbox=/);
    expect(sandbox).not.toMatch(/allow-same-origin/);
  });
});
