import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHROMA,
  ELEVATION,
  RHYTHM,
  TYPE,
  auditChroma,
  auditElevation,
  auditGeometry,
  auditPage,
  auditSurfaceOrder,
  auditTypography,
  dedupeFindings,
  expectedContainerPx,
  expectedSectionPaddingPx,
  type BandMeasurement,
} from "./site-rhythm";

const band = (over: Partial<BandMeasurement> = {}): BandMeasurement => ({
  index: 0,
  label: "band",
  surface: "canvas",
  width: "default",
  density: "section",
  containerWidthPx: 1200,
  paddingTopPx: 112,
  paddingBottomPx: 112,
  scrollWidthPx: 1440,
  clientWidthPx: 1440,
  auroraCount: 0,
  signalCount: 0,
  ...over,
});

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("rhythm geometry", () => {
  it("caps the container at the artboard width and subtracts gutters below it", () => {
    expect(expectedContainerPx("default", 1920)).toBe(RHYTHM.containerPx);
    expect(expectedContainerPx("default", 320)).toBe(320 - RHYTHM.gutterMobilePx * 2);
    expect(expectedContainerPx("wide", 1920)).toBe(RHYTHM.widePx);
    expect(expectedContainerPx("narrow", 1920)).toBe(RHYTHM.narrowPx);
  });

  it("switches the section rhythm at the desktop breakpoint", () => {
    expect(expectedSectionPaddingPx("section", 1440)).toBe(112);
    expect(expectedSectionPaddingPx("section", 375)).toBe(72);
    expect(expectedSectionPaddingPx("tight", 1440)).toBe(RHYTHM.tightDesktopPx);
  });

  it("fails a container wider than its preset but tolerates rounding", () => {
    expect(codes(auditGeometry([band({ containerWidthPx: 1320 })], 1920))).toContain(
      "rhythm.container.too_wide",
    );
    expect(auditGeometry([band({ containerWidthPx: 1201 })], 1920)).toHaveLength(0);
  });

  it("warns when padding falls under the rhythm but not when it exceeds it", () => {
    expect(
      codes(auditGeometry([band({ paddingTopPx: 40, paddingBottomPx: 112 })], 1440)),
    ).toEqual(["rhythm.section.padding_drift"]);
    expect(
      auditGeometry([band({ paddingTopPx: 180, paddingBottomPx: 180 })], 1440),
    ).toHaveLength(0);
  });

  it("flags a band that scrolls wider than its own box", () => {
    expect(codes(auditGeometry([band({ scrollWidthPx: 1500 })], 1440))).toContain(
      "rhythm.section.overflow",
    );
  });
});

describe("surface order", () => {
  it("rejects two glass-family surfaces without a canvas between them", () => {
    const found = auditSurfaceOrder([
      { surface: "glass", label: "a" },
      { surface: "aurora", label: "b" },
    ]);
    expect(codes(found)).toContain("surface.glass_stacked");
    expect(found[0]!.severity).toBe("error");
  });

  it("accepts glass · canvas · glass", () => {
    expect(
      auditSurfaceOrder([
        { surface: "glass", label: "a" },
        { surface: "canvas", label: "b" },
        { surface: "glass", label: "c" },
      ]),
    ).toHaveLength(0);
  });

  it("keeps aurora fields at least two bands apart", () => {
    expect(
      codes(
        auditSurfaceOrder([
          { surface: "aurora", label: "hero" },
          { surface: "canvas", label: "stats" },
          { surface: "aurora", label: "cta" },
        ]),
      ),
    ).toContain("surface.aurora_crowded");
  });

  it("names bands that declare no surface", () => {
    expect(codes(auditSurfaceOrder([{ surface: "unknown", label: "?" }]))).toEqual([
      "surface.unknown",
    ]);
  });
});

describe("chroma budget", () => {
  it("warns above one signal element per band", () => {
    expect(codes(auditChroma([band({ signalCount: 3 })]))).toContain(
      "chroma.signal_over_budget",
    );
  });

  it("warns on a page with no chromatic anchor at all", () => {
    expect(codes(auditChroma([band(), band({ index: 1 })]))).toContain("chroma.greyscale_page");
  });

  it("is silent on a page with exactly one aurora field", () => {
    expect(auditChroma([band({ auroraCount: 1 }), band({ index: 1 })])).toHaveLength(0);
  });

  it("has a budget consistent with the spec constants", () => {
    expect(CHROMA.maxAuroraPerViewport).toBe(1);
    expect(CHROMA.maxSignalPerBand).toBe(1);
  });
});

