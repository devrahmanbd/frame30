import { describe, expect, it } from "vitest";
import { MAX_TREE_DEPTH, newSection, type Section } from "./builder-ast";
import {
  canDrop,
  cloneNodes,
  countNodes,
  insertNodes,
  locate,
  mapTree,
  moveRelative,
  nudge,
  outline,
  removeNodes,
  topMost,
} from "./builder-tree";

function container(children: Section[] = []): Section {
  return { ...newSection("container"), children };
}

function tree(): Section[] {
  const a = { ...newSection("heading"), id: "a" };
  const b = { ...newSection("heading"), id: "b" };
  const box = { ...container([b]), id: "box" };
  const c = { ...newSection("heading"), id: "c" };
  return [a, box, c];
}

describe("builder tree", () => {
  it("outlines every node with parent, index and depth", () => {
    expect(outline(tree()).map((n) => [n.node.id, n.parentId, n.depth])).toEqual([
      ["a", null, 0],
      ["box", null, 0],
      ["b", "box", 1],
      ["c", null, 0],
    ]);
  });

  it("is immutable: operations never mutate the input", () => {
    const before = tree();
    const snapshot = JSON.stringify(before);
    removeNodes(before, ["b"]);
    insertNodes(before, "box", 0, [newSection("heading")]);
    moveRelative(before, "a", "c", "after");
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("removes a subtree and hands it back", () => {
    const { tree: next, removed } = removeNodes(tree(), ["box"]);
    expect(next.map((n) => n.id)).toEqual(["a", "c"]);
    expect(removed[0]?.children?.[0]?.id).toBe("b");
  });

  it("drops a node inside a container", () => {
    const next = moveRelative(tree(), "c", "box", "inside");
    expect(locate(next, "c")?.parentId).toBe("box");
    expect(next.map((n) => n.id)).toEqual(["a", "box"]);
  });

  it("reorders with before/after relative to a sibling", () => {
    const next = moveRelative(tree(), "c", "a", "before");
    expect(next.map((n) => n.id)).toEqual(["c", "a", "box"]);
  });

  it("refuses to drop a node into its own descendant", () => {
    const start = [{ ...container([{ ...container(), id: "inner" }]), id: "outer" }];
    expect(moveRelative(start, "outer", "inner", "inside")).toEqual(start);
  });

  it("refuses non-container drop targets", () => {
    const check = canDrop(tree(), [newSection("heading")], "a");
    expect(check).toEqual({ ok: false, reason: "not_a_container" });
  });

  it("enforces the depth cap", () => {
    let deep = container();
    for (let i = 1; i < MAX_TREE_DEPTH; i += 1) deep = container([deep]);
    const sections = [deep];
    const deepest = outline(sections).sort((a, b) => b.depth - a.depth)[0]!;
    expect(canDrop(sections, [newSection("heading")], deepest.node.id).ok).toBe(false);
  });

  it("nudges only within the current parent", () => {
    const start = tree();
    expect(nudge(start, "b", 1).map((n) => n.id)).toEqual(["a", "box", "c"]);
    expect(locate(nudge(start, "b", 1), "b")?.parentId).toBe("box");
    expect(nudge(start, "c", -1).map((n) => n.id)).toEqual(["a", "c", "box"]);
    expect(nudge(start, "a", -1)).toEqual(start);
  });

  it("clones with fresh ids all the way down", () => {
    const [copy] = cloneNodes([tree()[1]!]);
    expect(copy!.id).not.toBe("box");
    expect(copy!.children?.[0]?.id).not.toBe("b");
    expect(countNodes([copy!])).toBe(2);
  });

  it("collapses a selection to its top-most nodes", () => {
    expect(topMost(tree(), ["box", "b", "a"])).toEqual(["a", "box"]);
  });

  it("maps props across the whole tree", () => {
    const next = mapTree(tree(), (s) => ({ ...s, props: { ...s.props, text: "x" } }));
    expect(outline(next).every((n) => n.node.props["text"] === "x")).toBe(true);
  });
});
