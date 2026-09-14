import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ASSET_BUDGET,
  FONT_PRELOAD,
  THIRD_PARTY_BUDGET,
  VITALS_BUDGET,
  checkAssetBudget,
  checkThirdPartyBudget,
  formatBytes,
  rateVital,
} from "./web-vitals";
import { skeletonSpec } from "./widget-skeletons";
import { WIDGET_REGISTRY } from "./widget-registry";
import { CUSTOM_CODE_LIMITS } from "./custom-code";
import { SECTION_CATALOG } from "./builder-ast";

describe("Phase 7.3 — field budgets", () => {
  it("pins the platform Core Web Vitals targets", () => {
    expect(VITALS_BUDGET).toEqual({ lcpMs: 2500, inpMs: 200, cls: 0.02 });
  });

  it("grades a measurement against its budget", () => {
    expect(rateVital("lcpMs", 2400)).toBe("good");
    expect(rateVital("lcpMs", 4000)).toBe("needs-improvement");
    expect(rateVital("lcpMs", 6000)).toBe("poor");
    expect(rateVital("inpMs", 200)).toBe("good");
    expect(rateVital("cls", 0.03)).toBe("needs-improvement");
    expect(rateVital("cls", -1)).toBe("poor");
  });
});

describe("Phase 7.3 — transfer budgets", () => {
  it("holds a storefront route to 60KB CSS / 100KB JS gzipped", () => {
    expect(ASSET_BUDGET).toEqual({ cssGzBytes: 61440, jsGzBytes: 102400 });
    const ok = checkAssetBudget({ route: "/store/x", cssGzBytes: 50_000, jsGzBytes: 90_000 });
    expect(ok.ok).toBe(true);
    const bad = checkAssetBudget({ route: "/store/x", cssGzBytes: 80_000, jsGzBytes: 200_000 });
    expect(bad.ok).toBe(false);
    expect(bad.failures.map((f) => f.code)).toEqual(["asset:css", "asset:js"]);
  });

  it("prints human byte sizes for CI output", () => {
    expect(formatBytes(61440)).toBe("60.0KB");
  });

  it("the CI gate quotes the same numbers as the app", () => {
    const script = readFileSync(new URL("../../scripts/perf-budget.mjs", import.meta.url), "utf8");
    expect(script).toContain("cssGzBytes: 60 * 1024");
    expect(script).toContain("jsGzBytes: 100 * 1024");
  });
});

describe("Phase 7.3 — third-party and merchant scripts", () => {
  it("fails any parser-blocking script regardless of size", () => {
    const report = checkThirdPartyBudget([{ name: "pixel", gzBytes: 1_000, deferred: false }]);
    expect(report.ok).toBe(false);
    expect(report.failures[0]?.code).toBe("third_party:blocking");
  });

  it("caps the count and the combined weight", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `p${i}`, gzBytes: 9_000, deferred: true }));
    const report = checkThirdPartyBudget(many);
    expect(report.failures.map((f) => f.code)).toContain("third_party:count");
    expect(report.failures.map((f) => f.code)).toContain("third_party:bytes");
  });

  it("passes a realistic deferred set", () => {
    expect(
      checkThirdPartyBudget([
        { name: "analytics", gzBytes: 8_000, deferred: true },
        { name: "chat", gzBytes: 12_000, deferred: true },
      ]).ok,
    ).toBe(true);
  });

  it("keeps merchant custom JS inside the third-party byte budget", () => {
    expect(CUSTOM_CODE_LIMITS.js).toBeLessThan(THIRD_PARTY_BUDGET.scriptGzBytes);
  });
});

describe("Phase 7.3 — skeleton parity", () => {
  it("gives every data widget a reserved box", () => {
    for (const { type } of SECTION_CATALOG) {
      const meta = WIDGET_REGISTRY[type];
      const spec = skeletonSpec(type);
      if (meta.skeleton) {
        expect(spec, type).toBeTruthy();
        expect(spec!.count, type).toBeGreaterThan(0);
      } else {
        expect(spec, type).toBeNull();
      }
    }
  });

  it("marks every data-bound widget as needing a skeleton", () => {
    for (const { type } of SECTION_CATALOG) {
      const meta = WIDGET_REGISTRY[type];
      if (meta.data) expect(meta.skeleton, type).toBe(true);
    }
  });

  it("card and media placeholders always reserve an aspect ratio", () => {
    for (const { type } of SECTION_CATALOG) {
      const spec = skeletonSpec(type);
      if (spec && (spec.kind === "cards" || spec.kind === "media")) {
        expect(spec.ratio, type).toMatch(/^aspect-/);
      }
    }
  });
});

describe("Phase 7.3 — zero shift on locale switch", () => {
  it("preloads one stylesheet carrying both font subsets", () => {
    expect(FONT_PRELOAD.stylesheet).toContain("Noto+Sans+Bengali");
    expect(FONT_PRELOAD.stylesheet).toContain("Inter");
    expect(FONT_PRELOAD.stylesheet).toContain("display=swap");
    const root = readFileSync(new URL("../routes/__root.tsx", import.meta.url), "utf8");
    expect(root).toContain('rel: "preload"');
    expect(root).toContain("FONT_PRELOAD.origins");
  });

  it("declares metric-matched fallback faces for both scripts", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    for (const face of FONT_PRELOAD.fallbackFaces) {
      expect(css).toContain(`font-family: "${face}"`);
      expect(css).toContain("size-adjust");
    }
    expect(css).toContain('"Inter Fallback"');
    expect(css).toContain('"Noto Sans Bengali Fallback"');
  });
});
