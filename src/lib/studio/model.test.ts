import { describe, expect, it } from "vitest";
import {
  defaultPageSettings,
  emptyStudioDoc,
  isMenuBoundWidget,
  isStudioSlot,
  menuBindingOf,
  normalizeStudioSlot,
  renderStudioHtml,
  resolveMenuItems,
  resolveStudioSlots,
  slotOfNode,
  staticMenuItems,
  studioDocFromSlots,
  studioSlots,
  withSlot,
  parseStudioBody,
  sectionsToStudioNodes,
  serializeStudioBody,
  studioNodesToSections,
} from "./model";
import type { NodeSettings, StudioDoc, StudioNode } from "./model";
import {
  asStudioPlacement,
  detachStudioPlacement,
  linkedStudioBlockId,
  linkedStudioRevision,
  placementOwnerOf,
  resolveStudioDoc,
  resolveStudioGlobalBlocks,
  studioPlacementCounts,
  studioPlacementsOf,
  studioSelectionOwnerOf,
  type StudioGlobalBlock,
} from "@/lib/global-blocks";
import {
  isSlot,
  isTemplateKey,
  normalizeSlot,
  slotSections,
  templateSlotSections,
  themeAstFromSlotMap,
} from "@/lib/builder-ast";

function doc(): StudioDoc {
  return {
    version: 2,
    root: [
      {
        id: "c1",
        el: "container",
        settings: {},
        children: [
          { id: "b1", el: "button", settings: { label: "Click" } },
        ],
      },
    ],
    page: defaultPageSettings(),
  };
}

describe("parseStudioBody", () => {
  it("round-trips a serialized document", () => {
    const parsed = parseStudioBody(serializeStudioBody(doc()));
    expect(parsed?.root?.[0]?.children?.[0]).toMatchObject({
      el: "button",
    });
  });

  it("rescues payloads with escaped brackets instead of blanking", () => {
    const clean = serializeStudioBody(doc());
    const escaped = clean.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
    // Sanity: the escaped form really is invalid JSON on its own.
    expect(parseStudioBody(escaped)?.root?.[0]?.children?.[0]).toMatchObject(
      {
        el: "button",
      },
    );
  });

  it("returns null for garbage", () => {
    expect(parseStudioBody("<!--fq-studio:v2\nnot json\nfq-studio:end-->")).toBeNull();
    expect(parseStudioBody(null)).toBeNull();
    expect(parseStudioBody("plain markdown")).toBeNull();
  });
});

describe("sectionsToStudioNodes", () => {
  const section = (overrides = {}) => ({
    id: "old-id",
    type: "container",
    props: {},
    ...overrides,
  });

  it("maps type/props/children and regenerates ids", () => {
    const [node] = sectionsToStudioNodes([
      section({
        type: "heading",
        props: { text: "Hi" },
        children: [{ id: "c", type: "text", props: { text: "x" } }],
      }),
    ]);
    expect(node.el).toBe("heading");
    expect(node.settings).toMatchObject({ text: "Hi" });
    expect(node.id).not.toBe("old-id");
    expect(node.children?.[0]?.el).toBe("text");
    expect(node.children?.[0]?.id).not.toBe("c");
  });

  it("fans breakpoint visibility out onto device keys", () => {
    const [node] = sectionsToStudioNodes([
      section({ hidden: ["mobile", "nonsense"] }),
    ]);
    expect(node.hiddenOn).toEqual(["mobile", "mobileLandscape"]);
  });

  it("drops invalid, typeless, and non-object entries but keeps siblings", () => {
    const nodes = sectionsToStudioNodes([
      section({ type: "button", props: { label: "Keep" } }),
      section({ invalid: "bad" }),
      { id: "no-type", props: {} },
      null,
      "text",
    ]);
    expect(nodes.map((n) => n.el)).toEqual(["button"]);
  });

  it("round-trips back into sections for global-block save", () => {
    const nodes = sectionsToStudioNodes([
      {
        id: "a",
        type: "container",
        props: {},
        children: [
          { id: "b", type: "heading", props: { text: "Hi" }, hidden: ["mobile"] },
        ],
      },
    ]);
    const [section] = studioNodesToSections(nodes);
    expect(section.type).toBe("container");
    const child = section.children?.[0] as
      | { type?: unknown; props?: unknown; hidden?: unknown }
      | undefined;
    expect(child).toMatchObject({
      type: "heading",
      props: { text: "Hi" },
    });
    expect(child?.hidden).toEqual(["mobile"]);
    expect(section.id).not.toBe("a");
  });

  it("returns [] for non-arrays and truncates runaway depth", () => {
    expect(sectionsToStudioNodes(null)).toEqual([]);
    expect(sectionsToStudioNodes({})).toEqual([]);
    let deep: unknown = { id: "x", type: "container", props: {} };
    for (let i = 0; i < 20; i++)
      deep = { id: "x", type: "container", props: {}, children: [deep] };
    const [top] = sectionsToStudioNodes([deep]);
    let count = 0;
    let cursor = top;
    while (cursor?.children?.[0] && count < 30) {
      count += 1;
      cursor = cursor.children[0];
    }
    expect(top.el).toBe("container");
    expect(count).toBeLessThanOrEqual(13);
  });
});

