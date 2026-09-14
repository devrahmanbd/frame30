/**
 * Phase 10.6 exit-gate contract tests.
 *
 * These run without a browser: `scripts/design-gate.mjs` collects numbers and
 * hands them to the auditors below, so every threshold, tolerance and severity
 * decision is testable here. If a rule can only be verified by staring at a
 * Playwright report, it is not a gate.
 */
import { describe, expect, it } from "vitest";
import {
  CONTRAST,
  COLOR_ESCAPE_COMMENT,
  RESPONSIVE,
  VITALS,
  auditContrast,
  auditCtaStates,
  auditExitPage,
  auditHeadings,
  auditResponsive,
  auditSourceColors,
  auditSourceTree,
  auditVitals,
  composite,
  contrastRatio,
  countBySeverity,
  dedupeFindings,
  errorsOnly,
  flattenBackdrop,
  formatFinding,
  lineOf,
  parseColor,
  type ContrastSample,
  type ViewportMeasurement,
} from "./design-exit";

const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);

/* -------------------------------------------------------------------------- */
/* Rule 1 — colour discipline                                                 */
/* -------------------------------------------------------------------------- */

describe("auditSourceColors", () => {
  const scan = (contents: string) => auditSourceColors({ path: "src/x.tsx", contents });

  it("flags literal palette utilities, including variant-prefixed ones", () => {
    for (const token of [
      "text-white",
      "bg-black",
      "hover:bg-slate-800",
      "md:text-gray-400",
      "focus-visible:ring-blue-500/40",
      "border-red-500",
      "from-indigo-600",
    ]) {
      const found = scan(`<div className="${token} rounded" />`);
      expect(codes(found), token).toContain("color.hardcoded_utility");
    }
  });

  it("leaves semantic tokens and keyword utilities alone", () => {
    const found = scan(
      `<div className="text-fq-ink bg-fq-surface-2 border-fq-edge text-foreground bg-background border-current fill-transparent text-inherit ring-ring" />`,
    );
    expect(found).toEqual([]);
  });

  it("does not flag words that merely contain a family name", () => {
    const found = scan(
      `<p className="whitespace-nowrap">blackout, greyhound</p>; const bgBlackList = 1; // text-white-ish word`,
    );
    expect(codes(found)).not.toContain("color.hardcoded_utility");
  });

  it("flags arbitrary colour values in utilities", () => {
    for (const token of [
      "bg-[#0b0f14]",
      "text-[rgb(255,255,255)]",
      "border-[hsl(203_89%_53%)]",
      "shadow-[oklch(0.7_0.1_200)]",
    ]) {
      const found = scan(`<div className="${token}" />`);
      expect(codes(found), token).toContain("color.arbitrary_value");
    }
  });

  it("does not flag non-colour arbitrary values", () => {
    const found = scan(`<div className="w-[420px] leading-[1.6] grid-cols-[1fr_auto]" />`);
    expect(found).toEqual([]);
  });

  it("flags inline style colours", () => {
    expect(codes(scan(`<div style={{ color: "#fff" }} />`))).toContain("color.inline_style");
    expect(codes(scan(`<div style={{ backgroundColor: "rgba(0,0,0,.4)" }} />`))).toContain(
      "color.inline_style",
    );
  });

  it("permits an inline style that references a token", () => {
    const found = scan(`<div style={{ backgroundColor: "var(--fq-surface-2)" }} />`);
    expect(codes(found)).not.toContain("color.inline_style");
  });

  it("treats a raw hex as advisory, not blocking", () => {
    const found = scan(`const accent = "#1d9bf0";`);
    expect(found).toHaveLength(1);
    expect(found[0].code).toBe("color.raw_hex");
    expect(found[0].severity).toBe("warn");
  });

  it("ignores hex-looking noise in urls and svg paths", () => {
    const found = scan(`<a href="https://x.test/#abcdef">x</a><path d="M0 0h#aabbcc" />`);
    expect(codes(found)).not.toContain("color.raw_hex");
  });

  it("honours a written-down escape on the same line", () => {
    const found = scan(`<div className="bg-white" /> // ${COLOR_ESCAPE_COMMENT}: print stylesheet`);
    expect(found).toEqual([]);
  });

  it("reports an actionable path:line and never repeats one token per line", () => {
    const contents = `a\nb\n<div className="text-white text-white" />\n`;
    const found = auditSourceColors({ path: "src/components/public/X.tsx", contents });
    expect(found).toHaveLength(1);
    expect(found[0].where).toBe("src/components/public/X.tsx:3");
    expect(lineOf(contents, contents.indexOf("text-white"))).toBe(3);
  });

  it("sorts a tree scan deterministically", () => {
    const files = [
      { path: "src/b.tsx", contents: `<i className="text-white" />` },
      { path: "src/a.tsx", contents: `<i className="bg-black" />` },
    ];
    const where = auditSourceTree(files).map((f) => f.where);
    expect(where).toEqual(["src/a.tsx:1", "src/b.tsx:1"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Rule 2 — contrast                                                          */
/* -------------------------------------------------------------------------- */

describe("colour maths", () => {
  it("parses every shape a browser or stylesheet can emit", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#0b0f14")).toEqual({ r: 11, g: 15, b: 20, a: 1 });
    expect(parseColor("#00000080")?.a).toBeCloseTo(0.502, 2);
    expect(parseColor("rgb(255, 255, 255)")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("rgba(255, 255, 255, 0.62)")?.a).toBeCloseTo(0.62, 5);
    expect(parseColor("rgb(255 255 255 / 62%)")?.a).toBeCloseTo(0.62, 5);
    expect(parseColor("transparent")?.a).toBe(0);
    expect(parseColor("currentColor")).toBeNull();
    expect(parseColor(null)).toBeNull();
  });

  it("computes WCAG ratios that match the published reference values", () => {
    const white = parseColor("#ffffff")!;
    const black = parseColor("#000000")!;
    expect(contrastRatio(white, black)).toBe(21);
    expect(contrastRatio(white, white)).toBe(1);
    // #767676 on white is the canonical 4.54:1 boundary case.
    expect(contrastRatio(parseColor("#767676")!, white)).toBeCloseTo(4.54, 1);
  });

  it("composites alpha rather than assuming opacity", () => {
    const canvas = parseColor("#000000")!;
    const muted = parseColor("rgba(255,255,255,0.62)")!;
    const painted = composite(muted, canvas);
    expect(painted.r).toBeCloseTo(158.1, 1);
    // The naive (opaque) reading would claim 21:1 here.
    expect(contrastRatio(painted, canvas)).toBeLessThan(21);
  });

  it("flattens a backdrop stack outermost-first", () => {
    const base = parseColor("#000000")!;
    const glass = parseColor("rgba(255,255,255,0.06)")!;
    const single = flattenBackdrop([glass], base);
    const stacked = flattenBackdrop([glass, glass], base);
    expect(stacked.r).toBeGreaterThan(single.r);
    expect(flattenBackdrop([], base)).toEqual({ ...base, a: 1 });
  });
});

describe("auditContrast", () => {
  const onCanvas = (over: Partial<ContrastSample> = {}): ContrastSample => ({
    label: "body copy",
    role: "body",
    color: "rgb(255,255,255)",
    backdrop: ["rgba(255,255,255,0.06)"],
    base: "#0b0f14",
    fontSizePx: 17,
    fontWeight: 400,
    ...over,
  });

  it("passes white body copy on the dark canvas", () => {
    expect(auditContrast([onCanvas()])).toEqual([]);
  });

  it("blocks body copy that fails 4.5:1 once alpha is composited", () => {
    const found = auditContrast([onCanvas({ color: "rgba(255,255,255,0.30)" })]);
    expect(found).toHaveLength(1);
    expect(found[0].code).toBe("contrast.body");
    expect(found[0].severity).toBe("error");
    expect(Number(found[0].actual)).toBeLessThan(CONTRAST.bodyMin);
  });

  it("treats a near-miss on muted copy as advisory and a real miss as blocking", () => {
    const near = auditContrast([
      onCanvas({ role: "muted", label: "muted", color: "rgba(255,255,255,0.55)" }),
    ]);
    if (near.length) {
      expect(near[0].code).toBe("contrast.muted");
      expect(Number(near[0].actual)).toBeGreaterThanOrEqual(CONTRAST.mutedWarnFloor);
      expect(near[0].severity).toBe("warn");
    }
    const bad = auditContrast([
      onCanvas({ role: "muted", label: "muted", color: "rgba(255,255,255,0.22)" }),
    ]);
    expect(bad[0].severity).toBe("error");
  });

  it("applies the 3:1 large-text rule at 24px and to bold 18.66px", () => {
    const grey = "rgba(255,255,255,0.42)";
    expect(auditContrast([onCanvas({ color: grey, fontSizePx: 17 })])).toHaveLength(1);
    expect(auditContrast([onCanvas({ color: grey, fontSizePx: 24 })])).toEqual([]);
    expect(
      auditContrast([onCanvas({ color: grey, fontSizePx: 19, fontWeight: 700 })]),
    ).toEqual([]);
  });

  it("holds CTA states to the text rule and disabled to the perceivable floor", () => {
    const cta = onCanvas({
      role: "cta",
      label: "Start free [hover]",
      state: "hover",
      color: "rgba(255,255,255,0.35)",
      backdrop: ["rgb(29,155,240)"],
      fontSizePx: 16,
    });
    const found = auditContrast([cta]);
    expect(found[0].code).toBe("contrast.cta");
    expect(found[0].message).toContain("hover state");

    const disabled = auditContrast([
      onCanvas({ role: "cta-disabled", state: "disabled", color: "rgba(255,255,255,0.45)" }),
    ]);
    expect(disabled).toEqual([]);
  });

  it("holds focus rings to the 3:1 non-text rule", () => {
    const weak = auditContrast([
      onCanvas({ role: "focus-ring", label: "focus ring", color: "rgba(255,255,255,0.18)" }),
    ]);
    expect(weak[0].code).toBe("contrast.focus_ring");
    expect(weak[0].expected).toBe(CONTRAST.nonTextMin);
  });

  it("skips fully transparent text and reports unparseable colours instead of hiding them", () => {
    expect(auditContrast([onCanvas({ color: "transparent" })])).toEqual([]);
    const found = auditContrast([onCanvas({ color: "color(display-p3 1 1 1)" })]);
    expect(found[0].code).toBe("contrast.unmeasurable");
    expect(found[0].severity).toBe("warn");
  });

  it("reports CTA states that never resolved", () => {
    const rest = onCanvas({ role: "cta", label: "Start free [rest]", state: "rest" });
    const found = auditCtaStates([rest]);
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("hover");
    expect(found[0].message).toContain("focus");
  });
});

/* -------------------------------------------------------------------------- */
/* Rule 3 — responsive                                                        */
/* -------------------------------------------------------------------------- */

describe("auditResponsive", () => {
  const view = (over: Partial<ViewportMeasurement> = {}): ViewportMeasurement => ({
    route: "home",
    viewportPx: 320,
    locale: "bn",
    documentScrollWidthPx: 320,
    overflow: [],
    bangla: [],
    tapTargets: [],
    ...over,
  });

  it("passes a clean 320px view", () => {
    expect(auditResponsive(view())).toEqual([]);
  });

  it("absorbs sub-pixel scroll slack", () => {
    expect(auditResponsive(view({ documentScrollWidthPx: 320 + RESPONSIVE.scrollSlackPx }))).toEqual(
      [],
    );
  });

  it("blocks horizontal scroll and names the widest culprits", () => {
    const found = auditResponsive(
      view({
        documentScrollWidthPx: 372,
        overflow: [
          { label: "table.matrix", rightPx: 372, widthPx: 700, clipped: false },
          { label: "section.aurora", rightPx: 352, widthPx: 360, clipped: false },
          { label: "div.marquee", rightPx: 900, widthPx: 2000, clipped: true },
        ],
      }),
    );
    expect(codes(found)).toContain("responsive.horizontal_scroll");
    const overflowFindings = found.filter((f) => f.code === "responsive.element_overflow");
    expect(overflowFindings.map((f) => f.where.split("· ")[1])).toEqual([
      "table.matrix",
      "section.aurora",
    ]);
  });

  it("blocks a Bangla line box tighter than 1.35×", () => {
    const found = auditResponsive(
      view({
        bangla: [
          {
            label: "h2",
            heightPx: 40,
            fontSizePx: 20,
            lineHeightPx: 24,
            lineCount: 1,
            ancestorClipsY: false,
            text: "চেকআউট দ্রুত",
          },
        ],
      }),
    );
    expect(codes(found)).toEqual(["responsive.matra_clipped"]);
    expect(Number(found[0].actual)).toBeCloseTo(1.2, 2);
  });

  it("accepts a 1.35× line box and only flags real clipping", () => {
    const ok = {
      label: "p",
      heightPx: 54,
      fontSizePx: 17,
      lineHeightPx: 27,
      lineCount: 2,
      ancestorClipsY: true,
      text: "বাংলা লেখা",
    };
    expect(auditResponsive(view({ bangla: [ok] }))).toEqual([]);
    const clipped = auditResponsive(view({ bangla: [{ ...ok, heightPx: 28 }] }));
    expect(codes(clipped)).toEqual(["responsive.matra_clipped"]);
  });

  it("does not claim clipping when nothing clips the block axis", () => {
    expect(
      auditResponsive(
        view({
          bangla: [
            {
              label: "p",
              heightPx: 28,
              fontSizePx: 17,
              lineHeightPx: 27,
              lineCount: 2,
              ancestorClipsY: false,
              text: "বাংলা",
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("grades tap targets: under 24px blocks, under 44px on phones warns, inline is exempt", () => {
    const found = auditResponsive(
      view({
        tapTargets: [
          { label: "a.tiny", widthPx: 20, heightPx: 20, inline: false },
          { label: "button.medium", widthPx: 36, heightPx: 36, inline: false },
          { label: "a.inline", widthPx: 12, heightPx: 12, inline: true },
        ],
      }),
    );
    expect(found).toHaveLength(2);
    expect(found[0].severity).toBe("error");
    expect(found[1].severity).toBe("warn");
  });

  it("does not apply the comfortable bump on desktop widths", () => {
    const found = auditResponsive(
      view({
        viewportPx: 1440,
        documentScrollWidthPx: 1440,
        tapTargets: [{ label: "button", widthPx: 36, heightPx: 36, inline: false }],
      }),
    );
    expect(found).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Rule 4 — vitals                                                            */
/* -------------------------------------------------------------------------- */

describe("auditVitals", () => {
  const base = { route: "home", viewportPx: 1440, locale: "en" };

  it("passes a fast, stable home page", () => {
    expect(
      auditVitals({ ...base, lcpMs: 900, clsScore: 0.004, ttfbMs: 120, fontsReadyMs: 400 }),
    ).toEqual([]);
  });

  it("blocks a slow LCP on the budgeted route and warns elsewhere", () => {
    const home = auditVitals({ ...base, lcpMs: 2400, clsScore: 0, ttfbMs: 100 });
    expect(home[0].code).toBe("vitals.lcp");
    expect(home[0].severity).toBe("error");
    const docs = auditVitals({ ...base, route: "docs", lcpMs: 2400, clsScore: 0, ttfbMs: 100 });
    expect(docs[0].severity).toBe("warn");
  });

  it("warns when LCP is inside budget but has no headroom, and blames TTFB when it is the cost", () => {
    const tight = auditVitals({ ...base, lcpMs: 1800, clsScore: 0, ttfbMs: 100 });
    expect(tight[0].severity).toBe("warn");
    const slowServer = auditVitals({ ...base, lcpMs: 2600, clsScore: 0, ttfbMs: 1500 });
    expect(slowServer[0].message).toContain("TTFB");
  });

  it("blocks CLS above 0.05 and names what moved", () => {
    const found = auditVitals({
      ...base,
      lcpMs: 800,
      clsScore: 0.14,
      ttfbMs: 90,
      worstShift: { value: 0.1, sources: ["img.hero", "h1"] },
    });
    expect(found[0].code).toBe("vitals.cls");
    expect(found[0].severity).toBe("error");
    expect(found[0].message).toContain("img.hero");
  });

  it("warns on visible-but-legal CLS", () => {
    const found = auditVitals({ ...base, lcpMs: 800, clsScore: 0.03, ttfbMs: 90 });
    expect(found[0].severity).toBe("warn");
    expect(found[0].expected).toBe(VITALS.clsWarnLevel);
  });

  it("says 'unmeasured' rather than 'fast' when nothing was reported", () => {
    const found = auditVitals({ ...base, lcpMs: null, clsScore: null, ttfbMs: null });
    expect(codes(found)).toEqual(["vitals.missing", "vitals.missing"]);
    expect(found.every((f) => f.severity === "warn")).toBe(true);
  });

  it("warns on a late font swap", () => {
    const found = auditVitals({
      ...base,
      lcpMs: 800,
      clsScore: 0,
      ttfbMs: 90,
      fontsReadyMs: VITALS.fontSwapMs + 1,
    });
    expect(codes(found)).toContain("vitals.font_swap");
  });
});

/* -------------------------------------------------------------------------- */
/* Rule 5 — headings                                                          */
/* -------------------------------------------------------------------------- */

describe("auditHeadings", () => {
  it("passes one H1 with a well-formed outline", () => {
    expect(
      auditHeadings([
        { level: 1, text: "Storefronts for Bangladesh" },
        { level: 2, text: "Pricing" },
        { level: 3, text: "Included" },
        { level: 2, text: "FAQ" },
      ]),
    ).toEqual([]);
  });

  it("blocks a missing H1 and duplicate H1s", () => {
    expect(codes(auditHeadings([{ level: 2, text: "Pricing" }]))).toContain("heading.h1_missing");
    const dup = auditHeadings([
      { level: 1, text: "A" },
      { level: 1, text: "B" },
    ]);
    expect(codes(dup)).toContain("heading.h1_duplicate");
    expect(dup[0].message).toContain('"A"');
  });

  it("blocks a skipped level", () => {
    const found = auditHeadings([
      { level: 1, text: "Title" },
      { level: 3, text: "Detail" },
    ]);
    expect(codes(found)).toContain("heading.level_skipped");
    expect(found.at(-1)?.expected).toBe("h2");
  });

  it("allows climbing back up any number of levels", () => {
    expect(
      auditHeadings([
        { level: 1, text: "T" },
        { level: 2, text: "A" },
        { level: 3, text: "B" },
        { level: 4, text: "C" },
        { level: 2, text: "D" },
      ]),
    ).toEqual([]);
  });

  it("flags an empty heading without letting it break the order check", () => {
    const found = auditHeadings([
      { level: 1, text: "T" },
      { level: 2, text: "   " },
      { level: 3, text: "C" },
    ]);
    expect(codes(found)).toEqual(["heading.empty"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Aggregate and reporting                                                    */
/* -------------------------------------------------------------------------- */

describe("auditExitPage and reporting helpers", () => {
  const clean = {
    route: "home",
    viewportPx: 1440,
    locale: "en",
    documentScrollWidthPx: 1440,
    overflow: [],
    bangla: [],
    tapTargets: [],
    contrast: [
      {
        label: "body",
        role: "body" as const,
        color: "rgb(255,255,255)",
        backdrop: [],
        base: "#0b0f14",
        fontSizePx: 17,
        fontWeight: 400,
      },
    ],
    headings: [
      { level: 1 as const, text: "Title" },
      { level: 2 as const, text: "Section" },
    ],
    vitals: {
      route: "home",
      viewportPx: 1440,
      locale: "en",
      lcpMs: 900,
      clsScore: 0.01,
      ttfbMs: 120,
    },
  };

  it("reports ok on a clean page and stamps route context on every finding", () => {
    const report = auditExitPage(clean);
    expect(report.ok).toBe(true);
    expect(report.counts).toEqual({ error: 0, warn: 0, info: 0 });

    const broken = auditExitPage({ ...clean, headings: [{ level: 2, text: "Section" }] });
    expect(broken.ok).toBe(false);
    expect(broken.findings.every((f) => f.where.startsWith("home @1440/en"))).toBe(true);
  });

  it("is deterministic", () => {
    expect(auditExitPage(clean)).toEqual(auditExitPage(clean));
  });

  it("dedupes the same finding across viewports and locales", () => {
    const at = (w: number, l: string) => ({
      code: "responsive.horizontal_scroll" as const,
      severity: "error" as const,
      rule: "r",
      where: `home @${w}/${l}`,
      message: "m",
    });
    expect(dedupeFindings([at(320, "en"), at(768, "en"), at(320, "bn")])).toHaveLength(1);
  });

  it("counts, filters and formats findings for CI output", () => {
    const findings = [
      { code: "vitals.cls" as const, severity: "error" as const, rule: "r", where: "home", message: "m" },
      { code: "vitals.lcp" as const, severity: "warn" as const, rule: "r", where: "home", message: "m" },
    ];
    expect(countBySeverity(findings)).toEqual({ error: 1, warn: 1, info: 0 });
    expect(errorsOnly(findings)).toHaveLength(1);
    expect(formatFinding(findings[0])).toContain("FAIL [vitals.cls]");
    expect(formatFinding(findings[1])).toContain("WARN [vitals.lcp]");
  });
});
