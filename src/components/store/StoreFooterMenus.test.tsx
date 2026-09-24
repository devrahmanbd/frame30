/**
 * Songoskriti footer — TDD RED: storefront footer breakages.
 *
 * Reproduces each breakage before the fix:
 *  1. empty menus  → footer vanishes (renders null)
 *  2. missing data  → no newsletter block, no fallback columns
 *  3. mobile        → link grid is not single-column
 * Plus brand-standard guards: statement, one primary CTA, colophon.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { StoreFooterMenus } from "./StoreFooterMenus";
import type { MenuNode } from "@/lib/menus/menu";
import { StudioWidget } from "@/components/builder/studio/renderers";
import { buildFooterMain } from "@/lib/themes/songoskriti/footer";
import { BITEXT_FIELDS } from "@/lib/builder-ast";
import type { SectionType } from "@/lib/builder-ast";

async function renderFooter(nodes: MenuNode[]): Promise<string> {
  const rootRoute = createRootRoute({
    component: () => createElement(StoreFooterMenus, { slug: "demo", nodes }),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/store/demo"] }),
  });
  await router.load();
  const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
  router.clearExpiredCache();
  return html;
}

const node = (over: Partial<MenuNode> & { id: string; label: string }): MenuNode =>
  ({
    parentId: null,
    position: 0,
    kind: "custom",
    url: "#",
    refId: null,
    titleAttr: "",
    newTab: false,
    cssClass: "",
    depth: 0,
    children: [],
    ...over,
  }) as MenuNode;

describe("StoreFooterMenus breakages", () => {
  it("empty menus still render the statement footer (never vanishes)", async () => {
    const html = await renderFooter([]);
    expect(html).toContain("<footer");
    expect(html).toContain("Songoskriti");
  });

  it("missing newsletter data still renders the single newsletter CTA", async () => {
    const html = await renderFooter([]);
    expect(html).toContain("Join the list");
    expect(html).toContain('type="email"');
  });

  it("link grid is single-column on mobile", async () => {
    const html = await renderFooter([]);
    expect(html).toContain("grid-cols-1");
    expect(html).not.toMatch(/["\s]grid-cols-2["\s]/);
  });

  it("exactly one primary CTA in the footer", async () => {
    const html = await renderFooter([]);
    const submits = html.match(/type="submit"/g) ?? [];
    expect(submits.length).toBe(1);
  });

  it("colophon carries payments, copyright and language switch", async () => {
    const html = await renderFooter([]);
    expect(html).toContain("bKash");
    expect(html).toContain("©");
    expect(html).toContain("ভাষা");
  });

  it("real menus win over the manual fallback", async () => {
    const html = await renderFooter([
      node({ id: "m1", label: "Size guide", url: "/pages/size-guide" }),
    ]);
    expect(html).toContain("Size guide");
    expect(html).toContain("/store/demo/pages/size-guide");
  });
});

describe("footer_sitemap studio case breakages", () => {
  const widget = (settings: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(StudioWidget, {
        node: {
          id: "f1",
          el: "footer_sitemap",
          settings: settings as never,
        },
        device: "desktop",
      }),
    );

  it("missing data renders manual fallback columns, not a placeholder", () => {
    const html = widget({});
    expect(html).not.toContain("Add a sitemap column");
    expect(html).toContain("Heritage Handloom");
  });

  it("link grid is single-column on mobile", () => {
    const html = widget({});
    expect(html).toContain("grid-cols-1");
    expect(html).not.toMatch(/["\s]grid-cols-2["\s]/);
  });
});

describe("songoskriti footer blueprint (statement standard)", () => {
  const sections = buildFooterMain(((type, props) => ({
    id: `test-${type}`,
    type,
    props,
  })) as never);

  it("composes statement + newsletter + link columns + colophon", () => {
    const types = sections.map((s) => s.type);
    expect(types).toEqual([
      "rich_text",
      "newsletter",
      "footer_sitemap",
      "payment_icons",
      "rich_text",
    ]);
  });

  it("has exactly one primary CTA across the footer", () => {
    const ctaKeys = sections.flatMap((s) =>
      Object.keys(s.props).filter(
        (k) => !k.endsWith("_bn") && /buttonlabel|ctalabel/i.test(k),
      ),
    );
    expect(ctaKeys).toEqual(["buttonLabel"]);
  });

  it("every bilingual prop ships EN + BN", () => {
    for (const s of sections) {
      for (const key of BITEXT_FIELDS[s.type as SectionType] ?? []) {
        const en = s.props[key];
        if (typeof en !== "string" || !en.trim()) continue;
        expect(
          s.props[`${key}_bn`],
          `${s.type}.${key} missing _bn`,
        ).toBeTruthy();
      }
    }
  });

  it("payment marks stay comma-separated", () => {
    const pay = sections.find((s) => s.type === "payment_icons")!;
    expect(String(pay.props["marks"])).toContain(",");
  });
});