describe("faq scalar-to-items migration", () => {
  function faqDoc(settings: Record<string, unknown>): StudioDoc {
    return {
      version: 2,
      root: [{ id: "f1", el: "faq", settings: settings as never }],
      page: defaultPageSettings(),
    };
  }

  it("seeds items from scalar q/a pairs on load", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        faqDoc({ heading: "FAQ", q1: "Q1?", a1: "A1!", q2: "", a2: "", q3: "Q3?", a3: "" }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([
      { question: "Q1?", answer: "A1!" },
      { question: "Q3?", answer: "" },
    ]);
  });

  it("preserves author-edited items instead of re-seeding", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        faqDoc({
          q1: "Old?",
          a1: "Old.",
          items: [{ question: "New?", answer: "New." }],
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ question: "New?", answer: "New." }]);
  });
});

describe("product_qna scalar-to-items migration", () => {
  function qnaDoc(settings: Record<string, unknown>): StudioDoc {
    return {
      version: 2,
      root: [{ id: "q1", el: "product_qna", settings: settings as never }],
      page: defaultPageSettings(),
    };
  }

  it("seeds items from scalar q/a pairs on load", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        qnaDoc({ heading: "Q&A", q1: "Size?", a1: "Runs large.", q2: "", a2: "" }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ question: "Size?", answer: "Runs large." }]);
  });

  it("preserves author-edited items instead of re-seeding", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        qnaDoc({
          q1: "Old?",
          a1: "Old.",
          items: [{ question: "New?", answer: "New." }],
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ question: "New?", answer: "New." }]);
  });
});

describe("trust_bar scalar-to-items migration", () => {
  function trustDoc(settings: Record<string, unknown>): StudioDoc {
    return {
      version: 2,
      root: [{ id: "t1", el: "trust_bar", settings: settings as never }],
      page: defaultPageSettings(),
    };
  }

  it("seeds items from scalar icon/title/body triples on load", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        trustDoc({
          i1Icon: "delivery",
          i1Title: "Fast delivery",
          i1Body: "",
          i2Icon: "returns",
          i2Title: "",
          i2Body: "",
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([
      { icon: "delivery", title: "Fast delivery", body: "" },
    ]);
  });

  it("preserves author-edited items instead of re-seeding", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        trustDoc({
          i1Title: "Old?",
          items: [{ icon: "secure", title: "New?", body: "" }],
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ icon: "secure", title: "New?", body: "" }]);
  });
});

