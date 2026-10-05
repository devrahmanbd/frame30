import { describe, expect, it } from "vitest";
import { MENU_SLOTS } from "../marketplace-scopes";
import { BLOCK_SLOTS } from "../plugin-manifest";
import {
  addItem,
  buildTree,
  canIndent,
  canOutdent,
  canonicalHref,
  canonicalLabel,
  canonicalPromoTitle,
  EMPTY_STORE_MENUS,
  flatten,
  indentItem,
  isMenuPresentationMode,
  isMenuValid,
  locationsLabel,
  MENU_LOCATIONS,
  MENU_PRESENTATION_MODES,
  menuDirty,
  menuHandle,
  type CanonicalMenuItem,
  type CanonicalMenuPromo,
  type MenuItem,
  type MenuNode,
  type NavMenu,
  moveItem,
  moveVertical,
  normalise,
  outdentItem,
  rebaseMenuHref,
  rebaseMenuNodes,
  removeItem,
  searchSources,
  selectMobileMenu,
  shapeStoreMenus,
  sourceToItem,
  subtreeIds,
  toggleLocation,
  toCanonicalMenu,
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
    expect(
      buildTree([item("x", { parentId: "gone" })]).map((n) => n.id),
    ).toEqual(["x"]);
  });

  it("returns the subtree ids", () => {
    expect(subtreeIds(base, "b")).toEqual(["b", "b1"]);
  });
});

