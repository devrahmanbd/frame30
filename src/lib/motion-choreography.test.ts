/**
 * Phase 10.4 contract tests.
 *
 * Two jobs, and the second is the one that catches real regressions:
 *
 *  1. the auditors judge measurements the way §10.4 says they should, including
 *     the cases where they must stay quiet (a settled node has no transform, so
 *     auditing its rise would manufacture failures on correct markup);
 *  2. the spec, the motion tokens and `src/styles.css` all agree. A rule that
 *     exists in three places drifts in two of them, so the numbers are asserted
 *     against the stylesheet text rather than trusted.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MOTION_TOKENS, allowsMagnetic, driftDurationMs } from "./motion-policy";
import {
  DRIFT,
  FOLD,
  MAGNETIC,
  REDUCED,
  REVEAL,
  auditDrift,
  auditFold,
  auditMagnetic,
  auditMotionPage,
  auditReducedMotion,
  auditReveal,
  countMotionBySeverity,
  dedupeMotionFindings,
  formatMotionFinding,
  type MotionPageMeasurement,
  type RevealSample,
} from "./motion-choreography";

const base: MotionPageMeasurement = {
  route: "home",
  viewportPx: 1440,
  viewportHeightPx: 900,
  locale: "en",
  intent: "full",
  hydrated: true,
  reveals: [],
  drifts: [],
  magnetics: [],
  counters: [],
  lcp: null,
};

const reveal = (over: Partial<RevealSample> = {}): RevealSample => ({
  label: "card",
  state: "settled",
  durationMs: REVEAL.durationMs,
  delayMs: 0,
  properties: ["opacity", "transform"],
  translatePx: 0,
  topPx: 2_000,
  ...over,
});

const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

describe("reveal contract", () => {
  it("accepts a correct 16px / 480ms entrance", () => {
    expect(auditReveal({ ...base, reveals: [reveal(), reveal({ state: "pending", translatePx: 16 })] })).toEqual([]);
  });

  it("flags a duration outside tolerance but tolerates rounding", () => {
    expect(codes(auditReveal({ ...base, reveals: [reveal({ durationMs: 320 })] }))).toContain(
      "motion.reveal.duration",
    );
    expect(auditReveal({ ...base, reveals: [reveal({ durationMs: 480 + REVEAL.durationToleranceMs })] })).toEqual([]);
  });

  it("blocks layout-affecting transitions", () => {
    const f = auditReveal({ ...base, reveals: [reveal({ properties: ["opacity", "height"] })] });
    expect(codes(f)).toContain("motion.reveal.property");
    expect(f[0].severity).toBe("error");
  });

  it("never audits travel on a settled node", () => {
    // A settled node reports translatePx 0; that must not read as "0px rise".
    expect(auditReveal({ ...base, reveals: [reveal({ state: "settled", translatePx: 0 })] })).toEqual([]);
  });

  it("flags over-long travel and over-long stagger delays", () => {
    expect(
      codes(auditReveal({ ...base, reveals: [reveal({ state: "pending", translatePx: 48 })] })),
    ).toContain("motion.reveal.rise");
    expect(codes(auditReveal({ ...base, reveals: [reveal({ delayMs: 1_400 })] }))).toContain(
      "motion.reveal.delay",
    );
  });

  it("flags a reveal that re-hides on scroll-back", () => {
    expect(codes(auditReveal({ ...base, reveals: [reveal({ reHidden: true })] }))).toContain(
      "motion.reveal.repeat",
    );
  });

  it("is silent under reduced intent (the reduced auditor owns that pass)", () => {
    expect(auditReveal({ ...base, intent: "reduced", reveals: [reveal({ durationMs: 90 })] })).toEqual([]);
  });
});

describe("drift contract", () => {
  const drift = (over = {}) => ({
    label: "hero aurora",
    durationMs: 31_000,
    iterationCount: "infinite" as const,
    properties: ["transform"],
    aboveFold: true,
    ...over,
  });

  it("accepts a 31s composited loop", () => {
    expect(auditDrift({ ...base, drifts: [drift()] })).toEqual([]);
  });

  it("flags both ends of the 24–38s window", () => {
    expect(codes(auditDrift({ ...base, drifts: [drift({ durationMs: 8_000 })] }))).toContain(
      "motion.drift.duration",
    );
    expect(codes(auditDrift({ ...base, drifts: [drift({ durationMs: 60_000 })] }))).toContain(
      "motion.drift.duration",
    );
  });

  it("requires an infinite, composited loop", () => {
    expect(codes(auditDrift({ ...base, drifts: [drift({ iterationCount: 1 })] }))).toContain(
      "motion.drift.loop",
    );
    expect(codes(auditDrift({ ...base, drifts: [drift({ properties: ["filter"] })] }))).toContain(
      "motion.drift.property",
    );
  });

  it("keeps chroma scarce: one drifting field per viewport", () => {
    expect(codes(auditDrift({ ...base, drifts: [drift(), drift({ label: "second" })] }))).toContain(
      "motion.drift.crowded",
    );
    // Below the fold a second field shares no viewport with the first.
    expect(
      codes(auditDrift({ ...base, drifts: [drift(), drift({ label: "second", aboveFold: false })] })),
    ).not.toContain("motion.drift.crowded");
  });

  it("blocks a loop that survives a reduced-motion request", () => {
    const f = auditDrift({ ...base, intent: "reduced", drifts: [drift()] });
    expect(codes(f)).toEqual(["motion.reduced.loop"]);
    expect(f[0].severity).toBe("error");
  });

  it("ignores layers with no animation attached", () => {
    expect(auditDrift({ ...base, drifts: [drift({ durationMs: 0, iterationCount: 1 })] })).toEqual([]);
  });
});

describe("magnetic contract", () => {
  const magnet = (over = {}) => ({ label: "hero CTA", enabled: true, offsetPx: 6, ...over });

  it("allows the magnet on a wide viewport and blocks it below 1024px", () => {
    expect(auditMagnetic({ ...base, magnetics: [magnet()] })).toEqual([]);
    const f = auditMagnetic({ ...base, viewportPx: 768, magnetics: [magnet()] });
    expect(codes(f)).toContain("motion.magnetic.viewport");
    expect(f[0].severity).toBe("error");
  });

  it("accepts a disabled magnet on a phone", () => {
    expect(auditMagnetic({ ...base, viewportPx: 375, magnetics: [magnet({ enabled: false })] })).toEqual([]);
  });

  it("caps the pull and the count per band", () => {
    expect(codes(auditMagnetic({ ...base, magnetics: [magnet({ offsetPx: 40 })] }))).toContain(
      "motion.magnetic.offset",
    );
    expect(
      codes(
        auditMagnetic({
          ...base,
          magnetics: [magnet({ bandLabel: "hero" }), magnet({ label: "second", bandLabel: "hero" })],
        }),
      ),
    ).toContain("motion.magnetic.crowded");
  });

  it("blocks a magnet under reduced motion", () => {
    expect(codes(auditMagnetic({ ...base, intent: "reduced", magnetics: [magnet()] }))).toContain(
      "motion.reduced.property",
    );
  });
});

describe("reduced-motion pass", () => {
  it("accepts a short opacity settle with no travel", () => {
    expect(
      auditReducedMotion({
        ...base,
        intent: "reduced",
        reveals: [reveal({ durationMs: 180, properties: ["opacity"], translatePx: 0 })],
      }),
    ).toEqual([]);
  });

  it("blocks travel, long transitions and hidden content", () => {
    const f = auditReducedMotion({
      ...base,
      intent: "reduced",
      reveals: [reveal({ durationMs: 480, properties: ["opacity", "transform"], translatePx: 16, state: "pending" })],
    });
    expect(codes(f)).toEqual(
      expect.arrayContaining(["motion.reduced.duration", "motion.reduced.property", "motion.fold.pending"]),
    );
    expect(f.every((x) => x.severity === "error")).toBe(true);
  });

  it("requires counters to render their settled figure", () => {
    expect(
      codes(
        auditReducedMotion({
          ...base,
          intent: "reduced",
          counters: [{ label: "orders", rendered: "12,004", settled: "128,400" }],
        }),
      ),
    ).toContain("motion.reduced.counter");
    expect(
      auditReducedMotion({
        ...base,
        intent: "reduced",
        counters: [{ label: "orders", rendered: " 128,400 ", settled: "128,400" }],
      }),
    ).toEqual([]);
  });
});

describe("fold and LCP contract", () => {
  it("blocks a pending node above the fold before hydration", () => {
    const f = auditFold({ ...base, hydrated: false, reveals: [reveal({ state: "pending", topPx: 120 })] });
    expect(f[0].code).toBe("motion.fold.pending");
    expect(f[0].severity).toBe("error");
  });

  it("downgrades the same finding to advisory once hydrated", () => {
    const f = auditFold({ ...base, hydrated: true, reveals: [reveal({ state: "pending", topPx: 120 })] });
    expect(f[0].severity).toBe("warn");
  });

  it("ignores pending nodes below the fold", () => {
    expect(auditFold({ ...base, hydrated: false, reveals: [reveal({ state: "pending", topPx: 1_400 })] })).toEqual([]);
  });

  it("blocks any motion on the LCP text node", () => {
    expect(codes(auditFold({ ...base, lcp: { label: "h1", durationMs: 480, animationName: "none" } }))).toEqual([
      "motion.fold.lcp",
    ]);
    expect(codes(auditFold({ ...base, lcp: { label: "h1", durationMs: 0, animationName: "fq-reveal-rise" } }))).toEqual(
      ["motion.fold.lcp"],
    );
    expect(auditFold({ ...base, lcp: { label: "h1", durationMs: 0, animationName: "none" } })).toEqual([]);
  });
});

describe("aggregation", () => {
  it("dedupes, counts and formats", () => {
    const report = auditMotionPage({
      ...base,
      reveals: [reveal({ durationMs: 320 }), reveal({ durationMs: 320 })],
    });
    expect(report.findings).toHaveLength(1);
    expect(report.counts.warn).toBe(1);
    expect(report.ok).toBe(true);
    expect(formatMotionFinding(report.findings[0])).toMatch(/^WARN \[motion\.reveal\.duration]/);
  });

  it("reports ok: false only for blocking findings", () => {
    const report = auditMotionPage({ ...base, viewportPx: 390, magnetics: [{ label: "cta", enabled: true, offsetPx: 4 }] });
    expect(report.ok).toBe(false);
  });

  it("flags a budget overrun", () => {
    const report = auditMotionPage({ ...base, peakConcurrentAnimations: 30, budgetMax: 12 });
    expect(codes(report.findings)).toContain("motion.budget.exceeded");
  });

  it("dedupe and counting are independent of order", () => {
    const findings = [
      { code: "motion.reveal.duration", severity: "warn", rule: "r", where: "a", message: "m" },
      { code: "motion.reveal.duration", severity: "warn", rule: "r", where: "a", message: "m" },
      { code: "motion.fold.lcp", severity: "error", rule: "r", where: "b", message: "m" },
    ] as const;
    const unique = dedupeMotionFindings([...findings]);
    expect(unique).toHaveLength(2);
    expect(countMotionBySeverity(unique)).toEqual({ error: 1, warn: 1, info: 0 });
  });
});

describe("spec, tokens and stylesheet agree", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  it("shares the entrance tokens with the motion policy", () => {
    expect(MOTION_TOKENS.distance.rise).toBe(REVEAL.risePx);
    expect(MOTION_TOKENS.duration.reveal).toBe(REVEAL.durationMs);
    expect(MOTION_TOKENS.stagger.maxTotalMs).toBe(REVEAL.maxDelayMs);
    expect(MOTION_TOKENS.distance.magneticMax).toBe(MAGNETIC.maxOffsetPx);
    expect(MOTION_TOKENS.magnetic.minViewportPx).toBe(MAGNETIC.minViewportPx);
    expect(MOTION_TOKENS.drift.minMs).toBe(DRIFT.minMs);
    expect(MOTION_TOKENS.drift.maxMs).toBe(DRIFT.maxMs);
  });

  it("keeps every drift duration inside the window", () => {
    for (const i of [0, 1, 2, 3, 7]) {
      const ms = driftDurationMs(i);
      expect(ms).toBeGreaterThanOrEqual(DRIFT.minMs);
      expect(ms).toBeLessThanOrEqual(DRIFT.maxMs);
    }
  });

  it("declares an aurora drift animation inside the window, transform only", () => {
    const rule = css.match(/\.fq-aurora\[data-band-drift="true"\]::before\s*{[^}]+}/)?.[0] ?? "";
    expect(rule).toMatch(/animation:\s*fq-aurora-drift\s+(\d+)s/);
    const seconds = Number(rule.match(/fq-aurora-drift\s+(\d+)s/)?.[1]);
    expect(seconds * 1000).toBeGreaterThanOrEqual(DRIFT.minMs);
    expect(seconds * 1000).toBeLessThanOrEqual(DRIFT.maxMs);
    expect(rule).toContain("infinite");

    const keyframes = css.match(/@keyframes fq-aurora-drift\s*{[\s\S]*?\n}/)?.[0] ?? "";
    expect(keyframes).not.toBe("");
    // Only transform may appear in the keyframes; a filter or width here would
    // repaint a blurred layer on every frame.
    const props = [...keyframes.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
    for (const prop of props) expect(DRIFT.allowedProperties).toContain(prop as "transform");
  });

  it("parks the drift and every mesh blob under reduced motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) {\s*\.fq-aurora\[data-band-drift="true"\]::before { animation: none !important; }/,
    );
    expect(css).toContain(".fq-mesh-blob { animation: none !important; }");
  });

  it("caps reduced-motion transitions at the spec ceiling", () => {
    const clamp = Number(css.match(/transition-duration:\s*(\d+)ms\s*!important/)?.[1]);
    expect(clamp).toBeLessThanOrEqual(REDUCED.maxDurationMs);
  });

  it("keeps mesh blob loops inside the drift window too", () => {
    const durations = [...css.matchAll(/fq-mesh-drift\s+(\d+)s/g), ...css.matchAll(/animation-duration:\s*(\d+)s/g)]
      .map((m) => Number(m[1]) * 1000)
      .filter((ms) => ms > 1_000);
    expect(durations.length).toBeGreaterThan(0);
    for (const ms of durations) {
      expect(ms).toBeGreaterThanOrEqual(DRIFT.minMs);
      expect(ms).toBeLessThanOrEqual(DRIFT.maxMs);
    }
  });
});

describe("allowsMagnetic mirrors the audited rule", () => {
  it("requires full intent, a fine pointer and a wide viewport", () => {
    expect(allowsMagnetic("full", 1440, true)).toBe(true);
    expect(allowsMagnetic("full", 1023, true)).toBe(false);
    expect(allowsMagnetic("full", 1440, false)).toBe(false);
    expect(allowsMagnetic("reduced", 1440, true)).toBe(false);
    expect(allowsMagnetic("off", 1440, true)).toBe(false);
    expect(allowsMagnetic("full", Number.NaN, true)).toBe(false);
  });

  it("agrees with the fold slack being generous, not exact", () => {
    expect(FOLD.slackPx).toBeGreaterThan(0);
    expect(FOLD.lcpMotionAllowed).toBe(false);
    expect(FOLD.pendingBeforeHydrationAllowed).toBe(false);
  });
});
