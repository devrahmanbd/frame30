import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import browserslistToEsbuild from "browserslist-to-esbuild";
import packageJson from "../../package.json";
import { BROWSER_MATRIX, BUILDER_MIN_VIEWPORT_PX, MODERN_CSS_FEATURES, SMOKE_ENGINES } from "./browser-support";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
const smokeScript = readFileSync(new URL("../../scripts/browser-smoke.mjs", import.meta.url), "utf8");

describe("Phase 6 — declared and compiled browser matrix", () => {
  it("keeps the documented contract identical to package.json", () => {
    expect(packageJson.browserslist).toEqual(BROWSER_MATRIX);
  });

  it("derives a non-empty Vite target from Browserslist", () => {
    const targets = browserslistToEsbuild(packageJson.browserslist);
    expect(targets.length).toBeGreaterThanOrEqual(4);
    expect(targets.some((target) => target.startsWith("safari16.4"))).toBe(true);
    expect(viteConfig).toContain("target: browserslistToEsbuild()");
  });
});

describe("Phase 6 — progressive features", () => {
  it("guards every modern CSS feature that is used", () => {
    for (const feature of MODERN_CSS_FEATURES) {
      if (!styles.includes(feature.token)) continue;
      expect(styles, feature.token).toContain(`@supports ${feature.supports}`);
    }
  });

  it("does not require :has for table spacing", () => {
    const table = readFileSync(new URL("../components/ui/table.tsx", import.meta.url), "utf8");
    expect(table).not.toContain(":has(");
  });

  it("sets the explicit desktop builder floor", () => {
    expect(BUILDER_MIN_VIEWPORT_PX).toBe(1024);
  });
});

describe("Phase 6 — empirical release gate", () => {
  it("runs all engines and a no-JS context", () => {
    for (const engine of SMOKE_ENGINES) expect(smokeScript).toContain(engine);
    expect(smokeScript).toContain("javaScriptEnabled: false");
    expect(packageJson.scripts["e2e:browsers"]).toBe("node scripts/browser-smoke.mjs");
  });
});
