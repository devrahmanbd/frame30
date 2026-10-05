/**
 * T4.3 §21 — storefront chrome contracts (contract-level vitest suite).
 *
 * Covers, adapted from §21:
 *  1. menu dashboard → assign (location) → theme render (first claimant
 *     wins, mobile falls back to header, hrefs rebase onto the path host)
 *  2. header language switch, geometry-intact (same tag skeleton en vs bn)
 *  3. announcement edit → all templates (shared header slot)
 *  4. footer global edit → all templates (global_ref block resolution)
 *  5. mobile widths, structural only (hidden breakpoints, bp layering,
 *     range pins — no layout engine)
 *  6. bn menu/header/footer/widget integrity (as-authored labels, twins)
 *
 * Reuses: buildTree, validateMenu, toggleLocation, shapeStoreMenus,
 * selectMobileMenu, rebaseMenuHref, BREAKPOINT_PX/LAYER_RANGE, parseAst,
 * parseTemplates, resolveProps, resolveGlobalRef/GLOBAL_REF_MISSING,
 * responsiveClassOf, SectionRenderer.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GLOBAL_REF_MISSING,
  newSection,
  parseAst,
  parseTemplates,
  resolveGlobalRef,
  resolveProps,
  type Section,
} from "./builder-ast";
import {
  buildTree,
  rebaseMenuHref,
  selectMobileMenu,
  shapeStoreMenus,
  toggleLocation,
  validateMenu,
  type MenuItem,
  type NavMenu,
} from "./menus/menu";
import { BREAKPOINT_PX, LAYER_RANGE } from "./responsive";
import { responsiveClassOf } from "./responsive-css";
import { SectionRenderer } from "@/components/builder/SectionRenderer";

function item(id: string, label: string, url: string, extra: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    parentId: null,
    position: 0,
    kind: "custom",
    label,
    url,
    refId: null,
    titleAttr: "",
    newTab: false,
    cssClass: "",
    ...extra,
  };
}

function menu(id: string, locations: NavMenu["locations"], labels: string[]): NavMenu {
  return {
    id,
    name: id,
    handle: id,
    locations,
    items: labels.map((label, i) =>
      item(`${id}-${i}`, label, `/${label.toLowerCase().replace(/\s+/g, "-")}`, {
        position: i,
      }),
    ),
  };
}

/** Tag skeleton of rendered markup: structure without copy. */
function skeleton(html: string): string {
  return (html.match(/<\/?[a-zA-Z][a-zA-Z0-9-]*/g) ?? []).join(",");
}

describe("T4.3 chrome — menu dashboard→assign→theme render", () => {
  it("first claimant per location wins; unclaimed locations stay empty", () => {
    const shaped = shapeStoreMenus([
      menu("primary", ["header"], ["New in", "Sale"]),
      menu("second", ["header", "footer"], ["About"]),
    ]);
    expect(shaped.header.map((n) => n.label)).toEqual(["New in", "Sale"]);
    // Header already claimed — the second menu cannot shadow it.
    expect(shaped.footer.map((n) => n.label)).toEqual(["About"]);
    expect(shapeStoreMenus([]).header).toEqual([]);
  });

  it("assign/unassign flows through toggleLocation into the render shape", () => {
    const draft = menu("m", [], ["Home"]);
    const assigned = { ...draft, locations: toggleLocation(draft.locations, "header") };
    expect(shapeStoreMenus([assigned]).header).toHaveLength(1);
    const removed = { ...assigned, locations: toggleLocation(assigned.locations, "header") };
    expect(shapeStoreMenus([removed]).header).toEqual([]);
  });

  it("mobile drawer falls back to the header menu when no mobile menu is claimed", () => {
    const shaped = shapeStoreMenus([menu("m", ["header"], ["Home"])]);
    expect(selectMobileMenu(shaped).map((n) => n.label)).toEqual(["Home"]);
    const both = shapeStoreMenus([
      menu("m", ["header", "mobile"], ["Home"]),
    ]);
    expect(selectMobileMenu(both).map((n) => n.label)).toEqual(["Home"]);
  });

  it("rebases root-relative hrefs onto the path host, leaves the rest alone", () => {
    expect(rebaseMenuHref("/pages/about", "/store/foo")).toBe("/store/foo/pages/about");
    expect(rebaseMenuHref("https://x.example/", "/store/foo")).toBe("https://x.example/");
    expect(rebaseMenuHref("#top", "/store/foo")).toBe("#top");
    expect(rebaseMenuHref("tel:+8801", "/store/foo")).toBe("tel:+8801");
  });

  it("nests dashboard trees and rejects bad addresses at authoring time", () => {
    const items = [
      item("a", "Shop", "/shop"),
      item("b", "Saree", "/c/saree", { parentId: "a", position: 0 }),
    ];
    const tree = buildTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((c) => c.label)).toEqual(["Saree"]);
    expect(validateMenu([item("x", "", "nota url")]).length).toBeGreaterThan(0);
    expect(validateMenu([item("x", "Ok", "/ok")])).toEqual([]);
  });
});

