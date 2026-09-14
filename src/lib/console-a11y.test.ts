import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CONSOLE_BREAKPOINTS,
  CONSOLE_CONTRAST,
  CONSOLE_MOTION_MS,
  consoleContrastFailures,
  consoleContrastReport,
  contrastRatio,
  hardcodedColorHits,
} from "./console-a11y";

const css = readFileSync("src/styles.css", "utf8");

function walk(dir: string, out: Array<{ path: string; source: string }> = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path) && !path.endsWith(".test.ts"))
      out.push({ path, source: readFileSync(path, "utf8") });
  }
  return out;
}

describe("Phase 10 — console contrast floor", () => {
  it("computes sane ratios", () => {
    expect(contrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeGreaterThan(20);
  });

  it("holds 4.5:1 for text and 3:1 for UI in both schemes", () => {
    expect(consoleContrastFailures(css)).toEqual([]);
  });

  it("keeps body ink under the glare ceiling in both schemes", () => {
    const body = consoleContrastReport(css).filter((r) => r.name.startsWith("body on"));
    expect(body).toHaveLength(4);
    for (const row of body) {
      expect(row.ratio, `${row.scheme} ${row.name}`).toBeLessThanOrEqual(CONSOLE_CONTRAST.comfortMax);
      expect(row.ratio).toBeGreaterThanOrEqual(CONSOLE_CONTRAST.text);
    }
  });

  it("measures every ink/surface pair in light and dark", () => {
    const rows = consoleContrastReport(css);
    expect(rows.filter((r) => r.scheme === "light").length).toBeGreaterThanOrEqual(11);
    expect(rows.filter((r) => r.scheme === "dark").length).toBe(
      rows.filter((r) => r.scheme === "light").length,
    );
    expect(rows.every((r) => r.floor === CONSOLE_CONTRAST.text || r.floor === CONSOLE_CONTRAST.ui)).toBe(true);
  });
});

describe("Phase 10 — console stays on the token layer", () => {
  it("uses no hardcoded colour utilities in the shared kit or shell", () => {
    const files = [
      ...walk("src/components/console"),
      ...walk("src/components/admin"),
    ];
    expect(hardcodedColorHits(files)).toEqual([]);
  });
});

describe("Phase 10 — motion and focus invariants", () => {
  it("declares the motion tokens the budget quotes", () => {
    expect(css).toContain(`--fq-dur-fast: ${CONSOLE_MOTION_MS.fast}ms`);
    expect(css).toContain(`--fq-dur: ${CONSOLE_MOTION_MS.base}ms`);
    expect(css).toContain(`--fq-dur-slow: ${CONSOLE_MOTION_MS.slow}ms`);
  });

  it("neutralises console motion under prefers-reduced-motion", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.fq-admin \*/);
  });

  it("puts the focus ring on the signal colour", () => {
    expect(css).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--fq-signal[,)]/);
  });
});

describe("Phase 10 — the verification sweep is wired", () => {
  it("sweeps 390/768/1280/1920 in the browser gate", () => {
    const gate = readFileSync("scripts/console-gate.mjs", "utf8");
    for (const width of CONSOLE_BREAKPOINTS) expect(gate).toContain(String(width));
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["console:gate"]).toContain("console-gate.mjs");
    expect(pkg.scripts["gates:release"]).toContain("console:gate");
  });

  it("ships the written UX checklist future pages are reviewed against", () => {
    const doc = readFileSync("docs/02-merchant/console-ux-checklist.md", "utf8");
    expect(doc).toContain("4.5:1");
    expect(doc).toContain("prefers-reduced-motion");
  });
});
