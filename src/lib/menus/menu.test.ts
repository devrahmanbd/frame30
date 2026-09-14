import { describe, expect, it } from "vitest";
import {
  addItem,
  buildTree,
  canIndent,
  canOutdent,
  flatten,
  indentItem,
  isMenuValid,
  locationsLabel,
  menuDirty,
  menuHandle,
  type MenuItem,
  moveItem,
  moveVertical,
  normalise,
  outdentItem,
  removeItem,
  searchSources,
  sourceToItem,
  subtreeIds,
  toggleLocation,
  uniqueHandle,
  updateItem,
  validateMenu,
} from "./menu";

function item(id: string, over: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    parentId: null,
    position: 0,
    kind: "custom",
    label: id.toUpperCase(),
    url: "/x",
    refId: null,
    titleAttr: "",
    newTab: false,
    cssClass: "",
    ...over,
  };
}

const base: MenuItem[] = [
  item("a", { position: 0 }),
  item("b", { position: 1 }),
  item("b1", { parentId: "b", position: 0 }),
  item("c", { position: 2 }),
];

describe("handles", () => {
  it("slugs and de-duplicates", () => {
    expect(menuHandle("Main Menu!")).toBe("main-menu");
    expect(uniqueHandle("Main Menu", ["main-menu"])).toBe("main-menu-2");
  });
});

describe("tree", () => {
  it("nests children under their parent", () => {
    const tree = buildTree(base);
    expect(tree.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(tree[1]!.children.map((n) => n.id)).toEqual(["b1"]);
  });

  it("flattens depth-first with depths", () => {
    expect(flatten(base).map((n) => [n.id, n.depth])).toEqual([
      ["a", 0],
      ["b", 1 - 1],
      ["b1", 1],
      ["c", 0],
    ]);
  });

  it("promotes orphans to root", () => {
    expect(buildTree([item("x", { parentId: "gone" })]).map((n) => n.id)).toEqual(["x"]);
  });

  it("returns the subtree ids", () => {
    expect(subtreeIds(base, "b")).toEqual(["b", "b1"]);
  });
});

describe("mutations", () => {
  it("appends at root and renumbers", () => {
    const next = addItem(base, item("d"));
    expect(next.find((i) => i.id === "d")?.parentId).toBeNull();
    expect(normalise(next).filter((i) => i.parentId === null).map((i) => i.position)).toEqual([0, 1, 2, 3]);
  });

  it("removes an item with its children", () => {
    expect(removeItem(base, "b").map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("patches fields without changing the id", () => {
    expect(updateItem(base, "a", { label: "Home", id: "zzz" }).find((i) => i.id === "a")?.label).toBe("Home");
  });

  it("indents under the previous sibling and outdents back", () => {
    expect(canIndent(base, "a")).toBe(false);
    expect(canIndent(base, "b")).toBe(true);
    const indented = indentItem(base, "c");
    expect(indented.find((i) => i.id === "c")?.parentId).toBe("b");
    expect(canOutdent(indented, "c")).toBe(true);
    expect(outdentItem(indented, "c").find((i) => i.id === "c")?.parentId).toBeNull();
  });

  it("refuses to indent past the depth limit", () => {
    const deep = [
      item("a"),
      item("b", { position: 1 }),
      item("b1", { parentId: "b" }),
      item("b2", { parentId: "b1" }),
    ];
    expect(canIndent(deep, "b")).toBe(false);
  });

  it("moves before, after and into an item", () => {
    expect(moveItem(base, "c", "a", "before").filter((i) => i.parentId === null).map((i) => i.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(moveItem(base, "a", "b", "child").find((i) => i.id === "a")?.parentId).toBe("b");
  });

  it("never drops an item into its own subtree", () => {
    expect(moveItem(base, "b", "b1", "child").find((i) => i.id === "b")?.parentId).toBeNull();
  });

  it("moves an item up and down among its siblings", () => {
    const moved = moveVertical(base, "c", -1);
    expect(moved.filter((i) => i.parentId === null).sort((a, b) => a.position - b.position).map((i) => i.id)).toEqual(
      ["a", "c", "b"],
    );
  });
});

describe("validation", () => {
  it("flags empty labels and bad addresses", () => {
    const issues = validateMenu([item("a", { label: " " }), item("b", { url: "nope" })]);
    expect(issues.map((i) => i.field)).toEqual(["label", "url"]);
    expect(isMenuValid(base)).toBe(true);
  });
  it("accepts relative, hash, mail and tel links", () => {
    expect(isMenuValid([item("a", { url: "#top" }), item("b", { url: "mailto:a@b.test" })])).toBe(true);
  });
});

describe("sources and locations", () => {
  const sources = [
    { id: "p1", kind: "page" as const, label: "About us", url: "/about" },
    { id: "p2", kind: "product" as const, label: "Kettle", url: "/p/kettle" },
  ];
  it("searches sources", () => {
    expect(searchSources(sources, "kett").map((s) => s.id)).toEqual(["p2"]);
  });
  it("converts a source into a menu item", () => {
    expect(sourceToItem(sources[0]!, "new")).toMatchObject({ id: "new", kind: "page", refId: "p1" });
  });
  it("labels and toggles display locations", () => {
    expect(locationsLabel([])).toBe("Not displayed");
    expect(locationsLabel(["header", "footer"])).toBe("Header, Footer");
    expect(toggleLocation(["header"], "header")).toEqual([]);
    expect(toggleLocation([], "mobile")).toEqual(["mobile"]);
  });
});

describe("dirty tracking", () => {
  it("ignores position gaps but sees real edits", () => {
    expect(menuDirty(base, base.map((i) => ({ ...i, position: i.position * 10 })))).toBe(false);
    expect(menuDirty(base, updateItem(base, "a", { label: "Changed" }))).toBe(true);
  });
});