describe("announcement_bar scalar-to-items migration", () => {
  function announcementDoc(settings: Record<string, unknown>): StudioDoc {
    return {
      version: 2,
      root: [{ id: "a1", el: "announcement_bar", settings: settings as never }],
      page: defaultPageSettings(),
    };
  }

  it("seeds items from scalar m1/m2/m3 on load", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        announcementDoc({ m1: "Sale!", m2: "", m3: "New in" }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ text: "Sale!" }, { text: "New in" }]);
  });

  it("preserves author-edited items instead of re-seeding", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        announcementDoc({ m1: "Old?", items: [{ text: "New!" }] }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ text: "New!" }]);
  });
});

describe("lookbook scalar-to-items migration", () => {
  function lookbookDoc(settings: Record<string, unknown>): StudioDoc {
    return {
      version: 2,
      root: [{ id: "l1", el: "lookbook", settings: settings as never }],
      page: defaultPageSettings(),
    };
  }

  it("seeds items from scalar image/alt/href triples on load", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        lookbookDoc({
          i1Image: "/a.jpg",
          i1Alt: "Look 1",
          i1Href: "/c/1",
          i2Image: "",
          i2Alt: "",
          i2Href: "",
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ image: "/a.jpg", alt: "Look 1", href: "/c/1" }]);
  });

  it("preserves author-edited items instead of re-seeding", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        lookbookDoc({
          i1Image: "/old.jpg",
          items: [{ image: "/new.jpg", alt: "", href: "" }],
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ image: "/new.jpg", alt: "", href: "" }]);
  });
});

