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

const box = (children: Section[], id = "box"): Section => ({
  ...newSection("container"),
  id,
  children,
});

function nest(depth: number): Section {
  let node = { ...newSection("heading"), id: "leaf" } as Section;
  for (let i = depth; i > 0; i -= 1) node = box([node], `box-${i}`);
  return node;
}

describe("AST v3 nesting", () => {
  it("recurses into container children", () => {
    const ast = parseAst({
      header: [],
      main: [box([{ ...newSection("heading"), id: "h" }])],
      footer: [],
    });
    expect(ast.main[0]?.children?.[0]?.id).toBe("h");
  });

  it("caps nesting depth and flags the dropped subtree", () => {
    const ast = parseAst({ main: [nest(MAX_TREE_DEPTH + 2)] });
    const nodes = flattenAst(ast);
    expect(nodes.length).toBeLessThanOrEqual(MAX_TREE_DEPTH);
    expect(nodes.some((n) => n.invalid === "max_depth")).toBe(true);
  });

  it("caps total nodes per template", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      ...newSection("heading"),
      id: `n${i}`,
    }));
    const ast = parseAst({ main: [box(many)] });
    expect(flattenAst(ast).length).toBeLessThanOrEqual(MAX_NODES_PER_TEMPLATE);
  });

  it("survives a cyclic payload", () => {
    const cycle: Record<string, unknown> = {
      id: "loop",
      type: "container",
      props: {},
    };
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
    const ast = parseAst({
      main: [{ id: "x", type: "not_a_widget", props: {} }],
    });
    expect(ast.main[0]?.invalid).toBe("unknown_widget:not_a_widget");
  });

  it("validates slot legality per parent, at depth", () => {
    const ast = parseAst({
      footer: [box([{ ...newSection("hero"), id: "hero" }], "fbox")],
    });
    expect(ast.footer[0]?.children?.[0]?.invalid).toMatch(/illegal_slot/);
  });

  it("lints illegal nesting and empty containers", () => {
    const ast: ThemeAst = {
      header: [],
      main: [
        box([]),
        {
          ...newSection("heading"),
          id: "leaf",
          children: [{ ...newSection("heading"), id: "kid" }],
        },
      ],
      footer: [],
    };
    const messages = lintTemplate(ast).map((i) => i.message);
    expect(messages.some((m) => /Empty container/.test(m))).toBe(true);
    expect(messages.some((m) => /cannot hold nested widgets/.test(m))).toBe(
      true,
    );
  });
});

describe("AST v2 → v3 migration", () => {
  it("lifts a flat v2 document into slots", () => {
    const v3 = upgradeAstV2ToV3({
      sections: [{ id: "a", type: "heading", props: {} }],
    });
    expect(v3["main"]).toHaveLength(1);
    expect(v3["header"]).toEqual([]);
  });

  it("renames v2 container child keys to children", () => {
    const v3 = upgradeAstV2ToV3({
      main: [
        {
          id: "b",
          type: "container",
          props: {},
          items: [{ id: "c", type: "heading", props: {} }],
        },
      ],
    });
    const node = (v3["main"] as Record<string, unknown>[])[0]!;
    expect(node["items"]).toBeUndefined();
    expect(node["children"]).toHaveLength(1);
  });
});

describe("AST v2 repeater-safe upgrade (audit T2)", () => {
  const heroRows = [
    {
      heading: "Welcome",
      heading_bn: "স্বাগতম",
      image: "/hero.jpg",
      subheading: "New season",
      subheading_bn: "নতুন সিজন",
      ctaLabel: "Shop",
      ctaLabel_bn: "কেনাকাটা",
      ctaHref: "/c",
    },
  ];
  const faqRows = [
    {
      question: "Size?",
      question_bn: "সাইজ?",
      answer: "Runs large.",
      answer_bn: "বড় সাইজ।",
    },
  ];
  const footerRows = [
    {
      title: "Shop",
      title_bn: "কেনাকাটা",
      links: "New in|/",
      links_bn: "নতুন|/",
    },
  ];

  // Legacy shape: repeater rows stored at node level (outside props), as v2
  // documents and early studio payloads wrote them.
  const legacyDoc = () =>
    JSON.parse(
      JSON.stringify({
        header: [],
        main: [
          { id: "hero-1", type: "hero", props: {}, items: heroRows },
          { id: "faq-1", type: "faq", props: {}, items: faqRows },
        ],
        footer: [
          {
            id: "foot-1",
            type: "footer_sitemap",
            props: {},
            items: footerRows,
          },
        ],
      }),
    );

  it("leaves repeater data rows under items (never promotes to children)", () => {
    const v3 = upgradeAstV2ToV3(legacyDoc());
    for (const slot of ["main", "footer"] as const) {
      for (const node of v3[slot] as Record<string, unknown>[]) {
        expect(node["children"]).toBeUndefined();
        expect(node["items"]).toBeDefined();
      }
    }
    const hero = (v3["main"] as Record<string, unknown>[])[0]!;
    expect(hero["items"]).toEqual(heroRows);
  });

  it("parseAst preserves hero/faq/footer items + _bn twins", () => {
    const ast = parseAst(legacyDoc());
    expect(ast.main.find((s) => s.id === "hero-1")?.props.items).toEqual(
      heroRows,
    );
    expect(ast.main.find((s) => s.id === "faq-1")?.props.items).toEqual(
      faqRows,
    );
    expect(ast.footer.find((s) => s.id === "foot-1")?.props.items).toEqual(
      footerRows,
    );
  });

  it("parse→serialize→parse is stable for repeater items", () => {
    const once = parseAst(legacyDoc());
    const twice = parseAst(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(once.main.find((s) => s.id === "hero-1")?.props.items).toHaveLength(
      1,
    );
  });

  it("still promotes v2 container sections to children", () => {
    const doc = {
      main: [
        {
          id: "c",
          type: "container",
          props: {},
          sections: [{ id: "h", type: "heading", props: { text: "Hi" } }],
        },
      ],
    };
    const v3 = upgradeAstV2ToV3(JSON.parse(JSON.stringify(doc)));
    const node = (v3["main"] as Record<string, unknown>[])[0]!;
    expect(node["sections"]).toBeUndefined();
    expect(node["children"]).toHaveLength(1);
    const ast = parseAst(doc);
    expect(ast.main[0]?.children?.[0]?.id).toBe("h");
  });
});
