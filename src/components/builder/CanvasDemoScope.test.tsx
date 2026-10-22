/**
 * The editor canvas renders the theme's REQUIRED slots — not placeholders.
 *
 * Review M5 found the canvas mounted no `AccountDashboardProvider`, so the
 * account composition's three placeable panels rendered nothing. Review
 * Task 4 requires the editor and the preview to prove every required slot
 * non-empty, not only to carry a provider in the source.
 *
 * This suite renders the canvas's real path: `CanvasDemoScope` (the provider
 * wrapper the builder mounts) around `SectionRenderer` in EDITING mode, with
 * the theme's own compositions. `demoData` is the builder's flag that says
 * "the providers above are mounted, draw the context widget instead of the
 * editing placeholder" — production hosts never set it.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => () => undefined,
    Link: ({
      to,
      params,
      search,
      children,
      ...rest
    }: {
      to: string;
      params?: unknown;
      search?: unknown;
      children?: React.ReactNode;
    }) =>
      createElement(
        "a",
        {
          "data-link-to": to,
          "data-link-params": JSON.stringify(params ?? null),
          "data-link-search": JSON.stringify(search ?? null),
          ...rest,
        },
        children,
      ),
  };
});

import { LanguageProvider } from "@/lib/i18n";
import { SectionRenderer } from "./SectionRenderer";
import { CanvasDemoScope } from "./CanvasDemoScope";
import { songoskritiPreviewSource } from "@/lib/themes/songoskriti/preview";
import {
  SONGOSKRITI_PREVIEW_QUERY_TERM,
  SONGOSKRITI_PREVIEW_SEARCH_PATH,
  SONGOSKRITI_PREVIEW_SEARCH_TOTAL,
  songoskritiPreviewAccountOverview,
  songoskritiPreviewCart,
  songoskritiPreviewFeed,
  songoskritiPreviewOrders,
} from "@/lib/themes/songoskriti/preview-demo-data";
import { normalizeSearchParams } from "@/lib/storefront-search";
import type { TemplateKey } from "@/lib/builder-ast";
import type { SectionBuilder } from "@/lib/themes/songoskriti/types";

const BUILDER = readFileSync(
  "src/routes/_authenticated/dashboard/builder.tsx",
  "utf8",
);

function sections(template: TemplateKey) {
  let n = 0;
  const s: SectionBuilder = (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
  return songoskritiPreviewSource().main(template, s) ?? [];
}

function renderCanvas(template: TemplateKey, enabled = true): string {
  return renderToStaticMarkup(
    <LanguageProvider>
      <CanvasDemoScope
        enabled={enabled}
        cart={songoskritiPreviewCart()}
        query={{
          params: normalizeSearchParams({
            q: SONGOSKRITI_PREVIEW_QUERY_TERM,
          }),
          total: SONGOSKRITI_PREVIEW_SEARCH_TOTAL,
          basePath: SONGOSKRITI_PREVIEW_SEARCH_PATH,
          navigate: undefined,
        }}
        feed={songoskritiPreviewFeed()}
        account={{
          slug: "songoskriti",
          currency: "BDT",
          status: "ready",
          overview: songoskritiPreviewAccountOverview(),
          orders: songoskritiPreviewOrders(),
          tab: "orders",
          setTab: () => {},
          openOrderId: null,
          setOpenOrderId: () => {},
          orderDetail: null,
          placed: [],
        }}
      >
        {sections(template).map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            editing
            themeKey="songoskriti"
            template={template}
            demoData={enabled && section.type !== "page_content"}
          />
        ))}
      </CanvasDemoScope>
    </LanguageProvider>,
  );
}

describe("the editor canvas draws the theme's required slots", () => {
  it("renders the account panels, not three blank sections", () => {
    const html = renderCanvas("account");
    // The three placeable panels' visible content.
    expect(html).toContain("Account sections");
    expect(html).toContain("At a glance");
    expect(html).toContain("ORD-2477");
    expect(html).toContain("packed");
    // The three editing placeholders are gone; provider-backed panels drew.
    expect(html).not.toContain("Account navigation — live data");
    expect(html).not.toContain("Account overview — live data");
    expect(html).not.toContain("Account orders — live data");
    // The route-owned body slot keeps its honest named placeholder: the
    // canvas has no account route body to draw.
    expect(html).toContain(
      "Page content — live data appears on the storefront.",
    );
  });

  it("renders the cart's lines and summary from the demo cart", () => {
    const html = renderCanvas("cart");
    expect(html).toContain("Dhakai Jamdani Heritage Saree");
    expect(html).toContain("Order summary");
    expect(html).toContain("৳");
    expect(html).not.toContain("live data appears on the storefront");
  });

  it("renders the checkout's steps, rail and summary from the demo cart", () => {
    const html = renderCanvas("checkout");
    expect(html).toContain("Checkout");
    expect(html).toContain("Payment method");
    expect(html).toContain("Cash on delivery");
    expect(html).toContain("Order summary");
    expect(html).not.toContain("Payment methods — live data");
  });

  it("never borrows Songoskriti fixtures for a theme that is not Songoskriti", () => {
    const html = renderCanvas("account", false);
    // The provider scope is disabled: the fail-closed panels draw nothing,
    // and no demo shopper's rows leak into another theme's canvas.
    expect(html).not.toContain("ORD-2477");
    expect(html).not.toContain("Rumana Haque");
    expect(html).toContain("live data appears on the storefront");
  });
});

describe("the builder wires the canvas to that path", () => {
  it("mounts the demo scope only for Songoskriti and passes the demo flag", () => {
    expect(BUILDER).toContain(
      'const isSongoskriti = activeThemeKey === "songoskriti"',
    );
    expect(BUILDER).toContain("enabled={isSongoskriti}");
    expect(BUILDER).toContain('section.type !== "page_content"');
    expect(BUILDER).toContain("canvasDemoAccount");
    // The scope itself nests the account provider FIRST — the preview's order.
    const scope = readFileSync(
      "src/components/builder/CanvasDemoScope.tsx",
      "utf8",
    );
    expect(scope.indexOf("<AccountDashboardProvider")).toBeLessThan(
      scope.indexOf("<CartProvider"),
    );
  });
});
