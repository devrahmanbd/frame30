/**
 * Phase 5 exit gate — responsiveness.
 *
 * The browser sweep proves the rendered result; this suite proves the contract
 * the sweep relies on: one breakpoint set, a real cascade, overrides that
 * survive the trip to production CSS, and a publish gate that refuses the
 * layouts we know overflow a 320px phone.
 */
import { describe, expect, it } from "vitest";
import {
  BREAKPOINT_PX,
  DEVICE_PRESETS,
  LAYER_CASCADE,
  LAYER_RANGE,
  MIN_FLOOR_WIDTH_PX,
  MIN_PREFERRED_WIDTH_PX,
  MIN_TOUCH_PX,
  RESPONSIVE_LAYOUT_KEYS,
  bucketForWidth,
  inheritanceOf,
  isResponsiveLayoutKey,
  layerMedia,
} from "./responsive";
import {
  RESPONSIVE_CSS_BUDGET,
  compileResponsiveCss,
  responsiveClassOf,
  responsiveSignature,
  signatureKey,
} from "./responsive-css";
import { responsiveGate, responsiveIssues, SCROLL_LOCK_OWNERS } from "./responsive-lint";
import { newSection, parseAst, resolveProps, type Section, type ThemeAst } from "./builder-ast";
import { composePublishGate, RELEASE_GATES } from "./publish-gates";
import { DEFAULT_TOKENS } from "./builder-ast";
import { THEME_PRESETS } from "./theme-presets";

function mk(type: Parameters<typeof newSection>[0], id: string, extra: Partial<Section> = {}): Section {
  return { ...newSection(type), id, ...extra };
}

function ast(main: Section[]): ThemeAst {
  return parseAst({ header: [], main, footer: [] });
}

describe("Phase 5 — one breakpoint set, stated once", () => {
  it("gives every authoring layer a non-overlapping media range", () => {
    expect(layerMedia("desktop")).toBeNull();
    expect(layerMedia("tablet")).toBe(`@media (min-width: ${BREAKPOINT_PX.md}px) and (max-width: ${BREAKPOINT_PX.xl - 0.02}px)`);
    expect(layerMedia("mobile")).toBe(`@media (max-width: ${BREAKPOINT_PX.md - 0.02}px)`);
    expect(LAYER_RANGE.mobile.max! + 0.02).toBe(LAYER_RANGE.tablet.min!);
  });

  it("keeps the studio frames, the bucket resolver and the media ranges in agreement", () => {
    for (const preset of DEVICE_PRESETS) expect(bucketForWidth(preset.width)).toBe(preset.bp);
    expect(bucketForWidth(MIN_FLOOR_WIDTH_PX)).toBe("mobile");
    expect(bucketForWidth(MIN_PREFERRED_WIDTH_PX)).toBe("mobile");
    expect(bucketForWidth(BREAKPOINT_PX.md)).toBe("tablet");
    expect(bucketForWidth(BREAKPOINT_PX.xl)).toBe("desktop");
    expect(MIN_PREFERRED_WIDTH_PX).toBeGreaterThan(MIN_FLOOR_WIDTH_PX);
  });

  it("declares a narrow-to-wide cascade", () => {
    expect(LAYER_CASCADE.mobile).toEqual(["mobile", "tablet", "desktop"]);
    expect(LAYER_CASCADE.tablet).toEqual(["tablet", "desktop"]);
    expect(LAYER_CASCADE.desktop).toEqual(["desktop"]);
  });
});

describe("Phase 5 — per-device overrides for layout props", () => {
  it("covers every layout prop the TODO names", () => {
    for (const key of ["columns", "gap", "order", "align", "padY", "padX", "maxW", "ratio", "span"]) {
      expect(isResponsiveLayoutKey(key), key).toBe(true);
    }
    expect(isResponsiveLayoutKey("radius")).toBe(false);
    expect(new Set(RESPONSIVE_LAYOUT_KEYS).size).toBe(RESPONSIVE_LAYOUT_KEYS.length);
  });

  it("resolves props through the cascade, so mobile inherits a tablet override", () => {
    const node = mk("hero", "h1", { bp: { tablet: { padY: 40, align: "center" }, mobile: { padY: 12 } } });
    expect(resolveProps(node, "desktop")["padY"]).toBe(node.props["padY"]);
    expect(resolveProps(node, "tablet")["padY"]).toBe(40);
    expect(resolveProps(node, "mobile")["padY"]).toBe(12);
    // Inherited from tablet, not silently reset to the desktop base.
    expect(resolveProps(node, "mobile")["align"]).toBe("center");
  });

  it("reports where a value came from, for the inspector's inheritance hint", () => {
    const node = mk("hero", "h1", { bp: { tablet: { padY: 40 } } });
    expect(inheritanceOf(node, "padY", "tablet")).toMatchObject({ value: 40, source: "tablet", overridden: true, inherited: false });
    expect(inheritanceOf(node, "padY", "mobile")).toMatchObject({ source: "tablet", inherited: true, overridden: false });
    expect(inheritanceOf(node, "align", "mobile")).toMatchObject({ source: "desktop", inherited: true });
    expect(inheritanceOf(node, "not_a_prop", "mobile")).toMatchObject({ source: "default", overridden: false });
  });
});