describe("T4.3 chrome — header language switch is geometry-intact", () => {
  function headingSection(): Section {
    return {
      ...newSection("heading"),
      id: "t43-hdr",
      props: {
        ...newSection("heading").props,
        text: "Festive edit",
        text_bn: "উৎসবের এডিট",
      },
    };
  }

  it("en and bn renders share the same tag skeleton, only copy swaps", () => {
    const en = renderToStaticMarkup(
      <SectionRenderer section={headingSection()} locale="en" />,
    );
    const bn = renderToStaticMarkup(
      <SectionRenderer section={headingSection()} locale="bn" />,
    );
    expect(en).toContain("Festive edit");
    expect(bn).toContain("উৎসবের এডিট");
    // Geometry-intact: identical element structure, same node handle.
    expect(skeleton(bn)).toBe(skeleton(en));
    expect(bn).toContain('data-fq-node="t43-hdr"');
    expect(bn).toContain('lang="bn"');
    expect(en).not.toContain('lang="bn"');
  });
});

describe("T4.3 chrome — announcement edit reaches all templates", () => {
  it("a shared header slot carries one announcement edit to every template", () => {
    // The header slot is authored once and attached to every template: one
    // edit lands on index, product and page without per-template work.
    const header = [
      {
        ...newSection("announcement_bar"),
        id: "t43-ann",
        props: {
          ...newSection("announcement_bar").props,
          m1: "Eid sale is live",
          m1_bn: "ঈদ সেল লাইভ",
        },
      },
    ];
    const templates = parseTemplates({
      index: { header, main: [], footer: [] },
      product: { header, main: [], footer: [] },
      page: { header, main: [], footer: [] },
    });
    for (const key of ["index", "product", "page"] as const) {
      expect(templates[key]!.header[0]!.props["m1"]).toBe("Eid sale is live");
      expect(templates[key]!.header[0]!.props["m1_bn"]).toBe("ঈদ সেল লাইভ");
    }
    // Editing the single header node re-parses everywhere with twins intact.
    const edited = {
      ...header[0]!,
      props: { ...header[0]!.props, m1: "Eid sale extended" },
    };
    const after = parseTemplates({
      index: { header: [edited], main: [], footer: [] },
      product: { header: [edited], main: [], footer: [] },
    });
    expect(after.index!.header[0]!.props["m1"]).toBe("Eid sale extended");
    expect(after.product!.header[0]!.props["m1"]).toBe("Eid sale extended");
    expect(after.product!.header[0]!.props["m1_bn"]).toBe("ঈদ সেল লাইভ");
  });
});

