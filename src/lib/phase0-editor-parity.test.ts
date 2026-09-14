import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTION_CATALOG, newSection, MAX_TREE_DEPTH } from "./builder-ast";
import { canDrop, insertNodes, locate, outline } from "./builder-tree";

/**
 * Phase 0.6 — editor parity with Elementor / Webflow / Framer.
 *
 * These checks are structural on purpose: they assert the studio shell keeps
 * the three rails, the canvas keeps its `data-node-id` selection handle, and a
 * merchant can build a page from an empty template with containers, columns and
 * the widget tray alone.
 */
const builder = readFileSync("src/routes/_authenticated/admin/builder.tsx", "utf8");
const renderer = readFileSync("src/components/builder/SectionRenderer.tsx", "utf8");

describe("left rail", () => {
  it("switches layout slots", () => {
    expect(builder).toContain('aria-label={t("Layout slots"');
    expect(builder).toMatch(/SLOTS\.map/);
  });

  it("exposes Layers / Add / Blocks panels", () => {
    expect(builder).toContain('aria-label={t("Editor panels"');
    for (const key of ['"layers"', '"add"', '"blocks"']) expect(builder).toContain(key);
  });

  it("scopes the tray to a container when adding inside", () => {
    expect(builder).toContain("onAddInside");
    expect(builder).toContain("{ parentId: addParent }");
  });
});

describe("canvas", () => {
  it("tags every node with data-node-id in editing mode", () => {
    expect(renderer).toContain('{...(editing ? { "data-node-id": section.id } : {})}');
    // children recurse with the same editing flag, so nested nodes are selectable
    expect(renderer).toMatch(/renderChildren[\s\S]*editing=\{editing\}/);
  });

  it("selects the deepest node under the pointer, with modifier multi-select", () => {
    expect(builder).toContain('closest("[data-node-id]")');
    expect(builder).toMatch(/event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \? "toggle" : "replace"/);
  });

  it("renders device and locale frames", () => {
    expect(builder).toContain('aria-label={t("Preview size"');
    expect(builder).toContain('aria-label={t("Preview language"');
    expect(builder).toContain('locale === "both"');
  });

  it("supports inline text editing", () => {
    expect(builder).toContain("onInlineEdit");
  });
});

describe("right rail", () => {
  it("exposes Settings / Brand / History / Themes", () => {
    expect(builder).toContain('aria-label={t("Studio panels"');
    for (const key of ['"inspect"', '"brand"', '"history"', '"themes"']) {
      expect(builder).toContain(key);
    }
  });
});

describe("empty-template build path", () => {
  it("offers container and columns in the main slot tray", () => {
    const mainContainers = SECTION_CATALOG.filter(
      (entry) => entry.container && entry.slots.includes("main"),
    ).map((entry) => entry.type);
    expect(mainContainers).toContain("container");
    expect(mainContainers).toContain("columns");
  });

  it("builds container → columns → widget from zero nodes", () => {
    let tree = insertNodes([], null, 0, [newSection("container")]);
    const containerId = tree[0]!.id;
    expect(canDrop(tree, [newSection("columns")], containerId).ok).toBe(true);
    tree = insertNodes(tree, containerId, 0, [newSection("columns")]);
    const columnsId = locate(tree, containerId)!.node.children![0]!.id;
    tree = insertNodes(tree, columnsId, 0, [newSection("heading")]);

    const rows = outline(tree);
    expect(rows.map((row) => row.node.type)).toEqual([
      "container",
      "columns",
      "heading",
    ]);
    expect(Math.max(...rows.map((row) => row.depth))).toBeLessThan(MAX_TREE_DEPTH);
  });

  it("refuses to nest inside a non-container widget", () => {
    const tree = insertNodes([], null, 0, [newSection("heading")]);
    expect(canDrop(tree, [newSection("heading")], tree[0]!.id)).toEqual({
      ok: false,
      reason: "not_a_container",
    });
  });
});
