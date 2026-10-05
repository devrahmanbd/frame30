import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { biTextKeysOf, SECTION_CATALOG, type SectionType } from "./builder-ast";
import { newSection, type Section } from "./builder-ast";
import { isDataWidget, widgetMeta } from "./widget-registry";
import { WIDGET_COMPONENTS } from "@/components/builder/widgets";
import {
  CHROME_WIDGETS,
  MEGA_MENU_SLOT,
  parseLinkList,
} from "@/components/builder/chrome";
import {
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";
import type { WidgetRow } from "./widget-data";
import {
  clearMenuRenderers,
  registerMenuRenderer,
} from "./plugin-menu-renderers";

const CHROME: SectionType[] = [
  "subbrand_bar",
  "announcement_bar",
  "utility_bar",
  "trust_bar",
  "payment_icons",
  "notice",
  "mega_menu",
  "department_strip",
  "footer_sitemap",
  "search_command",
  "account_cart",
];

describe("phase 2.1 chrome widgets", () => {
  it("registers every chrome widget in the catalogue", () => {
    const types = new Set(SECTION_CATALOG.map((entry) => entry.type));
    for (const type of CHROME) expect(types.has(type)).toBe(true);
  });

  it("has a renderer for every chrome widget", () => {
    for (const type of CHROME)
      expect(typeof WIDGET_COMPONENTS[type]).toBe("function");
  });

  it("declares bilingual copy on every merchant-authored string", () => {
    for (const type of CHROME) {
      if (type === "footer_sitemap" || type === "account_cart") {
        expect(biTextKeysOf(type).length).toBeGreaterThan(0);
        continue;
      }
      expect(biTextKeysOf(type).length).toBeGreaterThan(0);
    }
  });

  it("keeps navigation widgets on the batched taxonomy source", () => {
    for (const type of ["mega_menu", "department_strip"] as SectionType[]) {
      expect(isDataWidget(type)).toBe(true);
      expect(widgetMeta(type)?.data?.source).toBe("taxonomy");
      expect(widgetMeta(type)?.skeleton).toBe(true);
    }
  });

  it("keeps header-only widgets out of other slots", () => {
    for (const type of [
      "utility_bar",
      "mega_menu",
      "search_command",
      "account_cart",
    ] as SectionType[]) {
      expect(widgetMeta(type)?.slots).toContain("header");
    }
    expect(widgetMeta("footer_sitemap")?.slots).toEqual(["footer"]);
  });

  it("claims no primary heading from the chrome", () => {
    for (const type of CHROME)
      expect(widgetMeta(type)?.seo.heading).toBe(false);
  });
});

describe("footer sitemap link parsing", () => {
  it("parses label|href pairs and drops malformed entries", () => {
    expect(parseLinkList("New in|/new, Sale|/sale")).toEqual([
      { label: "New in", href: "/new" },
      { label: "Sale", href: "/sale" },
    ]);
    expect(parseLinkList("|/orphan, Contact")).toEqual([
      { label: "Contact", href: "#" },
    ]);
  });

  it("caps a column at eight links", () => {
    const raw = Array.from({ length: 12 }, (_, i) => `L${i}|/l${i}`).join(", ");
    expect(parseLinkList(raw)).toHaveLength(8);
  });
});

describe("mega_menu plugin renderer replacement (MENU RUNTIME)", () => {
  afterEach(() => clearMenuRenderers());

  const section: Section = {
    ...newSection("mega_menu"),
    props: { label: "Shop", limit: 8 },
  };
  const taxRows: WidgetRow[] = [
    { id: "tax-0", title: "Dept 0", href: "/c/dept-0" },
    { id: "tax-1", title: "Dept 1", href: "/c/dept-1" },
  ];
  const pluginRows: WidgetRow[] = [
    { id: "plug-0", title: "Plugin Dept", href: "/c/plug" },
  ];
  const approvedSwap = {
    claims: [
      {
        pluginId: "nav-pro",
        slot: MEGA_MENU_SLOT,
        entry: "framique.mount(document.createTextNode('nav'))",
        reviewApproved: true,
      },
    ],
    grantedScopes: ["render_storefront", "replace_menus"],
    pluginRows,
  };

  function renderMega(data: WidgetCtx["data"]) {
    const Mega = CHROME_WIDGETS["mega_menu"] as WidgetComponent;
    const ctx: WidgetCtx = {
      section,
      ...widgetReader(section, undefined, "en"),
      Heading: "h2",
      primary: false,
      editing: false,
      locale: "en",
      storeSlug: "test",
      data,
      renderChildren: () => null,
      link: (href: string) => href,
      money: () => "",
    };
    return renderToStaticMarkup(
      createElement(Mega as (p: WidgetCtx) => React.ReactElement, ctx),
    );
  }

  const plainRows = () => renderMega({ rows: taxRows, pending: false });

  it("an approved + scoped swap with a registered renderer replaces the engine markup", () => {
    registerMenuRenderer("nav-pro", MEGA_MENU_SLOT, ({ rows }) =>
      createElement(
        "nav",
        { "data-plugin-nav": "nav-pro" },
        (rows as WidgetRow[]).map((row) => row.title).join("|"),
      ),
    );
    try {
      const html = renderMega({
        rows: taxRows,
        pending: false,
        menuSwap: approvedSwap,
      } as WidgetCtx["data"]);
      // The plugin owns the presentation and receives the winning rows.
      expect(html).toContain('data-plugin-nav="nav-pro"');
      expect(html).toContain("Plugin Dept");
      // The engine landmark (label-driven) is gone with its markup.
      expect(html).not.toContain('aria-label="Shop"');
      expect(html).not.toContain("Dept 0");
    } finally {
      clearMenuRenderers();
    }
  });

  it("unapproved swaps keep the engine markup byte-identical", () => {
    registerMenuRenderer("nav-pro", MEGA_MENU_SLOT, () =>
      createElement("nav", { "data-plugin-nav": "nav-pro" }, "plugin"),
    );
    try {
      const plain = plainRows();
      const gated = renderMega({
        rows: taxRows,
        pending: false,
        menuSwap: {
          ...approvedSwap,
          claims: [{ ...approvedSwap.claims[0], reviewApproved: false }],
        },
      } as WidgetCtx["data"]);
      expect(gated).toBe(plain);
      expect(gated).not.toContain("data-plugin-nav");
      expect(gated).toContain("Dept 0");
    } finally {
      clearMenuRenderers();
    }
  });

  it("a throwing row seam falls back to theme rows through engine markup", () => {
    const onError: Array<unknown> = [];
    const html = renderMega({
      rows: taxRows,
      pending: false,
      menuSwap: {
        ...approvedSwap,
        pluginRows: undefined,
        renderRows: () => {
          throw new Error("rows down");
        },
        onError: (error: unknown) => {
          onError.push(error);
        },
      },
    } as WidgetCtx["data"]);
    expect(html).toContain("Dept 0");
    expect(html).toContain('aria-label="Shop"');
    expect(onError).toHaveLength(1);
  });

  it("wraps the plugin presentation in the fail-open boundary over the engine markup", () => {
    const src = readFileSync("src/components/builder/chrome.tsx", "utf8");
    expect(src).toContain("selectPluginMenuRenderer");
    expect(src).toContain("<PluginMenuBoundary");
    expect(src).toContain("fallback={engineNav}");
    expect(src).toContain("<PluginNav");
  });
});