describe("Phase 5 — overrides reach production as real CSS", () => {
  it("emits nothing for a node with no responsive behaviour", () => {
    const plain = mk("hero", "h1");
    expect(responsiveSignature(plain)).toBeNull();
    expect(responsiveClassOf(plain)).toBeNull();
    expect(compileResponsiveCss(ast([plain])).css).toBe("");
  });

  it("compiles a mobile override into a range-scoped rule the node can match", () => {
    const node = mk("hero", "h1", { bp: { mobile: { padY: 8, align: "center", span: 4 } } });
    const cls = responsiveClassOf(node)!;
    const out = compileResponsiveCss(ast([node]));
    expect(cls).toMatch(/^fq-r-[a-z0-9]+$/);
    expect(out.css).toContain(`.fq-node.${cls}`);
    expect(out.css).toContain(`@media (max-width: ${BREAKPOINT_PX.md - 0.02}px)`);
    expect(out.css).toContain("padding-block:8px");
    expect(out.css).toContain("text-align:center");
    expect(out.css).toContain("grid-column:span 4 / span 4");
    expect(out.nodes).toBe(1);
  });

  it("orders tablet before mobile so the narrower layer wins without !important", () => {
    const node = mk("hero", "h1", { bp: { tablet: { padY: 40 }, mobile: { padY: 8 } } });
    const css = compileResponsiveCss(ast([node])).css;
    expect(css.indexOf("padding-block:40px")).toBeLessThan(css.indexOf("padding-block:8px"));
    expect(css).not.toContain("!important");
  });

  it("deduplicates identical signatures — forty identical cards cost one rule set", () => {
    const nodes = Array.from({ length: 40 }, (_, i) => mk("hero", `h${i}`, { bp: { mobile: { padY: 8 } } }));
    const out = compileResponsiveCss(ast(nodes));
    expect(out.nodes).toBe(40);
    expect(out.signatures).toBe(1);
    expect(out.rules).toBe(1);
    expect(new Set(nodes.map(responsiveClassOf)).size).toBe(1);
  });

  it("is deterministic and order-independent", () => {
    const a = mk("hero", "a", { bp: { mobile: { padY: 8, align: "center" } } });
    const b = mk("hero", "b", { bp: { mobile: { align: "center", padY: 8 } } });
    expect(signatureKey(responsiveSignature(a)!)).toBe(signatureKey(responsiveSignature(b)!));
    expect(compileResponsiveCss(ast([a])).css).toBe(compileResponsiveCss(ast([b])).css);
  });

  it("never lets a merchant string into the stylesheet", () => {
    const node = mk("hero", "h1", {
      bp: { mobile: { align: "center;} body{display:none}", padY: "12px; color: red" as never } },
    });
    const css = compileResponsiveCss(ast([node])).css;
    expect(css).not.toContain("body{display:none}");
    expect(css).not.toContain("color: red");
    // Both values are unparseable as their declared kinds, so both are
    // dropped outright — the node renders at its base layout rather than
    // carrying merchant text into the stylesheet.
    expect(css).toBe("");
  });

  it("clamps hostile numbers instead of trusting them", () => {
    const node = mk("hero", "h1", { bp: { mobile: { padY: 99_999, gap: -5, columns: 400 } } });
    const css = compileResponsiveCss(ast([node])).css;
    // In range after clamping to the platform maximum…
    expect(css).toContain("padding-block:160px");
    // …and out of range entirely, so rejected rather than silently squashed.
    expect(css).not.toContain("gap:");
    expect(css).not.toContain("grid-template-columns");
  });

  it("stays inside its budget and says so when it cannot", () => {
    const nodes = Array.from({ length: 200 }, (_, i) => mk("hero", `h${i}`, { bp: { mobile: { padY: i } } }));
    const out = compileResponsiveCss(ast(nodes), { budget: { maxRules: 10 } });
    expect(out.rules).toBe(10);
    expect(out.truncated).toBe(true);
    expect(out.warnings.join(" ")).toMatch(/budget/);
    expect(out.bytes).toBeLessThanOrEqual(RESPONSIVE_CSS_BUDGET.maxBytes);
  });

  it("compiles hidden layers into the same ranges the renderer uses", () => {
    const node = mk("hero", "h1", { hidden: ["mobile"] });
    const css = compileResponsiveCss(ast([node])).css;
    expect(css).toContain(`@media (max-width: ${BREAKPOINT_PX.md - 0.02}px)`);
    expect(css).toContain("display:none");
  });

  it("walks children, not just root sections", () => {
    const child = mk("hero", "c1", { bp: { mobile: { padY: 4 } } });
    const container = { ...mk("container", "wrap"), children: [child] } as Section;
    expect(compileResponsiveCss(ast([container])).nodes).toBe(1);
  });
});