describe("hero scalar-to-items migration", () => {
  function heroDoc(settings: Record<string, unknown>): StudioDoc {
    return {
      version: 2,
      root: [{ id: "h1", el: "hero", settings: settings as never }],
      page: defaultPageSettings(),
    };
  }

  it("seeds slides from heading/image plus s2/s3 pairs on load", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        heroDoc({
          heading: "Welcome",
          image: "/hero.jpg",
          subheading: "Sub",
          ctaLabel: "Shop",
          ctaHref: "/c",
          s2Heading: "Slide two",
          s2Image: "/s2.jpg",
          s3Heading: "",
          s3Image: "",
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([
      { heading: "Welcome", image: "/hero.jpg", subheading: "Sub", ctaLabel: "Shop", ctaHref: "/c" },
      { heading: "Slide two", image: "/s2.jpg", subheading: "", ctaLabel: "Shop", ctaHref: "/c" },
    ]);
  });

  it("preserves author-edited items instead of re-seeding", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        heroDoc({
          heading: "Old?",
          items: [{ heading: "New?", image: "", subheading: "", ctaLabel: "", ctaHref: "" }],
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([
      { heading: "New?", image: "", subheading: "", ctaLabel: "", ctaHref: "" },
    ]);
  });
});

describe("footer_sitemap scalar-to-items migration", () => {
  function footerDoc(settings: Record<string, unknown>): StudioDoc {
    return {
      version: 2,
      root: [{ id: "f1", el: "footer_sitemap", settings: settings as never }],
      page: defaultPageSettings(),
    };
  }

  it("seeds columns from cNTitle/cNLinks pairs, skipping fully-empty columns", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        footerDoc({
          c1Title: "Shop",
          c1Links: "New in|/, Best sellers|/",
          c2Title: "",
          c2Links: "Track order\nReturns",
          c3Title: "",
          c3Links: "",
          c4Title: "",
          c4Links: "",
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([
      { title: "Shop", links: "New in|/, Best sellers|/" },
      { title: "", links: "Track order\nReturns" },
    ]);
  });

  it("preserves author-edited items instead of re-seeding", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        footerDoc({
          c1Title: "Old?",
          items: [{ title: "New?", links: "A|/a" }],
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ title: "New?", links: "A|/a" }]);
  });
});

describe("spec_table scalar-to-items migration", () => {
  function specDoc(settings: Record<string, unknown>): StudioDoc {
    return {
      version: 2,
      root: [{ id: "s1", el: "spec_table", settings: settings as never }],
      page: defaultPageSettings(),
    };
  }

  it("seeds rows from rN triples, dropping label-empty rows", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        specDoc({
          r1Group: "Display",
          r1Label: "Size",
          r1Value: '6.1"',
          r2Group: "",
          r2Label: "Weight",
          r2Value: "",
          r3Group: "Orphan group",
          r3Label: "",
          r3Value: "x",
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([
      { group: "Display", label: "Size", value: '6.1"' },
      { group: "", label: "Weight", value: "" },
    ]);
  });

  it("preserves author-edited items instead of re-seeding", () => {
    const parsed = parseStudioBody(
      serializeStudioBody(
        specDoc({
          r1Label: "Old?",
          items: [{ group: "", label: "New?", value: "" }],
        }),
      ),
    );
    const settings = parsed?.root[0]?.settings as Record<string, unknown>;
    expect(settings.items).toEqual([{ group: "", label: "New?", value: "" }]);
  });
});

describe("studio slots (header / main / footer)", () => {
  const node = (id: string, slot?: StudioNode["slot"]): StudioNode => ({
    id,
    el: "heading",
    settings: { text: id },
    ...(slot ? { slot } : {}),
  });

  it("defaults everything to main", () => {
    expect(slotOfNode(node("a"))).toBe("main");
    expect(normalizeStudioSlot("bogus")).toBe("main");
    expect(normalizeStudioSlot(undefined)).toBe("main");
    expect(isStudioSlot("header")).toBe(true);
    expect(isStudioSlot("side")).toBe(false);
    const slots = studioSlots(doc());
    expect(slots.main.map((n) => n.id)).toEqual(["c1"]);
    expect(slots.header).toEqual([]);
    expect(slots.footer).toEqual([]);
  });

  it("partitions root nodes that carry a slot (ast[slot] semantics)", () => {
    const tagged: StudioDoc = {
      version: 2,
      root: [node("h", "header"), node("m"), node("f", "footer")],
      page: defaultPageSettings(),
    };
    const slots = studioSlots(tagged);
    expect(slots.header.map((n) => n.id)).toEqual(["h"]);
    expect(slots.main.map((n) => n.id)).toEqual(["m"]);
    expect(slots.footer.map((n) => n.id)).toEqual(["f"]);
    expect(withSlot(node("x"), "footer").slot).toBe("footer");
  });

  it("round-trips header/footer without touching legacy single-root docs", () => {
    const legacy = parseStudioBody(serializeStudioBody(doc()));
    expect(legacy?.header).toBeUndefined();
    expect(legacy?.footer).toBeUndefined();
    // Legacy render output is unchanged (main only, header/footer empty).
    expect(renderStudioHtml(doc())).toContain("Click");

    const withChrome: StudioDoc = studioDocFromSlots(
      { header: [node("h")], main: doc().root, footer: [node("f")] },
      defaultPageSettings(),
    );
    const parsed = parseStudioBody(serializeStudioBody(withChrome));
    expect(parsed?.header?.map((n) => n.id)).toEqual(["h"]);
    expect(parsed?.root.map((n) => n.id)).toEqual(["c1"]);
    expect(parsed?.footer?.map((n) => n.id)).toEqual(["f"]);
    // Slot tags survive the wire.
    const tagged = parseStudioBody(
      serializeStudioBody({
        version: 2,
        root: [node("h", "header")],
        page: defaultPageSettings(),
      }),
    );
    expect(tagged?.root[0]?.slot).toBe("header");
  });

  it("resolves theme chrome over page overrides", () => {
    const page: StudioDoc = studioDocFromSlots(
      { header: [node("page-h")], main: [node("m")], footer: [node("page-f")] },
      defaultPageSettings(),
    );
    expect(resolveStudioSlots(page, null).main.map((n) => n.id)).toEqual([
      "m",
    ]);
    const theme: StudioDoc = studioDocFromSlots(
      { header: [node("theme-h")], main: [], footer: [node("theme-f")] },
      defaultPageSettings(),
    );
    const resolved = resolveStudioSlots(page, theme);
    expect(resolved.header.map((n) => n.id)).toEqual(["theme-h"]);
    expect(resolved.main.map((n) => n.id)).toEqual(["m"]);
    expect(resolved.footer.map((n) => n.id)).toEqual(["theme-f"]);
    // Empty theme chrome falls back to the page override.
    const bareTheme = emptyStudioDoc();
    const fallback = resolveStudioSlots(page, bareTheme);
    expect(fallback.header.map((n) => n.id)).toEqual(["page-h"]);
    expect(fallback.footer.map((n) => n.id)).toEqual(["page-f"]);
  });

  it("mirrors builder-ast slot / template-map helpers", () => {
    expect(isSlot("main")).toBe(true);
    expect(normalizeSlot("side")).toBe("main");
    const ast = themeAstFromSlotMap({ main: [] });
    expect(ast.header).toEqual([]);
    expect(slotSections(ast, "header")).toEqual([]);
    expect(isTemplateKey("page")).toBe(true);
    expect(isTemplateKey("nope")).toBe(false);
    expect(templateSlotSections({ index: ast }, "index", "main")).toEqual([]);
    expect(templateSlotSections({}, "nope", "main")).toEqual([]);
  });
});

describe("studio linked placements", () => {
  const leaf = (id: string): StudioNode => ({
    id,
    el: "heading",
    settings: { text: id },
  });
  const block: StudioGlobalBlock = {
    id: "blk_1",
    name: "Promo",
    revision: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
    nodes: [leaf("b1"), leaf("b2")],
  };
  const placement = (): StudioNode =>
    asStudioPlacement(
      { id: "p1", el: "container", settings: {}, children: [leaf("kid")] },
      block,
    );

  it("marks a placement link and drops its own children", () => {
    const p = placement();
    expect(linkedStudioBlockId(p)).toBe("blk_1");
    expect(linkedStudioRevision(p)).toBe(3);
    expect(p.children ?? []).toHaveLength(0);
    expect(linkedStudioBlockId(leaf("plain"))).toBeNull();
  });

  it("grafts content for render without mutating the stored tree", () => {
    const stored = [placement()];
    const { nodes, report } = resolveStudioGlobalBlocks(stored, [block]);
    expect(stored[0]!.children ?? []).toHaveLength(0);
    expect(nodes[0]!.children ?? []).toHaveLength(2);
    expect(Object.keys(report.resolved)).toHaveLength(1);
    expect(report.missing).toHaveLength(0);
  });

  it("gives grafted nodes deterministic ids with a selection proxy", () => {
    const p = placement();
    const first =
      resolveStudioGlobalBlocks([p], [block]).nodes[0]!.children![0]!.id;
    const second =
      resolveStudioGlobalBlocks([p], [block]).nodes[0]!.children![0]!.id;
    expect(first).toBe(second);
    expect(placementOwnerOf(first)).toBe(p.id);
    expect(studioSelectionOwnerOf(first)).toBe(p.id);
    expect(studioSelectionOwnerOf(p.id)).toBe(p.id);
  });

  it("reports missing blocks and stale revisions instead of dropping", () => {
    const { nodes, report } = resolveStudioGlobalBlocks([placement()], []);
    expect(nodes).toHaveLength(1);
    expect(report.missing).toEqual(["p1"]);
    const old = asStudioPlacement(leaf("p2"), { id: "blk_1", revision: 1 });
    const stale = resolveStudioGlobalBlocks([old], [block]);
    expect(stale.report.stale).toEqual(["p2"]);
    expect(stale.nodes[0]!.children ?? []).toHaveLength(2);
  });

  it("detaches into real, independently editable nodes", () => {
    const detached = detachStudioPlacement(placement(), block.nodes);
    expect(linkedStudioBlockId(detached)).toBeNull();
    expect(detached.children ?? []).toHaveLength(2);
  });

  it("counts usage and finds placements across slots", () => {
    const other = asStudioPlacement(leaf("p3"), block);
    expect(
      studioPlacementCounts([[placement()], [leaf("x"), other]])["blk_1"],
    ).toBe(2);
    expect(studioPlacementsOf([placement(), leaf("x")], "blk_1")).toEqual([
      "p1",
    ]);
    const docWithSlots: StudioDoc = studioDocFromSlots(
      { header: [placement()], main: [leaf("m")], footer: [] },
      defaultPageSettings(),
    );
    const { doc: resolved, report } = resolveStudioDoc(docWithSlots, [block]);
    expect(resolved.header?.[0]?.children ?? []).toHaveLength(2);
    expect(resolved.root.map((n) => n.id)).toEqual(["m"]);
    expect(Object.keys(report.resolved)).toEqual(["p1"]);
  });
});

describe("widget → menu binding", () => {
  const menus = [
    {
      id: "menu-1",
      handle: "header",
      items: [
        { label: "Home", url: "/", position: 1, parentId: null },
        { label: "Shop", url: "/c/all", position: 0, parentId: null },
        { label: "Child", url: "/c/sub", position: 0, parentId: "x" },
      ],
    },
  ];
  const bound = (menuId: string): StudioNode => ({
    id: "n1",
    el: "nav_menu",
    settings: { menuId, items: [{ label: "Manual", href: "/manual" }] },
  });

  it("reads the binding and keeps manual items as fallback", () => {
    expect(isMenuBoundWidget("nav_menu")).toBe(true);
    expect(isMenuBoundWidget("mega_menu")).toBe(true);
    expect(isMenuBoundWidget("heading")).toBe(false);
    expect(menuBindingOf(bound("  "))).toBeNull();
    expect(menuBindingOf(bound("menu-1"))).toBe("menu-1");
    expect(staticMenuItems(bound("menu-1"))).toEqual([
      { label: "Manual", href: "/manual" },
    ]);
  });

  it("resolves bound menus for the canvas preview", () => {
    expect(resolveMenuItems(bound(""), menus)).toBeNull();
    expect(resolveMenuItems(bound("menu-1"), null)).toBeNull();
    expect(resolveMenuItems(bound("missing"), menus)).toBeNull();
    // By id, top-level only, in position order.
    expect(resolveMenuItems(bound("menu-1"), menus)).toEqual([
      { label: "Shop", href: "/c/all" },
      { label: "Home", href: "/" },
    ]);
    // By handle too.
    expect(
      resolveMenuItems(bound("header"), menus)?.map((i) => i.label),
    ).toEqual(["Shop", "Home"]);
    // A bound-but-empty menu resolves to [] (not the manual fallback).
    const empty = [{ id: "e", items: [] as never[] }];
    expect(resolveMenuItems(bound("e"), empty)).toEqual([]);
  });
});

describe("whatsapp_button", () => {
  const wa = (settings: NodeSettings): StudioDoc => ({
    ...emptyStudioDoc(),
    root: [{ id: "wa1", el: "whatsapp_button", settings }],
  });

  it("renders a wa.me anchor with digits-only phone", () => {
    const html = renderStudioHtml(
      wa({ phone_number: "+880 1540-203662", label: "Chat now" }),
    );
    expect(html).toContain("https://wa.me/8801540203662");
    expect(html).toContain("Chat now");
    expect(html).toContain('target="_blank"');
  });

  it("renders the bubble glyph, never the dots placeholder", () => {
    const html = renderStudioHtml(wa({ phone_number: "8801540203662" }));
    expect(html).toContain('viewBox="0 0 512 512"');
    expect(html).toContain("M192.7 146.9");
    expect(html).not.toContain("+880 1540-203662");
  });

  it("renders nothing without a phone number (fail closed, no fake links)", () => {
    expect(renderStudioHtml(wa({ phone_number: "" }))).not.toContain("wa.me");
    expect(renderStudioHtml(wa({}))).not.toContain("<a");
  });

  it("escapes the greeting text", () => {
    const html = renderStudioHtml(
      wa({ phone_number: "8801", greeting_message: "<b>Hi</b>" }),
    );
    expect(html).not.toContain("<b>Hi</b>");
    expect(html).toContain("wa.me/8801?text=");
  });
});