describe("mutations", () => {
  it("appends at root and renumbers", () => {
    const next = addItem(base, item("d"));
    expect(next.find((i) => i.id === "d")?.parentId).toBeNull();
    expect(
      normalise(next)
        .filter((i) => i.parentId === null)
        .map((i) => i.position),
    ).toEqual([0, 1, 2, 3]);
  });

  it("removes an item with its children", () => {
    expect(removeItem(base, "b").map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("patches fields without changing the id", () => {
    expect(
      updateItem(base, "a", { label: "Home", id: "zzz" }).find(
        (i) => i.id === "a",
      )?.label,
    ).toBe("Home");
  });

  it("indents under the previous sibling and outdents back", () => {
    expect(canIndent(base, "a")).toBe(false);
    expect(canIndent(base, "b")).toBe(true);
    const indented = indentItem(base, "c");
    expect(indented.find((i) => i.id === "c")?.parentId).toBe("b");
    expect(canOutdent(indented, "c")).toBe(true);
    expect(
      outdentItem(indented, "c").find((i) => i.id === "c")?.parentId,
    ).toBeNull();
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
    expect(
      moveItem(base, "c", "a", "before")
        .filter((i) => i.parentId === null)
        .map((i) => i.id),
    ).toEqual(["c", "a", "b"]);
    expect(
      moveItem(base, "a", "b", "child").find((i) => i.id === "a")?.parentId,
    ).toBe("b");
  });

  it("never drops an item into its own subtree", () => {
    expect(
      moveItem(base, "b", "b1", "child").find((i) => i.id === "b")?.parentId,
    ).toBeNull();
  });

  it("moves an item up and down among its siblings", () => {
    const moved = moveVertical(base, "c", -1);
    expect(
      moved
        .filter((i) => i.parentId === null)
        .sort((a, b) => a.position - b.position)
        .map((i) => i.id),
    ).toEqual(["a", "c", "b"]);
  });
});

describe("validation", () => {
  it("flags empty labels and bad addresses", () => {
    const issues = validateMenu([
      item("a", { label: " " }),
      item("b", { url: "nope" }),
    ]);
    expect(issues.map((i) => i.field)).toEqual(["label", "url"]);
    expect(isMenuValid(base)).toBe(true);
  });
  it("accepts relative, hash, mail and tel links", () => {
    expect(
      isMenuValid([
        item("a", { url: "#top" }),
        item("b", { url: "mailto:a@b.test" }),
      ]),
    ).toBe(true);
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
    expect(sourceToItem(sources[0]!, "new")).toMatchObject({
      id: "new",
      kind: "page",
      refId: "p1",
    });
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
    expect(
      menuDirty(
        base,
        base.map((i) => ({ ...i, position: i.position * 10 })),
      ),
    ).toBe(false);
    expect(menuDirty(base, updateItem(base, "a", { label: "Changed" }))).toBe(
      true,
    );
  });
});

describe("storefront shaping", () => {
  function navMenu(
    id: string,
    locations: NavMenu["locations"],
    items: MenuItem[] = [],
  ): NavMenu {
    return { id, name: id, handle: id, locations, items };
  }

  it("returns empty trees when no menu claims a location", () => {
    expect(shapeStoreMenus([])).toEqual(EMPTY_STORE_MENUS);
    expect(shapeStoreMenus([navMenu("m1", [], [item("a")])])).toEqual(
      EMPTY_STORE_MENUS,
    );
  });

  it("gives each location to its first claimant", () => {
    const shaped = shapeStoreMenus([
      navMenu("first", ["header", "footer"], [item("a")]),
      navMenu("second", ["header", "mobile"], [item("b")]),
    ]);
    expect(shaped.header.map((n) => n.id)).toEqual(["a"]);
    expect(shaped.footer.map((n) => n.id)).toEqual(["a"]);
    expect(shaped.mobile.map((n) => n.id)).toEqual(["b"]);
  });

  it("nests children through buildTree", () => {
    const shaped = shapeStoreMenus([
      navMenu(
        "m1",
        ["header"],
        [
          item("a", { position: 0 }),
          item("b", { position: 1 }),
          item("b1", { parentId: "b", position: 0 }),
        ],
      ),
    ]);
    expect(shaped.header.map((n) => n.id)).toEqual(["a", "b"]);
    expect(shaped.header[1]!.children.map((n) => n.id)).toEqual(["b1"]);
  });

  it("falls back to the header menu when no mobile menu is claimed", () => {
    const shaped = shapeStoreMenus([navMenu("m1", ["header"], [item("a")])]);
    expect(selectMobileMenu(shaped).map((n) => n.id)).toEqual(["a"]);
    const both = shapeStoreMenus([
      navMenu("m1", ["header"], [item("a")]),
      navMenu("m2", ["mobile"], [item("m")]),
    ]);
    expect(selectMobileMenu(both).map((n) => n.id)).toEqual(["m"]);
  });
});

describe("menu href rebasing", () => {
  it("prefixes root-relative hrefs with the path-host base", () => {
    expect(rebaseMenuHref("/pages/about", "/store/acme")).toBe(
      "/store/acme/pages/about",
    );
    expect(rebaseMenuHref("/p/kettle", "/store/acme")).toBe(
      "/store/acme/p/kettle",
    );
    expect(rebaseMenuHref("/c/tea", "/store/acme")).toBe("/store/acme/c/tea");
  });

  it("leaves custom-host hrefs untouched when the base is empty", () => {
    expect(rebaseMenuHref("/pages/about", "")).toBe("/pages/about");
  });

  it("never rewrites absolute, hash, protocol-relative or contact hrefs", () => {
    for (const href of [
      "https://example.com/x",
      "http://example.com/x",
      "//example.com/x",
      "#top",
      "mailto:a@b.test",
      "tel:+8801",
    ]) {
      expect(rebaseMenuHref(href, "/store/acme")).toBe(href);
    }
  });

  it("rebases a whole tree without touching anything else", () => {
    const nodes: MenuNode[] = [
      {
        ...item("a", { url: "/pages/about" }),
        depth: 0,
        children: [
          {
            ...item("b", { url: "https://example.com/x" }),
            depth: 1,
            children: [],
          },
        ],
      },
    ];
    const next = rebaseMenuNodes(nodes, "/store/acme");
    expect(next[0]!.url).toBe("/store/acme/pages/about");
    expect(next[0]!.children[0]!.url).toBe("https://example.com/x");
    expect(next[0]!.label).toBe("A");
    // Input is not mutated.
    expect(nodes[0]!.url).toBe("/pages/about");
  });
});

describe("TRACK M — plugin slot vocabulary separation", () => {
  it("menu fill points collide with neither locations nor block slots", () => {
    expect([...MENU_SLOTS]).toEqual([
      "menu_bar",
      "menu_dropdown",
      "menu_drawer",
    ]);
    for (const slot of MENU_SLOTS) {
      expect(MENU_LOCATIONS.map((entry) => entry.key)).not.toContain(slot);
      expect([...BLOCK_SLOTS]).not.toContain(slot);
    }
  });

  it("storefront shaping still keys on locations only", () => {
    expect(Object.keys(EMPTY_STORE_MENUS).sort()).toEqual([
      "footer",
      "header",
      "mobile",
    ]);
  });
});

describe("T4.1 canonical menu type", () => {
  const promo: CanonicalMenuPromo = {
    image: "/ph/promo.jpg",
    href: "/c/festive",
    title: "Festive",
    title_bn: "উৎসব",
  };
  const entry: CanonicalMenuItem = {
    id: "shop",
    label: "Shop",
    label_bn: "কেনাকাটা",
    href: "/c/shop",
    badge: "New",
    metadata: { title: "Shop all", target: "_blank" },
    image: null,
    promo,
    children: [
      {
        id: "sarees",
        label: "Sarees",
        label_bn: "শাড়ি",
        href: "/c/sarees",
        children: [
          {
            id: "jamdani",
            label: "Jamdani",
            label_bn: "জামদানি",
            href: "/c/jamdani",
          },
        ],
      },
    ],
  };

  it("resolves bitext labels per locale with English fallback", () => {
    expect(canonicalLabel(entry, "en")).toBe("Shop");
    expect(canonicalLabel(entry, "bn")).toBe("কেনাকাটা");
    expect(canonicalLabel({ label: "Shop", label_bn: "  " }, "bn")).toBe(
      "Shop",
    );
    expect(canonicalLabel({ label: "Shop" }, "bn")).toBe("Shop");
  });

  it("resolves promo titles per locale with English fallback", () => {
    expect(canonicalPromoTitle(promo, "en")).toBe("Festive");
    expect(canonicalPromoTitle(promo, "bn")).toBe("উৎসব");
    expect(
      canonicalPromoTitle({ title: "Festive", title_bn: null }, "bn"),
    ).toBe("Festive");
  });

  it("keeps nested children, badge, metadata and the promo ref", () => {
    expect(entry.children?.map((c) => c.id)).toEqual(["sarees"]);
    expect(entry.children?.[0]?.children?.map((c) => c.id)).toEqual([
      "jamdani",
    ]);
    expect(entry.badge).toBe("New");
    expect(entry.metadata).toEqual({ title: "Shop all", target: "_blank" });
    expect(entry.promo?.image).toBe("/ph/promo.jpg");
  });

  it("rebases canonical hrefs onto a path host", () => {
    expect(canonicalHref(entry, "/store/demo")).toBe("/store/demo/c/shop");
    expect(canonicalHref({ href: "#top" }, "/store/demo")).toBe("#top");
    expect(
      canonicalHref({ href: "https://example.com/x" }, "/store/demo"),
    ).toBe("https://example.com/x");
  });

  it("sanctions exactly the dropdown and drawer presentation modes", () => {
    expect([...MENU_PRESENTATION_MODES]).toEqual(["dropdown", "drawer"]);
    expect(isMenuPresentationMode("dropdown")).toBe(true);
    expect(isMenuPresentationMode("drawer")).toBe(true);
    expect(isMenuPresentationMode("mega")).toBe(false);
    expect(isMenuPresentationMode(undefined)).toBe(false);
  });
});

describe("T4.1 toCanonicalMenu", () => {
  function node(
    id: string,
    over: Partial<MenuNode> = {},
  ): MenuNode {
    return {
      id,
      parentId: null,
      position: 0,
      kind: "custom",
      label: id.toUpperCase(),
      url: `/c/${id}`,
      refId: null,
      titleAttr: "",
      newTab: false,
      cssClass: "",
      depth: 0,
      children: [],
      ...over,
    };
  }

  it("maps dashboard trees to canonical items with nested children", () => {
    const tree = buildTree([
      item("a", { position: 0 }),
      item("b", { position: 1 }),
      item("b1", { parentId: "b", position: 0 }),
    ]);
    const canonical = toCanonicalMenu(tree);
    expect(canonical.map((c) => c.id)).toEqual(["a", "b"]);
    expect(canonical.map((c) => c.href)).toEqual(["/x", "/x"]);
    expect(canonical[1]!.children?.map((c) => c.id)).toEqual(["b1"]);
    // Dashboard rows carry no enrichment today: explicit nulls, not garbage.
    expect(canonical[0]).toMatchObject({
      label_bn: null,
      badge: null,
      image: null,
      promo: null,
    });
    expect(canonical[0]!.metadata).toEqual({});
  });

  it("derives link metadata from title, new-tab and css class", () => {
    const [one] = toCanonicalMenu([
      node("a", { titleAttr: "Shop all", newTab: true, cssClass: "hot" }),
    ]);
    expect(one!.metadata).toEqual({
      title: "Shop all",
      target: "_blank",
      class: "hot",
    });
  });

  it("carries enrichment through when the source node has it", () => {
    const enriched = node("a", {
      label: "Shop",
      url: "/c/shop",
      children: [node("b", { label: "Sarees", url: "/c/sarees" })],
    }) as unknown as MenuNode;
    (enriched as unknown as Record<string, unknown>)["label_bn"] =
      "কেনাকাটা";
    (enriched as unknown as Record<string, unknown>)["badge"] = "New";
    (enriched as unknown as Record<string, unknown>)["image"] = "/ph/nav.jpg";
    (enriched as unknown as Record<string, unknown>)["promo"] = {
      image: "/ph/promo.jpg",
      href: "/c/festive",
      title: "Festive",
      title_bn: "উৎসব",
    };
    const [one] = toCanonicalMenu([enriched]);
    expect(one!.label_bn).toBe("কেনাকাটা");
    expect(one!.badge).toBe("New");
    expect(one!.image).toBe("/ph/nav.jpg");
    expect(one!.promo).toEqual({
      image: "/ph/promo.jpg",
      href: "/c/festive",
      title: "Festive",
      title_bn: "উৎসব",
    });
    expect(canonicalLabel(one!, "bn")).toBe("কেনাকাটা");
    expect(canonicalPromoTitle(one!.promo!, "bn")).toBe("উৎসব");
  });

  it("drops malformed promos instead of rendering broken tiles", () => {
    const bad = node("a") as unknown as Record<string, unknown>;
    bad["promo"] = { image: "/ph/promo.jpg", title: "No href" };
    const [one] = toCanonicalMenu([bad as unknown as MenuNode]);
    expect(one!.promo).toBeNull();
  });

  it("never mutates the input tree", () => {
    const tree = buildTree([item("a"), item("b", { position: 1 })]);
    const before = JSON.stringify(tree);
    toCanonicalMenu(tree);
    expect(JSON.stringify(tree)).toBe(before);
  });
});