describe("Phase 5 — the static responsive gate", () => {
  it("blocks a grid that cannot fit the mobile column count", () => {
    const node = mk("product_grid", "g1", { bp: { mobile: { columns: 6 } } });
    const issues = responsiveIssues(ast([node]));
    expect(issues.some((i) => i.code === "responsive.columns_overflow" && i.level === "error")).toBe(true);
    expect(issues.find((i) => i.code === "responsive.columns_overflow")?.nodeId).toBe("g1");
  });

  it("warns about a dense but legal mobile grid instead of blocking it", () => {
    const node = mk("product_grid", "g1", { bp: { mobile: { columns: 3 } } });
    const issues = responsiveIssues(ast([node]));
    expect(issues.some((i) => i.code === "responsive.columns_dense" && i.level === "warn")).toBe(true);
    expect(issues.some((i) => i.level === "error")).toBe(false);
  });

  it("blocks vh units, sub-44px tap targets and fixed-width tappables", () => {
    const vh = mk("hero", "v1", { props: { ...newSection("hero").props, minHeight: "100vh" } });
    const tap = mk("hero", "t1", { props: { ...newSection("hero").props, tapSize: 32 } });
    const fixed = mk("hero", "f1", { props: { ...newSection("hero").props, ctaLabel: "Buy w-[220px]" } });
    const codes = responsiveIssues([vh, tap, fixed]).filter((i) => i.level === "error").map((i) => i.code);
    expect(codes).toContain("responsive.vh_unit");
    expect(codes).toContain("responsive.tap_target");
    expect(codes).toContain("responsive.fixed_tappable");
    expect(MIN_TOUCH_PX).toBe(44);
  });

  it("allows exactly one scroll-lock owner per template", () => {
    const one = responsiveIssues(ast([mk(SCROLL_LOCK_OWNERS[0], "o1")]));
    expect(one.some((i) => i.code === "responsive.multiple_scroll_locks")).toBe(false);
    const two = responsiveIssues(ast([mk(SCROLL_LOCK_OWNERS[0], "o1"), mk(SCROLL_LOCK_OWNERS[1], "o2")]));
    expect(two.some((i) => i.code === "responsive.multiple_scroll_locks" && i.level === "error")).toBe(true);
  });

  it("reports the compiled stylesheet's stats alongside the issues", () => {
    const report = responsiveGate(ast([mk("hero", "h1", { bp: { mobile: { padY: 8 } } })]));
    expect(report.ok).toBe(true);
    expect(report.css.rules).toBe(1);
    expect(report.css.bytes).toBeGreaterThan(0);
    expect(report.css.truncated).toBe(false);
  });
});

describe("Phase 5 — publish and release wiring", () => {
  it("fails a publish whose template overflows the mobile grid", () => {
    const bad = ast([mk("product_grid", "g1", { bp: { mobile: { columns: 8 } } })]);
    const gate = composePublishGate({ tokens: DEFAULT_TOKENS, responsive: { ast: bad } });
    expect(gate.ok).toBe(false);
    expect(gate.failures.some((f) => f.code === "responsive.columns_overflow")).toBe(true);
    expect(gate.responsive?.ok).toBe(false);
  });

  it("leaves a clean template passing and keeps warnings non-blocking", () => {
    const clean = ast([mk("product_grid", "g1", { bp: { mobile: { columns: 3 } } })]);
    const gate = composePublishGate({ tokens: DEFAULT_TOKENS, responsive: { ast: clean } });
    expect(gate.failures.filter((f) => f.code.startsWith("responsive."))).toEqual([]);
    expect(gate.warnings.some((w) => w.code === "responsive.columns_dense")).toBe(true);
  });

  it("declares the browser sweep as a release gate", () => {
    const entry = RELEASE_GATES.find((g) => g.key === "responsive");
    expect(entry?.script).toBe("scripts/responsive-sweep.mjs");
    expect(entry?.npm).toBe("responsive:sweep");
  });

  it("ships every preset template through the gate without an error", () => {
    for (const preset of THEME_PRESETS) {
      for (const [template, tree] of Object.entries(preset.templates)) {
        const report = responsiveGate(tree as ThemeAst);
        expect(report.failures, `${preset.key}/${template}`).toEqual([]);
      }
    }
  });
});