describe("typography", () => {
  const sample = (over: Partial<Parameters<typeof auditTypography>[0][number]> = {}) => ({
    label: "p",
    kind: "body" as const,
    lang: "en",
    fontFamily: "DM Sans, sans-serif",
    fontSizePx: 17,
    lineHeightPx: 27.2,
    letterSpacingPx: 0,
    ...over,
  });

  it("passes DM Sans 17/1.6 body copy", () => {
    expect(auditTypography([sample()])).toHaveLength(0);
  });

  it("warns on a 15px body size and a tight line box", () => {
    expect(codes(auditTypography([sample({ fontSizePx: 15, lineHeightPx: 20 })]))).toEqual(
      expect.arrayContaining(["type.body_size", "type.body_line_height"]),
    );
  });

  it("keeps display tracking as a percentage of size", () => {
    const ok = auditTypography([
      sample({ kind: "display", fontFamily: "Space Grotesk", fontSizePx: 64, letterSpacingPx: 64 * -0.042, lineHeightPx: 64 }),
    ]);
    expect(ok).toHaveLength(0);

    const lost = auditTypography([
      // -2px tracking authored at 24px, still -2px once clamped to 64px.
      sample({ kind: "display", fontFamily: "Space Grotesk", fontSizePx: 64, letterSpacingPx: -2, lineHeightPx: 64 }),
    ]);
    expect(codes(lost)).toContain("type.display_tracking_lost");
  });

  it("requires Bangla to reset tracking and open the line box", () => {
    const found = auditTypography([
      sample({
        kind: "display",
        lang: "bn",
        fontFamily: "Noto Sans Bengali",
        fontSizePx: 48,
        letterSpacingPx: -2,
        lineHeightPx: 48,
      }),
    ]);
    expect(codes(found)).toEqual(
      expect.arrayContaining(["type.bn_tracking_not_reset", "type.bn_line_box_tight"]),
    );
    expect(found.every((f) => f.severity === "error")).toBe(true);
  });

  it("treats a Bangla body line box under 1.35 as blocking", () => {
    const found = auditTypography([
      sample({ lang: "bn", fontFamily: "Noto Sans Bengali", lineHeightPx: 17 * 1.2 }),
    ]);
    expect(found.find((f) => f.code === "type.body_line_height")?.severity).toBe("error");
  });
});

describe("elevation", () => {
  it("requires a 1px light edge on glass", () => {
    expect(
      codes(
        auditElevation([
          { label: "card", edgeAlpha: null, edgeWidthPx: 0, ambientBlurPx: 40, hasInsetHighlight: false },
        ]),
      ),
    ).toContain("elevation.edge_missing");
  });

  it("accepts the spec edge", () => {
    expect(
      auditElevation([
        {
          label: "card",
          edgeAlpha: ELEVATION.edgeAlpha,
          edgeWidthPx: 1,
          ambientBlurPx: 40,
          hasInsetHighlight: true,
        },
      ]),
    ).toHaveLength(0);
  });

  it("flags shadow-only elevation", () => {
    expect(
      codes(
        auditElevation([
          { label: "card", edgeAlpha: 0.14, edgeWidthPx: 1, ambientBlurPx: 140, hasInsetHighlight: false },
        ]),
      ),
    ).toContain("elevation.shadow_only");
  });
});

describe("aggregate report", () => {
  it("is only ok when no blocking finding exists", () => {
    const ok = auditPage({
      route: "/pricing",
      viewportPx: 1440,
      locale: "en",
      bands: [band({ auroraCount: 1 })],
      type: [],
      glass: [],
    });
    expect(ok.ok).toBe(true);

    const bad = auditPage({
      route: "/pricing",
      viewportPx: 1440,
      locale: "en",
      bands: [band({ containerWidthPx: 1600, auroraCount: 1 })],
      type: [],
      glass: [],
    });
    expect(bad.ok).toBe(false);
    expect(bad.counts.error).toBeGreaterThan(0);
  });

  it("collapses the same finding measured at several viewports", () => {
    const one = {
      code: "rhythm.section.padding_drift" as const,
      severity: "warn" as const,
      rule: "r",
      message: "m",
      where: "/pricing @1440/en · band 2",
    };
    const two = { ...one, where: "/pricing @320/en · band 2" };
    expect(dedupeFindings([one, two])).toHaveLength(1);
  });
});

/**
 * The stylesheet is the other half of this contract. These assertions are the
 * reason a designer can change the rhythm in one place: if `styles.css` and
 * `RHYTHM` disagree, this test names the mismatch instead of a reviewer
 * noticing it three pages later.
 */
describe("stylesheet agrees with the spec", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

  it("declares the container and gutter tokens from RHYTHM", () => {
    expect(css).toContain(`--fq-container: ${RHYTHM.containerPx}px`);
    expect(css).toContain(`--fq-container-narrow: ${RHYTHM.narrowPx}px`);
    expect(css).toContain(`--fq-container-wide: ${RHYTHM.widePx}px`);
    expect(css).toContain(`--fq-gutter: ${RHYTHM.gutterMobilePx}px`);
    expect(css).toContain(`--fq-gutter: ${RHYTHM.gutterDesktopPx}px`);
  });

  it("declares the 112/72 section rhythm behind the md breakpoint", () => {
    expect(css).toContain(`--fq-band-y: ${RHYTHM.sectionMobilePx}px`);
    expect(css).toContain(`--fq-band-y: ${RHYTHM.sectionDesktopPx}px`);
    expect(css).toContain(`@media (min-width: ${RHYTHM.desktopMinWidthPx}px)`);
  });

  it("pins the edge-light alpha and the body scale", () => {
    expect(css).toContain(`--fq-edge: rgb(255 255 255 / ${ELEVATION.edgeAlpha})`);
    expect(css).toContain(`font-size: ${TYPE.bodyPx}px`);
    expect(css).toContain(`line-height: ${TYPE.bodyLineHeight}`);
  });

  it("resets tracking and opens the line box for Bangla subtrees", () => {
    expect(css).toMatch(/\[lang="bn"\][\s\S]{0,120}letter-spacing: 0/);
    expect(css).toContain(`max(${TYPE.bnMinLineHeight}em`);
  });
});
