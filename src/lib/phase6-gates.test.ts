import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONTRAST_FLOOR,
  GATE_MATRIX,
  RELEASE_GATES,
  composePublishGate,
  contrastGate,
  contrastReport,
  effectiveDark,
  skeletonParityGate,
} from "./publish-gates";
import { DEFAULT_DARK_TOKENS, DEFAULT_TOKENS } from "./builder-ast";
import { THEME_PRESETS } from "./theme-presets";
import { LIGHTHOUSE_BUDGET, VITALS_BUDGET } from "./web-vitals";

describe("Phase 6 — contrast gate, light and dark", () => {
  it("sweeps the same four scheme × locale combinations the browser gate does", () => {
    expect(GATE_MATRIX).toHaveLength(4);
    const script = readFileSync("scripts/a11y-gate.mjs", "utf8");
    for (const variant of GATE_MATRIX) {
      expect(script).toContain(`${variant.scheme}-${variant.locale}`);
    }
  });

  it("measures every ink/surface/accent pair in both schemes", () => {
    const rows = contrastReport(DEFAULT_TOKENS);
    expect(rows.filter((r) => r.scheme === "light")).toHaveLength(5);
    expect(rows.filter((r) => r.scheme === "dark")).toHaveLength(5);
    expect(rows.every((r) => r.floor === CONTRAST_FLOOR.text || r.floor === CONTRAST_FLOOR.ui)).toBe(true);
  });

  it("falls back to the platform dark set for a light-only theme", () => {
    expect(effectiveDark({ ...DEFAULT_TOKENS, dark: null })).toEqual(DEFAULT_DARK_TOKENS);
  });

  it("fails a theme whose body copy is unreadable", () => {
    const failures = contrastGate({ ...DEFAULT_TOKENS, ink: "#EEEEEE", surface: "#FFFFFF" });
    expect(failures.some((f) => f.code === "contrast.light")).toBe(true);
  });

  it("ships presets that pass in light and dark", () => {
    for (const preset of THEME_PRESETS) {
      expect(contrastGate(preset.tokens).map((f) => f.message), preset.key).toEqual([]);
    }
  });
});

describe("Phase 6 — zero-CLS skeleton parity", () => {
  it("every data widget reserves a box with a known aspect", () => {
    expect(skeletonParityGate()).toEqual([]);
  });
});

describe("Phase 6 — composed publish gate", () => {
  it("passes a clean theme", () => {
    expect(composePublishGate({ tokens: DEFAULT_TOKENS }).ok).toBe(true);
  });

  it("carries lint, translation, font and contrast failures together", () => {
    const gate = composePublishGate({
      tokens: { ...DEFAULT_TOKENS, ink: "#EEEEEE" },
      lint: ["index: broken"],
      translation: ["বাংলা translation coverage is 40%"],
      fonts: ["fonts: unlicensed face"],
    });
    expect(gate.ok).toBe(false);
    const codes = new Set(gate.failures.map((f) => f.code));
    expect(codes).toContain("lint");
    expect(codes).toContain("translation");
    expect(codes).toContain("fonts");
    expect([...codes].some((c) => c.startsWith("contrast."))).toBe(true);
  });
});

describe("Phase 6 — release gates are wired, not merely present", () => {
  it("declares the three browser gates with the budgets the app quotes", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    for (const gate of RELEASE_GATES) {
      expect(pkg.scripts[gate.npm], gate.key).toBeTruthy();
      expect(pkg.scripts["gates:release"]).toContain(gate.npm);
    }
    expect(pkg.scripts["gates"]).toContain("gates:release");
  });

  it("quotes one set of numbers", () => {
    expect(LIGHTHOUSE_BUDGET.lcpMs).toBe(VITALS_BUDGET.lcpMs);
    const vitals = readFileSync("scripts/vitals-gate.mjs", "utf8");
    expect(vitals).toContain(`lcpMs: ${VITALS_BUDGET.lcpMs}`);
    expect(vitals).toContain(`cls: ${VITALS_BUDGET.cls}`);
    expect(vitals).toContain(`TBT_BUDGET_MS = ${LIGHTHOUSE_BUDGET.tbtMs}`);
    const a11y = readFileSync("scripts/a11y-gate.mjs", "utf8");
    expect(a11y).toContain("color-contrast");
  });
});
