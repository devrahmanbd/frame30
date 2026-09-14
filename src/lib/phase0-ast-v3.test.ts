import { describe, expect, it } from "vitest";
import {
  MAX_NODES_PER_TEMPLATE,
  MAX_TREE_DEPTH,
  flattenAst,
  lintTemplate,
  newSection,
  parseAst,
  upgradeAstV2ToV3,
  type Section,
  type ThemeAst,
} from "./builder-ast";
import { THEME_PRESETS } from "./theme-presets";

const box = (children: Section[], id = "box"): Section => ({ ...newSection("container"), id, children });

function nest(depth: number): Section {
  let node = { ...newSection("heading"), id: "leaf" } as Section;
  for (let i = depth; i > 0; i -= 1) node = box([node], `box-${i}`);
  return node;
}

describe("AST v3 nesting", () => {
  it("recurses into container children", () => {
    const ast = parseAst({ header: [], main: [box([{ ...newSection("heading"), id: "h" }])], footer: [] });
    expect(ast.main[0]?.children?.[0]?.id).toBe("h");
  });

  it("caps nesting depth and flags the dropped subtree", () => {
    const ast = parseAst({ main: [nest(MAX_TREE_DEPTH + 2)] });
    const nodes = flattenAst(ast);
    expect(nodes.length).toBeLessThanOrEqual(MAX_TREE_DEPTH);
    expect(nodes.some((n) => n.invalid === "max_depth")).toBe(true);
  });

  it("caps total nodes per template", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ ...newSection("heading"), id: `n${i}` }));
    const ast = parseAst({ main: [box(many)] });
    expect(flattenAst(ast).length).toBeLessThanOrEqual(MAX_NODES_PER_TEMPLATE);
  });

  it("survives a cyclic payload", () => {
    const cycle: Record<string, unknown> = { id: "loop", type: "container", props: {} };
    cycle["children"] = [cycle];
    expect(() => parseAst({ main: [cycle] })).not.toThrow();
    expect(flattenAst(parseAst({ main: [cycle] })).length).toBe(1);
  });

  it("de-duplicates ids across slots", () => {
    const ast = parseAst({
      header: [{ ...newSection("announcement_bar"), id: "dup" }],
      main: [{ ...newSection("heading"), id: "dup" }],
    });
    expect(ast.main[0]?.id).not.toBe(ast.header[0]?.id);
  });

  it("degrades unknown widgets to a visible placeholder", () => {
    const ast = parseAst({ main: [{ id: "x", type: "not_a_widget", props: {} }] });
    expect(ast.main[0]?.invalid).toBe("unknown_widget:not_a_widget");
  });

  it("validates slot legality per parent, at depth", () => {
    const ast = parseAst({ footer: [box([{ ...newSection("hero"), id: "hero" }], "fbox")] });
    expect(ast.footer[0]?.children?.[0]?.invalid).toMatch(/illegal_slot/);
  });

  it("lints illegal nesting and empty containers", () => {
    const ast: ThemeAst = {
      header: [],
      main: [box([]), { ...newSection("heading"), id: "leaf", children: [{ ...newSection("heading"), id: "kid" }] }],
      footer: [],
    };
    const messages = lintTemplate(ast).map((i) => i.message);
    expect(messages.some((m) => /Empty container/.test(m))).toBe(true);
    expect(messages.some((m) => /cannot hold nested widgets/.test(m))).toBe(true);
  });
});

describe("AST v2 → v3 migration", () => {
  it("lifts a flat v2 document into slots", () => {
    const v3 = upgradeAstV2ToV3({ sections: [{ id: "a", type: "heading", props: {} }] });
    expect(v3["main"]).toHaveLength(1);
    expect(v3["header"]).toEqual([]);
  });

  it("renames v2 container child keys to children", () => {
    const v3 = upgradeAstV2ToV3({ main: [{ id: "b", type: "container", props: {}, items: [{ id: "c", type: "heading", props: {} }] }] });
    const node = (v3["main"] as Record<string, unknown>[])[0]!;
    expect(node["items"]).toBeUndefined();
    expect(node["children"]).toHaveLength(1);
  });

  it("is idempotent and non-mutating on every preset", () => {
    for (const preset of THEME_PRESETS) {
      for (const ast of Object.values(preset.templates)) {
        const frozen = JSON.stringify(ast);
        const once = upgradeAstV2ToV3(ast);
        expect(JSON.stringify(ast)).toBe(frozen);
        expect(upgradeAstV2ToV3(once)).toEqual(once);
      }
    }
  });
});

describe("round trip", () => {
  it("parse(serialize(x)) === x for every preset template, with zero invalid nodes", () => {
    for (const preset of THEME_PRESETS) {
      for (const [key, ast] of Object.entries(preset.templates)) {
        const round = parseAst(JSON.parse(JSON.stringify(ast)));
        expect(flattenAst(round).filter((n) => n.invalid), `${preset.key ?? ""} ${key}`).toEqual([]);
        expect(parseAst(JSON.parse(JSON.stringify(round))), `${key}`).toEqual(round);
      }
    }
  });
});
