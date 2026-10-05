/**
 * T3.3 — footer split (FooterData + ThemeFooterRenderer), cases only.
 *
 * Vitest env node — NO jsdom/testing-library/renderHook. Static markup
 * via renderToStaticMarkup + pure `buildFooterData` asserts.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageProvider } from "@/lib/i18n";

// Router mock: hoisted pathname drives custom vs store base; StoreFooterMenus
// only reads `useRouterState` (no Link), so a minimal stub suffices.
const mockPathname = vi.hoisted(() => ({ current: "/store/demo" }));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: mockPathname.current } }),
  };
});

import {
  buildFooterData,
  StoreFooterMenus,
  ThemeFooterRenderer,
  type FooterData,
} from "./StoreFooterMenus";
import { FooterGlobalBlockControl, GlobalBlockBar } from "../builder/GlobalBlockBar";
import type { MenuNode } from "@/lib/menus/menu";

function dbNode(
  over: Partial<MenuNode> & Pick<MenuNode, "id" | "label" | "url">,
): MenuNode {
  return {
    parentId: null,
    position: 0,
    kind: "custom",
    refId: null,
    titleAttr: "",
    newTab: false,
    cssClass: "",
    depth: 0,
    children: [],
    ...over,
  };
}

function childOf(
  id: string,
  label: string,
  url: string,
  over: Partial<MenuNode> = {},
): MenuNode {
  return dbNode({ id, label, url, parentId: "shop", depth: 1, ...over });
}

function shopColumn(): MenuNode {
  return dbNode({
    id: "shop",
    label: "Shop",
    url: "#",
    children: [
      childOf("new-in", "New arrivals", "/c/new-in", {
        titleAttr: "New in",
      }),
      childOf("women", "Women", "/c/women", { newTab: true }),
    ],
  });
}

function renderWithLang(ui: ReactElement): string {
  return renderToStaticMarkup(
    <LanguageProvider initialLang="en">{ui}</LanguageProvider>,
  );
}

function hrefsOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
}

describe("buildFooterData", () => {
  it("marks empty input so the caller renders nothing", () => {
    const data = buildFooterData([], "/store/demo");
    expect(data.isEmpty).toBe(true);
    expect(data.columns).toEqual([]);
  });

  it("groups children under their top-level column with rebased hrefs", () => {
    const data = buildFooterData([shopColumn()], "/store/demo");
    expect(data.isEmpty).toBe(false);
    expect(data.columns).toHaveLength(1);
    expect(data.columns[0]!.label).toBe("Shop");
    expect(data.columns[0]!.links.map((l) => l.href)).toEqual([
      "/store/demo/c/new-in",
      "/store/demo/c/women",
    ]);
  });

  it("preserves the legacy caps: 12 columns, 24 links each", () => {
    const nodes = Array.from({ length: 13 }, (_, i) =>
      dbNode({
        id: `c-${i}`,
        label: `Col ${i}`,
        url: "#",
        children: Array.from({ length: 25 }, (_, j) =>
          childOf(`c-${i}-l-${j}`, `Link ${j}`, `/p/${i}-${j}`),
        ),
      }),
    );
    const data = buildFooterData(nodes, "/store/demo");
    expect(data.columns).toHaveLength(12);
    for (const col of data.columns) expect(col.links).toHaveLength(24);
  });

  it("carries titleAttr/newTab through for accessible rendering", () => {
    const data = buildFooterData([shopColumn()], "/store/demo");
    const links = data.columns[0]!.links;
    expect(links[0]!.titleAttr).toBe("New in");
    expect(links[1]!.newTab).toBe(true);
  });

  it("defaults the mobile accordion to collapsed", () => {
    expect(buildFooterData([shopColumn()], "").mobileAccordion).toEqual({
      expandedId: null,
    });
  });
});

describe("StoreFooterMenus default output", () => {
  it("renders nothing when no menu claims the footer", () => {
    mockPathname.current = "/store/demo";
    const html = renderWithLang(
      createElement(StoreFooterMenus, { slug: "demo", nodes: [] }),
    );
    expect(html).toBe("");
  });

  it("keeps the legacy grid markup, labels and rebased hrefs", () => {
    mockPathname.current = "/store/demo";
    const html = renderWithLang(
      createElement(StoreFooterMenus, { slug: "demo", nodes: [shopColumn()] }),
    );
    expect(html).toContain('aria-label="Footer menu"');
    expect(html).toContain(
      "mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4",
    );
    // Heading-only node (url "#") keeps the <p> heading, never a link.
    expect(html).toContain(">Shop</p>");
    expect(html).not.toContain('href="#">Shop</a>');
    // Child links keep the serif treatment + rebased hrefs.
    expect(html).toContain(
      "font-serif text-[15px] font-light text-foreground/70",
    );
    expect(html).toContain('href="/store/demo/c/new-in"');
    expect(html).toContain('title="New in"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it("renders a linked heading as an anchor", () => {
    mockPathname.current = "/store/demo";
    const nodes = [
      dbNode({ id: "sale", label: "Sale", url: "/c/sale", children: [] }),
    ];
    const html = renderWithLang(
      createElement(StoreFooterMenus, { slug: "demo", nodes }),
    );
    expect(html).toContain('href="/store/demo/c/sale"');
    expect(html).toContain(">Sale</a>");
  });
});

describe("same FooterData under two presentations", () => {
  function sharedData(): FooterData {
    return buildFooterData(
      [
        shopColumn(),
        dbNode({
          id: "care",
          label: "Customer Care",
          url: "/pages/contact",
          titleAttr: "Contact us",
          children: [childOf("faq", "FAQ", "/pages/faq")],
        }),
      ],
      "/store/demo",
    );
  }

  it("columns and stacked render the identical link set", () => {
    const data = sharedData();
    const columns = renderToStaticMarkup(
      createElement(ThemeFooterRenderer, {
        data,
        label: "Footer menu",
        presentation: "columns",
      }),
    );
    const stacked = renderToStaticMarkup(
      createElement(ThemeFooterRenderer, {
        data,
        label: "Footer menu",
        presentation: "stacked",
      }),
    );
    // Same merchant data everywhere: identical hrefs and labels.
    expect(hrefsOf(stacked).sort()).toEqual(hrefsOf(columns).sort());
    for (const text of ["Shop", "New arrivals", "Women", "Customer Care", "FAQ"]) {
      expect(stacked).toContain(text);
      expect(columns).toContain(text);
    }
    // Different theme presentations: grid vs stacked wrappers.
    expect(columns).toContain("sm:grid-cols-2 lg:grid-cols-4");
    expect(stacked).toContain('data-footer-presentation="stacked"');
    expect(stacked).not.toContain("lg:grid-cols-4");
  });

  it("StoreFooterMenus can serve the stacked presentation for a theme", () => {
    mockPathname.current = "/store/demo";
    const html = renderWithLang(
      createElement(StoreFooterMenus, {
        slug: "demo",
        nodes: [shopColumn()],
        presentation: "stacked",
      }),
    );
    expect(html).toContain('data-footer-presentation="stacked"');
    expect(html).toContain('href="/store/demo/c/new-in"');
  });
});

describe("FooterGlobalBlockControl", () => {
  it("leaves GlobalBlockBar output untouched", () => {
    const html = renderWithLang(
      createElement(GlobalBlockBar, {
        blockName: "Footer block",
        onEdit: () => {},
        onUnlink: () => {},
      }),
    );
    expect(html).toContain("Global block:");
    expect(html).toContain("Footer block");
    expect(html).toContain("Edit global");
    expect(html).toContain("Unlink");
  });

  it("linked footer reuses the global bar under a footer caption", () => {
    const html = renderWithLang(
      createElement(FooterGlobalBlockControl, {
        blockName: "Footer block",
        onEdit: () => {},
        onUnlink: () => {},
      }),
    );
    expect(html).toContain('data-footer-global-block="linked"');
    expect(html).toContain("Footer block");
    expect(html).toContain("Edit global");
    expect(html).toContain("Unlink");
  });

  it("unlinked footer hints at cross-theme reuse with an optional link action", () => {
    const plain = renderWithLang(
      createElement(FooterGlobalBlockControl, {
        blockName: null,
        onEdit: () => {},
        onUnlink: () => {},
      }),
    );
    expect(plain).toContain('data-footer-global-block="unlinked"');
    expect(plain).toContain("Footer uses theme sections.");
    expect(plain).not.toContain("Link global block</button>");

    const withLink = renderWithLang(
      createElement(FooterGlobalBlockControl, {
        blockName: null,
        onEdit: () => {},
        onUnlink: () => {},
        onLink: () => {},
      }),
    );
    expect(withLink).toContain("Link global block");
  });
});
