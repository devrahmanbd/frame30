import { describe, expect, it } from "vitest";
import {
  BREAKPOINT_PX,
  BUCKET_OF_BREAKPOINT,
  DEVICE_PRESETS,
  GRID_COLS,
  GRID_GUTTER_PX,
  MIN_SUPPORTED_WIDTH_PX,
  MIN_TOUCH_PX,
  bucketForWidth,
  clampSpan,
  hasFixedWidth,
  isUppercaseHostile,
  spanClass,
} from "./responsive";
import { SECTION_CATALOG, STYLE_KEYS, lintTemplate, newSection, parseAst, resolveProps, sectionStyle } from "./builder-ast";
import { THEME_PRESETS } from "./theme-presets";

describe("Phase 6 — platform breakpoints", () => {
  it("pins the platform breakpoints", () => {
    expect(BREAKPOINT_PX).toEqual({ base: 0, sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 });
    expect(GRID_COLS).toEqual({ mobile: 4, tablet: 8, desktop: 12 });
    expect(GRID_GUTTER_PX).toBe(16);
    expect(MIN_TOUCH_PX).toBe(44);
    expect(MIN_SUPPORTED_WIDTH_PX).toBe(320);
  });

  it("resolves a viewport width to the same bucket the editor edits", () => {
    for (const preset of DEVICE_PRESETS) {
      expect(bucketForWidth(preset.width), String(preset.width)).toBe(preset.bp);
    }
    expect(bucketForWidth(319)).toBe("mobile");
    expect(bucketForWidth(1536)).toBe("desktop");
  });

  it("keeps every breakpoint name mapped to a bucket", () => {
    for (const name of Object.keys(BREAKPOINT_PX)) {
      expect(BUCKET_OF_BREAKPOINT[name as keyof typeof BREAKPOINT_PX]).toBeTruthy();
    }
  });
});

describe("Phase 6 — column span per breakpoint", () => {
  it("gives every widget a responsive span control with an auto default", () => {
    expect(STYLE_KEYS).toContain("span");
    for (const entry of SECTION_CATALOG) {
      const field = entry.fields.find((f) => f.key === "span");
      expect(field, entry.type).toBeTruthy();
      expect(field?.responsive, entry.type).toBe(true);
      expect(entry.defaults["span"], entry.type).toBe(0);
    }
  });

  it("clamps spans to the grid of the bucket", () => {
    expect(clampSpan(20, "desktop")).toBe(12);
    expect(clampSpan(20, "tablet")).toBe(8);
    expect(clampSpan(20, "mobile")).toBe(4);
    expect(clampSpan(-3)).toBe(0);
    expect(clampSpan("6")).toBe(6);
  });

  it("emits a static span class, never a computed one", () => {
    expect(spanClass(6)).toBe("fq-span-6");
    expect(spanClass(0)).toBe("");
    expect(sectionStyle({ span: 4 }).className).toContain("fq-span-4");
    expect(sectionStyle({}).className).not.toContain("fq-span");
  });

  it("reads the span from the active breakpoint layer", () => {
    const ast = parseAst({
      main: [{ ...newSection("hero"), id: "h1", bp: { mobile: { span: 4 } } }],
    });
    const node = ast.main[0]!;
    expect(sectionStyle(resolveProps(node, "mobile")).className).toContain("fq-span-4");
    expect(sectionStyle(resolveProps(node)).className).not.toContain("fq-span");
  });
});

describe("Phase 6 — elasticity lint", () => {
  it("detects fixed widths", () => {
    expect(hasFixedWidth("w-[240px]")).toBe(true);
    expect(hasFixedWidth("width: 12rem")).toBe(true);
    expect(hasFixedWidth("min-w-[320px]")).toBe(true);
    expect(hasFixedWidth("w-full max-w-prose")).toBe(false);
    expect(hasFixedWidth(42)).toBe(false);
  });

  it("blocks publish on a fixed-width prop", () => {
    const base = newSection("banner");
    const ast = parseAst({
      main: [{ ...base, id: "b1", props: { ...base.props, text: "Buy w-[220px]" } }],
    });
    const issues = lintTemplate(ast, "index");
    expect(issues.some((i) => i.level === "error" && /Fixed pixel width/.test(i.message))).toBe(true);
  });

  it("flags uppercase styling on বাংলা copy", () => {
    expect(isUppercaseHostile("অফার")).toBe(true);
    expect(isUppercaseHostile("Offer")).toBe(false);
    const base = newSection("banner");
    const ast = parseAst({
      main: [{ ...base, id: "b2", props: { ...base.props, text: "Offer uppercase", text_bn: "অফার" } }],
    });
    expect(lintTemplate(ast, "index").some((i) => /Uppercase styling/.test(i.message))).toBe(true);
  });

  it("ships presets free of fixed widths", () => {
    for (const preset of THEME_PRESETS) {
      for (const [template, ast] of Object.entries(preset.templates)) {
        const issues = lintTemplate(ast, template as never).filter(
          (i) => i.level === "error" && /Fixed pixel width|Uppercase styling/.test(i.message),
        );
        expect(issues, `${preset.key}/${template}`).toEqual([]);
      }
    }
  });
});
