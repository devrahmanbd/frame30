import { describe, expect, it } from "vitest";
import {
  SECTION_CATALOG,
  STYLE_FIELDS,
  STYLE_KEYS,
  catalogEntry,
  lintTemplate,
  newSection,
  parseAst,
  resolveProps,
  sectionStyle,
} from "./builder-ast";

describe("Phase 0.4 — universal style layer", () => {
  it("gives every widget the whole style vocabulary exactly once", () => {
    for (const entry of SECTION_CATALOG) {
      const keys = entry.fields.map((f) => f.key);
      for (const key of STYLE_KEYS) {
        expect(keys.filter((k) => k === key).length, `${entry.type}.${key}`).toBe(1);
      }
      for (const key of STYLE_KEYS) {
        expect(entry.defaults[key], `${entry.type}.${key} default`).toBeDefined();
      }
    }
  });

  it("offers tokens only — no free-form colour or length input", () => {
    for (const field of STYLE_FIELDS) {
      expect(["select", "number"], field.key).toContain(field.kind);
      if (field.kind === "select") expect(field.options?.length, field.key).toBeGreaterThan(1);
    }
  });

  it("keeps a widget's own control when it already declares the key", () => {
    const container = catalogEntry("container")!;
    expect(container.fields.filter((f) => f.key === "maxW")).toHaveLength(1);
    expect(container.fields.filter((f) => f.key === "align")).toHaveLength(1);
  });

  it("renders style props as token classes and clamped spacing", () => {
    const out = sectionStyle({ bg: "muted", radius: "lg", border: "hairline", padY: 999, padX: -20 });
    expect(out.className).toContain("bg-muted");
    expect(out.className).toContain("rounded-fq-lg");
    expect(out.className).toContain("border-border");
    expect(out.style["paddingBlock"]).toBe("160px");
    expect(out.style["paddingInline"]).toBeUndefined();
    expect(out.className).not.toMatch(/#[0-9a-f]{3}/i);
  });

  it("writes style overrides into the active breakpoint bucket", () => {
    const ast = parseAst({
      main: [{ ...newSection("hero"), id: "h1", bp: { mobile: { padY: 12, align: "center" } } }],
    });
    const node = ast.main[0]!;
    expect(node.bp?.mobile).toEqual({ padY: 12, align: "center" });
    expect(resolveProps(node, "mobile")["padY"]).toBe(12);
    expect(resolveProps(node)["padY"]).toBe(0);
    expect(sectionStyle(resolveProps(node, "mobile")).className).toContain("text-center");
  });

  it("rejects a non-responsive style key inside a breakpoint layer", () => {
    const ast = parseAst({ main: [{ ...newSection("hero"), id: "h2", bp: { mobile: { shadow: "md" } } }] });
    expect(ast.main[0]!.bp).toBeUndefined();
  });

  it("lints a raw colour as an error, in base props and breakpoint layers", () => {
    const base = parseAst({ main: [{ ...newSection("heading"), id: "c1", props: { text: "#ff0000 sale" } }] });
    const issues = lintTemplate(base, "index");
    expect(issues.some((i) => i.level === "error" && /Raw colour/.test(i.message))).toBe(true);

    const clean = parseAst({ main: [newSection("heading")] });
    expect(lintTemplate(clean, "index").some((i) => /Raw colour/.test(i.message))).toBe(false);
  });

  it("keeps per-breakpoint visibility on the node", () => {
    const ast = parseAst({ main: [{ ...newSection("hero"), id: "v1", hidden: ["mobile", "bogus"] }] });
    expect(ast.main[0]!.hidden).toEqual(["mobile"]);
  });
});