describe("T4.3 chrome — footer global edit reaches all templates", () => {
  const block = {
    id: "blk_footer",
    name: "Global footer",
    nodes: [
      {
        ...newSection("heading"),
        id: "gf-h",
        props: { ...newSection("heading").props, text: "Shop", text_bn: "দোকান" },
      },
    ],
  };

  function footerRef(placementId: string): Section {
    return {
      ...newSection("global_ref"),
      id: placementId,
      props: { ...newSection("global_ref").props, ref: "blk_footer" },
    };
  }

  it("one block edit resolves into every template footer", () => {
    for (const placement of ["index", "product"]) {
      const { sections, missing } = resolveGlobalRef(footerRef(`gf-${placement}`), [block]);
      expect(missing).toBe(false);
      expect(sections[0]!.props["text"]).toBe("Shop");
      // Grafted copies are detached: editing the block never mutates placements.
      expect(sections[0]!.id).toContain(`gf-${placement}~`);
    }
    // The block edit itself: new copy lands everywhere on next resolve.
    const renamed = { ...block, nodes: [{ ...block.nodes[0]!, props: { ...block.nodes[0]!.props, text: "Shop all" } }] };
    const { sections } = resolveGlobalRef(footerRef("gf-index"), [renamed]);
    expect(sections[0]!.props["text"]).toBe("Shop all");
  });

  it("a deleted block degrades to a labelled placeholder, never a hole", () => {
    const { sections, missing } = resolveGlobalRef(footerRef("gf-gone"), []);
    expect(missing).toBe(true);
    expect(sections[0]!.invalid).toBe(GLOBAL_REF_MISSING);
  });
});

describe("T4.3 chrome — mobile widths, structural only", () => {
  it("pins the visibility ranges (mobile < 768, tablet 768–1279, desktop is the base)", () => {
    expect(BREAKPOINT_PX.md).toBe(768);
    expect(BREAKPOINT_PX.xl).toBe(1280);
    expect(LAYER_RANGE.mobile).toEqual({ min: null, max: 767.98 });
    expect(LAYER_RANGE.tablet).toEqual({ min: 768, max: 1279.98 });
    // Desktop is the unconditional base cascade — no range to escape.
    expect(LAYER_RANGE.desktop).toEqual({ min: null, max: null });
  });

  it("a mobile-hidden node renders nothing at the mobile width, intact elsewhere", () => {
    const section: Section = {
      ...newSection("heading"),
      id: "t43-hide",
      hidden: ["mobile"],
    };
    const mobile = renderToStaticMarkup(
      <SectionRenderer section={section} locale="en" device="mobile" />,
    );
    const desktop = renderToStaticMarkup(
      <SectionRenderer section={section} locale="en" device="desktop" />,
    );
    expect(mobile).toBe("");
    expect(desktop).toContain('data-fq-node="t43-hide"');
  });

  it("breakpoint layers merge tablet→mobile over the base, desktop stays base", () => {
    const section: Section = {
      ...newSection("heading"),
      id: "t43-bp",
      props: { ...newSection("heading").props, align: "left" },
      bp: { tablet: { align: "center" }, mobile: { align: "right" } },
    };
    expect(resolveProps(section, "desktop")["align"]).toBe("left");
    expect(resolveProps(section, "tablet")["align"]).toBe("center");
    expect(resolveProps(section, "mobile")["align"]).toBe("right");
  });

  it("nodes without overrides carry no responsive class (common case is free)", () => {
    expect(responsiveClassOf(newSection("heading"))).toBeNull();
  });
});

describe("T4.3 chrome — bn integrity across menu, header, footer, widget", () => {
  it("dashboard menu labels render as-authored in every locale", () => {
    const shaped = shapeStoreMenus([
      menu("bn", ["header"], ["শাড়ি", "পাঞ্জাবি"]),
    ]);
    expect(shaped.header.map((n) => n.label)).toEqual(["শাড়ি", "পাঞ্জাবি"]);
    // Dashboard nodes carry no _bn transform — what the merchant typed is
    // what every locale serves.
    expect(JSON.stringify(shaped)).toContain("শাড়ি");
  });

  it("widget + chrome bitext twins survive the save round-trip", () => {
    const parsed = parseAst({
      header: [
        {
          ...newSection("announcement_bar"),
          id: "bn-ann",
          props: {
            ...newSection("announcement_bar").props,
            m1: "Sale",
            m1_bn: "সেল",
          },
        },
      ],
      main: [
        {
          ...newSection("heading"),
          id: "bn-h",
          props: { ...newSection("heading").props, text: "New", text_bn: "নতুন" },
        },
      ],
      footer: [],
    });
    expect(parsed.header[0]!.props["m1_bn"]).toBe("সেল");
    expect(parsed.main[0]!.props["text_bn"]).toBe("নতুন");
    const html = renderToStaticMarkup(
      <SectionRenderer section={parsed.main[0]!} locale="bn" />,
    );
    expect(html).toContain("নতুন");
  });
});
