/**
 * Studio selection sync + tree-move guards — characterization contract.
 *
 * Pins the pure rules behind the multi-select interaction in
 * `StudioBuilder.tsx` (`applySelection`, `topMostStudioIds`), the
 * ghost-drop cleanup rule (`StudioBuilder.tsx:517-523`, expressed here via
 * the exact `filter` + `findNode` predicate the effect runs), and the
 * `moveNode` self-drop guard in `tree.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  applySelection,
  topMostStudioIds,
} from "@/components/builder/studio/StudioBuilder";
import {
  canMove,
  containsNode,
  findNode,
  moveNode,
  removeNode,
  type DropTarget,
} from "./tree";
import type { StudioNode } from "./model";

function node(
  id: string,
  children: StudioNode[] = [],
  el = "container",
): StudioNode {
  return { id, el, settings: {}, children };
}

function widget(id: string): StudioNode {
  return { id, el: "heading", settings: {} };
}

describe("studio applySelection", () => {
  it("replace collapses any selection to the single id", () => {
    expect(applySelection(["a", "b"], "c", "replace")).toEqual(["c"]);
    expect(applySelection(["a"], "a", "replace")).toEqual(["a"]);
    expect(applySelection([], "a", "replace")).toEqual(["a"]);
  });

  it("toggle adds and removes while preserving order", () => {
    expect(applySelection(["b", "a"], "c", "toggle")).toEqual(["b", "a", "c"]);
    expect(applySelection(["a", "b", "c"], "b", "toggle")).toEqual(["a", "c"]);
    expect(applySelection([], "a", "toggle")).toEqual(["a"]);
  });

  it("null clears the selection in both modes (deselect)", () => {
    expect(applySelection(["a", "b"], null, "replace")).toEqual([]);
    expect(applySelection(["a"], null, "toggle")).toEqual([]);
  });

  it("never mutates the incoming selection", () => {
    const current = ["a", "b"];
    applySelection(current, "c", "toggle");
    applySelection(current, "a", "toggle");
    applySelection(current, "z", "replace");
    expect(current).toEqual(["a", "b"]);
  });
});

describe("studio topMostStudioIds", () => {
  it("collapses nested children under a selected ancestor", () => {
    const root = [node("a", [node("b", [widget("c")])]), widget("e")];
    expect(topMostStudioIds(root, ["a", "b", "c"])).toEqual(["a"]);
    expect(topMostStudioIds(root, ["b", "c"])).toEqual(["b"]);
    expect(topMostStudioIds(root, ["c"])).toEqual(["c"]);
  });

  it("keeps ids from disjoint subtrees", () => {
    const root = [
      node("a", [widget("b")]),
      node("c", [widget("d")]),
      widget("e"),
    ];
    expect(topMostStudioIds(root, ["b", "d", "e"])).toEqual(["b", "d", "e"]);
    expect(topMostStudioIds(root, ["a", "c"])).toEqual(["a", "c"]);
  });

  it("returns document order regardless of input order", () => {
    const root = [
      node("a", [widget("b")]),
      node("c", [widget("d")]),
      widget("e"),
    ];
    expect(topMostStudioIds(root, ["e", "b"])).toEqual(["b", "e"]);
    expect(topMostStudioIds(root, ["d", "a"])).toEqual(["a", "d"]);
  });

  it("drops unknown ids and dedupes repeats", () => {
    const root = [node("a", [widget("b")]), widget("e")];
    expect(topMostStudioIds(root, ["ghost"])).toEqual([]);
    expect(topMostStudioIds(root, ["b", "ghost", "b"])).toEqual(["b"]);
    expect(topMostStudioIds(root, [])).toEqual([]);
  });
});

describe("studio ghost-drop cleanup", () => {
  it("drops a selected id whose subtree was removed", () => {
    const root = [widget("a"), widget("b"), widget("c")];
    const selected = ["a", "b"];
    const next = removeNode(root, "a");
    expect(findNode(next, "a")).toBeUndefined();
    // StudioBuilder.tsx:517-523 — keep only ids still in the tree.
    const cleaned = selected.filter((id) => findNode(next, id));
    expect(cleaned).toEqual(["b"]);
  });

  it("clears every id when the whole selected subtree is gone", () => {
    const root = [node("a", [widget("b")]), widget("c")];
    const selected = ["a", "b"];
    const next = removeNode(root, "a");
    expect(selected.filter((id) => findNode(next, id))).toEqual([]);
  });

  it("leaves live selections untouched and never throws on ghosts", () => {
    const root = [widget("a")];
    expect(["a"].filter((id) => findNode(root, id))).toEqual(["a"]);
    expect(["ghost"].filter((id) => findNode(root, id))).toEqual([]);
    expect(findNode([], "a")).toBeUndefined();
    expect(removeNode(root, "ghost")).toEqual(root);
    const target: DropTarget = { id: null, position: "after" };
    expect(moveNode(root, "ghost", target)).toBe(root);
  });
});

describe("studio moveNode guards", () => {
  it("refuses to drop a node onto itself", () => {
    const root = [node("a", [widget("b")]), widget("c")];
    for (const position of ["before", "after", "inside"] as const) {
      expect(moveNode(root, "a", { id: "a", position })).toBe(root);
      expect(canMove(root, "a", { id: "a", position })).toBe(false);
    }
  });

  it("refuses to drop a node into its own descendant", () => {
    const root = [node("a", [node("b", [widget("c")])])];
    expect(containsNode(root, "a", "b")).toBe(true);
    expect(containsNode(root, "a", "a")).toBe(true);
    for (const position of ["before", "after", "inside"] as const) {
      expect(moveNode(root, "a", { id: "b", position })).toBe(root);
    }
  });

  it("refuses inside-drops on non-containers but allows containers", () => {
    const root = [node("box", [widget("w1")]), widget("w2")];
    expect(moveNode(root, "w1", { id: "w2", position: "inside" })).toBe(root);
    expect(canMove(root, "w1", { id: "w2", position: "inside" })).toBe(false);
    const moved = moveNode(root, "w2", { id: "box", position: "inside" });
    expect(moved).not.toBe(root);
    expect(findNode(moved, "box")?.children?.map((child) => child.id)).toEqual([
      "w1",
      "w2",
    ]);
  });

  it("still performs a legal reorder without touching the input", () => {
    const root = [widget("a"), widget("b"), widget("c")];
    const moved = moveNode(root, "c", { id: "a", position: "before" });
    expect(moved.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
    expect(root.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("sends a ghost drop target to a root-end append instead of losing the node", () => {
    const root = [widget("a"), widget("b")];
    const moved = moveNode(root, "a", { id: "ghost", position: "before" });
    expect(moved.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});
