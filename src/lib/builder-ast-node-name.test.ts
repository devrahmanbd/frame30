/**
 * The merchant's own layer name must survive the save round-trip.
 *
 * The navigator's rename control writes `props.__name` (`LayerTree` →
 * `renameNode`), and the navigator reads it back as the layer label. It is not
 * a catalog field, so `parseSection` used to rebuild `props` from the catalog
 * and the advanced-tab specs only — dropping the name on every save. The name
 * survived the open editor session and the next reload showed `Container`
 * again: a real merchant edit, silently lost.
 *
 * The seven-template lane caught it on its Blog article journey, whose nested
 * leg renames two layers and compares the navigator after a reload. These
 * assertions are the unit-level twin of that comparison: the property is the
 * parser's, not the browser's.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_NODE_NAME,
  NODE_NAME_PROP,
  parseAst,
  parseTemplates,
} from "./builder-ast";

/** A renamed container holding one renamed child — the nested-leg shape. */
function nested() {
  return {
    header: [],
    main: [
      {
        id: "parent-1",
        type: "container",
        props: { [NODE_NAME_PROP]: "Nested parent" },
        children: [
          {
            id: "child-1",
            type: "container",
            props: { [NODE_NAME_PROP]: "Nested child" },
            children: [
              {
                id: "text-1",
                type: "rich_text",
                props: { [NODE_NAME_PROP]: "Marker text", text: "hello" },
              },
            ],
          },
        ],
      },
    ],
    footer: [],
  };
}

describe("the merchant's layer name survives parse", () => {
  it("keeps __name on a renamed container and its nested children", () => {
    const ast = parseAst(nested());
    const parent = ast.main[0]!;
    expect(parent.props[NODE_NAME_PROP]).toBe("Nested parent");
    expect(parent.children?.[0]?.props[NODE_NAME_PROP]).toBe("Nested child");
    expect(parent.children?.[0]?.children?.[0]?.props[NODE_NAME_PROP]).toBe(
      "Marker text",
    );
  });

  it("is stable across a second parse — the save after a reload keeps it", () => {
    const once = parseAst(nested());
    const twice = parseAst(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(twice.main[0]?.props[NODE_NAME_PROP]).toBe("Nested parent");
  });

  it("survives parseTemplates for a variant key (the Blog article shape)", () => {
    const templates = parseTemplates({
      blog_article: nested(),
      blog: nested(),
    });
    expect(templates.blog_article?.main[0]?.props[NODE_NAME_PROP]).toBe(
      "Nested parent",
    );
    // Renaming one template's layer must not touch the other's document.
    expect(templates.blog?.main[0]?.props[NODE_NAME_PROP]).toBe(
      "Nested parent",
    );
  });

  it("trims and bounds the name exactly like the rename input", () => {
    const ast = parseAst({
      main: [
        {
          id: "a",
          type: "rich_text",
          props: { [NODE_NAME_PROP]: `  ${"x".repeat(200)}  ` },
        },
      ],
    });
    const name = ast.main[0]?.props[NODE_NAME_PROP];
    expect(typeof name).toBe("string");
    expect((name as string).length).toBe(MAX_NODE_NAME);
    expect(name as string).toBe("x".repeat(MAX_NODE_NAME));
  });

  it("drops a blank name so the widget label is the fallback", () => {
    for (const blank of ["", "   ", null, 42, { evil: true }]) {
      const ast = parseAst({
        main: [
          { id: "a", type: "rich_text", props: { [NODE_NAME_PROP]: blank } },
        ],
      });
      expect(
        ast.main[0]!.props[NODE_NAME_PROP],
        `a non-name ${JSON.stringify(blank)} is not a custom label`,
      ).toBeUndefined();
    }
  });

  it("leaves an unnamed node without the reserved key", () => {
    const ast = parseAst({
      main: [{ id: "a", type: "rich_text", props: { text: "plain" } }],
    });
    expect(ast.main[0]!.props).not.toHaveProperty(NODE_NAME_PROP);
  });
});
